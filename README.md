# Dynamic AI — Home Assistant add-on

A Home Assistant add-on that gives you a Claude/ChatGPT-style assistant inside HA: a chat that
**sees** your home (live state + history, drawn as charts), **controls** it (with live animated
feedback), and **talks** with you hands-free. Supports **Claude (Anthropic)** and
**ChatGPT (OpenAI)**.

The add-on itself lives in [`dynamic_ai/`](./dynamic_ai) — see its
[README](./dynamic_ai/README.md) for full documentation, configuration, and the design notes.

## Install

**Option A — add this repository (easiest):**
1. In Home Assistant: **Settings → Add-ons → Add-on Store → ⋮ (top-right) → Repositories**.
2. Add `https://github.com/SvenHamers/ha-gen-ui` and close.
3. Find **Dynamic AI** in the store and click **Install**.
4. Open its **Configuration** tab, paste your OpenAI key (and optionally an Anthropic key), then **Start**.
5. Open it from the sidebar.

> If this repository is **private**, Home Assistant can't pull it from the store — either make it
> public, or use Option B.

**Option B — local add-on:** copy the [`dynamic_ai/`](./dynamic_ai) folder to `/addons/dynamic_ai/`
on your HA machine (via the *Samba share* or *Advanced SSH & Web Terminal* add-on), then install it
from **Settings → Add-ons → Local add-ons**.

The add-on builds itself on install (it pulls Node + dependencies and builds the UI), so the first
start can take a few minutes — especially on a Raspberry Pi.
