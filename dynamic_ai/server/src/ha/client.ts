import { log } from "../logger";

export interface HaState {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
}

export interface HistoryPoint {
  t: string; // ISO timestamp
  state: string;
}
export interface HistorySeries {
  entity_id: string;
  name: string;
  unit?: string;
  points: HistoryPoint[];
}

/**
 * Home Assistant client. The same class works in both run modes — only the
 * baseUrl + token differ (Supervisor proxy vs. your HA URL + long-lived token).
 */
export class HaClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string | null,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(15000),
      headers: { ...this.headers(), ...(init?.headers || {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HA ${init?.method || "GET"} ${path} -> ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  /** True if HA is reachable + the token is valid. */
  async ping(): Promise<boolean> {
    try {
      await this.req("/api/", { signal: AbortSignal.timeout(5000) });
      return true;
    } catch (err) {
      log.warn("HA ping failed:", (err as Error).message);
      return false;
    }
  }

  async getStates(): Promise<HaState[]> {
    return this.req<HaState[]>("/api/states");
  }

  async getState(entityId: string): Promise<HaState> {
    return this.req<HaState>(`/api/states/${encodeURIComponent(entityId)}`);
  }

  /** Fetch + normalize history for charting. start/end are ISO strings. */
  async getHistory(entityIds: string[], startIso: string, endIso?: string): Promise<HistorySeries[]> {
    const params = new URLSearchParams();
    params.set("filter_entity_id", entityIds.join(","));
    if (endIso) params.set("end_time", endIso);
    const raw = await this.req<any[][]>(`/api/history/period/${encodeURIComponent(startIso)}?${params.toString()}`);
    const out: HistorySeries[] = [];
    for (const series of raw || []) {
      if (!series?.length) continue;
      const first = series[0];
      out.push({
        entity_id: first.entity_id,
        name: first.attributes?.friendly_name || first.entity_id,
        unit: first.attributes?.unit_of_measurement,
        points: series.map((s) => ({ t: s.last_changed || s.last_updated, state: String(s.state) })),
      });
    }
    return out;
  }

  /** Call a service. Returns the states HA reports as changed. */
  async callService(
    domain: string,
    service: string,
    target?: { entity_id?: string | string[]; area_id?: string | string[]; device_id?: string | string[] },
    data?: Record<string, any>,
  ): Promise<HaState[]> {
    const body = { ...(data || {}), ...(target || {}) };
    return this.req<HaState[]>(`/api/services/${domain}/${service}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async getServices(): Promise<any[]> {
    return this.req<any[]>("/api/services");
  }
}
