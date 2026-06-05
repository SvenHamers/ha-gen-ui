import type { Provider, PublicSettings } from "@dyn/shared";

function ProviderPicker({ settings, provider, onProvider }: { settings: PublicSettings; provider: Provider; onProvider: (p: Provider) => void }) {
  const opts: { id: Provider; label: string }[] = [];
  if (settings.providers.openai) opts.push({ id: "openai", label: "ChatGPT" });
  if (settings.providers.anthropic) opts.push({ id: "anthropic", label: "Claude" });
  if (opts.length === 0) return null;
  if (opts.length === 1) return <span className="text-xs text-white/40">{opts[0].label}</span>;
  return (
    <div className="flex rounded-lg bg-white/5 p-0.5 text-xs">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onProvider(o.id)}
          className={`rounded-md px-2.5 py-1 transition ${provider === o.id ? "bg-brand-500 text-white" : "text-white/60 hover:text-white"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TopBar({
  settings,
  provider,
  onProvider,
  onToggleSidebar,
  onOpenSettings,
}: {
  settings: PublicSettings | null;
  provider: Provider;
  onProvider: (p: Provider) => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
      <button className="btn-ghost !px-2 md:hidden" onClick={onToggleSidebar} aria-label="Toggle sidebar">
        ☰
      </button>
      <div className="font-semibold md:hidden">Dynamic AI</div>
      <div className="flex-1" />
      {settings && <ProviderPicker settings={settings} provider={provider} onProvider={onProvider} />}
      <button className="btn-ghost !px-2" onClick={onOpenSettings} aria-label="Settings" title="Settings">
        ⚙️
      </button>
    </header>
  );
}
