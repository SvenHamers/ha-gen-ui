/**
 * Dynamic AI Card — a Lovelace custom card (installed via HACS) that embeds the
 * Dynamic AI add-on cleanly inside your own dashboard (no nested Home Assistant
 * UI). It auto-finds the installed add-on and shows it via its ingress URL.
 *
 * The microphone is shown only when it's actually supported: the embedded app
 * hides it outside a secure context (HTTP), and this card grants the frame mic
 * permission so it *can* work when you're on HTTPS.
 *
 *   type: custom:dynamic-ai-card
 *   height: 600px          # optional (e.g. 70vh)
 *   url: /api/...          # optional: point at the add-on manually
 *   slug: ea5af132_dynamic_ai   # optional: add-on slug if auto-detect fails
 *   embed: false           # optional: show the full app UI (with its own chrome)
 */
const VERSION = "0.1.0";
// eslint-disable-next-line no-console
console.info(
  `%c DYNAMIC-AI-CARD %c ${VERSION} `,
  "background:#3f6fe6;color:#fff;border-radius:3px 0 0 3px;padding:2px 4px",
  "background:#161a24;color:#fff;border-radius:0 3px 3px 0;padding:2px 4px",
);

class DynamicAiCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._initialized = false;
    this.innerHTML = "";
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._initialized = true;
      this._init();
    }
  }

  async _init() {
    this._root = document.createElement("ha-card");
    this._root.style.overflow = "hidden";
    this._root.style.height = this._config.height || "600px";
    this.appendChild(this._root);

    try {
      const base = this._config.url ? this._config.url : await this._resolveIngressUrl();
      const sep = base.includes("?") ? "&" : "?";
      const src = base + (this._config.embed === false ? "" : `${sep}embed=1`);

      const iframe = document.createElement("iframe");
      iframe.src = src;
      iframe.allow = "microphone; autoplay; clipboard-write";
      iframe.setAttribute("allowfullscreen", "");
      iframe.style.cssText = "width:100%;height:100%;border:0;display:block;";
      this._root.innerHTML = "";
      this._root.appendChild(iframe);

      // Keep the ingress session cookie fresh for long-lived dashboards.
      if (!this._config.url) {
        this._keepAlive = window.setInterval(() => this._createSession().catch(() => {}), 4 * 60 * 1000);
      }
    } catch (err) {
      this._error((err && err.message) || String(err));
    }
  }

  async _resolveIngressUrl() {
    const slug = this._config.slug || (await this._findSlug());
    const info = await this._api(`/addons/${slug}/info`, "get");
    const ingressUrl = (info && (info.ingress_url || (info.data && info.data.ingress_url))) || null;
    if (!ingressUrl) throw new Error("That add-on has no ingress URL (is ingress enabled?).");
    await this._createSession();
    return ingressUrl;
  }

  async _findSlug() {
    const res = await this._api("/addons", "get");
    const addons = (res && (res.addons || (res.data && res.data.addons))) || [];
    const me = addons.find((a) => a.slug && (a.slug.endsWith("_dynamic_ai") || a.name === "Dynamic AI"));
    if (!me) throw new Error("Couldn't find the Dynamic AI add-on. Is it installed? You can also set 'slug:' or 'url:' in the card config.");
    return me.slug;
  }

  async _createSession() {
    const res = await this._api("/ingress/session", "post");
    const session = res && (res.session || (res.data && res.data.session));
    if (session) {
      const secure = location.protocol === "https:" ? ";Secure" : "";
      document.cookie = `ingress_session=${session};path=/api/hassio_ingress/;SameSite=Strict${secure}`;
    }
    return session;
  }

  _api(endpoint, method) {
    return this._hass.callWS({ type: "supervisor/api", endpoint, method });
  }

  _error(msg) {
    this._root.innerHTML = `<div style="padding:16px;font:14px/1.5 var(--paper-font-body1_-_font-family,sans-serif)">
      <b style="color:var(--error-color,#db4437)">Dynamic AI card</b><br>${msg}<br><br>
      <span style="color:var(--secondary-text-color)">Tip: set <code>url:</code> to point directly at the add-on, or <code>slug:</code> if auto-detect fails. The add-on must be installed and running.</span>
    </div>`;
  }

  getCardSize() {
    return 8;
  }

  disconnectedCallback() {
    if (this._keepAlive) window.clearInterval(this._keepAlive);
  }
}

customElements.define("dynamic-ai-card", DynamicAiCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "dynamic-ai-card",
  name: "Dynamic AI",
  description: "Embed the Dynamic AI chat (charts, control, and mic-when-supported) in your dashboard.",
  preview: false,
});
