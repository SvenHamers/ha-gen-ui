import { useState } from "react";
import type { Provider, PublicSettings } from "@dyn/shared";
import { ExposureManager } from "./ExposureManager";

function Chip({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-xs ${ok === undefined ? "bg-white/10 text-white/70" : ok ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/40"}`}>
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-white/50">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

export function SettingsModal({
  settings,
  provider,
  onProvider,
  onClose,
  onRefresh,
}: {
  settings: PublicSettings;
  provider: Provider;
  onProvider: (p: Provider) => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [manage, setManage] = useState(false);
  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button className="btn-ghost !px-2" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3.5 text-sm">
          <Row label="Run mode">
            <Chip>{settings.mode === "addon" ? "Home Assistant add-on" : "Local dev"}</Chip>
          </Row>
          <Row label="Home Assistant">
            <span className={settings.haConnected ? "text-emerald-300" : "text-rose-300"}>{settings.haConnected ? "Connected" : "Not connected"}</span>
          </Row>

          <Row label="Text brain">
            <div className="flex gap-1">
              <button
                disabled={!settings.providers.openai}
                onClick={() => onProvider("openai")}
                className={`rounded-md px-2 py-1 text-xs ${provider === "openai" ? "bg-brand-500 text-white" : "bg-white/10 text-white/60"} disabled:opacity-30`}
              >
                ChatGPT
              </button>
              <button
                disabled={!settings.providers.anthropic}
                onClick={() => onProvider("anthropic")}
                className={`rounded-md px-2 py-1 text-xs ${provider === "anthropic" ? "bg-brand-500 text-white" : "bg-white/10 text-white/60"} disabled:opacity-30`}
              >
                Claude
              </button>
            </div>
          </Row>

          <Row label="Voice">
            <span className="text-white/70">{settings.voiceEnabled ? `On · ${settings.voiceModel}` : "Needs an OpenAI key"}</span>
          </Row>

          <Row label="Exposed to the AI">
            <button onClick={() => setManage(true)} className="rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20">
              {settings.exposeMode === "all" ? "All entities" : `${settings.exposedCount ?? 0} selected`} · Manage
            </button>
          </Row>

          <Row label="Keys configured">
            <div className="flex gap-1">
              <Chip ok={settings.providers.openai}>OpenAI</Chip>
              <Chip ok={settings.providers.anthropic}>Anthropic</Chip>
            </div>
          </Row>

          <div>
            <div className="mb-1 text-white/50">Allowed control domains</div>
            <div className="flex flex-wrap gap-1">
              {settings.allowedDomains.map((d) => (
                <Chip key={d}>{d}</Chip>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-white/50">Confirm-first (sensitive) domains</div>
            <div className="flex flex-wrap gap-1">
              {settings.confirmDomains.map((d) => (
                <span key={d} className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-300">
                  {d}
                </span>
              ))}
            </div>
          </div>

          <p className="border-t border-white/10 pt-3 text-xs text-white/40">
            {settings.mode === "addon"
              ? "Change keys and control domains in the add-on’s Configuration tab in Home Assistant, then restart the add-on."
              : "Change keys in your .env file and restart the dev server. Allowed/confirm domains use sensible defaults in dev."}
          </p>
        </div>
      </div>
    </div>
    {manage && <ExposureManager onClose={() => setManage(false)} onSaved={onRefresh} />}
    </>
  );
}
