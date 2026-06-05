import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { VoiceHandlers, VoiceStatus } from "../lib/realtime";
import { createVoiceController, type VoiceTransport } from "../lib/voice";

const LABEL: Record<VoiceStatus, string> = {
  connecting: "Connecting…",
  listening: "Listening — just talk",
  speaking: "Speaking…",
  idle: "Idle",
  error: "Voice error",
};

/**
 * A slim, inline voice bar that takes the composer's place while active — so
 * the chat above (live transcript + generated charts/cards) stays fully visible.
 */
export function VoicePanel({ handlers, onClose }: { handlers: VoiceHandlers; onClose: () => void }) {
  const [status, setStatus] = useState<VoiceStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const ctrlRef = useRef<VoiceTransport | null>(null);

  useEffect(() => {
    const c = createVoiceController({
      ...handlers,
      onStatus: setStatus,
      onError: (m) => {
        setError(m);
        setStatus("error");
      },
    });
    ctrlRef.current = c;
    c.start().catch((e) => {
      setError((e as Error).message);
      setStatus("error");
    });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    ctrlRef.current?.stop();
    onClose();
  }

  const active = status === "listening" || status === "speaking";
  return (
    <div className="border-t border-white/10 bg-ink-900/40 px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <motion.div
          animate={{ scale: status === "speaking" ? [1, 1.25, 1] : active ? [1, 1.12, 1] : 1 }}
          transition={{ repeat: Infinity, duration: status === "speaking" ? 0.7 : 1.8 }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
          style={{
            background: "radial-gradient(circle at 50% 38%, #8db0ff, #3f6fe6 60%, #233067)",
            boxShadow: active ? "0 0 22px rgba(91,139,255,0.5)" : "none",
          }}
        >
          🎙️
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{LABEL[status]}</div>
          {error ? (
            <div className="text-xs leading-snug text-rose-300">{error}</div>
          ) : (
            <div className="truncate text-xs text-white/40">Hands-free — the transcript &amp; cards appear above as you talk</div>
          )}
        </div>
        <button onClick={close} className="btn-danger shrink-0">
          End voice
        </button>
      </div>
    </div>
  );
}
