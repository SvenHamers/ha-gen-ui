import { VoiceController, type VoiceHandlers } from "./realtime";
import { VoiceWsController } from "./realtimeWs";

export interface VoiceTransport {
  start(): Promise<void>;
  stop(): void;
}

/**
 * Pick the best voice transport for this environment:
 * - WebRTC (lowest latency) when RTCPeerConnection exists (desktop browsers).
 * - WebSocket relay otherwise — e.g. the Home Assistant Companion app's webview,
 *   which has the mic but no WebRTC.
 */
export function createVoiceController(handlers: VoiceHandlers): VoiceTransport {
  const hasWebRTC = typeof RTCPeerConnection !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  return hasWebRTC ? new VoiceController(handlers) : new VoiceWsController(handlers);
}
