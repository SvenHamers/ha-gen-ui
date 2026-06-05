import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { loadConfig } from "./config";
import { HaClient } from "./ha/client";
import { ConversationStore } from "./store/conversations";
import { SettingsStore } from "./store/settings";
import { registerRoutes } from "./routes";
import { attachRealtimeWs } from "./realtimeWs";
import { log } from "./logger";

const cfg = loadConfig();
const ha = new HaClient(cfg.ha.baseUrl, cfg.ha.token);
const store = new ConversationStore(cfg.dataDir);
const settings = new SettingsStore(cfg.dataDir, { exposeMode: cfg.exposeMode, exposedEntities: cfg.exposedEntities });

const app = Fastify({ logger: false, bodyLimit: 8 * 1024 * 1024 });

registerRoutes(app, { cfg, ha, store, settings });
attachRealtimeWs(app, { cfg, ha, settings });

// Serve the built frontend in production / add-on mode. In local dev the Vite
// dev server serves the UI and proxies /api here, so this block is skipped.
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = process.env.WEB_DIST_DIR || path.resolve(here, "../../web/dist");
if (existsSync(path.join(webDist, "index.html"))) {
  await app.register(fastifyStatic, { root: webDist, prefix: "/" });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url && req.raw.url.startsWith("/api")) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    // SPA fallback
    reply.sendFile("index.html");
  });
  log.info(`Serving web UI from ${webDist}`);
} else {
  log.info("No web build found — running API only (use the Vite dev server for the UI).");
}

app
  .listen({ host: "0.0.0.0", port: cfg.port })
  .then(() => {
    log.info(`Dynamic AI running in ${cfg.mode.toUpperCase()} mode on :${cfg.port}`);
    log.info(`HA endpoint: ${cfg.ha.baseUrl}`);
    log.info(`Providers — openai: ${!!cfg.openaiApiKey}, anthropic: ${!!cfg.anthropicApiKey}`);
  })
  .catch((err) => {
    log.error("Failed to start:", err);
    process.exit(1);
  });
