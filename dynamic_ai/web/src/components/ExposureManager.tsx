import { useEffect, useMemo, useState } from "react";
import type { EntityInfo, ExposeMode } from "@dyn/shared";
import { getEntities, getExposure, setExposure } from "../lib/api";

const isPattern = (e: string) => e.includes("*") || !e.includes(".");

function toRegex(pattern: string): RegExp {
  let p = pattern.trim();
  if (!p.includes("*") && !p.includes(".")) p = p + ".*";
  const body = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + body + "$");
}

const chip = (active: boolean) => `rounded-lg px-3 py-1.5 text-sm transition ${active ? "bg-brand-500 text-white" : "bg-white/10 text-white/60 hover:text-white"}`;

export function ExposureManager({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<ExposeMode>("all");
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [patterns, setPatterns] = useState<string[]>([]);
  const [entities, setEntities] = useState<EntityInfo[]>([]);
  const [search, setSearch] = useState("");
  const [patternInput, setPatternInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getExposure(), getEntities()]).then(([ex, ents]) => {
      setMode(ex.mode);
      setPatterns(ex.entities.filter(isPattern));
      setIds(new Set(ex.entities.filter((e) => !isPattern(e))));
      setEntities(ents);
      setLoading(false);
    });
  }, []);

  const patternRegexes = useMemo(() => patterns.map(toRegex), [patterns]);
  const matchedByPattern = (id: string) => patternRegexes.some((rx) => rx.test(id));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? entities.filter((e) => e.entity_id.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)) : entities;
    return list.slice(0, 300);
  }, [entities, search]);

  const exposedCount = useMemo(() => {
    if (mode === "all") return entities.length;
    return entities.filter((e) => ids.has(e.entity_id) || matchedByPattern(e.entity_id)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, entities, ids, patternRegexes]);

  function toggle(id: string) {
    setIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function addPattern() {
    const p = patternInput.trim();
    if (p && !patterns.includes(p)) setPatterns([...patterns, p]);
    setPatternInput("");
  }

  async function save() {
    setSaving(true);
    const entitiesList = mode === "list" ? [...patterns, ...Array.from(ids)] : [];
    await setExposure({ mode, entities: entitiesList });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card flex max-h-[85vh] w-full max-w-2xl flex-col p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Exposed entities</h2>
          <button className="btn-ghost !px-2" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-white/50">Choose what the assistant can see and control. Everything else is invisible to it.</p>

        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => setMode("all")} className={chip(mode === "all")}>
            All entities
          </button>
          <button onClick={() => setMode("list")} className={chip(mode === "list")}>
            Only selected
          </button>
          <span className="ml-auto text-xs text-white/50">{exposedCount} exposed</span>
        </div>

        {mode === "list" && (
          <>
            <div className="mt-3">
              <div className="mb-1 text-xs text-white/50">
                Patterns — e.g. <code>light.*</code>, <code>sensor.*_battery</code>, or a domain like <code>climate</code>
              </div>
              <div className="flex flex-wrap gap-1">
                {patterns.map((p) => (
                  <span key={p} className="flex items-center gap-1 rounded-md bg-brand-500/20 px-2 py-0.5 text-xs text-brand-400">
                    {p}
                    <button onClick={() => setPatterns(patterns.filter((x) => x !== p))} className="text-white/40 hover:text-rose-400">
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-1.5 flex gap-2">
                <input
                  value={patternInput}
                  onChange={(e) => setPatternInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addPattern()}
                  placeholder="add a pattern…"
                  className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm outline-none focus:border-brand-500/60"
                />
                <button onClick={addPattern} className="btn-ghost border border-white/15 text-xs">
                  Add
                </button>
              </div>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search entities…"
              className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-brand-500/60"
            />

            <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10">
              {loading && <div className="p-4 text-sm text-white/40">Loading entities…</div>}
              {!loading &&
                filtered.map((e) => {
                  const viaPattern = matchedByPattern(e.entity_id);
                  const checked = ids.has(e.entity_id) || viaPattern;
                  return (
                    <label key={e.entity_id} className="flex cursor-pointer items-center gap-2 border-b border-white/5 px-3 py-1.5 text-sm hover:bg-white/[0.03]">
                      <input type="checkbox" checked={checked} disabled={viaPattern} onChange={() => toggle(e.entity_id)} className="accent-brand-500" />
                      <span className="min-w-0 flex-1 truncate">
                        {e.name} <span className="text-white/30">· {e.entity_id}</span>
                      </span>
                      {viaPattern && <span className="text-[10px] text-brand-400">via pattern</span>}
                      <span className="shrink-0 text-xs text-white/40">{e.state}</span>
                    </label>
                  );
                })}
              {!loading && filtered.length === 0 && <div className="p-4 text-sm text-white/40">No matches.</div>}
              {!loading && entities.length > 300 && !search && (
                <div className="p-2 text-center text-[11px] text-white/30">Showing first 300 — search to narrow down.</div>
              )}
            </div>
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost border border-white/15" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
