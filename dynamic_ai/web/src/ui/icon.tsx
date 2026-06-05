// Lightweight, dependency-free icon: maps common Material Design Icon names
// (what the AI tends to emit) to emoji glyphs. Falls back to a neutral dot.
const MAP: Record<string, string> = {
  lightbulb: "💡", "lightbulb-on": "💡", "lightbulb-outline": "💡", lamp: "💡", "ceiling-light": "💡",
  power: "⏻", "power-plug": "🔌", "toggle-switch": "🎚️", "toggle-switch-outline": "🎚️",
  fan: "🌀", thermometer: "🌡️", thermostat: "🌡️", temperature: "🌡️", "home-thermometer": "🌡️",
  "water-percent": "💧", water: "💧", humidity: "💧", "weather-sunny": "☀️", "weather-night": "🌙",
  "weather-cloudy": "☁️", "weather-rainy": "🌧️", battery: "🔋", "battery-charging": "🔌", "battery-low": "🪫",
  lock: "🔒", "lock-open": "🔓", door: "🚪", "door-open": "🚪", garage: "🚗", "window-closed": "🪟",
  "window-open": "🪟", blinds: "🪟", curtains: "🪟", "motion-sensor": "🚶", walk: "🚶",
  home: "🏠", "home-assistant": "🏠", account: "👤", person: "🧍", "account-group": "👥",
  music: "🎵", play: "▶️", pause: "⏸️", stop: "⏹️", speaker: "🔊", "volume-high": "🔊", television: "📺", tv: "📺",
  alarm: "⏰", "alarm-light": "🚨", "shield-home": "🛡️", shield: "🛡️", bell: "🔔", "bell-ring": "🔔",
  robot: "🤖", "robot-happy": "🤖", calendar: "📅", clock: "🕐", "clock-outline": "🕐",
  "chart-line": "📈", "chart-bar": "📊", gauge: "📊", leaf: "🌿", flash: "⚡", lightning: "⚡",
  check: "✅", "check-circle": "✅", close: "❌", "close-circle": "❌", alert: "⚠️", information: "ℹ️",
  vacuum: "🧹", "robot-vacuum": "🧹", fridge: "🧊", "washing-machine": "🧺", radiator: "🔥",
  fire: "🔥", snowflake: "❄️", "air-conditioner": "❄️", "fan-speed-1": "🌀", coffee: "☕", "silverware-fork-knife": "🍴",
};

export function Icon({ name, className, style }: { name?: string; className?: string; style?: React.CSSProperties }) {
  if (!name) return null;
  const key = name.replace(/^mdi:/, "");
  const glyph = MAP[key] || MAP[key.split("-")[0]] || "•";
  return (
    <span className={className} style={style} aria-hidden>
      {glyph}
    </span>
  );
}
