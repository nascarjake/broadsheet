const assert = require("node:assert/strict");
(async () => {
  const {
    articleRequest,
    articleMetadata,
    readArticle,
    boundedHTML,
    restrictedPreview,
  } = await import("../api/articles.mjs");
  for (const url of [
    "https://127.0.0.1/a",
    "https://www.theguardian.com.evil.org/a",
    "http://www.theguardian.com/world/article",
    "https://user:secret@www.bbc.com/news/a",
    "https://www.bbc.com:8443/news/a",
    "https://www.bbc.com/login",
    "file:///etc/passwd",
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
      assert.equal(options.redirect, "error");
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
  const client = require("../dist/article-reader.js");
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
  await client.load("https://www.theguardian.com/world/example");
  assert.equal(loads, 1, "Repeated cards share the in-flight request");
  finish();
  const loaded = await one;
  assert.equal(loaded.status, "ready");
  await client.load("https://www.theguardian.com/world/example");
  assert.equal(loads, 1, "Fold/unfold reuses the loaded article");
  delete global.document;
  delete global.BROADSHEET_CONFIG;
  console.log(
    "Article URL boundaries, redirect isolation, public access handling, response limits, metadata, safe rendering data, and shared reader loading passed",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
