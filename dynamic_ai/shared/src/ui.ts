import { z } from "zod";

/**
 * The generative-UI vocabulary. The AI composes a tree of these building blocks
 * via the `render_ui` tool; the web renderer draws them. We never hand-code
 * per-device widgets — new answers are just new arrangements of these blocks.
 *
 * Interactive blocks carry an {@link ActionRef} — a *named* action, never code —
 * so everything still flows through the server-side safety layer.
 */

/** A safe, named action the AI may propose/run. Never arbitrary code. */
export const ActionRefSchema = z.object({
  ref: z.literal("call_service"),
  domain: z.string().describe("HA domain, e.g. 'light'"),
  service: z.string().describe("HA service, e.g. 'turn_off'"),
  target: z
    .object({
      entity_id: z.union([z.string(), z.array(z.string())]).optional(),
      area_id: z.union([z.string(), z.array(z.string())]).optional(),
      device_id: z.union([z.string(), z.array(z.string())]).optional(),
    })
    .optional(),
  data: z.record(z.any()).optional().describe("Extra service data, e.g. { brightness_pct: 60 }"),
});
export type ActionRef = z.infer<typeof ActionRefSchema>;

const ChartSeriesSchema = z.object({
  label: z.string(),
  points: z
    .array(z.tuple([z.union([z.string(), z.number()]), z.number()]))
    .describe("[x, y] points; x is an ISO time string (xType 'time') or a category label"),
});
export type ChartSeries = z.infer<typeof ChartSeriesSchema>;

const BadgeColor = z.enum(["green", "red", "amber", "blue", "gray", "violet"]);

// ---- recursive node type (hand-written so it's exact & ergonomic) ----------

export type UiNode =
  | { type: "stack"; dir?: "v" | "h"; gap?: number; align?: "start" | "center" | "end" | "stretch"; children: UiNode[] }
  | { type: "grid"; cols?: number; gap?: number; children: UiNode[] }
  | { type: "card"; title?: string; subtitle?: string; icon?: string; accent?: string; children: UiNode[] }
  | { type: "section"; title?: string; children: UiNode[] }
  | { type: "divider" }
  | { type: "text"; text?: string; markdown?: string; muted?: boolean; size?: "sm" | "md" | "lg" }
  | { type: "stat"; label: string; value: string | number; unit?: string; delta?: number; icon?: string; color?: string }
  | { type: "badge"; text: string; color?: z.infer<typeof BadgeColor> }
  | { type: "icon"; name: string; color?: string; size?: number }
  | { type: "image"; src: string; alt?: string; rounded?: boolean }
  | { type: "keyvalue"; rows: { key: string; value: string }[] }
  | { type: "progress"; value: number; max?: number; label?: string; color?: string }
  | { type: "gauge"; value: number; min?: number; max?: number; unit?: string; label?: string }
  | { type: "chart"; kind: "line" | "bar" | "area" | "scatter"; series: ChartSeries[]; unit?: string; xType?: "time" | "category"; title?: string; height?: number }
  | { type: "sparkline"; points: number[]; color?: string }
  | { type: "timeline"; items: { time: string; label: string; icon?: string; color?: string }[] }
  | { type: "entity"; entityId: string; name?: string; state?: string; unit?: string; icon?: string }
  | { type: "action_card"; label: string; icon?: string; action: ActionRef; state?: "idle" | "running" | "success" | "error"; message?: string }
  | { type: "button"; label: string; action: ActionRef; variant?: "primary" | "default" | "danger"; icon?: string }
  | { type: "toggle"; label: string; on: boolean; action: ActionRef }
  | { type: "slider"; label: string; value: number; min?: number; max?: number; step?: number; unit?: string; action: ActionRef };

export const UiNodeSchema: z.ZodType<UiNode> = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal("stack"),
      dir: z.enum(["v", "h"]).optional(),
      gap: z.number().optional(),
      align: z.enum(["start", "center", "end", "stretch"]).optional(),
      children: z.array(UiNodeSchema),
    }),
    z.object({ type: z.literal("grid"), cols: z.number().int().min(1).max(6).optional(), gap: z.number().optional(), children: z.array(UiNodeSchema) }),
    z.object({
      type: z.literal("card"),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      icon: z.string().optional(),
      accent: z.string().optional(),
      children: z.array(UiNodeSchema),
    }),
    z.object({ type: z.literal("section"), title: z.string().optional(), children: z.array(UiNodeSchema) }),
    z.object({ type: z.literal("divider") }),
    z.object({
      type: z.literal("text"),
      text: z.string().optional(),
      markdown: z.string().optional(),
      muted: z.boolean().optional(),
      size: z.enum(["sm", "md", "lg"]).optional(),
    }),
    z.object({
      type: z.literal("stat"),
      label: z.string(),
      value: z.union([z.string(), z.number()]),
      unit: z.string().optional(),
      delta: z.number().optional(),
      icon: z.string().optional(),
      color: z.string().optional(),
    }),
    z.object({ type: z.literal("badge"), text: z.string(), color: BadgeColor.optional() }),
    z.object({ type: z.literal("icon"), name: z.string(), color: z.string().optional(), size: z.number().optional() }),
    z.object({ type: z.literal("image"), src: z.string(), alt: z.string().optional(), rounded: z.boolean().optional() }),
    z.object({ type: z.literal("keyvalue"), rows: z.array(z.object({ key: z.string(), value: z.string() })) }),
    z.object({ type: z.literal("progress"), value: z.number(), max: z.number().optional(), label: z.string().optional(), color: z.string().optional() }),
    z.object({ type: z.literal("gauge"), value: z.number(), min: z.number().optional(), max: z.number().optional(), unit: z.string().optional(), label: z.string().optional() }),
    z.object({
      type: z.literal("chart"),
      kind: z.enum(["line", "bar", "area", "scatter"]),
      series: z.array(ChartSeriesSchema),
      unit: z.string().optional(),
      xType: z.enum(["time", "category"]).optional(),
      title: z.string().optional(),
      height: z.number().optional(),
    }),
    z.object({ type: z.literal("sparkline"), points: z.array(z.number()), color: z.string().optional() }),
    z.object({
      type: z.literal("timeline"),
      items: z.array(z.object({ time: z.string(), label: z.string(), icon: z.string().optional(), color: z.string().optional() })),
    }),
    z.object({
      type: z.literal("entity"),
      entityId: z.string(),
      name: z.string().optional(),
      state: z.string().optional(),
      unit: z.string().optional(),
      icon: z.string().optional(),
    }),
    z.object({
      type: z.literal("action_card"),
      label: z.string(),
      icon: z.string().optional(),
      action: ActionRefSchema,
      state: z.enum(["idle", "running", "success", "error"]).optional(),
      message: z.string().optional(),
    }),
    z.object({ type: z.literal("button"), label: z.string(), action: ActionRefSchema, variant: z.enum(["primary", "default", "danger"]).optional(), icon: z.string().optional() }),
    z.object({ type: z.literal("toggle"), label: z.string(), on: z.boolean(), action: ActionRefSchema }),
    z.object({
      type: z.literal("slider"),
      label: z.string(),
      value: z.number(),
      min: z.number().optional(),
      max: z.number().optional(),
      step: z.number().optional(),
      unit: z.string().optional(),
      action: ActionRefSchema,
    }),
  ]),
);

/** Argument schema for the `render_ui` tool. */
export const RenderUiArgsSchema = z.object({ tree: UiNodeSchema });
export type RenderUiArgs = z.infer<typeof RenderUiArgsSchema>;
