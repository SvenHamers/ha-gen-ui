import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessageDTO, Provider, PublicSettings, ServerEvent, UiNode } from "@dyn/shared";
import {
  deleteConversation,
  fetchSettings,
  getConversation,
  listConversations,
  streamChat,
  uid,
  type ConversationSummary,
} from "./lib/api";
import type { ChatMessage, Part } from "./lib/types";
import { voiceUnsupportedReason } from "./lib/realtime";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { Composer } from "./components/Composer";
import { VoicePanel } from "./components/VoicePanel";
import { SettingsModal } from "./components/SettingsModal";
import { TopBar } from "./components/TopBar";

function toDTO(messages: ChatMessage[]): ChatMessageDTO[] {
  return messages
    .map((m) => ({
      role: m.role,
      content: m.parts.filter((p): p is Extract<Part, { kind: "text" }> => p.kind === "text").map((p) => p.text).join(""),
    }))
    .filter((m) => m.content.trim().length > 0);
}

// Minimal/embed mode (e.g. a Lovelace webpage card or wall tablet): ?embed=1
// hides the sidebar + top bar and shows just the chat. ?embed=0 / absent = full UI.
const EMBED = (() => {
  if (typeof window === "undefined") return false;
  const v = new URLSearchParams(window.location.search).get("embed");
  return v !== null && v !== "0" && v !== "false";
})();

export default function App() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentId, setCurrentId] = useState<string>(() => uid());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [provider, setProvider] = useState<Provider>("openai");
  const [sending, setSending] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const refreshConversations = useCallback(() => {
    listConversations().then(setConversations);
  }, []);

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setSettings(s);
        const saved = localStorage.getItem("provider") as Provider | null;
        setProvider(saved && s.providers[saved] ? saved : s.defaultProvider);
      })
      .catch(() => setSettings(null));
    refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    localStorage.setItem("provider", provider);
  }, [provider]);

  // --- message helpers -------------------------------------------------------
  const patch = useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const handleEvent = useCallback(
    (asstId: string, ev: ServerEvent) => {
      patch(asstId, (msg) => {
        const parts = [...msg.parts];
        switch (ev.type) {
          case "text": {
            const last = parts[parts.length - 1];
            if (last && last.kind === "text") parts[parts.length - 1] = { kind: "text", text: last.text + ev.delta };
            else parts.push({ kind: "text", text: ev.delta });
            break;
          }
          case "tool_call":
            parts.push({ kind: "tool", id: ev.id, name: ev.name, status: "running" });
            break;
          case "tool_result":
            for (let i = 0; i < parts.length; i++) {
              const p = parts[i];
              if (p.kind === "tool" && p.id === ev.id) parts[i] = { ...p, status: ev.ok ? "ok" : "error", summary: ev.summary, error: ev.error };
            }
            break;
          case "ui":
            parts.push({ kind: "ui", id: ev.id, tree: ev.tree });
            break;
          case "error":
            parts.push({ kind: "text", text: `\n\n⚠️ ${ev.message}` });
            break;
        }
        const streaming = ev.type !== "done";
        return { ...msg, parts, streaming };
      });
    },
    [patch],
  );

  // --- send a text message ---------------------------------------------------
  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;
      const userMsg: ChatMessage = { id: uid(), role: "user", parts: [{ kind: "text", text }], ts: Date.now() };
      const base = [...messages, userMsg];
      const asstId = uid();
      setMessages([...base, { id: asstId, role: "assistant", parts: [], ts: Date.now(), streaming: true }]);
      setSending(true);
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        await streamChat({ messages: toDTO(base), provider, conversationId: currentId }, (ev) => handleEvent(asstId, ev), ac.signal);
      } catch (err) {
        patch(asstId, (m) => ({ ...m, parts: [...m.parts, { kind: "text", text: `⚠️ ${(err as Error).message}` }], streaming: false }));
      } finally {
        setSending(false);
        patch(asstId, (m) => ({ ...m, streaming: false }));
        refreshConversations();
      }
    },
    [messages, provider, currentId, sending, handleEvent, patch, refreshConversations],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setSending(false);
  }, []);

  // --- conversation management ----------------------------------------------
  const newChat = useCallback(() => {
    stop();
    setMessages([]);
    setCurrentId(uid());
  }, [stop]);

  const openConversation = useCallback(async (id: string) => {
    stop();
    const c = await getConversation(id);
    if (!c) return;
    setCurrentId(id);
    setMessages(c.messages.map((m) => ({ id: uid(), role: m.role, parts: [{ kind: "text", text: m.content }], ts: Date.now() })));
  }, [stop]);

  const removeConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      refreshConversations();
      if (id === currentId) newChat();
    },
    [currentId, newChat, refreshConversations],
  );

  // --- voice → message wiring ------------------------------------------------
  const voiceAsstId = useRef<string | null>(null);
  const ensureVoiceAsst = useCallback((): string => {
    if (voiceAsstId.current) return voiceAsstId.current;
    const id = uid();
    voiceAsstId.current = id;
    setMessages((m) => [...m, { id, role: "assistant", parts: [], ts: Date.now(), streaming: true }]);
    return id;
  }, []);

  const voiceHandlers = {
    onUserText: (text: string) => {
      voiceAsstId.current = null;
      setMessages((m) => [...m, { id: uid(), role: "user" as const, parts: [{ kind: "text" as const, text }], ts: Date.now() }]);
    },
    onAssistantText: (text: string) => {
      const id = ensureVoiceAsst();
      patch(id, (msg) => {
        const parts = msg.parts.filter((p) => p.kind !== "text");
        return { ...msg, parts: [{ kind: "text", text }, ...parts] };
      });
    },
    onUi: (uiId: string, tree: UiNode) => {
      const id = ensureVoiceAsst();
      patch(id, (msg) => ({ ...msg, parts: [...msg.parts, { kind: "ui", id: uiId, tree }] }));
    },
    onAssistantDone: () => {
      if (voiceAsstId.current) patch(voiceAsstId.current, (m) => ({ ...m, streaming: false }));
      voiceAsstId.current = null;
    },
  };

  const noKey = settings && !settings.providers.openai && !settings.providers.anthropic;
  // Only offer voice where the mic can actually run (secure context / has WebRTC or WS + mic).
  const voiceSupported = voiceUnsupportedReason() === null;

  return (
    <div className="flex h-full text-[15px]">
      {!EMBED && (
        <Sidebar
          open={sidebarOpen}
          conversations={conversations}
          currentId={currentId}
          settings={settings}
          onNewChat={newChat}
          onOpen={openConversation}
          onDelete={removeConversation}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      <main className="flex h-full min-w-0 flex-1 flex-col">
        {!EMBED && (
          <TopBar
            settings={settings}
            provider={provider}
            onProvider={setProvider}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
        <ChatView messages={messages} noKey={!!noKey} onSuggest={send} />
        {voiceActive ? (
          <VoicePanel handlers={voiceHandlers} onClose={() => setVoiceActive(false)} />
        ) : (
          <Composer
            disabled={!!noKey}
            sending={sending}
            voiceEnabled={!!settings?.voiceEnabled && voiceSupported}
            voiceActive={voiceActive}
            onSend={send}
            onStop={stop}
            onToggleVoice={() => setVoiceActive((v) => !v)}
          />
        )}
      </main>
      {settingsOpen && settings && (
        <SettingsModal
          settings={settings}
          provider={provider}
          onProvider={setProvider}
          onClose={() => setSettingsOpen(false)}
          onRefresh={() => fetchSettings().then(setSettings).catch(() => {})}
        />
      )}
    </div>
  );
}
