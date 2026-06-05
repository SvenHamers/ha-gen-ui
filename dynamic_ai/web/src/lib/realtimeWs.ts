import type { UiNode } from "@dyn/shared";
import { apiUrl } from "./api";
import { voiceUnsupportedReason, type VoiceHandlers } from "./realtime";

/**
 * WebSocket voice transport — no WebRTC. Captures the mic with getUserMedia +
 * ScriptProcessor (PCM16 @ 24 kHz), streams it to our backend relay, and plays
 * the returned audio via the Web Audio API. Works in the Home Assistant
 * Companion app's webview, where Assist's mic works but RTCPeerConnection is
 * unavailable.
 */
export class VoiceWsController {
  private ws?: WebSocket;
  private ctx?: AudioContext;
  private micStream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private proc?: ScriptProcessorNode;
  private nextStart = 0;
  private playing: AudioBufferSourceNode[] = [];
  private capturing = false;

  constructor(private handlers: VoiceHandlers) {}

  async start(): Promise<void> {
    this.handlers.onStatus?.("connecting");
    const reason = voiceUnsupportedReason();
    if (reason) throw new Error(reason);
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      throw new Error(`Couldn't access the microphone (${(err as Error).name}).`);
    }

    const u = new URL(apiUrl("api/realtime/ws"));
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(u.toString());
    this.ws = ws;
    ws.binaryType = "arraybuffer";
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        try {
          this.onJson(JSON.parse(e.data));
        } catch {
          /* ignore */
        }
      } else {
        this.playPcm(e.data as ArrayBuffer);
      }
    };
    ws.onerror = () => this.handlers.onError?.("Voice connection error");
    ws.onclose = () => this.handlers.onStatus?.("idle");
  }

  private onJson(msg: any) {
    switch (msg.type) {
      case "ready":
        this.beginCapture();
        this.handlers.onStatus?.("listening");
        break;
      case "assistant_text":
        this.handlers.onAssistantText?.(msg.text);
        break;
      case "assistant_done":
        this.handlers.onAssistantDone?.();
        this.handlers.onStatus?.("listening");
        break;
      case "user_text":
        this.handlers.onUserText?.(msg.text);
        break;
      case "ui":
        this.handlers.onUi?.(`ws-${this.nextStart.toFixed(3)}-${msg.tree?.type ?? ""}`, msg.tree as UiNode);
        break;
      case "clear_audio":
        this.clearPlayback();
        break;
      case "error":
        this.handlers.onError?.(msg.message || "Voice error");
        break;
    }
  }

  private beginCapture() {
    if (this.capturing || !this.micStream) return;
    this.capturing = true;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = this.ctx || new Ctx();
    this.ctx = ctx;
    void ctx.resume();
    const source = ctx.createMediaStreamSource(this.micStream);
    this.source = source;
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    this.proc = proc;
    const inRate = ctx.sampleRate;
    proc.onaudioprocess = (e) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const pcm = downsampleToPcm16(e.inputBuffer.getChannelData(0), inRate, 24000);
      this.ws.send(pcm.buffer);
    };
    source.connect(proc);
    proc.connect(ctx.destination); // needed to pump; we never write output so it's silent
  }

  private playPcm(buf: ArrayBuffer) {
    const ctx = this.ctx;
    if (!ctx) return;
    const int16 = new Int16Array(buf);
    if (!int16.length) return;
    const audioBuf = ctx.createBuffer(1, int16.length, 24000);
    const ch = audioBuf.getChannelData(0);
    for (let i = 0; i < int16.length; i++) ch[i] = int16[i] / 0x8000;
    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(ctx.destination);
    const t = Math.max(ctx.currentTime + 0.02, this.nextStart);
    src.start(t);
    this.nextStart = t + audioBuf.duration;
    this.playing.push(src);
    src.onended = () => {
      this.playing = this.playing.filter((s) => s !== src);
    };
    this.handlers.onStatus?.("speaking");
  }

  private clearPlayback() {
    for (const s of this.playing) {
      try {
        s.stop();
      } catch {
        /* ignore */
      }
    }
    this.playing = [];
    this.nextStart = 0;
  }

  stop(): void {
    this.clearPlayback();
    try {
      this.proc?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    this.micStream?.getTracks().forEach((t) => t.stop());
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.handlers.onStatus?.("idle");
  }
}

function clampToInt16(s: number): number {
  const v = Math.max(-1, Math.min(1, s));
  return v < 0 ? v * 0x8000 : v * 0x7fff;
}

function downsampleToPcm16(input: Float32Array, inRate: number, outRate: number): Int16Array {
  if (inRate === outRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = clampToInt16(input[i]);
    return out;
  }
  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = clampToInt16(input[Math.floor(i * ratio)]);
  return out;
}
