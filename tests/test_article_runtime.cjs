// Optional native HTMLRewriter checks: provide MINIFLARE_PATH and a Wrangler
// --dry-run bundle via BROADSHEET_WORKER_BUNDLE. No network content is needed.
const assert = require("node:assert/strict");
const { Miniflare, Response, convertV4MiniflareOptions } = require(
  process.env.MINIFLARE_PATH || "miniflare",
);
(async () => {
  const paragraphs = Array.from(
    { length: 8 },
    (_, n) =>
      `<p>Report paragraph ${n}: public sample reporting with enough original fixture prose for a complete article extraction check.</p>`,
  ).join("");
  let html = `<html><head><script type="application/ld+json">{"@type":"NewsArticle","author":{"name":"Test Reporter"},"isAccessibleForFree":true}</script></head><body><nav><p>Navigation should never enter the article.</p></nav><article><div class="entry-content">${paragraphs}<ul><li>One bullet <strong>with emphasis</strong></li><li><p>A nested bullet paragraph appears once.</p></li></ul><aside><p>Unrelated newsletter invitation.</p></aside><p>Final paragraph beyond the feed excerpt, with a <script>window.BAD=1;</script>safe ending.</p></div></article></body></html>`;
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: require("node:fs").readFileSync(
        process.env.BROADSHEET_WORKER_BUNDLE,
        "utf8",
      ),
      compatibilityDate: "2026-11-08",
      outboundService: async () =>
        new Response(html, { headers: { "Content-Type": "text/html" } }),
    }),
  );
  const request = (url = "https://www.nasa.gov/news/test-story/") =>
    mf.dispatchFetch(
      "https://reader.test/api/article?url=" +
        encodeURIComponent(url),
    );
  try {
    let response = await request(),
      data = await response.json();
    assert.equal(data.status, "ready");
    assert.equal(data.author, "Test Reporter");
    assert.equal(data.blocks.length, 11);
    const text = data.blocks.map((b) => b.text).join("\n");
    assert.ok(text.includes("safe ending"));
    assert.ok(
      !text.includes("window.BAD") &&
        !text.includes("newsletter") &&
        !text.includes("Navigation"),
    );
    assert.equal(text.split("A nested bullet paragraph").length - 1, 1);
    html = html.replace(
      '"isAccessibleForFree":true',
      '"isAccessibleForFree":false',
    );
    data = await (await request()).json();
    assert.equal(data.reason, "restricted");
    assert.equal(data.blocks.length, 0);
    html =
      '<meta name="robots" content="nosnippet"><article><div class="entry-content">' +
      paragraphs +
      "</div></article>";
    data = await (await request()).json();
    assert.equal(data.reason, "restricted");
    html = "<nav>" + paragraphs + "</nav>";
    data = await (await request()).json();
    assert.equal(data.status, "unavailable");
    html = `<script type="application/ld+json">${JSON.stringify({ "@type": "VideoObject", name: "A public video report", description: "The publisher's short video description.", embedUrl: "https://players.brightcove.net/665003303001/6tKQRAx7lu_default/index.html?videoId=6408121386112" })}</script><main><div class="wysiwyg"></div></main>`;
    data = await (await request("https://www.aljazeera.com/video/newsfeed/2026/11/9/example")).json();
    assert.equal(data.status, "ready", "Video reports do not require a long text article");
    assert.equal(data.kind, "video");
    assert.equal(data.media.length, 1);
    assert.equal(data.blocks[0].text, "The publisher's short video description.");
    html = `<main><amp-live-list id="live-blog-updates"><div><h2>Latest update headline</h2><div class="wysiwyg">${paragraphs}</div></div></amp-live-list></main>`;
    data = await (await request("https://www.aljazeera.com/amp/news/liveblog/2026/11/9/example")).json();
    assert.equal(data.status, "ready");
    assert.equal(data.kind, "liveblog");
    assert.equal(data.blocks[0].text, "Latest update headline");
    assert.equal(data.blocks.length, 9, "Alternate selectors never duplicate update text");
    html = `<meta name="author" content="EFF Reporter"><article class="node--full"><div class="field--name-body">${paragraphs}<p>Final EFF paragraph with a <a href="/document/reference">source reference</a>.</p><figure><p>Unlicensed photo caption</p></figure></div></article><article class="node--teaser"><div class="field--name-body"><p>Unrelated teaser must not appear.</p></div></article>`;
    data = await (await request("https://www.eff.org/deeplinks/2026/11/runtime-eff")).json();
    assert.equal(data.status, "ready");
    assert.equal(data.author, "EFF Reporter");
    assert.equal(data.license.name, "CC BY 4.0");
    assert.equal(data.blocks.length, 9);
    assert.equal(data.links[0].url, "https://www.eff.org/document/reference");
    assert.ok(data.blocks.at(-1).text.includes("Final EFF paragraph"));
    html = `<div class="post-header"><div class="contributor-name"><span>Written by</span><a>Original Writer</a></div><div class="contributor-name"><span>Translated by</span><a>Translator</a></div></div><div class="full-article"><div class="entry">${paragraphs}<p>Global Voices final paragraph.</p><div class="wp-caption"><p>Third-party media caption.</p></div></div></div>`;
    data = await (await request("https://globalvoices.org/2026/11/11/runtime-gv/")).json();
    assert.equal(data.status, "ready");
    assert.equal(data.license.name, "CC BY 3.0");
    assert.equal(data.author, "Written by Original Writer · Translated by Translator");
    assert.equal(data.blocks.at(-1).text, "Global Voices final paragraph.");
    html = html.replace("Global Voices final paragraph.", "Reprinted with permission. All rights reserved.");
    data = await (await request("https://globalvoices.org/2026/11/11/runtime-restricted/")).json();
    assert.equal(data.reason, "rights");
    assert.equal(data.retryable, false);
    html = html.replace("Reprinted with permission. All rights reserved.", "This story was originally published by Example Partner and shared by Global Voices.");
    data = await (await request("https://globalvoices.org/2026/11/11/runtime-partner/")).json();
    assert.equal(data.reason, "rights", "Partner text requires separate permission even if it mentions Global Voices");
    html = html.replace("This story was originally published by Example Partner and shared by Global Voices.", "Originally published on Global Voices in French.");
    data = await (await request("https://globalvoices.org/2026/11/11/runtime-translation/")).json();
    assert.equal(data.status, "ready", "Global Voices translations retain original/translator credit");
    console.log(
      "Native Worker article extraction: full prose through the final paragraph, nested lists, bylines, navigation/script exclusion, restricted articles and unavailable pages passed",
    );
  } finally {
    await mf.dispose();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
