import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ExposeMode, ExposureConfig } from "@dyn/shared";
import { log } from "../logger";

export interface RuntimeSettings {
  exposeMode: ExposeMode;
  exposedEntities: string[];
}

/**
 * User-editable runtime settings, persisted to /data/settings.json. The add-on
 * options (config.yaml) provide the initial defaults; once the user edits the
 * exposure list in the UI, this file is the source of truth.
 */
export class SettingsStore {
  private file: string;
  private data: RuntimeSettings;

  constructor(dataDir: string, defaults: RuntimeSettings) {
    this.file = path.join(dataDir, "settings.json");
    this.data = { ...defaults };
    try {
      mkdirSync(dataDir, { recursive: true });
      if (existsSync(this.file)) {
        const saved = JSON.parse(readFileSync(this.file, "utf8"));
        this.data = {
          exposeMode: saved.exposeMode === "list" ? "list" : defaults.exposeMode,
          exposedEntities: Array.isArray(saved.exposedEntities) ? saved.exposedEntities : defaults.exposedEntities,
        };
      }
    } catch (err) {
      log.warn("Could not load settings store:", (err as Error).message);
    }
  }

  getExposure(): ExposureConfig {
    return { mode: this.data.exposeMode, entities: [...this.data.exposedEntities] };
  }

  setExposure(next: ExposureConfig): ExposureConfig {
    this.data.exposeMode = next.mode === "list" ? "list" : "all";
    this.data.exposedEntities = Array.isArray(next.entities) ? next.entities.map((s) => s.trim()).filter(Boolean) : [];
    this.persist();
    return this.getExposure();
  }

  private persist() {
    try {
      writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch (err) {
      log.warn("Could not persist settings:", (err as Error).message);
    }
  }
}
