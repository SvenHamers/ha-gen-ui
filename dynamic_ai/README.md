# Dynamic AI for Home Assistant

Your own Claude/ChatGPT, living inside Home Assistant — it can **see** your home
(states + history, drawn as charts), **act** on it (control devices, with live animated
feedback), and **talk** with you hands-free (real two-way voice).

- Text brain: **Claude (Anthropic)** *or* **ChatGPT (OpenAI)** — your choice.
- Voice: **OpenAI Realtime** — hands-free, and it talks back.
- The whole screen is **generative**: the AI composes a small set of UI building blocks,
  so there are no hand-coded per-device widgets.

> Full design + rationale lives in [`PLAN.md`](./PLAN.md).

---

## Two ways to run it

The **same code** runs as a Home Assistant add-on *and* on your laptop. It auto-detects
which: if `SUPERVISOR_TOKEN` is present it talks to HA through the Supervisor proxy;
otherwise it reads a `.env` file.

### A) Local development (test on your laptop)

You need Node 20+, an OpenAI key (and optionally an Anthropic key), and a Home Assistant
**long-lived access token** (HA → your profile → *Security* → *Long-lived access tokens* →
*Create token*).

```bash
cp .env.example .env        # then fill in HA_URL, HA_TOKEN, OPENAI_API_KEY, ...
npm install
npm run dev                 # backend + frontend with hot reload
# open http://localhost:8099
```

Voice works locally too — browsers treat `http://localhost` as a secure context, so the
microphone is allowed.

### B) As a Home Assistant add-on

**Add the repository (easiest, needs a public repo):** in HA go to
**Settings → Add-ons → Add-on Store → ⋮ → Repositories**, add
`https://github.com/SvenHamers/ha-gen-ui`, then install **Dynamic AI** from the store.

**Or install locally (works with a private repo too):**

1. Make sure you can reach the `/addons` folder on your HA machine — install the official
   **Samba share** or **Advanced SSH & Web Terminal** add-on.
2. Copy the **`dynamic_ai/`** folder from this repo into `/addons/dynamic_ai/`.
3. In Home Assistant: **Settings → Add-ons → Add-on Store → ⋮ → Check for updates**, then
   open **Local add-ons → Dynamic AI → Install**. (First build pulls Node + deps; on a
   Raspberry Pi this can take a few minutes.)
4. Open the add-on's **Configuration** tab and paste your `openai_api_key`
   (and optionally `anthropic_api_key`), then **Start**.
5. Open it from the sidebar (**Dynamic AI**).

The add-on gets its Home Assistant credentials automatically — you do **not** create a
long-lived token for add-on mode.

**Open it in a browser (optional, standalone):** to reach Dynamic AI as its own page outside
the sidebar, open the add-on's **Network** section, assign a host port for `8099/tcp` (e.g.
`8099`), Save, then visit `http://<ha-host>:8099`. ⚠️ This port has **no Home Assistant login**
— anyone who can reach it can use the assistant and control your home, so only enable it on a
trusted network. It's plain HTTP, so voice/mic won't work there (chat, charts, and control do);
combine with `?embed=1` for a clean chat-only page.

---

## Voice & embedding

Run Dynamic AI as a normal **ingress add-on** (the sidebar panel) — *don't* expose it on a raw
HTTP port and iframe it into an HTTPS page (browsers block that as mixed content). With ingress
the browser only ever talks to Home Assistant over HA's own connection; HA proxies to the
add-on internally over HTTP (server-side, invisible to the browser). So the whole app — chat,
charts, control, and the voice WebSocket (`wss`) — runs on HA's origin with **no mixed content**.

**For hands-free voice, reach Home Assistant over HTTPS.** The microphone API (`getUserMedia`)
is only exposed in a *secure context* (HTTPS or `localhost`); over plain `http://` the browser
hides it for any web page — a hard rule, and the reason HA's own Assist uses the app's
*native* mic instead. Make HA HTTPS via a **Nabu Casa** remote URL, or TLS in front of HA
(reverse proxy / Cloudflare Tunnel). Then open the sidebar panel and voice just works.

Transport auto-selects: **WebRTC** on desktop browsers, a **WebSocket relay**
(browser ⇄ add-on ⇄ OpenAI) in webviews without WebRTC like the iOS Companion app. Text,
charts, and control work over plain HTTP too — only the microphone needs HTTPS.

**Minimal / embed mode:** append `?embed=1` to the URL to hide the sidebar and top bar and show
just the chat — handy for a Lovelace *Webpage* card, a wall tablet, or a kiosk. (`?embed=0` or
omitting it shows the full UI.)

**Local dev:** `http://localhost:8099` is already a secure context, so voice works there. To
test on a phone over the LAN, run `HTTPS=1 npm run dev` (self-signed cert — accept the warning).

## Project layout

```
shared/   # types + zod schemas shared by server and web (the event + UI protocol)
server/   # Node + Fastify backend: config, HA client, AI providers, tools, routes
web/      # React + Vite frontend: chat, generative UI renderer, voice mode
config.yaml / Dockerfile   # Home Assistant add-on packaging
PLAN.md   # the design document
```

## Configuration reference

| Setting | Where (add-on) | Where (dev) | Notes |
|---|---|---|---|
| OpenAI key | `openai_api_key` | `OPENAI_API_KEY` | required (voice + ChatGPT) |
| Anthropic key | `anthropic_api_key` | `ANTHROPIC_API_KEY` | optional (Claude text brain) |
| Default text provider | `default_text_provider` | `DEFAULT_TEXT_PROVIDER` | `openai` or `anthropic` |
| Voice model | `voice_model` | `VOICE_MODEL` | OpenAI Realtime model |
| Allowed control domains | `allowed_domains` | — | which domains the AI may control |
| Confirm-first domains | `confirm_domains` | — | actions that need an explicit OK |
| Exposure mode | `expose_mode` (`all`/`list`) | `EXPOSE_MODE` | `list` = AI only sees/controls chosen entities |
| Exposed entities | `exposed_entities` | `EXPOSED_ENTITIES` | ids/patterns (`light.*`); also editable in-app under **Settings → Exposed to the AI** |
| HA URL | (automatic) | `HA_URL` | dev only |
| HA token | (automatic) | `HA_TOKEN` | dev only — long-lived access token |

## Safety

The AI can control your home, so by default sensitive domains (`lock`,
`alarm_control_panel`, …) require an explicit confirmation, and you control the
allow-list of what it may touch at all. The generative UI can only reference **named
actions** (never raw code), so every action still flows through this safety layer.
See [`PLAN.md`](./PLAN.md) §7.
