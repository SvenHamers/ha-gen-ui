import type { PublicSettings } from "@dyn/shared";
import type { ConversationSummary } from "../lib/api";

export function Sidebar({
  open,
  conversations,
  currentId,
  settings,
  onNewChat,
  onOpen,
  onDelete,
  onOpenSettings,
}: {
  open: boolean;
  conversations: ConversationSummary[];
  currentId: string;
  settings: PublicSettings | null;
  onNewChat: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
}) {
  if (!open) return null;
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-ink-900/50 p-3 md:flex">
      <div className="flex items-center gap-2 px-1 py-1.5">
        <span className="text-xl">🤖</span>
        <span className="font-semibold">Dynamic AI</span>
      </div>
      <button className="btn-primary mt-2 w-full" onClick={onNewChat}>
        + New chat
      </button>

      <div className="mt-3 flex-1 overflow-y-auto">
        {conversations.length === 0 && <div className="px-2 py-4 text-xs text-white/40">No conversations yet.</div>}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`group flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition hover:bg-white/5 ${
              c.id === currentId ? "bg-white/10" : ""
            }`}
          >
            <button className="min-w-0 flex-1 truncate text-left" onClick={() => onOpen(c.id)} title={c.title}>
              {c.title || "Untitled"}
            </button>
            <button
              className="ml-1 shrink-0 text-white/30 opacity-0 transition hover:text-rose-400 group-hover:opacity-100"
              onClick={() => onDelete(c.id)}
              aria-label="Delete conversation"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button onClick={onOpenSettings} className="mt-2 rounded-lg border border-white/10 px-3 py-2 text-left text-xs text-white/60 hover:bg-white/5">
        <div className="flex items-center justify-between">
          <span>Settings</span>
          <span>⚙️</span>
        </div>
        {settings && (
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/40">
            <span className={`h-1.5 w-1.5 rounded-full ${settings.haConnected ? "bg-emerald-400" : "bg-rose-400"}`} />
            {settings.haConnected ? "Home Assistant connected" : "HA not connected"}
            <span className="rounded bg-white/10 px-1">{settings.mode}</span>
          </div>
        )}
      </button>
    </aside>
  );
}
