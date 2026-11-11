import { guardianArticle } from "./guardian.mjs";
// Read public article pages on demand. Text is returned to the requesting reader,
// never added to the static edition or fetched with user credentials. Only
// explicitly licensed text uses short-lived edge caching.
const publishers = [
  {
    id: "guardian",
    name: "The Guardian",
    hosts: ["www.theguardian.com", "theguardian.com"],
    roots: [".article-body-viewer-selector"],
  },
  {
    id: "globalvoices",
    name: "Global Voices",
    hosts: ["globalvoices.org"],
    paths: /^\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/?$/,
    roots: [".full-article .entry"],
    contributors: ".post-header .contributor-name",
    license: { name: "CC BY 3.0", url: "https://creativecommons.org/licenses/by/3.0/", policy: "https://globalvoices.org/about/global-voices-attribution-policy/" },
  },
  {
    id: "eff",
    name: "Electronic Frontier Foundation",
    hosts: ["www.eff.org", "eff.org"],
    paths: /^\/deeplinks\/\d{4}\/\d{2}\/[^/]+\/?$/,
    roots: ["article.node--full .field--name-body"],
    license: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/", policy: "https://www.eff.org/copyright" },
  },
  {
    id: "nasa",
    name: "NASA",
    hosts: ["www.nasa.gov", "science.nasa.gov", "nasa.gov"],
    roots: ["article .entry-content"],
  },
  {
    id: "verge",
    name: "The Verge",
    hosts: ["www.theverge.com", "theverge.com"],
    roots: [
      ".duet--article--article-body-component",
      ".article-body",
      ".c-entry-content",
    ],
  },
  {
    id: "ars",
    name: "Ars Technica",
    hosts: ["arstechnica.com", "www.arstechnica.com"],
    roots: ["article .post-content"],
  },
  {
    id: "sciencedaily",
    name: "ScienceDaily",
    hosts: ["www.sciencedaily.com", "sciencedaily.com"],
    roots: ["#story_text", ".story_text"],
  },
  {
    id: "aljazeera",
    name: "Al Jazeera",
    hosts: ["www.aljazeera.com", "aljazeera.com"],
    roots: ["main .wysiwyg", "main #live-blog-updates"],
  },
  {
    id: "lemonde",
    name: "Le Monde",
    hosts: ["www.lemonde.fr", "lemonde.fr"],
    roots: [".article__body"],
  },
];
const MAX_BYTES = 1800000,
  MAX_TEXT = 160000,
  MAX_BLOCKS = 600;
const clean = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();
export const restrictedPreview = (value) =>
  /(?:^|[,\s])(?:nosnippet|noarchive)(?:[,;\s]|$)|max-snippet\s*:\s*\d+/i.test(
    value || "",
  );
export function articleVideo(value) {
  try {
    const u = new URL(value);
    // Only the public player and account supplied by Al Jazeera's metadata.
    if (u.origin !== "https://players.brightcove.net" || u.username || u.password ||
        !/^\/665003303001\/[A-Za-z0-9_-]+_default\/index.html$/.test(u.pathname) ||
        !/^\d{6,20}$/.test(u.searchParams.get("videoId") || "")) return "";
    return u.origin + u.pathname + "?videoId=" + u.searchParams.get("videoId");
  } catch { return ""; }
}
export function articleRequest(value, expected) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Error("Choose a valid publisher article.");
  }
  const publisher = publishers.find((p) => p.hosts.includes(url.hostname));
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !publisher ||
    (publisher.paths && !publisher.paths.test(url.pathname)) ||
    (expected && expected !== publisher.id) ||
    url.pathname === "/" ||
    /(?:^|\/)(?:api|login|signin|sign-in|subscribe|account|oauth|auth)(?:\/|$)/i.test(
      url.pathname,
    )
  )
    throw Error("Choose an article from a supported publisher.");
  url.hash = "";
  url.search = "";
  return { url, publisher };
}
export async function boundedHTML(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error("The publisher returned an empty page.");
  let size = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw Error("This article is too large for the reader.");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
const unavailable = (reason, message, url, publisher) => ({
  status: "unavailable",
  reason,
  message,
  url: url.href,
  publisher: publisher.name,
  blocks: [],
});
export function articleMetadata(documents) {
  const records = [];
  const visit = (v, depth = 0) => {
    if (depth > 8 || records.length > 2000 || !v || typeof v !== "object")
      return;
    if (Array.isArray(v)) {
      for (const n of v.slice(0, 100)) visit(n, depth + 1);
      return;
    }
    records.push(v);
    for (const value of Object.values(v))
      if (value && typeof value === "object") visit(value, depth + 1);
  };
  for (const doc of documents) visit(doc);
  const articles = records.filter((r) =>
    [r["@type"]]
      .flat()
      .some((t) =>
        /^(?:NewsArticle|Article|BlogPosting|ReportageNewsArticle|AnalysisNewsArticle|LiveBlogPosting)$/i.test(
          t || "",
        ),
      ),
  );
  const main = articles[0] || {},
    people = [main.author]
      .flat()
      .map((p) => (typeof p === "string" ? p : p?.name))
      .filter(Boolean);
  return {
    restricted: records.some(
      (r) =>
        r.isAccessibleForFree === false || r.isAccessibleForFree === "false",
    ),
    author: clean(people.join(", ")).slice(0, 300),
    publishedAt: clean(main.datePublished),
    modifiedAt: clean(main.dateModified),
    copyright: clean(main.copyrightNotice).slice(0, 500),
    title: clean(main.headline),
    videos: records.filter((r) => r["@type"] === "VideoObject").slice(0, 3).map((r) => ({
      src: articleVideo(r.embedUrl),
      title: clean(r.name).slice(0, 300),
      description: clean(r.description).slice(0, 20000),
    })).filter((r) => r.src),
  };
}
export async function extractArticle(html, url, publisher) {
  const groups = publisher.roots.map((root) => ({
      root,
      blocks: [],
      stack: [],
    })),
    documents = [],
    meta = {},
    scripts = [],
    contributors = [],
    links = [];
  let forbidden = 0,
    script = null,
    restricted = false,
    overflow = false;
  const rewriter = new HTMLRewriter()
    .on("meta", {
      element(e) {
        const name = (
            e.getAttribute("name") ||
            e.getAttribute("property") ||
            ""
          ).toLowerCase(),
          value = e.getAttribute("content") || "";
        if (["robots", "broadsheet"].includes(name) && restrictedPreview(value))
          restricted = true;
        if (["author", "og:title", "article:published_time"].includes(name))
          meta[name] = clean(value);
      },
    })
    .on('link[rel="amphtml"]', {
      element(e) { meta.amp = e.getAttribute("href"); },
    })
    .on('script[type="application/ld+json"]', {
      element(e) {
        const row = { text: "" };
        scripts.push(row);
        script = row;
        e.onEndTag(() => (script = null));
      },
      text(t) {
        if (script) {
          if (script.text.length + t.text.length > 200000) script = null;
          else script.text += t.text;
        }
      },
    })
    .on(
      'script,style,noscript,nav,aside,footer,form,[hidden],[aria-hidden="true"],[data-nosnippet],.newsletter,.related-content,.article__paywall',
      {
        element(e) {
          if (
            [
              "area",
              "base",
              "br",
              "col",
              "embed",
              "hr",
              "img",
              "input",
              "link",
              "meta",
              "param",
              "source",
              "track",
              "wbr",
            ].includes(e.tagName)
          )
            return;
          forbidden++;
          e.onEndTag(() => forbidden--);
        },
      },
    );
  if (publisher.contributors) {
    let contributor;
    rewriter.on(publisher.contributors, {
      element(e) { contributor = { text: "" }; contributors.push(contributor); e.onEndTag(() => { contributor = null; }); },
      text(t) { if (contributor && contributor.text.length < 1000) contributor.text += " " + t.text; },
    });
  }
  if (publisher.license) {
    // These publishers license their own text, not every embedded photograph,
    // quotation, player or illustration. Keep text references; omit media.
    rewriter.on(".wp-caption, figure, .pullquote, .related-cases", {
      element(e) { forbidden++; e.onEndTag(() => forbidden--); },
    });
    for (const group of groups) {
      let link;
      rewriter.on(group.root + " a[href]", {
        element(e) {
          link = null;
          try {
            const target = new URL(e.getAttribute("href"), url);
            if (!forbidden && ["https:", "http:"].includes(target.protocol) && !target.username && !target.password && links.length < 120) {
              link = { url: target.href, text: "" }; links.push(link);
            }
          } catch {}
          e.onEndTag(() => { link = null; });
        },
        text(t) { if (link && link.text.length < 300) link.text += t.text; },
      });
    }
  }
  for (const group of groups)
    for (const tag of ["p", "h2", "h3", "li"]) {
      const own = [];
      rewriter.on(group.root + " " + tag, {
        element(e) {
          const block = {
            type:
              tag === "p"
                ? "paragraph"
                : tag === "li"
                  ? "list-item"
                  : "heading",
            text: "",
            ignore: forbidden > 0,
          };
          own.push(block);
          group.stack.push(block);
          group.blocks.push(block);
          if (group.blocks.length > MAX_BLOCKS) overflow = true;
          e.onEndTag(() => {
            own.pop();
            group.stack.pop();
          });
        },
        text(t) {
          const b = own.at(-1);
          if (b && group.stack.at(-1) === b && !forbidden && !b.ignore) {
            if (b.text.length + t.text.length > 20000) overflow = true;
            else b.text += t.text;
          }
        },
      });
    }
  // Consume the transformed stream; no publisher markup is returned to the app.
  const output = rewriter.transform(
    new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }),
  );
  const reader = output.body.getReader();
  try {
    while (!(await reader.read()).done) {}
  } finally {
    reader.releaseLock();
  }
  for (const s of scripts)
    try {
      documents.push(JSON.parse(s.text));
    } catch {}
  const { videos, ...metadata } = articleMetadata(documents);
  if (restricted || metadata.restricted)
    return unavailable(
      "restricted",
      "This publisher requires access through its own site for this article.",
      url,
      publisher,
    );
  if (overflow)
    return unavailable(
      "large",
      "This article exceeds the reader limit. Open the publisher to read it in full.",
      url,
      publisher,
    );
  const candidates = groups.map((g) =>
    g.blocks
      .filter((b) => !b.ignore)
      .map((b) => ({ type: b.type, text: clean(b.text) }))
      .filter((b) => b.text),
  );
  // Alternate selectors are fallbacks, never concatenated duplicate copies.
  let blocks =
    candidates.sort(
      (a, b) =>
        b.reduce((n, x) => n + x.text.length, 0) -
        a.reduce((n, x) => n + x.text.length, 0),
    )[0] || [];
  const isAlJazeera = publisher.id === "aljazeera",
    kind = isAlJazeera && /\/news\/liveblog\//.test(url.pathname)
      ? "liveblog" : isAlJazeera && /^\/video\//.test(url.pathname) ? "video" : "article",
    media = isAlJazeera ? videos.map(({ src, title }) => ({ type: "embed", src, title })) : [];
  let alternate = "";
  if (kind === "liveblog" && meta.amp) {
    try {
      const candidate = articleRequest(new URL(meta.amp, url).href, publisher.id).url;
      if (candidate.origin === url.origin && candidate.pathname === "/amp" + url.pathname)
        alternate = candidate.href;
    } catch {}
  }
  if (kind === "video" && media.length && !blocks.length && videos[0].description)
    blocks = [{ type: "paragraph", text: videos[0].description }];
  const separateRights = /all rights reserved|not (?:covered|available) under (?:a |the )?creative commons|reprinted with permission/i,
    partnerText = /(?:originally|first) published (?:by|in|at|on) (?!Global Voices\b)|republished (?:from|with)/i;
  if (publisher.license && blocks.some((b) => separateRights.test(b.text) || partnerText.test(b.text)))
    return { ...unavailable("rights", "This story includes a separate reuse notice. Read the original at the publisher.", url, publisher), retryable: false };
  const characters = blocks.reduce((n, b) => n + b.text.length, 0);
  if (characters > MAX_TEXT)
    return unavailable(
      "large",
      "This article exceeds the reader limit. Open the publisher to read it in full.",
      url,
      publisher,
    );
  if (kind !== "video" && (characters < 200 || !blocks.some((b) => b.type === "paragraph")))
    return { ...unavailable(
      "unavailable",
      "The publisher did not provide a readable article page. You can retry or open the original.",
      url,
      publisher,
    ), alternate };
  if (!blocks.length && !media.length)
    return unavailable("unavailable", "The publisher did not supply readable text or a supported video.", url, publisher);
  const author = contributors.length ? [...new Set(contributors.map((c) => clean(c.text)))].join(" · ").slice(0, 500) : metadata.author || meta.author || "";
  if (publisher.license && !author)
    return { ...unavailable("attribution", "The original author credit could not be verified. Read this story at the publisher.", url, publisher), retryable: false };
  return {
    status: "ready",
    url: url.href,
    publisher: publisher.name,
    ...metadata,
    kind,
    media,
    alternate,
    author,
    ...(publisher.license ? {
      license: publisher.license,
      presentation: "Text-only presentation. Embedded media omitted; links listed below.",
      links: [...new Map(links.filter((l) => clean(l.text)).map((l) => [l.url, { url: l.url, text: clean(l.text) }])).values()],
    } : {}),
    blocks,
    wordCount: blocks.reduce((n, b) => n + b.text.split(/\s+/).length, 0),
    retrievedAt: new Date().toISOString(),
  };
}
async function fetchArticle(
  request,
  { get = fetch, extract = extractArticle, guardianKey, cache, ctx } = {},
) {
  let { url, publisher } = articleRequest(request.searchParams.get("url"));
  if (publisher.id === "guardian")
    return guardianArticle(url, publisher, guardianKey, { get, cache, ctx });
  let usedAlternate = false;
  const canonical = url.href;
  for (let redirects = 0; redirects < 6; redirects++) {
    const response = await get(url.href, {
      redirect: "manual",
      credentials: "omit",
      headers: {
        Accept: "text/html",
        "User-Agent": "Broadsheet/1.0 (personal article reader)",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      await response.body?.cancel();
      if (!location) throw Error("The publisher returned an invalid redirect.");
      ({ url } = articleRequest(new URL(location, url).href, publisher.id));
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      const denied = [401, 402, 403].includes(response.status);
      return { ...unavailable(
        response.status === 401 ||
          response.status === 402 ||
          response.status === 403
          ? "restricted"
          : "unavailable",
        denied
          ? `${publisher.name} declined the reader's request. Read this story directly at ${publisher.name}.`
          : "This article is not available to the reader right now. Retry or open it at the publisher.",
        url,
        publisher,
      ), retryable: !denied };
    }
    if (
      !response.headers.get("Content-Type")?.toLowerCase().includes("text/html")
    ) {
      await response.body?.cancel();
      return unavailable(
        "format",
        "This source does not provide an HTML article. Open its original page.",
        url,
        publisher,
      );
    }
    if (restrictedPreview(response.headers.get("X-Robots-Tag"))) {
      await response.body?.cancel();
      return unavailable(
        "restricted",
        "This publisher requires reading this article on its own site.",
        url,
        publisher,
      );
    }
    const result = await extract(await boundedHTML(response), url, publisher);
    const { alternate, ...article } = result;
    // Follow only the publisher-advertised public live-blog alternate, after
    // a successful page fetch. Never retry denial or subscription pages there.
    if (!usedAlternate && publisher.id === "aljazeera" &&
        (result.status === "ready" || result.reason === "unavailable") && alternate) {
      const candidate = articleRequest(alternate, publisher.id).url;
      if (candidate.origin === url.origin && candidate.pathname === "/amp" + url.pathname) {
        usedAlternate = true;
        url = candidate;
        continue;
      }
    }
    return { ...article, url: usedAlternate ? canonical : article.url };
  }
  throw Error("The publisher redirected too many times.");
}

// Only explicitly reusable text gets a shared cache. Other publishers retain
// their existing on-demand no-store behavior. No cross-request promises or
// request-scoped state are kept in Worker globals.
export async function readArticle(request, options = {}) {
  const { url, publisher } = articleRequest(request.searchParams.get("url"));
  if (!publisher.license) return fetchArticle(request, options);
  const { cache, ctx } = options;
  const key = new Request("https://broadsheet-cache.invalid/licensed-article/v1/" + publisher.id + url.pathname);
  try {
    const old = await cache?.match(key);
    if (old) return await old.json();
  } catch { /* Cache failure must not make a licensed article unreadable. */ }
  const article = await fetchArticle(request, options);
  if (article.status === "ready" && cache && ctx) ctx.waitUntil(
    cache.put(key, new Response(JSON.stringify(article), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=900" } })).catch(() => {}),
  );
  return article;
}
