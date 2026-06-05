import type { UiNode } from "@dyn/shared";
import { apiUrl } from "./api";

/**
 * Why voice might not work in this context. The microphone API (getUserMedia)
 * is only exposed in a *secure context* (HTTPS or localhost) — over plain http://
 * the browser hides it entirely, no matter the transport. Returns a clear,
 * actionable message, or null if voice can run here.
 */
export function voiceUnsupportedReason(): string | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "Voice isn't available here.";
  if (!window.isSecureContext) {
    return "Voice needs a secure (HTTPS) connection for the microphone — this page is loaded over http://, so the browser blocks mic access. Open Home Assistant over HTTPS (e.g. your Nabu Casa remote URL, or a local TLS/reverse-proxy setup) and voice works everywhere, including the Companion app. Text & charts work fine here.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "The microphone API isn't available in this view. Try opening Dynamic AI in a normal browser tab. Text & charts work fine here.";
  }
  return null;
}

export type VoiceStatus = "idle" | "connecting" | "listening" | "speaking" | "error";

export interface VoiceHandlers {
  onUserText?: (text: string) => void;
  onAssistantText?: (text: string) => void;
  onAssistantDone?: () => void;
  onUi?: (id: string, tree: UiNode) => void;
  onStatus?: (s: VoiceStatus) => void;
  onError?: (msg: string) => void;
}

/**
 * Hands-free voice via the OpenAI Realtime API over WebRTC. Our backend mints a
 * short-lived token (the real key never reaches the browser) and hands over the
 * instructions + tools. Tool calls are executed by the backend (so HA control +
 * safety happen server-side), and any UI the tools produce is rendered inline.
 */
export class VoiceController {
  private pc?: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private micStream?: MediaStream;
  private audioEl?: HTMLAudioElement;
  private assistantBuf = "";

  constructor(private handlers: VoiceHandlers) {}

  async start(): Promise<void> {
    this.handlers.onStatus?.("connecting");

    const reason = voiceUnsupportedReason();
    if (reason) throw new Error(reason);

    const r = await fetch(apiUrl("api/realtime/session"), { method: "POST" });
    if (!r.ok) throw new Error((await r.text().catch(() => "")) || "Could not start voice session");
    const { token, instructions, tools, language } = await r.json();
    if (!token) throw new Error("No ephemeral token returned by the server");

    const pc = new RTCPeerConnection();
    this.pc = pc;

    this.audioEl = document.createElement("audio");
    this.audioEl.autoplay = true;
    pc.ontrack = (e) => {
      if (this.audioEl) this.audioEl.srcObject = e.streams[0];
    };

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      throw new Error(
        `Couldn't access the microphone (${(err as Error).name}). If Dynamic AI is embedded inside Home Assistant, the page may block mic access — open it in a browser tab.`,
      );
    }
    for (const track of this.micStream.getTracks()) pc.addTrack(track, this.micStream);

    const dc = pc.createDataChannel("oai-events");
    this.dc = dc;
    dc.onopen = () => {
      // GA Realtime shape: turn detection + input transcription live under
      // audio.input; voice/model were set server-side at token creation.
      this.send({
        type: "session.update",
        session: {
          type: "realtime",
          instructions,
          tools,
          tool_choice: "auto",
          audio: {
            input: {
              turn_detection: { type: "server_vad" },
              transcription: { model: "gpt-4o-mini-transcribe", ...(language ? { language } : {}) },
            },
          },
        },
      });
      this.handlers.onStatus?.("listening");
    };
    dc.onmessage = (e) => {
      try {
        this.onServerEvent(JSON.parse(e.data));
      } catch {
        /* ignore */
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // GA handshake: POST the SDP offer to /v1/realtime/calls. The model is
    // bound to the ephemeral token, so no model query param is needed.
    const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/sdp" },
    });
    if (!sdpRes.ok) throw new Error("Realtime handshake failed: " + (await sdpRes.text().catch(() => "")));
    await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });
  }

  private send(obj: unknown) {
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(obj));
  }

  private async onServerEvent(ev: any) {
    const t: string = ev.type || "";
    // Match on suffixes so we tolerate minor event-name drift across API versions.
    if (t.endsWith("audio_transcript.delta")) {
      this.assistantBuf += ev.delta || "";
      this.handlers.onAssistantText?.(this.assistantBuf);
      this.handlers.onStatus?.("speaking");
    } else if (t.endsWith("audio_transcript.done")) {
      this.handlers.onAssistantDone?.();
      this.assistantBuf = "";
      this.handlers.onStatus?.("listening");
    } else if (t === "conversation.item.input_audio_transcription.completed") {
      if (ev.transcript) this.handlers.onUserText?.(ev.transcript);
    } else if (t === "response.function_call_arguments.done") {
      await this.handleToolCall(ev.name, ev.call_id, ev.arguments);
    } else if (t === "error") {
      this.handlers.onError?.(ev.error?.message || "Voice error");
    }
  }

  private async handleToolCall(name: string, callId: string, args: string) {
    let result = "{}";
    try {
      const r = await fetch(apiUrl("api/realtime/tool"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, arguments: args }),
      });
      const data = await r.json();
      result = typeof data.result === "string" ? data.result : JSON.stringify(data.result ?? {});
      if (data.ui) this.handlers.onUi?.(callId, data.ui);
    } catch (err) {
      result = "Tool failed: " + (err as Error).message;
    }
    this.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: result } });
    this.send({ type: "response.create" });
  }

  stop(): void {
    try {
      this.dc?.close();
    } catch {
      /* ignore */
    }
    try {
      this.pc?.close();
    } catch {
      /* ignore */
    }
    this.micStream?.getTracks().forEach((t) => t.stop());
    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl = undefined;
    }
    this.handlers.onStatus?.("idle");
  }
}
