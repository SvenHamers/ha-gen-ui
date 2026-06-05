import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, Part } from "../lib/types";
import { Renderer } from "../ui/Renderer";

const TOOL_LABEL: Record<string, string> = {
  list_entities: "Finding devices",
  get_states: "Checking current state",
  get_history: "Reading history",
  call_service: "Running action",
};

function ToolChip({ part }: { part: Extract<Part, { kind: "tool" }> }) {
  // The rendered UI itself is the feedback for render_ui — no chip needed.
  if (part.name === "render_ui") return null;
  const label = TOOL_LABEL[part.name] || part.name;
  return (
    <div className="flex w-fit items-center gap-2 rounded-full bg-white/[0.04] px-2.5 py-1 text-xs text-white/50">
      {part.status === "running" ? (
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
      ) : part.status === "error" ? (
        <span className="text-rose-400">✕</span>
      ) : (
        <span className="text-emerald-400">✓</span>
      )}
      <span>{part.summary || label}</span>
    </div>
  );
}

function PartView({ part }: { part: Part }) {
  if (part.kind === "text") {
    if (!part.text.trim()) return null;
    return (
      <div className="prose-chat text-[15px] leading-relaxed text-white/90">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
      </div>
    );
  }
  if (part.kind === "tool") return <ToolChip part={part} />;
  if (part.kind === "ui") return <Renderer node={part.tree} />;
  return null;
}

function Typing() {
  return (
    <div className="flex items-center gap-1 py-1 text-white/50">
      <span className="typing-dot text-2xl leading-none">·</span>
      <span className="typing-dot text-2xl leading-none">·</span>
      <span className="typing-dot text-2xl leading-none">·</span>
    </div>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  if (isUser) {
    const text = message.parts.filter((p): p is Extract<Part, { kind: "text" }> => p.kind === "text").map((p) => p.text).join("");
    return (
      <div className="mb-5 flex justify-end">
        <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl bg-brand-500/90 px-4 py-2.5 text-white">{text}</div>
      </div>
    );
  }

  const empty = message.parts.length === 0 || message.parts.every((p) => p.kind === "text" && !p.text.trim());
  return (
    <div className="mb-6 flex justify-start">
      <div className="flex w-full flex-col gap-3">
        {message.parts.map((p, i) => (
          <PartView key={i} part={p} />
        ))}
        {message.streaming && empty && <Typing />}
      </div>
    </div>
  );
}
