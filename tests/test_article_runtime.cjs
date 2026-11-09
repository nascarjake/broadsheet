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
  const request = () =>
    mf.dispatchFetch(
      "https://reader.test/api/article?url=" +
        encodeURIComponent("https://www.nasa.gov/news/test-story/"),
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
