import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ActionRef, UiNode } from "@dyn/shared";
import { runAction } from "../lib/api";
import { Icon } from "./icon";
import { Renderer } from "./Renderer";

type N<T extends UiNode["type"]> = Extract<UiNode, { type: T }>;

function Children({ nodes }: { nodes: UiNode[] }) {
  return (
    <>
      {nodes.map((n, i) => (
        <Renderer key={i} node={n} />
      ))}
    </>
  );
}

// ---- layout -----------------------------------------------------------------

export function Stack({ node }: { node: N<"stack"> }) {
  const horizontal = node.dir === "h";
  return (
    <div
      className={`flex ${horizontal ? "flex-row flex-wrap items-center" : "flex-col"}`}
      style={{ gap: node.gap ?? 10, alignItems: node.align === "stretch" ? "stretch" : node.align }}
    >
      <Children nodes={node.children} />
    </div>
  );
}

export function Grid({ node }: { node: N<"grid"> }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${node.cols ?? 2}, minmax(0,1fr))`, gap: node.gap ?? 10 }}>
      <Children nodes={node.children} />
    </div>
  );
}

export function Card({ node }: { node: N<"card"> }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-4"
      style={node.accent ? { borderColor: node.accent + "55" } : undefined}
    >
      {(node.title || node.icon) && (
        <div className="mb-2 flex items-center gap-2">
          {node.icon && <Icon name={node.icon} className="text-lg" />}
          <div>
            {node.title && <div className="font-semibold leading-tight">{node.title}</div>}
            {node.subtitle && <div className="text-xs text-white/50">{node.subtitle}</div>}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        <Children nodes={node.children} />
      </div>
    </motion.div>
  );
}

export function Section({ node }: { node: N<"section"> }) {
  return (
    <div className="flex flex-col gap-2">
      {node.title && <div className="text-xs font-semibold uppercase tracking-wide text-white/40">{node.title}</div>}
      <Children nodes={node.children} />
    </div>
  );
}

export function Divider() {
  return <div className="my-1 h-px w-full bg-white/10" />;
}

// ---- display ----------------------------------------------------------------

export function Text({ node }: { node: N<"text"> }) {
  const sizeCls = node.size === "lg" ? "text-lg" : node.size === "sm" ? "text-xs" : "text-sm";
  const cls = `${sizeCls} ${node.muted ? "text-white/50" : "text-white/90"} prose-chat`;
  if (node.markdown) {
    return (
      <div className={cls}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{node.markdown}</ReactMarkdown>
      </div>
    );
  }
  return <div className={cls}>{node.text}</div>;
}

export function Stat({ node }: { node: N<"stat"> }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-white/50">
        {node.icon && <Icon name={node.icon} />}
        {node.label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums" style={node.color ? { color: node.color } : undefined}>
          {node.value}
        </span>
        {node.unit && <span className="text-sm text-white/50">{node.unit}</span>}
        {typeof node.delta === "number" && (
          <span className={`ml-1 text-xs ${node.delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {node.delta >= 0 ? "▲" : "▼"} {Math.abs(node.delta)}
          </span>
        )}
      </div>
    </div>
  );
}

const BADGE: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  red: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  blue: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  gray: "bg-white/10 text-white/70 border-white/20",
  violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
};
export function Badge({ node }: { node: N<"badge"> }) {
  return <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs ${BADGE[node.color || "gray"]}`}>{node.text}</span>;
}

export function IconBlock({ node }: { node: N<"icon"> }) {
  return <Icon name={node.name} className="text-xl" style={{ color: node.color, fontSize: node.size }} />;
}

export function Image({ node }: { node: N<"image"> }) {
  return <img src={node.src} alt={node.alt || ""} className={node.rounded ? "rounded-xl" : ""} style={{ maxWidth: "100%" }} />;
}

export function KeyValue({ node }: { node: N<"keyvalue"> }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      {node.rows.map((r, i) => (
        <div key={i} className="flex justify-between gap-3 border-b border-white/5 pb-1">
          <span className="text-white/50">{r.key}</span>
          <span className="text-right font-medium">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Progress({ node }: { node: N<"progress"> }) {
  const pct = Math.max(0, Math.min(100, (node.value / (node.max ?? 100)) * 100));
  return (
    <div>
      {node.label && (
        <div className="mb-1 flex justify-between text-xs text-white/50">
          <span>{node.label}</span>
          <span>{Math.round(pct)}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          className="h-full rounded-full"
          style={{ background: node.color || "#5b8bff" }}
        />
      </div>
    </div>
  );
}

export function Gauge({ node }: { node: N<"gauge"> }) {
  const min = node.min ?? 0;
  const max = node.max ?? 100;
  const pct = Math.max(0, Math.min(1, (node.value - min) / (max - min || 1)));
  const r = 50;
  const circ = Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 72" className="w-40">
        <path d="M10,62 A50,50 0 0 1 110,62" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="11" strokeLinecap="round" />
        <motion.path
          d="M10,62 A50,50 0 0 1 110,62"
          fill="none"
          stroke="#5b8bff"
          strokeWidth="11"
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${pct * circ} ${circ}` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </svg>
      <div className="-mt-6 text-center">
        <div className="text-2xl font-semibold tabular-nums">
          {node.value}
          {node.unit && <span className="text-sm text-white/50">{node.unit}</span>}
        </div>
        {node.label && <div className="text-xs text-white/50">{node.label}</div>}
      </div>
    </div>
  );
}

export function Sparkline({ node }: { node: N<"sparkline"> }) {
  const pts = node.points;
  if (!pts.length) return null;
  const w = 140;
  const h = 36;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const d = pts.map((v, i) => `${(i / (pts.length - 1 || 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={d} fill="none" stroke={node.color || "#5b8bff"} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Timeline({ node }: { node: N<"timeline"> }) {
  return (
    <div className="flex flex-col gap-2">
      {node.items.map((it, i) => (
        <div key={i} className="flex items-start gap-2 text-sm">
          <div className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: it.color || "#5b8bff" }} />
          <div>
            <span className="text-white/40">{it.time}</span> — {it.icon && <Icon name={it.icon} />} {it.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Entity({ node }: { node: N<"entity"> }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon name={node.icon || "home-assistant"} className="text-lg" />
        <span className="text-sm">{node.name || node.entityId}</span>
      </div>
      {node.state !== undefined && (
        <span className="text-sm font-medium">
          {node.state}
          {node.unit ? ` ${node.unit}` : ""}
        </span>
      )}
    </div>
  );
}

// ---- interactive (the safe action bridge) -----------------------------------

type ActState = "idle" | "running" | "success" | "error";

function StatusGlyph({ state }: { state: ActState }) {
  return (
    <AnimatePresence mode="wait">
      <motion.span key={state} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
        {state === "running" && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
        {state === "success" && <span className="text-emerald-400">✓</span>}
        {state === "error" && <span className="text-rose-400">✕</span>}
      </motion.span>
    </AnimatePresence>
  );
}

export function ActionCard({ node }: { node: N<"action_card"> }) {
  const [state, setState] = useState<ActState>((node.state as ActState) || "idle");
  const [message, setMessage] = useState(node.message || "");
  const needsConfirm = state === "idle";

  async function run() {
    setState("running");
    const res = await runAction(node.action);
    if (res.ok) {
      setState("success");
      setMessage(res.message || "Done");
    } else {
      setState("error");
      setMessage(res.error || "Failed");
    }
  }

  return (
    <motion.div layout className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <Icon name={node.icon || "flash"} className="text-lg" />
        <div>
          <div className="text-sm font-medium">{node.label}</div>
          {message && <div className="text-xs text-white/50">{message}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {needsConfirm ? (
          <button className="btn-primary !py-1.5 !px-3 text-xs" onClick={run}>
            Confirm
          </button>
        ) : (
          <StatusGlyph state={state} />
        )}
      </div>
    </motion.div>
  );
}

/** Replace the first numeric field of action.data with `value` (so a brightness
 * slider whose action.data is { brightness_pct: 0 } works), else set data.value. */
function withValue(action: ActionRef, value: number): ActionRef {
  const data: Record<string, any> = { ...(action.data || {}) };
  const numKey = Object.keys(data).find((k) => typeof data[k] === "number");
  if (numKey) data[numKey] = value;
  else data.value = value;
  return { ...action, data };
}

export function ActionButtonBlock({ node }: { node: N<"button"> }) {
  const [state, setState] = useState<ActState>("idle");
  async function run() {
    setState("running");
    const res = await runAction(node.action);
    setState(res.ok ? "success" : "error");
    if (res.ok) setTimeout(() => setState("idle"), 1500);
  }
  const cls = node.variant === "danger" ? "btn-danger" : node.variant === "primary" ? "btn-primary" : "btn-ghost border border-white/15";
  return (
    <button className={`${cls} w-fit`} onClick={run} disabled={state === "running"}>
      {node.icon && <Icon name={node.icon} />}
      {node.label}
      {state !== "idle" && <StatusGlyph state={state} />}
    </button>
  );
}

export function Toggle({ node }: { node: N<"toggle"> }) {
  const [on, setOn] = useState(node.on);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    const res = await runAction(node.action);
    setBusy(false);
    if (res.ok) setOn((v) => !v);
  }
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2">
      <span className="text-sm">{node.label}</span>
      <button
        onClick={toggle}
        disabled={busy}
        className={`relative h-6 w-11 rounded-full transition ${on ? "bg-brand-500" : "bg-white/15"}`}
      >
        <motion.span layout className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow" style={{ left: on ? 22 : 2 }} />
      </button>
    </div>
  );
}

export function Slider({ node }: { node: N<"slider"> }) {
  const [value, setValue] = useState(node.value);
  const [state, setState] = useState<ActState>("idle");
  async function commit(v: number) {
    setState("running");
    const res = await runAction(withValue(node.action, v));
    setState(res.ok ? "success" : "error");
    if (res.ok) setTimeout(() => setState("idle"), 1200);
  }
  return (
    <div className="rounded-xl bg-white/[0.04] px-3 py-2">
      <div className="mb-1 flex justify-between text-sm">
        <span>{node.label}</span>
        <span className="tabular-nums text-white/60">
          {value}
          {node.unit}
          <span className="ml-2 inline-block w-3 align-middle">{state !== "idle" && <StatusGlyph state={state} />}</span>
        </span>
      </div>
      <input
        type="range"
        className="w-full accent-brand-500"
        min={node.min ?? 0}
        max={node.max ?? 100}
        step={node.step ?? 1}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        onMouseUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => commit(Number((e.target as HTMLInputElement).value))}
      />
    </div>
  );
}
