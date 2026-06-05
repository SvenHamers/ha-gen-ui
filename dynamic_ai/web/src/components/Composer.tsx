import { useLayoutEffect, useRef, useState } from "react";

export function Composer({
  disabled,
  sending,
  voiceEnabled,
  voiceActive,
  onSend,
  onStop,
  onToggleVoice,
}: {
  disabled: boolean;
  sending: boolean;
  voiceEnabled: boolean;
  voiceActive: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onToggleVoice: () => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [text]);

  function submit() {
    const t = text.trim();
    if (!t || sending) return;
    onSend(t);
    setText("");
  }

  return (
    <div className="border-t border-white/10 px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          disabled={disabled}
          placeholder={disabled ? "Add an API key in Settings to start…" : "Message Dynamic AI…  (e.g. “battery levels today”)"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-44 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none placeholder:text-white/30 focus:border-brand-500/60"
        />
        {voiceEnabled && (
          <button
            onClick={onToggleVoice}
            title="Hands-free voice"
            className={`btn !h-11 !w-11 !px-0 text-lg ${voiceActive ? "bg-rose-500 text-white" : "bg-white/10 text-white/80 hover:bg-white/20"}`}
          >
            🎤
          </button>
        )}
        {sending ? (
          <button onClick={onStop} title="Stop" className="btn bg-white/15 !h-11 !w-11 !px-0 text-white">
            ◼
          </button>
        ) : (
          <button onClick={submit} disabled={disabled || !text.trim()} title="Send" className="btn-primary !h-11 !w-11 !px-0 text-lg disabled:opacity-40">
            ➤
          </button>
        )}
      </div>
      <div className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-white/30">
        Dynamic AI can read and control your home — sensitive actions ask for confirmation.
      </div>
    </div>
  );
}
