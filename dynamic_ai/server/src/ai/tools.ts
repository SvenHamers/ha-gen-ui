import { RenderUiArgsSchema, type ActionRef, type UiNode } from "@dyn/shared";
import type { AppConfig } from "../config";
import { entityIdsOf } from "../exposure";
import { HaClient, type HaState } from "../ha/client";
import { log } from "../logger";
import type { ToolDef } from "./types";

export interface ToolContext {
  cfg: AppConfig;
  ha: HaClient;
  /** True if the entity is exposed to the assistant (see Settings → exposure). */
  isExposed: (entityId: string) => boolean;
}

export interface ToolExecResult {
  /** String handed back to the model as the tool result. */
  modelResult: string;
  /** Optional building-block tree to render on screen. */
  ui?: UiNode;
  ok: boolean;
  summary?: string;
  error?: string;
}

// --- the generative-UI vocabulary, described for the model -------------------

const UI_VOCAB = `Pass { "tree": <node> }. A node is an object with a "type" and fields:
LAYOUT: {type:"stack",dir?:"v"|"h",gap?,align?,children:[node]} | {type:"grid",cols?:1-6,children:[node]} | {type:"card",title?,subtitle?,icon?(mdi name),accent?(hex),children:[node]} | {type:"section",title?,children:[node]} | {type:"divider"}
DISPLAY: {type:"text",text?|markdown?,muted?,size?:"sm"|"md"|"lg"} | {type:"stat",label,value,unit?,delta?,icon?} | {type:"badge",text,color?:"green"|"red"|"amber"|"blue"|"gray"|"violet"} | {type:"icon",name,color?} | {type:"image",src,alt?} | {type:"keyvalue",rows:[{key,value}]} | {type:"progress",value,max?,label?} | {type:"gauge",value,min?,max?,unit?,label?}
DATA VIZ: {type:"chart",kind:"line"|"bar"|"area"|"scatter",series:[{label,points:[[x,y]]}],unit?,xType?:"time"|"category",title?} | {type:"sparkline",points:[number]} | {type:"timeline",items:[{time,label,icon?}]}
HOME: {type:"entity",entityId,name?,state?,unit?,icon?} | {type:"action_card",label,icon?,action:ACTION,state?:"idle"|"running"|"success"|"error",message?}
INTERACTIVE: {type:"button",label,action:ACTION,variant?} | {type:"toggle",label,on,action:ACTION} | {type:"slider",label,value,min?,max?,step?,action:ACTION}
ACTION = {ref:"call_service",domain,service,target?:{entity_id},data?}. Charts: for time-series use xType:"time" and ISO time strings as x. Top-level node is usually a "card" or "stack".`;

export function buildToolDefs(): ToolDef[] {
  return [
    {
      name: "list_entities",
      description: "List/search the user's Home Assistant entities to resolve names to entity_ids. Returns entity_id, friendly name, state and domain.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Filter by domain, e.g. 'light', 'sensor', 'cover'." },
          search: { type: "string", description: "Case-insensitive substring matched against entity_id or friendly name." },
          limit: { type: "number", description: "Max results (default 60)." },
        },
      },
    },
    {
      name: "get_states",
      description: "Get the current state and attributes of specific entities.",
      parameters: {
        type: "object",
        properties: { entity_ids: { type: "array", items: { type: "string" }, description: "Entity ids to fetch." } },
        required: ["entity_ids"],
      },
    },
    {
      name: "get_history",
      description:
        "Get historical values for entities — for plotting trends OR reading a value at a past time. Give either a preset `period`, or an explicit `start`/`end` ISO range. For a value at a specific moment, request a NARROW window ending at that moment. Home Assistant only logs a point when the value changes, so the value 'at' time T is the most recent point at or before T (each series reports summary.last and summary.lastAt).",
      parameters: {
        type: "object",
        properties: {
          entity_ids: { type: "array", items: { type: "string" }, description: "Entity ids." },
          period: { type: "string", enum: ["today", "24h", "7d", "30d"], description: "Preset range (default 'today'). Ignored when start is given." },
          start: { type: "string", description: "ISO start time, e.g. '2026-06-04T13:00:00+02:00'. Overrides period." },
          end: { type: "string", description: "ISO end time (defaults to now). For 'value at 3pm yesterday', set end to ~3pm and start a couple of hours earlier." },
        },
        required: ["entity_ids"],
      },
    },
    {
      name: "call_service",
      description: "Control the home by calling a Home Assistant service (e.g. light.turn_off). Sensitive domains are not run immediately — the user is shown a confirmation button.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "e.g. 'light'" },
          service: { type: "string", description: "e.g. 'turn_on'" },
          entity_id: {
            description: "Target entity id, or list of ids.",
            anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
          },
          data: { type: "object", description: 'Extra service data, e.g. {"brightness_pct": 60}.' },
        },
        required: ["domain", "service"],
      },
    },
    {
      name: "render_ui",
      description: "Render rich UI on the user's screen from building blocks. Prefer this over plain text whenever there is data to show. " + UI_VOCAB,
      parameters: {
        type: "object",
        properties: { tree: { type: "object", description: "The root building-block node." } },
        required: ["tree"],
      },
    },
  ];
}

// --- helpers -----------------------------------------------------------------

function toNumber(state: string): number | null {
  const n = parseFloat(state);
  if (!Number.isNaN(n)) return n;
  const s = state.toLowerCase();
  if (["on", "home", "open", "true", "playing", "unlocked", "active"].includes(s)) return 1;
  if (["off", "away", "closed", "false", "idle", "locked", "not_home", "standby", "inactive"].includes(s)) return 0;
  return null;
}

function downsample<T>(arr: T[], target: number): T[] {
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  const out: T[] = [];
  for (let i = 0; i < target; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
}

function periodStart(period: string): Date {
  const now = new Date();
  if (period === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const hours = period === "7d" ? 24 * 7 : period === "30d" ? 24 * 30 : 24;
  return new Date(now.getTime() - hours * 3600 * 1000);
}

/** Build an ActionRef from loose call_service input. */
function toActionRef(input: any): ActionRef {
  const target = input.entity_id ? { entity_id: input.entity_id } : input.target;
  return { ref: "call_service", domain: String(input.domain), service: String(input.service), target, data: input.data };
}

function targetLabel(action: ActionRef): string {
  const e = action.target?.entity_id;
  if (Array.isArray(e)) return e.join(", ");
  return e || action.target?.area_id?.toString() || "(no target)";
}

/** Decide how a proposed action should be handled. */
export function actionDisposition(cfg: AppConfig, domain: string): "execute" | "confirm" | "blocked" {
  if (cfg.confirmDomains.includes(domain)) return "confirm";
  if (cfg.allowedDomains.includes(domain)) return "execute";
  return "blocked";
}

/** Run a service now and read back the resulting state for feedback. */
export async function executeActionNow(ctx: ToolContext, action: ActionRef): Promise<{ message: string; state?: HaState }> {
  await ctx.ha.callService(action.domain, action.service, action.target, action.data);
  let state: HaState | undefined;
  const eid = Array.isArray(action.target?.entity_id) ? action.target?.entity_id[0] : action.target?.entity_id;
  if (eid) {
    try {
      state = await ctx.ha.getState(eid);
    } catch {
      /* ignore */
    }
  }
  const msg = state
    ? `${state.attributes?.friendly_name || state.entity_id} is now ${state.state}${state.attributes?.unit_of_measurement || ""}`
    : `${action.domain}.${action.service} called`;
  return { message: msg, state };
}

// --- the executor ------------------------------------------------------------

export async function executeTool(name: string, input: any, ctx: ToolContext): Promise<ToolExecResult> {
  try {
    switch (name) {
      case "list_entities": {
        const states = await ctx.ha.getStates();
        const domain: string | undefined = input?.domain;
        const search: string | undefined = input?.search?.toLowerCase();
        const limit: number = Math.min(Number(input?.limit) || 60, 200);
        let rows = states.filter((s) => ctx.isExposed(s.entity_id));
        if (domain) rows = rows.filter((s) => s.entity_id.startsWith(domain + "."));
        if (search) {
          rows = rows.filter(
            (s) => s.entity_id.toLowerCase().includes(search) || String(s.attributes?.friendly_name || "").toLowerCase().includes(search),
          );
        }
        const list = rows.slice(0, limit).map((s) => ({
          entity_id: s.entity_id,
          name: s.attributes?.friendly_name || s.entity_id,
          state: s.state,
          unit: s.attributes?.unit_of_measurement,
        }));
        return { ok: true, modelResult: JSON.stringify({ count: rows.length, returned: list.length, entities: list }) };
      }

      case "get_states": {
        const ids: string[] = input?.entity_ids || [];
        const out: any[] = [];
        for (const id of ids) {
          if (!ctx.isExposed(id)) {
            out.push({ entity_id: id, error: "not exposed to the assistant" });
            continue;
          }
          try {
            const s = await ctx.ha.getState(id);
            out.push({ entity_id: s.entity_id, name: s.attributes?.friendly_name, state: s.state, unit: s.attributes?.unit_of_measurement, attributes: s.attributes });
          } catch {
            out.push({ entity_id: id, error: "not found" });
          }
        }
        return { ok: true, modelResult: JSON.stringify(out) };
      }

      case "get_history": {
        const ids: string[] = (input?.entity_ids || []).filter((id: string) => ctx.isExposed(id));
        if (!ids.length) return { ok: false, modelResult: "get_history needs entity_ids that are exposed to the assistant.", error: "no exposed entity_ids" };
        // Explicit start/end (ISO) take precedence over the preset period.
        const startDate = input?.start ? new Date(input.start) : periodStart(input?.period || "today");
        const endDate = input?.end ? new Date(input.end) : new Date();
        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();
        const series = await ctx.ha.getHistory(ids, startIso, endIso);
        const result = series.map((s) => {
          const numeric = s.points.map((p) => ({ t: p.t, v: toNumber(p.state) })).filter((p): p is { t: string; v: number } => p.v !== null);
          // Only downsample when there are many points — keep full resolution for narrow windows.
          const sampled = numeric.length > 200 ? downsample(numeric, 200) : numeric;
          const values = numeric.map((p) => p.v);
          const last = numeric[numeric.length - 1];
          const summary = values.length
            ? {
                min: Math.min(...values),
                max: Math.max(...values),
                last: last.v,
                lastAt: last.t,
                avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
                count: values.length,
              }
            : null;
          return { entity_id: s.entity_id, name: s.name, unit: s.unit, summary, points: sampled.map((p) => [p.t, p.v]) };
        });
        return {
          ok: true,
          modelResult: JSON.stringify({
            window: { start: startIso, end: endIso },
            note: "HA records a point only when the value changes; the value 'at' a time is the most recent point at or before it (summary.last @ summary.lastAt).",
            series: result,
          }),
        };
      }

      case "call_service": {
        if (!input?.domain || !input?.service) {
          return { ok: false, modelResult: "call_service needs domain and service.", error: "missing args" };
        }
        const action = toActionRef(input);
        const blocked = entityIdsOf(action.target).filter((id) => !ctx.isExposed(id));
        if (blocked.length) {
          return {
            ok: false,
            error: "not exposed",
            modelResult: `Blocked: ${blocked.join(", ")} ${blocked.length > 1 ? "are" : "is"} not exposed to the assistant. Ask the user to expose ${blocked.length > 1 ? "them" : "it"} in Settings → Exposed entities.`,
          };
        }
        const disposition = actionDisposition(ctx.cfg, action.domain);
        const label = `${action.domain}.${action.service} → ${targetLabel(action)}`;

        if (disposition === "blocked") {
          return {
            ok: false,
            error: "domain not allowed",
            modelResult: `Blocked: the '${action.domain}' domain is not in the user's allowed control domains (${ctx.cfg.allowedDomains.join(", ")}). Tell the user this domain isn't enabled.`,
          };
        }
        if (disposition === "confirm") {
          return {
            ok: true,
            summary: "Awaiting confirmation",
            modelResult: `The action was prepared but NOT executed because '${action.domain}' is a sensitive domain. The user sees a confirmation button and must click it. Tell them it's ready to confirm.`,
            ui: { type: "action_card", label, icon: input.icon, action, state: "idle", message: "Tap to confirm" },
          };
        }
        // execute now
        const res = await executeActionNow(ctx, action);
        return {
          ok: true,
          summary: res.message,
          modelResult: `Done. ${res.message}.`,
          ui: { type: "action_card", label, action, state: "success", message: res.message },
        };
      }

      case "render_ui": {
        const parsed = RenderUiArgsSchema.safeParse(input);
        if (!parsed.success) {
          const issues = parsed.error.issues
            .slice(0, 6)
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("; ");
          return {
            ok: false,
            error: "invalid ui",
            modelResult: `render_ui validation failed: ${issues}. Please re-send render_ui with a corrected tree.`,
          };
        }
        return { ok: true, summary: "Rendered", modelResult: "UI rendered for the user.", ui: parsed.data.tree };
      }

      default:
        return { ok: false, error: "unknown tool", modelResult: `Unknown tool: ${name}` };
    }
  } catch (err) {
    log.error(`tool ${name} failed:`, (err as Error).message);
    return { ok: false, error: (err as Error).message, modelResult: `Tool ${name} failed: ${(err as Error).message}` };
  }
}

/** Build the compact entity summary lines injected into the system prompt. */
export function summarizeEntities(states: HaState[], isExposed: (id: string) => boolean = () => true): { lines: string[]; total: number } {
  const exposed = states.filter((s) => isExposed(s.entity_id));
  const interesting = exposed.filter((s) => {
    const d = s.entity_id.split(".")[0];
    return ["light", "switch", "fan", "cover", "climate", "lock", "media_player", "sensor", "binary_sensor", "person", "scene", "vacuum"].includes(d);
  });
  const lines = interesting.slice(0, 80).map((s) => {
    const unit = s.attributes?.unit_of_measurement ? ` ${s.attributes.unit_of_measurement}` : "";
    return `- ${s.entity_id} — ${s.attributes?.friendly_name || s.entity_id} (${s.state}${unit})`;
  });
  return { lines, total: exposed.length };
}
