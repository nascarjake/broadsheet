/* An on-demand, in-place article reader. Full text lives only in bounded memory. */
(function (root) {
  const records = new Map(),
    MAX_RECORDS = 30,
    MAX_ACTIVE = 3,
    MAX_QUEUED = 12,
    waiting = [];
  let active = 0;
  async function acquire() {
    if (active < MAX_ACTIVE) { active++; return; }
    if (waiting.length >= MAX_QUEUED) throw Error("Several articles are opening. Wait a moment, then try again.");
    await new Promise((resolve) => waiting.push(resolve));
  }
  function release() {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
  function licensedSource(url) {
    try {
      const host = new URL(url).hostname;
      if (host === "globalvoices.org") return { name: "CC BY 3.0", url: "https://creativecommons.org/licenses/by/3.0/" };
      if (["www.eff.org", "eff.org"].includes(host)) return { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" };
    } catch {}
    return null;
  }
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const safe = (value) => {
    try {
      const u = new URL(value);
      return ["https:", "http:"].includes(u.protocol) &&
        !u.username &&
        !u.password
        ? u.href
        : "";
    } catch {
      return "";
    }
  };
  function articleVideo(value) {
    try {
      const u = new URL(value);
      return u.origin === "https://players.brightcove.net" && !u.username && !u.password &&
        /^\/665003303001\/[A-Za-z0-9_-]+_default\/index.html$/.test(u.pathname) &&
        /^\d{6,20}$/.test(u.searchParams.get("videoId") || "")
        ? u.origin + u.pathname + "?videoId=" + u.searchParams.get("videoId") : "";
    } catch { return ""; }
  }
  function validate(data) {
    if (data?.status !== "ready")
      return {
        status: "unavailable",
        message: String(
          data?.message ||
            "This article could not be loaded. Try again or read it at the publisher.",
        ).slice(0, 300),
        retryable: data?.retryable !== false,
        publisher: String(data?.publisher || "the publisher").slice(0, 100),
      };
    if (data.format === "guardian") {
      if (
        typeof data.html !== "string" ||
        !data.html ||
        data.html.length > 500000 ||
        !safe(data.url) ||
        !["www.theguardian.com", "theguardian.com"].includes(
          new URL(data.url).hostname,
        )
      )
        throw Error("The Guardian article format could not be read.");
      return {
        status: "ready",
        format: "guardian",
        html: data.html,
        url: data.url,
        publisher: "The Guardian",
        title: String(data.title || ""),
        author: String(data.author || "").slice(0, 500),
        wordCount: Number(data.wordCount) || 1,
      };
    }
    const media = Array.isArray(data.media) &&
      ["www.aljazeera.com", "aljazeera.com"].includes(new URL(safe(data.url) || "https://invalid.test").hostname)
      ? data.media.slice(0, 3).map((m) => ({ src: articleVideo(m.src), title: String(m.title || "Video report").slice(0, 300) })).filter((m) => m.src)
      : [];
    if (
      !Array.isArray(data.blocks) ||
      (!data.blocks.length && !media.length) ||
      data.blocks.length > 600
    )
      throw Error("The publisher did not return a readable article.");
    let size = 0;
    const blocks = data.blocks.map((b) => {
      if (
        !["paragraph", "heading", "list-item"].includes(b.type) ||
        typeof b.text !== "string" ||
        b.text.length > 20000
      )
        throw Error("The article format could not be read.");
      size += b.text.length;
      return { type: b.type, text: b.text };
    });
    if (size > 160000) throw Error("This article is too large for the reader.");
    const license = licensedSource(safe(data.url));
    return {
      status: "ready",
      url: safe(data.url),
      ...(license && data.license?.url === license.url ? {
        license,
        presentation: "Text-only presentation. Embedded media omitted; links listed below.",
        links: (Array.isArray(data.links) ? data.links : []).slice(0, 120).map((link) => ({ url: safe(link.url), text: String(link.text || "").slice(0, 300) })).filter((link) => link.url && link.text),
      } : {}),
      blocks,
      media,
      kind: ["video", "liveblog"].includes(data.kind) ? data.kind : "article",
      retrievedAt: Number.isFinite(Date.parse(data.retrievedAt)) ? data.retrievedAt : "",
      publisher: String(data.publisher || "Publisher").slice(0, 100),
      author: String(data.author || "").slice(0, 500),
      copyright: String(data.copyright || "").slice(0, 500),
      wordCount: blocks.reduce((n, b) => n + b.text.split(/\s+/).length, 0),
    };
  }
  function guardianFrame(record) {
    const frame = el("iframe", "guardian-article"),
      id = crypto.randomUUID();
    frame.title = "Article text from The Guardian";
    frame.dataset.readerFrame = id;
    frame.setAttribute(
      "sandbox",
      "allow-scripts allow-popups allow-popups-to-escape-sandbox",
    );
    frame.referrerPolicy = "no-referrer";
    // The reader grows with its content; only the surrounding canvas scrolls.
    frame.setAttribute("scrolling", "no");
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${id}'; frame-src https:; form-action 'none'; base-uri https://www.theguardian.com https://theguardian.com"><base href="${record.url.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" target="_blank"><style>html,body{margin:0;padding:0;overflow:hidden}body{display:flow-root;font:18px/1.7 Georgia,serif;color:#27342b;overflow-wrap:anywhere}p{margin:0 0 1.25em}h2,h3{font:600 26px/1.3 Georgia,serif;margin:1.5em 0 .6em}a{color:#53694c;text-underline-offset:3px}img,video{max-width:100%;height:auto}figure{margin:24px 0}figcaption{font:11px/1.6 Arial,sans-serif;color:#606d5c}blockquote{margin:20px 0;padding-left:20px;border-left:2px solid #bac7ae}iframe{max-width:100%;border:0}</style></head><body>${record.html}<script nonce="${id}">
for(const a of document.querySelectorAll('a')){a.target='_blank';a.rel='noopener noreferrer';}
// Measure the body, not the document viewport: text can shrink after widening.
const report=()=>parent.postMessage({type:'broadsheet-guardian-height',id:'${id}',height:Math.ceil(Math.max(document.body.getBoundingClientRect().height,document.body.scrollHeight))+2},'*');
new ResizeObserver(report).observe(document.body);addEventListener('load',report);report();
// Wheel events do not bubble across a frame boundary, even without overflow.
addEventListener('wheel',e=>{
  e.preventDefault();
  const unit=e.deltaMode===1?18:e.deltaMode===2?innerHeight:1;
  parent.postMessage({type:'broadsheet-guardian-wheel',id:'${id}',deltaX:e.deltaX*unit,deltaY:e.deltaY*unit,clientX:e.clientX,clientY:e.clientY,ctrlKey:e.ctrlKey,metaKey:e.metaKey},'*');
},{passive:false});
<\/script></body></html>`;
    return frame;
  }
  root.addEventListener?.("message", (event) => {
    const data = event.data;
    if (
      !["broadsheet-guardian-height", "broadsheet-guardian-wheel"].includes(
        data?.type,
      )
    )
      return;
    for (const frame of document.querySelectorAll("iframe.guardian-article"))
      if (
        event.source === frame.contentWindow &&
        data.id === frame.dataset.readerFrame
      ) {
        if (data.type === "broadsheet-guardian-height") {
          if (!Number.isFinite(data.height)) return;
          frame.style.height =
            Math.ceil(Math.max(200, Math.min(40000, data.height))) + "px";
        } else {
          if (
            ![data.deltaX, data.deltaY, data.clientX, data.clientY].every(
              Number.isFinite,
            )
          ) return;
          const rect = frame.getBoundingClientRect();
          // The canvas scales the frame. Restore the pointer's page position
          // so pinch-to-zoom stays anchored under the cursor at every zoom.
          frame.dispatchEvent(new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaX: data.deltaX,
            deltaY: data.deltaY,
            clientX: rect.left + data.clientX * rect.width / frame.clientWidth,
            clientY: rect.top + data.clientY * rect.height / frame.clientHeight,
            ctrlKey: data.ctrlKey === true,
            metaKey: data.metaKey === true,
          }));
        }
        break;
      }
  });
  function render(node, record) {
    node.replaceChildren();
    node.dataset.readerState = record.status;
    node.setAttribute("aria-busy", String(record.status === "loading"));
    if (record.status === "loading") {
      node.append(
        el("p", "article-reader-status", "Opening the article…"),
        el("div", "article-reader-skeleton"),
      );
      return;
    }
    if (record.status === "ready") {
      node.append(
        el(
          "p",
          "article-reader-byline",
          [
            record.author || node.dataset.author,
            record.publisher,
            Math.max(1, Math.ceil(record.wordCount / 220)) + " min read",
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      );
      if (record.format === "guardian") {
        if (record.title && record.title !== node.dataset.headline)
          node.append(el("h2", "article-current-title", record.title));
        const attribution = el("a", "guardian-attribution");
        attribution.href = "https://www.theguardian.com/";
        attribution.target = "_blank";
        attribution.rel = "noopener noreferrer";
        const logo = el("img");
        logo.src = "vendor/guardian-powered-by.png";
        logo.alt = "Powered by The Guardian";
        attribution.append(logo);
        node.append(attribution, guardianFrame(record));
        return;
      }
      if (record.license) {
        const attribution = el("p", "article-reader-byline");
        const original = el("a", "", "Originally published at " + record.publisher),
          license = el("a", "", record.license.name);
        for (const [link, href] of [[original, record.url], [license, record.license.url]]) {
          link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer";
        }
        attribution.append(original, " · ", license);
        node.append(attribution, el("p", "small", record.presentation));
      }
      if (record.kind === "liveblog") {
        node.append(el("p", "article-reader-byline", "Latest published updates · loaded " + new Date(record.retrievedAt || record.time || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })));
        const refresh = el("button", "article-reader-retry", "↻ Refresh updates");
        refresh.type = "button";
        refresh.onclick = () => void load(node.dataset.readerUrl, true);
        node.append(refresh);
      }
      for (const media of record.media || []) {
        const video = el("iframe", "article-video");
        video.src = media.src;
        video.title = media.title;
        video.loading = "lazy";
        video.referrerPolicy = "strict-origin-when-cross-origin";
        video.setAttribute("allow", "fullscreen; picture-in-picture; encrypted-media");
        video.setAttribute("allowfullscreen", "");
        node.append(video);
      }
      const prose = el("div", "article-prose");
      for (const b of record.blocks)
        prose.append(
          el(
            b.type === "heading" ? "h3" : "p",
            b.type === "list-item" ? "article-list-item" : "",
            b.type === "list-item" ? "• " + b.text : b.text,
          ),
        );
      node.append(
        prose,
        el("p", "article-reader-end", "◆ " + record.publisher),
      );
      if (record.links?.length) {
        const references = el("details", "article-references"), list = el("ul");
        references.append(el("summary", "small", "Links from the original article"));
        for (const reference of record.links) {
          const item = el("li"), link = el("a", "", reference.text);
          link.href = reference.url; link.target = "_blank"; link.rel = "noopener noreferrer";
          item.append(link); list.append(item);
        }
        references.append(list); node.append(references);
      }
      if (record.copyright) node.append(el("p", "small", record.copyright));
      return;
    }
    node.append(el("p", "article-reader-status", record.message));
    const excerpt = node.dataset.excerpt;
    if (excerpt) node.append(el("p", "article-reader-excerpt", excerpt));
    if (record.retryable !== false) {
      const retry = el("button", "article-reader-retry", "↻ Try loading again");
      retry.type = "button";
      retry.onclick = () => void load(node.dataset.readerUrl, true);
      node.append(retry);
    } else {
      const source = el("a", "article-reader-retry", "Read at " + record.publisher + " ↗");
      source.href = node.dataset.readerUrl;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      node.append(source);
    }
  }
  function notify(url) {
    const r = records.get(url);
    for (const node of document.querySelectorAll(".article-reader"))
      if (node.dataset.readerUrl === url) render(node, r);
  }
  async function load(url, force = false) {
    const old = records.get(url);
    if (
      old &&
      (old.status === "loading" ||
        !force && Date.now() - old.time < (old.status === "ready" ? old.kind === "liveblog" ? 60000 : 900000 : 30000))
    )
      return old;
    const record = { status: "loading", time: Date.now() };
    records.delete(url);
    records.set(url, record);
    notify(url);
    for (const [key, value] of records) {
      if (records.size <= MAX_RECORDS) break;
      if (value.status !== "loading") records.delete(key);
    }
    let acquired = false;
    try {
      const api = root.BROADSHEET_CONFIG?.apiBase;
      if (root.BROADSHEET_OFFLINE || !safe(api))
        throw Error("Connect to Broadsheet online to load this article.");
      const target = new URL("api/article", api);
      target.searchParams.set("url", url);
      await acquire();
      acquired = true;
      const response = await fetch(target.href, {
        credentials: "omit",
        signal: AbortSignal.timeout(22000),
      });
      if (!response.ok)
        throw Error(
          response.status === 429
            ? "Please wait a moment, then try opening the article again."
            : "The article could not be loaded. Try again or open it at the publisher.",
        );
      const data = validate(await response.json());
      Object.assign(record, data, { time: Date.now() });
    } catch (error) {
      Object.assign(record, {
        status: "unavailable",
        time: Date.now(),
        message: error.message,
      });
    }
    if (acquired) release();
    if (records.get(url) === record) notify(url);
    for (const [key, value] of records) {
      if (records.size <= MAX_RECORDS) break;
      if (value.status !== "loading") records.delete(key);
    }
    return record;
  }
  function mount(story) {
    const node = el("section", "article-reader");
    node.setAttribute("aria-label", "Article text");
    const url = safe(story.url);
    node.dataset.readerUrl = url;
    node.dataset.excerpt = story.excerpt || "";
    node.dataset.author = story.author || "";
    node.dataset.headline = story.title || "";
    const record = records.get(url);
    render(node, record || { status: "loading" });
    // Mounting is synchronous; promise completion updates the existing prose node
    // so loading never replaces the card or resets its reading position.
    void load(url).then((record) => {
      if (
        node.isConnected &&
        node.dataset.readerState === "loading" &&
        record.status !== "loading"
      )
        render(node, record);
    });
    return node;
  }
  const api = { mount, validate, load };
  root.BroadsheetArticleReader = api;
  if (typeof module !== "undefined") module.exports = { ...api, guardianFrame };
})(typeof window !== "undefined" ? window : globalThis);
