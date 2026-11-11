const assert = require("node:assert/strict");
(async () => {
  const {
    articleRequest,
    articleMetadata,
    readArticle,
    boundedHTML,
    restrictedPreview,
    articleVideo,
  } = await import("../api/articles.mjs");
  for (const url of [
    "https://127.0.0.1/a",
    "https://www.theguardian.com.evil.org/a",
    "http://www.theguardian.com/world/article",
    "https://user:secret@www.bbc.com/news/a",
    "https://www.bbc.com:8443/news/a",
    "https://www.bbc.com/login",
    "file:///etc/passwd",
    "https://www.bbc.com/news/a",
    "https://globalvoices.org/wp-json/wp/v2/users/1",
    "https://www.eff.org/document/not-a-news-article",
    "https://globalvoices.org/2026/11/11/a/private/",
  ])
    assert.throws(() => articleRequest(url));
  const request = articleRequest(
    "https://www.theguardian.com/world/2026/nov/08/story?utm_source=rss#comments",
  );
  assert.equal(
    request.url.href,
    "https://www.theguardian.com/world/2026/nov/08/story",
  );
  const metadata = articleMetadata([
    {
      "@graph": [
        {
          "@type": "NewsArticle",
          author: [{ name: "Example Reporter" }],
          datePublished: "2026-11-09",
          isAccessibleForFree: false,
        },
      ],
    },
  ]);
  assert.equal(metadata.author, "Example Reporter");
  assert.equal(metadata.restricted, true);
  assert.equal(restrictedPreview("index, max-snippet:-1"), false);
  assert.equal(restrictedPreview("max-snippet:0"), true);
  assert.equal(restrictedPreview("nosnippet"), true);
  const ajPlayer = "https://players.brightcove.net/665003303001/6tKQRAx7lu_default/index.html?videoId=6408121386112";
  assert.equal(articleVideo(ajPlayer + "&autoplay=true"), ajPlayer);
  for (const bad of [ajPlayer.replace("665003303001", "123456789"), ajPlayer.replace("https:", "http:"), ajPlayer.replace("players.brightcove.net", "players.brightcove.net.evil.test"), ajPlayer.replace("6408121386112", "javascript:alert(1)")])
    assert.equal(articleVideo(bad), "");
  const query = new URL(
    "https://reader.test/api/article?url=" +
      encodeURIComponent("https://www.nasa.gov/news/test-article/"),
  );
  let calls = 0,
    extractions = 0;
  const extract = async (html, url, publisher) => {
    extractions++;
    assert.equal(html, "<article>Public reporting.</article>");
    assert.equal(publisher.id, "nasa");
    return {
      status: "ready",
      url: url.href,
      blocks: [{ type: "paragraph", text: "Public reporting." }],
    };
  };
  let data = await readArticle(query, {
    extract,
    get: async (url, options) => {
      calls++;
      assert.equal(options.redirect, "manual");
      assert.equal(options.credentials, "omit");
      assert.ok(!options.headers.Cookie && !options.headers.Authorization);
      return new Response("<article>Public reporting.</article>", {
        headers: { "Content-Type": "text/html" },
      });
    },
  });
  assert.equal(data.status, "ready");
  assert.equal(extractions, 1);
  data = await readArticle(query, {
    extract,
    get: async () => new Response("Denied", { status: 403 }),
  });
  assert.equal(data.reason, "restricted");
  assert.equal(data.retryable, false, "Publisher denials should lead to the original, not a futile retry");
  assert.equal(extractions, 1);
  data = await readArticle(query, {
    extract,
    get: async () =>
      new Response("Do not extract", {
        headers: { "Content-Type": "text/html", "X-Robots-Tag": "nosnippet" },
      }),
  });
  assert.equal(data.reason, "restricted");
  assert.equal(extractions, 1);
  await assert.rejects(
    readArticle(query, {
      extract,
      get: async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "http://169.254.169.254/latest/meta-data/" },
        }),
    }),
  );
  assert.equal(extractions, 1);
  await assert.rejects(
    readArticle(query, {
      extract,
      get: async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://www.bbc.com/news/different-story" },
        }),
    }),
  );
  await assert.rejects(
    boundedHTML(new Response("x".repeat(1800001))),
    /too large/,
  );
  const liveURL = "https://www.aljazeera.com/news/liveblog/2026/11/9/example";
  const liveQuery = new URL("https://reader.test/api/article?url=" + encodeURIComponent(liveURL));
  const liveCalls = [];
  data = await readArticle(liveQuery, {
    get: async (url) => {
      liveCalls.push(url);
      return new Response("<main>Public coverage</main>", { headers: { "Content-Type": "text/html" } });
    },
    extract: async (_html, url) => url.pathname.startsWith("/amp/")
      ? { status: "ready", kind: "liveblog", blocks: [{ type: "paragraph", text: "Latest published update" }], url: url.href }
      : { status: "unavailable", reason: "unavailable", alternate: liveURL.replace("/news/", "/amp/news/") },
  });
  assert.deepEqual(liveCalls, [liveURL, liveURL.replace("/news/", "/amp/news/")]);
  assert.equal(data.status, "ready");
  assert.equal(data.url, liveURL, "Retain the original story URL for linked alternates");
  assert.equal(data.alternate, undefined);
  let deniedCalls = 0;
  data = await readArticle(liveQuery, { get: async () => { deniedCalls++; return new Response("Denied", { status: 403 }); } });
  assert.equal(deniedCalls, 1, "Never follow alternate pages after publisher denial");
  assert.equal(data.retryable, false);
  const { guardianArticle } = await import("../api/guardian.mjs");
  const guardianURL = new URL(
      "https://www.theguardian.com/world/2026/nov/09/example",
    ),
    guardianPublisher = { name: "The Guardian" };
  assert.equal(
    (await guardianArticle(guardianURL, guardianPublisher, "")).reason,
    "setup",
  );
  const key = "private_guardian_test_key_12345",
    html =
      '<p>A full API article with a <a href="https://example.org/reference">source link</a>.</p><img alt="Publisher watermark" src="https://media.example.org/mark.png">';
  const licensed = await guardianArticle(guardianURL, guardianPublisher, key, {
    get: async (input, options) => {
      const target = new URL(input);
      assert.equal(target.origin, "https://content.guardianapis.com");
      assert.equal(target.searchParams.get("api-key"), key);
      assert.equal(options.redirect, "manual");
      return Response.json({
        response: {
          status: "ok",
          content: {
            webTitle: "A full API article",
            fields: { body: html, byline: "Reporter Name", wordcount: "90" },
          },
        },
      });
    },
  });
  assert.equal(
    licensed.html,
    html,
    "Licensed links, notices, watermark and advertising markup remain intact",
  );
  assert.ok(!JSON.stringify(licensed).includes(key));
  let redirects = 0;
  const redirected = await guardianArticle(
    guardianURL,
    guardianPublisher,
    key,
    {
      get: async (input) => {
        const target = new URL(input);
        assert.equal(target.searchParams.get("api-key"), key);
        if (redirects++ === 0)
          return new Response(null, {
            status: 302,
            headers: { Location: "/world/2026/nov/09/canonical-article" },
          });
        assert.equal(target.pathname, "/world/2026/nov/09/canonical-article");
        assert.equal(
          target.searchParams.get("show-fields"),
          "body,headline,byline,wordcount",
        );
        return Response.json({
          response: {
            status: "ok",
            content: { fields: { body: html, wordcount: "90" } },
          },
        });
      },
    },
  );
  assert.equal(redirected.status, "ready");
  assert.equal(redirects, 2);
  let rejectedCalls = 0;
  await assert.rejects(
    guardianArticle(guardianURL, guardianPublisher, key, {
      get: async () => {
        rejectedCalls++;
        return new Response(null, {
          status: 302,
          headers: { Location: "https://untrusted.example/article" },
        });
      },
    }),
    /redirect failed/,
  );
  assert.equal(
    rejectedCalls,
    1,
    "Never forward the Guardian key to another host",
  );
  let loops = 0;
  await assert.rejects(
    guardianArticle(guardianURL, guardianPublisher, key, {
      get: async () => {
        loops++;
        return new Response(null, {
          status: 302,
          headers: { Location: "/loop" },
        });
      },
    }),
    /redirect failed/,
  );
  assert.equal(loops, 4);
  const licensedQuery = new URL("https://reader.test/api/article?url=" + encodeURIComponent("https://www.eff.org/deeplinks/2026/11/example"));
  let licensedFetches = 0, saved, background;
  const licensedOptions = {
    cache: { match: async () => saved?.clone(), put: async (_key, response) => { saved = response; } },
    ctx: { waitUntil: (promise) => { background = promise; } },
    get: async () => { licensedFetches++; return new Response("Public source", { headers: { "Content-Type": "text/html" } }); },
    extract: async () => ({ status: "ready", publisher: "EFF", blocks: [{ type: "paragraph", text: "Licensed sample" }] }),
  };
  await readArticle(licensedQuery, licensedOptions);
  await background;
  assert.equal(saved.headers.get("Cache-Control"), "public, max-age=900");
  await readArticle(licensedQuery, licensedOptions);
  assert.equal(licensedFetches, 1, "Licensed articles reuse the edge cache");
  await readArticle(licensedQuery, { ...licensedOptions, cache: { match: async () => { throw Error("cache offline"); } }, ctx: null });
  assert.equal(licensedFetches, 2, "Cache failures fall back to the publisher");
  await readArticle(licensedQuery, { ...licensedOptions, cache: { match: async () => new Response("invalid cached json") }, ctx: null });
  assert.equal(licensedFetches, 3, "Invalid cached data also falls back to the publisher");
  saved = null;
  await readArticle(licensedQuery, { ...licensedOptions, extract: async () => ({ status: "unavailable" }) });
  assert.equal(saved, null, "Unavailable stories are never cached as full articles");
  const client = require("../dist/article-reader.js");
  const attributed = client.validate({ status: "ready", url: "https://globalvoices.org/2026/11/11/example/", publisher: "Global Voices", author: "Author and translator", license: { url: "https://creativecommons.org/licenses/by/3.0/" }, blocks: [{ type: "paragraph", text: "Original fixture prose" }], links: [{ url: "javascript:alert(1)", text: "bad" }, { url: "https://example.org/reference", text: "A source" }] });
  assert.equal(attributed.license.name, "CC BY 3.0");
  assert.equal(attributed.links.length, 1);
  assert.equal(client.validate({ ...attributed, url: "https://evil.test/" }).license, undefined);
  assert.throws(() =>
    client.validate({
      status: "ready",
      blocks: [{ type: "html", text: "<script>bad</script>" }],
    }),
  );
  assert.throws(() =>
    client.validate({
      status: "ready",
      blocks: [{ type: "paragraph", text: "x".repeat(20001) }],
    }),
  );
  assert.equal(
    client.validate({ status: "unavailable", message: "Subscriber article" })
      .status,
    "unavailable",
  );
  const guardianValidated = client.validate(licensed);
  assert.equal(guardianValidated.html, html);
  const video = client.validate({ status: "ready", url: "https://www.aljazeera.com/video/example", kind: "video", media: [{ src: ajPlayer, title: "A public video report" }], blocks: [] });
  assert.equal(video.media[0].src, ajPlayer);
  assert.equal(video.kind, "video");
  assert.throws(() => client.validate({ status: "ready", url: "https://evil.test/article", media: [{ src: ajPlayer }], blocks: [] }));
  assert.throws(() =>
    client.validate({ ...licensed, url: "https://evil.org/article" }),
  );
  const originalDocument = global.document;
  global.document = {
    createElement: () => ({
      dataset: {},
      setAttribute(name, value) {
        this[name] = value;
      },
    }),
  };
  global.crypto ||= require("node:crypto").webcrypto;
  const frame = client.guardianFrame(guardianValidated);
  assert.ok(frame.srcdoc.includes("</script>"));
  assert.ok(frame.srcdoc.includes(html));
  assert.ok(!frame.sandbox.includes("allow-same-origin"));
  assert.ok(frame.srcdoc.includes("script-src 'nonce-"));
  global.document = originalDocument;
  global.document = { querySelectorAll: () => [] };
  global.BROADSHEET_CONFIG = { apiBase: "https://reader.test/" };
  let loads = 0,
    finish;
  global.fetch = async (url, options) => {
    loads++;
    assert.equal(options.credentials, "omit");
    await new Promise((resolve) => (finish = resolve));
    return {
      ok: true,
      json: async () => ({
        status: "ready",
        publisher: "Example",
        blocks: [{ type: "paragraph", text: "Article body" }],
      }),
    };
  };
  const one = client.load("https://www.theguardian.com/world/example");
  await client.load("https://www.theguardian.com/world/example", true);
  assert.equal(loads, 1, "Repeated/forced opens share the in-flight request");
  finish();
  const loaded = await one;
  assert.equal(loaded.status, "ready");
  await client.load("https://www.theguardian.com/world/example");
  assert.equal(loads, 1, "Fold/unfold reuses the loaded article");
  let inProgress = 0, peak = 0;
  global.fetch = async () => {
    inProgress++; peak = Math.max(peak, inProgress);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inProgress--;
    return { ok: true, json: async () => ({ status: "ready", blocks: [{ type: "paragraph", text: "Concurrent fixture article" }] }) };
  };
  const batch = await Promise.all(Array.from({ length: 40 }, (_, n) => client.load("https://www.eff.org/deeplinks/2026/11/concurrency-" + n)));
  assert.equal(peak, 3, "Article loads have a strict three-request concurrency ceiling");
  assert.equal(batch.filter((r) => r.status === "ready").length, 15, "The waiting queue is bounded to twelve additional articles");
  assert.ok(batch.filter((r) => r.status !== "ready").every((r) => /Several articles/.test(r.message)));
  delete global.document;
  delete global.BROADSHEET_CONFIG;
  console.log(
    "Article URL boundaries, redirect isolation, public access handling, response limits, metadata, safe rendering data, and shared reader loading passed",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
