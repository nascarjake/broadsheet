/* Shared, deterministic workspace operations. No DOM or network dependencies. */
(function (root) {
  const TOPICS = [
    "World",
    "Space",
    "Science",
    "Technology",
    "AI",
    "Climate",
    "Cooking",
  ];
  function tags(s) {
    const t = new Set(s.topics || []);
    if (s.sourceId === "nasa" || s.source === "NASA") {
      t.add("Space");
      t.add("Science");
      if (s.topic === "Earth & environment") t.add("Climate");
    }
    const text = s.title || "";
    if (
      /\b(ai|artificial intelligence|machine learning|llm|openai|chatgpt)\b/i.test(
        text,
      )
    )
      t.add("AI");
    return [...t];
  }
  function filter(stories, state) {
    const q = (state.query || "").trim().toLowerCase();
    return stories
      .filter(
        (s) =>
          (state.sources || []).includes(s.sourceId) &&
          (!state.topics?.length ||
            tags(s).some((t) => state.topics.includes(t))) &&
          (!state.savedOnly || state.saved.includes(s.id)) &&
          (!q ||
            [s.title, s.excerpt, s.source, ...tags(s)]
              .join(" ")
              .toLowerCase()
              .includes(q)),
      )
      .sort((a, b) =>
        state.sort === "source"
          ? a.source.localeCompare(b.source) ||
            (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0)
          : (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0),
      );
  }
  function arrange(stories, size = "comfortable") {
    const w = size === "compact" ? 320 : size === "large" ? 520 : 400,
      h = size === "compact" ? 340 : size === "large" ? 600 : 420;
    return Object.fromEntries(
      stories.map((s, i) => [
        s.id,
        { x: (i % 3) * (w + 24), y: Math.floor(i / 3) * (h + 24), w, h },
      ]),
    );
  }
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }
  function cleanLayout(layout) {
    return Object.fromEntries(
      Object.entries(layout || {})
        .filter(
          ([, v]) =>
            v && ["x", "y", "w", "h"].every((k) => Number.isFinite(v[k])),
        )
        .map(([id, v]) => [
          id,
          {
            x: clamp(v.x, -100000, 100000),
            y: clamp(v.y, -100000, 100000),
            w: clamp(v.w, 280, 900),
            h: clamp(v.h, 300, 1400),
          },
        ]),
    );
  }
  function resolveURL(value, base) {
    try {
      const u = base ? new URL(value, base) : new URL(value);
      return ["http:", "https:"].includes(u.protocol) ? u.href : "";
    } catch {
      return "";
    }
  }
  const api = { resolveURL, TOPICS, tags, filter, arrange, clamp, cleanLayout };
  root.BroadsheetModel = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
