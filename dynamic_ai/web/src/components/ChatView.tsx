import { useEffect, useRef } from "react";
import type { ChatMessage } from "../lib/types";
import { MessageBubble } from "./MessageBubble";

const SUGGESTIONS = [
  "What's the status of my home right now?",
  "Show me the battery levels of today",
  "Is anyone home?",
  "Turn off the living room lights",
];

function EmptyState({ noKey, onSuggest }: { noKey: boolean; onSuggest: (t: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl">🤖</div>
      <h1 className="mt-4 text-2xl font-semibold">Hey, I'm your home's AI</h1>
      <p className="mt-2 max-w-md text-sm text-white/50">
        Ask me about your home and I'll <span className="text-white/80">draw</span> the answer. Tell me to do something and I'll{" "}
        <span className="text-white/80">do it</span> — with live feedback.
      </p>
      {noKey ? (
        <div className="mt-6 max-w-md rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          No AI key configured yet. Add an OpenAI key (and optionally an Anthropic key) in the add-on settings — or your <code>.env</code> for local
          dev — then reload.
        </div>
      ) : (
        <div className="mt-6 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => onSuggest(s)} className="card px-3 py-2.5 text-left text-sm text-white/80 transition hover:bg-white/[0.06]">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatView({ messages, noKey, onSuggest }: { messages: ChatMessage[]; noKey: boolean; onSuggest: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div ref={ref} className="flex-1 overflow-y-auto">
      <div className="mx-auto h-full max-w-3xl px-4 py-6">
        {messages.length === 0 ? <EmptyState noKey={noKey} onSuggest={onSuggest} /> : messages.map((m) => <MessageBubble key={m.id} message={m} />)}
      </div>
    </div>
  );
}
