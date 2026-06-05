import type { ExposeMode } from "@dyn/shared";

/**
 * Build a predicate that decides whether an entity is exposed to the assistant.
 * Patterns may be exact ids ("light.kitchen"), globs ("light.*", "sensor.*_battery"),
 * or a bare domain ("light", treated as "light.*").
 */
export function buildExposure(mode: ExposeMode, patterns: string[]): (entityId: string) => boolean {
  if (mode === "all") return () => true;
  const exact = new Set<string>();
  const regexes: RegExp[] = [];
  for (const raw of patterns) {
    const p = raw.trim();
    if (!p) continue;
    if (!p.includes("*")) {
      // bare domain ("light") → "light.*"; otherwise an exact entity id
      if (!p.includes(".")) regexes.push(toRegex(p + ".*"));
      else exact.add(p);
    } else {
      regexes.push(toRegex(p));
    }
  }
  return (id: string) => exact.has(id) || regexes.some((rx) => rx.test(id));
}

function toRegex(pattern: string): RegExp {
  // escape regex specials except "*", then turn "*" into ".*"
  const body = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + body + "$");
}

/** Extract the entity_id targets from a call_service-style target object. */
export function entityIdsOf(target?: { entity_id?: string | string[] }): string[] {
  const e = target?.entity_id;
  if (!e) return [];
  return Array.isArray(e) ? e : [e];
}
