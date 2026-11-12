/* Public, unauthenticated feeds. Media stays on its source's servers. */
(function (root) {
  const sources = [
    { id: "lemmy-memes", type: "lemmy", host: "lemmy.world", feed: "memes", label: "Memes · Lemmy World" },
    { id: "mastodon-funny", type: "mastodon", host: "mastodon.social", feed: "funny", label: "#funny · Mastodon" },
    { id: "programmer-humor", type: "lemmy", host: "programming.dev", feed: "programmer_humor", label: "Programmer humor · programming.dev" },
    { id: "mastodon-memes", type: "mastodon", host: "mastodon.social", feed: "memes", label: "#memes · Mastodon" },
    { id: "me-irl", type: "lemmy", host: "lemmy.world", feed: "me_irl", label: "Me IRL · Lemmy World" },
    { id: "mastodon-online", type: "mastodon", host: "mastodon.online", feed: "memes", label: "#memes · Mastodon Online" },
  ];
  const cache = new Map();
  function mediaURL(value) {
    try {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password && !u.port &&
        /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(u.hostname) &&
        !/\.(local|localhost|internal)$/i.test(u.hostname) ? u.href : "";
    } catch { return ""; }
  }
  function plain(value) {
    return String(value || "").replace(/<[^>]*>/g, " ").replace(/&(?:#(x[\da-f]+|\d+)|([a-z]+));/gi, (all, code, name) => {
      if (code) {
        const n = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
      }
      return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[name.toLowerCase()] || all;
    }).replace(/\s+/g, " ").trim().slice(0, 4000);
  }
  function identity(value) {
    let a = 2166136261, b = 5381;
    for (const c of value) { a = Math.imul(a ^ c.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ c.charCodeAt(0); }
    return "meme-" + (a >>> 0).toString(36) + (b >>> 0).toString(36);
  }
  function kind(type, url) {
    if (/^(video|gifv)$/.test(type) || /^video\//.test(type) || /\.(mp4|webm|ogv)(?:[?#]|$)/i.test(url)) return type === "gifv" ? "GIFs" : "Videos";
    if (type === "image/gif" || /\.gif(?:[?#]|$)/i.test(url)) return "GIFs";
    if (type === "image" || /^image\//.test(type) || /\.(png|jpe?g|webp|avif)(?:[?#]|$)/i.test(url)) return "Pictures";
    return "";
  }
  function item(source, { url, title, description = title, author, authorUrl, published, media, tags = [] }) {
    url = mediaURL(url);
    if (!url || !media.length) return null;
    const first = media[0];
    return {
      id: identity(first.original || first.url), kind: "memes", title: plain(title).slice(0, 180) || "A little internet absurdity",
      description: plain(description), category: first.format, tags: [...new Set([first.format, ...media.map(m => m.format), ...tags])],
      image: first.preview || (first.type === "image" ? first.url : ""), images: media.filter(m => m.type === "image").map(m => m.url),
      media, mediaKey: first.original || first.url, url, author: plain(author), authorUrl: mediaURL(authorUrl), published,
      source: source.label, sourceId: source.id, sourceUrl: url,
      imageCredit: "Posted by " + plain(author || "unknown contributor") + ". Original media rights holders retain their rights",
      imageLicense: "No reuse license inferred; see the original post",
    };
  }
  function lemmyItems(data, source) {
    return (data.posts || []).flatMap(row => {
      const p = row.post || {}, c = row.community || {}, a = row.creator || {};
      if (p.nsfw || c.nsfw || p.deleted || p.removed || c.deleted || c.removed || a.deleted || p.featured_community) return [];
      const url = mediaURL(p.url), format = kind(p.url_content_type || "", url);
      if (!url || !format) return [];
      const media = [{ url, original: url, type: format === "Videos" ? "video" : "image", format, preview: mediaURL(p.thumbnail_url), alt: plain(p.name) }];
      const result = item(source, { url: p.ap_id, title: p.name, author: a.name, authorUrl: a.actor_id, published: p.published, media, tags: [c.title || c.name] });
      return result ? [result] : [];
    });
  }
  function mastodonItems(data, source) {
    return data.flatMap(p => {
      if (p.sensitive || p.spoiler_text || p.reblog || p.visibility !== "public") return [];
      const media = (p.media_attachments || []).flatMap(m => {
        const url = mediaURL(m.url), format = kind(m.type, url);
        if (!url || !format) return [];
        return [{ url, original: mediaURL(m.remote_url) || url, type: ["video", "gifv"].includes(m.type) ? "video" : "image", format, preview: mediaURL(m.preview_url), alt: plain(m.description), duration: m.meta?.original?.duration }];
      });
      const caption = plain(p.content);
      const title = caption.replace(/https?:\/\/\S+/g, "").replace(/(?:^|\s)[#@]\s*[\p{L}\p{N}_@.-]+/gu, "").replace(/\s+/g, " ").trim();
      const result = item(source, { url: p.url || p.uri, title: (title || media[0]?.alt || "From " + (p.account?.acct || source.label)).slice(0, 140), description: caption, author: p.account?.acct, authorUrl: p.account?.url, published: p.created_at, media, tags: (p.tags || []).map(t => t.name) });
      return result ? [result] : [];
    });
  }
  async function read(url, signal) {
    signal?.throwIfAborted();
    const old = cache.get(url);
    if (old && Date.now() - old.time < 600000) return old.data;
    const response = await fetch(url, { credentials: "omit", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
    if (!response.ok) throw Error("Feed unavailable");
    const data = await response.json();
    if (data.error) throw Error("Feed unavailable");
    cache.set(url, { time: Date.now(), data });
    if (cache.size > 60) cache.delete(cache.keys().next().value);
    return data;
  }
  function dedupe(items) {
    const found = new Set();
    return items.filter(i => { const key = i.mediaKey || i.id; if (found.has(key)) return false; found.add(key); return true; });
  }
  async function catalog({ source = "all", order = "mixed", query = "", category = "All", cursor = null, signal } = {}) {
    const selected = sources.filter(s => source === "all" || s.id === source);
    if (!selected.length) throw Error("Choose an available meme source.");
    const results = await Promise.all(selected.map(async s => {
      const current = cursor?.[s.id];
      if (current === false) return { source: s, items: [], next: false, skipped: true };
      const u = new URL("https://" + s.host + (s.type === "lemmy" ? "/api/v3/post/list" : "/api/v1/timelines/tag/" + s.feed));
      if (s.type === "lemmy") {
        u.search = new URLSearchParams({ community_name: s.feed, sort: order === "newest" ? "New" : "Hot", limit: "40", page: String(current?.page || 1), type_: "All" });
      } else {
        u.search = new URLSearchParams({ only_media: "true", limit: "40", ...(current?.maxId ? { max_id: current.maxId } : {}) });
      }
      try {
        const data = await read(u.href, signal), rows = s.type === "lemmy" ? data.posts : data;
        if (!Array.isArray(rows)) throw Error("Invalid feed");
        return { source: s, items: s.type === "lemmy" ? lemmyItems(data, s) : mastodonItems(data, s), next: !rows.length ? false : s.type === "lemmy" ? { page: (current?.page || 1) + 1 } : { maxId: String(rows.at(-1).id) } };
      } catch (error) {
        signal?.throwIfAborted();
        return { source: s, items: [], next: current || {}, failed: true };
      }
    }));
    signal?.throwIfAborted();
    if (results.every(r => r.failed || r.skipped) && results.some(r => r.failed)) throw Error("Meme feeds could not be reached. Your loaded and saved memes are still available; try Refresh shortly.");
    const mixed = [];
    for (let n = 0; n < Math.max(0, ...results.map(r => r.items.length)); n++)
      for (const r of results) if (r.items[n]) mixed.push(r.items[n]);
    const q = query.trim().toLowerCase();
    let items = dedupe(mixed).filter(i => (category === "All" || i.tags.includes(category)) && (!q || [i.title, i.description, i.author, i.source, ...i.tags].join(" ").toLowerCase().includes(q)));
    if (order === "newest") items.sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0));
    const next = Object.fromEntries(results.map(r => [r.source.id, r.next]));
    const failed = results.filter(r => r.failed).map(r => r.source.label);
    return { items, next: Object.values(next).some(Boolean) ? next : null, live: true, provider: "public-memes", query: query.trim(), filter: category, collectedAt: new Date().toISOString(),
      sources: results.map(r => ({ id: r.source.id, label: r.source.label, status: r.failed ? "unavailable" : r.next === false ? "exhausted" : "available" })),
      note: "Public community feeds · " + (selected.length - failed.length) + "/" + selected.length + " sources available" + (failed.length ? " · Unavailable: " + failed.join(", ") : "") + ". Search checks each loaded source page; continue for more. Sensitive-flagged posts are excluded.",
    };
  }
  const api = { sources, catalog, mediaURL, plain, dedupe, lemmyItems, mastodonItems, clearCache: () => cache.clear() };
  root.BroadsheetMemes = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
