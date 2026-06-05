# Dynamic AI for Home Assistant — Build Plan

> Your own Claude/ChatGPT, living inside Home Assistant — able to **see** your home
> (states + history, drawn as charts), **act** on it (control devices, with live animated
> feedback), and **talk** with you hands-free (real two-way voice).
> Text brain: both **Claude (Anthropic)** and **ChatGPT (OpenAI)**.
> Voice: **OpenAI** — hands-free, and it talks back.
> The whole screen is **generative from primitives** — the AI composes a small set of
> building blocks, so we never hand-code individual widgets (see §10).
> Runs **inside HA as an add-on** *and* **locally on your laptop with an API key** for testing (§4).

---

## 1. Confirmed decisions

| Decision | Choice | Why it matters |
|----------|--------|----------------|
| HA install type | **Home Assistant OS** | We ship a native **Add-on**. The add-on gets its HA token automatically (`SUPERVISOR_TOKEN`) — no manual long-lived token. |
| Stack | **TypeScript full-stack** (Node + React) | One language. Best fit for streaming chat, charts, and animations. |
| v1 scope | **Everything** | Chat + read + charts + control-with-feedback + dual provider + voice, all in the first release. |
| Voice | **Hands-free, fully OpenAI** | OpenAI **Realtime API**: you talk, it talks back, no tapping. Voice mode runs on OpenAI's model (Claude has no realtime voice); text mode still lets you choose Claude or ChatGPT. |
| UI engine | **Generative from primitives** | One renderer + ~15 building blocks; the AI composes any layout. No per-widget coding, consistent look, safe action bridge (§10). |
| Run modes | **Add-on (prod) + local dev (test)** | Same code both ways; locally you run it on your laptop with a long-lived HA token + `.env` keys, `npm run dev` (§4). |

You will provide: an **OpenAI API key** (required — it powers voice) and optionally an
**Anthropic API key** (to use Claude as the text brain). In the add-on these go in the
settings screen; for local testing they go in a `.env` file (§4). The in-HA connection is
automatic; for local testing you add a long-lived HA token.

---

## 2. What it does (the clever parts)

1. **"Don't just tell me — draw it."**
   *"Battery percentages of today"* → AI fetches history → frontend renders a **chart**.
   The AI chooses the visualization (line chart for trends, status card for on/off, etc.).

2. **"Don't just say done — show it happening."**
   *"Turn off the living room light"* → AI calls the service → frontend shows an
   **animated action card**: icon → spinner → ✅ (or ❌ with the reason). Real feedback.

3. **"Just talk to it."**
   Flip into voice mode for a **hands-free, two-way conversation** — you speak, it speaks
   back, no buttons. Because voice shares the same tools, you can *say* "show me today's
   battery levels" and **watch the chart appear while it talks**, or "turn off the lights"
   and **see the action card animate** as it confirms out loud.

> All three are drawn by **one generative UI engine**: the AI composes a small set of
> building blocks into whatever fits — we never hand-code individual widgets (§10).

---

## 3. Architecture

```
┌─────────────────────────── Home Assistant OS ───────────────────────────┐
│                                                                          │
│   Browser (HA sidebar → "Dynamic AI" panel, via Ingress = HA login)      │
│        │                                                                 │
│        │  event stream (SSE/WebSocket): text · tool-calls · ui-tree      │
│        │  + voice: live audio session (mic ↔ speaker)                    │
│        ▼                                                                 │
│   ┌──────────────── Add-on container (Docker) ────────────────┐          │
│   │  FRONTEND  (React + Vite)                                  │          │
│   │   • chat UI (streaming, markdown)                          │          │
│   │   • generative renderer ◄── "ui" events (building blocks)  │          │
│   │   • animated action feedback ◄── tool-call/result events   │          │
│   │   • voice mode (hands-free talk + listen)                  │          │
│   │                                                            │          │
│   │  BACKEND  (Node + TypeScript)                              │          │
│   │   • provider abstraction:  Claude  |  ChatGPT  (text)      │          │
│   │   • OpenAI Realtime session minting (voice)                │          │
│   │   • tool-calling loop (the AI's "hands")                   │          │
│   │   • config layer (add-on options  OR  .env)  ◄── §4        │          │
│   │   • conversation store (/data, survives restarts)          │          │
│   │   • HA client ───────────────┐                             │          │
│   └──────────────────────────────┼─────────────────────────────┘          │
│                                   │ SUPERVISOR_TOKEN (prod)                │
│                                   ▼                                        │
│        Supervisor proxy → HA Core API  (states · history · services)      │
│        + HA WebSocket (live state for instant feedback)                   │
└──────────────────────────────────────────────────────────────────────────┘
            │  HTTPS                         │  audio + tool calls
            ▼                                ▼
   Anthropic API  /  OpenAI API      OpenAI Realtime API  (voice)
        (text brain, your keys)       (your OpenAI key)
```

**The "tools" we give the AI** (this is what makes it able to use your home):

| Tool | Purpose |
|------|---------|
| `list_entities(area?, domain?)` | Discover what exists, so "living room light" → `light.living_room`. |
| `get_states(entity_ids[])` | Current value + attributes of entities. |
| `get_history(entity_ids[], start, end)` | Historical values → feeds the charts. |
| `call_service(domain, service, target, data)` | Perform an action (turn_on/off, set brightness, lock, etc.). |
| `render_ui(tree)` | The AI's single door to the screen — composes building blocks (chart, card, stat, action-button…) into any layout. See §10. |

**The event stream** (how the UI does its magic): the backend streams typed events to the
frontend — `text` (assistant prose), `tool_call` (started → action card with spinner),
`tool_result` (✅/❌ + new state), and `ui` (a tree of building blocks → the generative
renderer draws it). The frontend is a *renderer* of this stream — exactly like
Claude/ChatGPT streaming, plus our generative UI.

**Voice path (hands-free):** the browser opens a low-latency audio session with the
**OpenAI Realtime API** using a short-lived token our backend mints — your real key never
leaves the server. OpenAI handles listening, turn-taking, speaking, and interruptions.
When the model decides to act, it emits the *same* tool calls (`get_history`, `call_service`,
`render_ui`, …), which we run against Home Assistant — so the chat's charts and action cards
light up *while it talks*. **Voice and text share one brain-tools-UI core.**

---

## 4. Run modes: add-on (prod) & local dev (test)

The **exact same code** runs two ways. A small **config layer** picks where secrets come
from, and the **HA client** picks how it reaches Home Assistant — chosen automatically by
whether `SUPERVISOR_TOKEN` is present.

| | **Add-on mode (production)** | **Local dev mode (testing)** |
|---|---|---|
| Where it runs | Inside HA, as the add-on container | On your laptop (`npm run dev`) |
| Detected by | `SUPERVISOR_TOKEN` is set | no `SUPERVISOR_TOKEN` → read `.env` |
| HA reached via | Supervisor proxy `http://supervisor/core` | your HA URL, e.g. `http://homeassistant.local:8123` |
| HA auth | automatic `SUPERVISOR_TOKEN` | a **long-lived access token** you create in HA |
| LLM keys & settings | from the add-on settings UI (`/data/options.json`) | from your local `.env` file |
| Frontend served | via Ingress (HTTPS, HA login) | Vite dev server on `http://localhost` (instant reload) |
| Voice (mic + WebRTC) | works (Ingress = HTTPS) | works (`localhost` counts as a secure context) |

**How the HA client switches** (one interface, two backends):
- add-on → base `http://supervisor/core`, token = `SUPERVISOR_TOKEN`
- dev → base `HA_URL`, token = `HA_TOKEN` (your long-lived token)
- REST = `${base}/api/…`, WebSocket = `${base}/api/websocket` — identical calls either way.

The browser always talks to **our** backend (which talks to HA server-side), so there's no
CORS hassle in dev. The OpenAI Realtime ephemeral token is minted by our backend from your
`.env` key, so **voice is fully testable locally** too.

**`.env.example`** (committed to the repo; copy to `.env` and fill in):
```dotenv
# Home Assistant — dev mode only (automatic inside the add-on)
HA_URL=http://homeassistant.local:8123
HA_TOKEN=                 # HA → Profile → Security → Long-lived access tokens → Create

# LLM keys — in the add-on these come from the settings UI instead
OPENAI_API_KEY=           # required (voice + ChatGPT)
ANTHROPIC_API_KEY=        # optional (Claude as the text brain)

# optional
DEFAULT_TEXT_PROVIDER=openai   # openai | anthropic
PORT=8099
```

**To run locally:** create a long-lived token in HA → `cp .env.example .env` → fill it in →
`npm install` → `npm run dev` → open `http://localhost:8099`. No container rebuilds, instant
reload, talking to your real house. The very same build also runs as the add-on, unchanged.

---

## 5. Tech choices

| Layer | Choice | Notes |
|-------|--------|-------|
| Backend runtime | Node 20 + TypeScript | |
| Web framework | Fastify (or Hono) | lightweight, first-class streaming |
| Text LLM SDKs | `@anthropic-ai/sdk`, `openai` | both support tool/function calling |
| Voice | **OpenAI Realtime API** (`gpt-4o-realtime` family) | hands-free speech-in/speech-out + tool calls in one session |
| Audio transport | WebRTC + ephemeral token (backend-proxy fallback) | low latency mic↔model; API key stays server-side |
| HA access | Supervisor proxy + `SUPERVISOR_TOKEN` (prod) **or** HA URL + long-lived token (dev) | one client, auto-selected — see §4 |
| Config / secrets | add-on options (`/data/options.json`) **or** `.env` (dotenv) | one config layer, auto-selected — see §4 |
| Frontend | React + Vite + TypeScript | |
| **Generative UI** | Custom JSON-schema renderer + ~15 primitives (§10) | AI composes the screen; validated; malformed → safe text fallback |
| Charts | ECharts | the engine *behind* the `chart` building block (one of the primitives) |
| Animations | Framer Motion | the action-card spinner → ✅ feel |
| Styling | Tailwind CSS | fast, consistent |
| Markdown | react-markdown | render the AI's text |
| Packaging | Multi-stage Dockerfile, single container | Vite build → Node serves UI + API |
| Add-on | `config.yaml` (Ingress, options schema), `build.yaml` (multi-arch) | sidebar panel, settings screen |

---

## 6. Build milestones

> v1 = all of these. We build in order so each step is independently verifiable.

- **M0 — Add-on shell + local dev.** Scaffold repo, minimal `config.yaml` + Dockerfile, the
  Node+React skeleton with **`npm run dev`** for local testing, plus a "hello" page — served
  through Ingress in the add-on *and* on `http://localhost` in dev. *Proves both run modes
  and the hardest plumbing (HA ↔ add-on ↔ UI) first.*
- **M1 — HA connection (both run modes).** One HA client that works via the Supervisor proxy
  in the add-on **and** via your HA URL + long-lived token locally (`.env`), plus the config
  layer that loads secrets from add-on options or `.env`. WebSocket live state. A tiny test
  endpoint confirms reads + an action — runnable on your laptop. (§4)
- **M2 — AI brain + tools.** Provider abstraction (Claude ⇄ ChatGPT), the tool-calling
  loop wired to M1, streaming. Testable from the API before any UI.
- **M3 — Chat UI.** Streaming chat that looks/feels like Claude/ChatGPT. Talk back and forth.
- **M4 — Generative UI engine.** The base renderer + the ~15 building-block vocabulary (§10)
  + the AI's `render_ui` schema, validated (malformed → safe text fallback). Charts from
  history *and* animated action cards both fall out of this one engine. *This is the "wow" —
  and where the no-per-widget-coding payoff lands.*
- **M5 — Voice mode (hands-free).** OpenAI Realtime session in the browser: talk and it
  talks back, no tapping. Routes tool calls to HA so charts/action cards appear *while
  speaking*. Interruptions + turn-taking handled by OpenAI.
- **M6 — Settings, safety & polish.** Model/voice pickers, key entry, conversation
  persistence, control-safety options (§7), docs, multi-arch packaging. → **Full v1.**

---

## 7. Safety (because the AI can control your house)

Built into M6, surfaced as settings:
- **Allow-list of domains** the AI may control (e.g. lights/switches yes; locks/alarm off by default).
- **Confirm-before-acting** toggle for sensitive actions (locks, covers, alarm, climate).
- **Generative UI can't bypass safety:** building blocks reference *named actions*
  (`call_service` + params), never raw code — so every action the AI draws still flows
  through the allow-list + confirmation path above.
- **Voice is extra careful:** in hands-free mode, sensitive actions still require an explicit
  confirmation (a spoken "yes" or a tap) before they run — so a misheard phrase can't unlock a door.
- Ingress means **only logged-in HA users** can reach the chat at all.
- Keys stored as HA add-on secrets (password fields) / in `.env` locally — never shown in the UI/logs.

---

## 8. Prerequisites / what I'll need from you

1. **API keys**: an OpenAI key (required for voice) and optionally an Anthropic key (for Claude as the text brain).
2. **For local testing (you asked for this):** a **long-lived access token** + your HA URL in
   a `.env` file lets you run the whole thing on your laptop with `npm run dev` against your
   real HA — no container rebuilds, voice included. Fully supported by design (§4); the same
   build runs as the add-on unchanged.
3. **A way to load the add-on onto your HA** for the in-HA test — easiest is the official
   **"Samba share"** or **"Advanced SSH & Web Terminal"** add-on, so we can drop our add-on
   folder into `/addons` and it appears under *Settings → Add-ons → Local add-ons*.
   (Alternatively we host it in a GitHub repo and add it as a custom repository.)

---

## 9. Open decisions to revisit (not blocking)

- "Today's battery" uses the History API; very long ranges may later use HA's long-term
  **statistics** API — future enhancement.
- UI is **generative from primitives** (§10). A locked-down "AI writes raw UI code" escape
  hatch could be added later *if* a bespoke case ever needs it — not planned for v1.
- Voice is **in v1** (hands-free, OpenAI). Later options: a **wake word** ("Hey …"),
  **native HA Assist / local voice** (offline, works with HA voice hardware), or a "pipeline"
  voice mode that lets **Claude** be the voice brain too (Whisper → Claude → TTS).

---

## 10. The UI primitive vocabulary (the base)

The AI composes the screen from these building blocks via `render_ui(tree)`. We build the
renderer + schema **once**; new kinds of answers usually need **no new code** — just a new
arrangement of existing blocks. Occasionally we add one primitive, which then unlocks many
new layouts.

- **Layout:** `stack` (vertical/horizontal), `grid`, `card`, `section`, `divider`
- **Display:** `text` (markdown), `stat` (big number + label + delta), `badge`/`chip`,
  `icon`, `image`, `keyvalue` (attribute list), `progress`, `gauge`
- **Data viz:** `chart` (line / bar / area / scatter — ECharts under the hood), `sparkline`, `timeline`
- **Home-specific:** `entity` (a HA entity with its proper icon + live state),
  `action_card` (a safe, *named* action reference — not code)
- **Interactive:** `button`, `toggle`, `slider` (bound to allow-listed actions)

Every spec is validated against a JSON schema; anything malformed falls back to plain text,
so a bad generation never breaks the screen. Interactive blocks carry **action references**
(domain / service / target / params) that always run through the safe path in §7 — the
generative UI proposes, the safe layer disposes.

---

## 11. Next step

Scaffold **M0** — the installable add-on shell that *also* runs locally (`npm run dev`) and
shows a page in the HA sidebar. Once that's confirmed working, we march straight through
M1 → M6.
