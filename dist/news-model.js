/* News media, source-grounded context, and editorial sizing. No network or DOM. */
(function (root) {
  const stop = new Set(
    "a an the and or for from with that this these those after before into over under says said say more first new latest news live updates update video watch pictures photo photos how what why when who their have has are was were will could would should about amid its not but out his her they them all can you your our than just been also year years day days today week world nasa".split(
      " ",
    ),
  );
  const wordCache = new Map(),
    locationCache = new WeakMap(),
    profileCache = new WeakMap();
  function publicURL(value) {
    if (/^images\/[\w./-]+$/.test(value || "") && !value.includes(".."))
      return value;
    if (/^data:image\/(jpeg|png|webp);base64,[\w+/=]+$/.test(value || ""))
      return value;
    try {
      const u = new URL(value);
      if (
        !["http:", "https:"].includes(u.protocol) ||
        u.username ||
        u.password ||
        !u.hostname
      )
        return "";
      const h = u.hostname;
      if (
        h === "localhost" ||
        h.endsWith(".localhost") ||
        h.endsWith(".local") ||
        h.endsWith(".internal") ||
        h.startsWith("[") ||
        /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(
          h,
        )
      )
        return "";
      u.protocol = "https:";
      return u.href;
    } catch {
      return "";
    }
  }
  function media(story) {
    const records = [
        ...(story.blocks || []).filter((b) =>
          ["image", "video"].includes(b.type),
        ),
        ...(story.media || []),
      ],
      seen = new Set();
    return records.filter((m) => {
      const key =
        m.type === "image"
          ? publicURL(m.src)
          : m.type === "video"
            ? m.id || publicURL(m.src) || publicURL(m.url)
            : "";
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function words(title) {
    if (wordCache.has(title)) return wordCache.get(title);
    const result = [
      ...new Set(
        (title.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
          .filter((t) => t.length > 3 && !stop.has(t))
          .map((t) => t.replace(/'s$/, "")),
      ),
    ];
    wordCache.set(title, result);
    if (wordCache.size > 1200) wordCache.delete(wordCache.keys().next().value);
    return result;
  }
  function related(story, stories, limit = 4) {
    const a = new Set(words(story.title)),
      date = Date.parse(story.date);
    return stories
      .filter(
        (s) =>
          s.id !== story.id &&
          s.url !== story.url &&
          (!Number.isFinite(date) ||
            !Number.isFinite(Date.parse(s.date)) ||
            Math.abs(date - Date.parse(s.date)) < 7 * 86400000),
      )
      .map((s) => {
        const b = words(s.title),
          shared = b.filter((w) => a.has(w));
        return {
          story: s,
          shared,
          score:
            shared.length * 3 +
            shared.reduce((n, w) => n + Math.min(10, w.length) / 20, 0) +
            (s.sourceId !== story.sourceId ? 1 : 0),
        };
      })
      .filter((s) => s.shared.length >= 2)
      .sort(
        (a, b) =>
          b.score - a.score ||
          (Date.parse(b.story.date) || 0) - (Date.parse(a.story.date) || 0),
      )
      .slice(0, limit);
  }
  const extra = {
    USA: ["United States", "American", "Americans", "U.S.", "US"],
    GBR: ["UK", "U.K.", "Britain", "British"],
    UKR: ["Ukrainian", "Ukrainians", "Kyiv", "Kharkiv"],
    RUS: ["Russian", "Russians", "Moscow"],
    POL: ["Polish", "Krakow", "Warsaw"],
    CHN: ["Chinese", "Beijing", "Shanghai"],
    ISR: ["Israeli", "Israelis"],
    PSX: ["Palestinian", "Palestinians", "Gaza", "West Bank"],
    IRN: ["Iranian", "Iranians", "Tehran"],
    LBN: ["Lebanese", "Beirut"],
    FRA: ["French", "Paris"],
    DEU: ["German", "Berlin"],
    SDN: ["Sudanese", "Khartoum"],
    JPN: ["Japanese", "Tokyo"],
    IND: ["Indian", "New Delhi", "Mumbai"],
    TUR: ["Turkiye", "Türkiye", "Turkish", "Ankara", "Antalya"],
  };
  function locations(story, geography) {
    const cached = locationCache.get(story);
    if (cached?.geography === geography) return cached.result;
    if (
      story.location &&
      Number.isFinite(story.location.lat) &&
      Number.isFinite(story.location.lon)
    )
      return [
        {
          ...story.location,
          name: story.location.name || "Publisher-provided location",
          coordinate: true,
        },
      ];
    if (
      (story.topics || []).includes("Cooking") &&
      !(story.topics || []).includes("World")
    )
      return [];
    const title = story.title || "",
      ambiguous = new Set(["Georgia", "Jordan", "Chad", "Turkey", "Congo"]);
    const hits = [];
    for (const country of geography?.countries || [])
      for (const alias of [...country.aliases, ...(extra[country.id] || [])]) {
        if (
          !alias ||
          (alias.length < 3 && !["US", "UK"].includes(alias)) ||
          ambiguous.has(alias)
        )
          continue;
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          short = alias.length <= 4 && alias.toUpperCase() === alias;
        const match = new RegExp(
          "(?:^|[^\\p{L}])(" + escaped + ")(?:$|[^\\p{L}])",
          short ? "u" : "iu",
        ).exec(title);
        if (match) {
          const start = match.index + match[0].indexOf(match[1]);
          hits.push({
            country,
            name: country.name,
            term: match[1],
            start,
            end: start + match[1].length,
            basis: "Place named in the headline",
            precision: "country / territory overview",
          });
          break;
        }
      }
    const result = hits
      .filter(
        (h) =>
          !hits.some(
            (o) =>
              o !== h &&
              o.start <= h.start &&
              o.end >= h.end &&
              o.end - o.start > h.end - h.start,
          ),
      )
      .slice(0, 4);
    locationCache.set(story, { geography, result });
    return result;
  }
  function profile(story, { unit = 240, columns = 6, geography } = {}) {
    const cache = profileCache.get(story),
      key = unit + ":" + columns;
    if (cache?.geography === geography && cache.values.has(key))
      return cache.values.get(key);
    const m = media(story),
      image = m.find((m) => m.type === "image"),
      clip = m.find((m) => m.type === "video"),
      places = locations(story, geography);
    const length = story.wordCount || (story.excerpt || "").split(/\s+/).length;
    const mapLead =
      places.length > 0 &&
      (!image ||
        (image.width &&
          image.width < 400 &&
          /\b(border|war|attack|earthquake|flood|where|across|invad|missile)\w*/i.test(
            story.title,
          )));
    let span = clip
      ? 3
      : image
        ? image.width >= 600 || length > 600
          ? 3
          : 2
        : story.title.length < 76 && (story.excerpt || "").length < 160
          ? 1
          : 2;
    span = Math.min(columns, mapLead ? Math.max(2, span) : span);
    const width = span * unit + (span - 1) * 18;
    const headlineSize = span >= 3 ? 40 : span === 2 ? 29 : 22;
    const coverHeight = mapLead
      ? Math.min(220, width * 0.5)
      : image
        ? Math.round(
            Math.max(
              140,
              Math.min(
                330,
                (width - 40) *
                  Math.min(
                    0.9,
                    (image.height || 0) / (image.width || 1) || 0.56,
                  ),
              ),
            ),
          )
        : 0;
    const lines = Math.ceil(
      story.title.length / Math.max(12, (width - 40) / (headlineSize * 0.48)),
    );
    const excerptLines = span === 1 ? 2 : length > 500 ? 5 : 3;
    const height = Math.ceil(
      240 +
        lines * headlineSize * 1.09 +
        coverHeight +
        (coverHeight ? 38 : 0) +
        excerptLines * 22 +
        (places.length && !mapLead ? 26 : 0),
    );
    const result = {
      span,
      width,
      height: Math.max(260, height),
      headlineSize,
      coverHeight,
      shape: mapLead
        ? "locator"
        : clip
          ? "video"
          : span >= 3
            ? "lead"
            : span === 1
              ? "brief"
              : "report",
      image,
      clip,
      places,
    };
    const record =
      cache?.geography === geography ? cache : { geography, values: new Map() };
    record.values.set(key, result);
    profileCache.set(story, record);
    return result;
  }
  function editionOrder(items) {
    const remaining = new Set(items.map((s) => s.id)),
      result = [];
    for (const story of items) {
      if (!remaining.has(story.id)) continue;
      result.push(story);
      remaining.delete(story.id);
      for (const match of related(story, items, 3)) {
        if (remaining.has(match.story.id)) {
          result.push(match.story);
          remaining.delete(match.story.id);
        }
      }
    }
    return result;
  }
  const api = {
    publicURL,
    media,
    words,
    related,
    locations,
    profile,
    editionOrder,
  };
  root.BroadsheetNews = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
