const assert = require("node:assert/strict");
const M = require("../dist/memes.js");
const S = require("../dist/spaces.js");
const lemmy = M.sources[0], mastodon = M.sources[1];
const post = (n, overrides = {}) => ({
  post: { id: n, name: "Funny &amp; relatable", url: `https://media.example/meme${n}.jpg`, url_content_type: "image/jpeg", ap_id: `https://lemmy.world/post/${n}`, published: "2026-11-10T12:00:00Z", ...overrides },
  creator: { name: "creator", actor_id: "https://lemmy.world/u/creator" },
  community: { title: "Memes" },
});
const status = (n, overrides = {}) => ({
  id: String(n), url: `https://mastodon.social/@maker/${n}`, visibility: "public", content: "<p>Funny &amp; good</p>",
  created_at: "2026-11-11T12:00:00Z", account: { acct: "maker", url: "https://mastodon.social/@maker" },
  media_attachments: [{ type: "video", url: `https://media.example/clip${n}.mp4`, preview_url: "https://media.example/poster.jpg", description: "A funny clip", meta: { original: { duration: 12 } } }], ...overrides,
});
(async () => {
  for (const url of ["javascript:alert(1)", "data:image/png;base64,xxx", "http://media.example/a.jpg", "https://127.0.0.1/a", "https://localhost/a", "https://example.local/a", "https://user:secret@example.com/a"])
    assert.equal(M.mediaURL(url), "");
  assert.equal(M.plain("<p>Hello &amp; &#x1F600;</p>"), "Hello & 😀");
  const normalized = M.lemmyItems({ posts: [post(1), post(2, { nsfw: true }), post(3, { removed: true }), post(4, { deleted: true }), post(5, { url: "https://example.com/article", url_content_type: "text/html" }), post(6, { featured_community: true }), post(7, { url: "https://media.example/reaction.gif", url_content_type: "image/gif" })] }, lemmy);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].title, "Funny & relatable");
  assert.equal(normalized[0].author, "creator");
  assert.equal(normalized[1].category, "GIFs");
  const videos = M.mastodonItems([status(1), status(2, { sensitive: true }), status(3, { spoiler_text: "CW" }), status(4, { visibility: "private" }), status(5, { reblog: {} }), status(6, { media_attachments: [{ type: "gifv", url: "https://media.example/reaction.mp4" }, { type: "image", url: "https://media.example/picture.png" }] })], mastodon);
  assert.equal(videos.length, 2);
  assert.equal(videos[0].category, "Videos");
  assert.equal(videos[0].media[0].duration, 12);
  assert.equal(videos[1].media.length, 2);
  assert.ok(videos[1].tags.includes("Pictures"));
  assert.equal(M.dedupe([...normalized, ...normalized]).length, 2);
  assert.equal(S.filter(videos, { filter: "Videos", query: "maker" }).length, 1);
  assert.notEqual(S.storageKey("memes"), S.storageKey("movies"));

  const calls = [];
  let mode = "okay";
  global.fetch = async (input, options) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (mode === "fail" || (mode === "partial" && url.host === "programming.dev")) throw Error("offline");
    if (mode === "empty") return { ok: true, json: async () => url.pathname.includes("/post/list") ? { posts: [] } : [] };
    return { ok: true, json: async () => url.pathname.includes("/post/list") ? { posts: [post(Number(url.searchParams.get("page")) || 1)] } : [status(url.searchParams.get("max_id") ? 90 : 100)] };
  };
  const first = await M.catalog();
  assert.equal(calls.length, 6);
  assert.equal(first.items.length, 2, "Repeated media across federated feeds is collapsed");
  assert.deepEqual(first.items.map(i => i.category), ["Pictures", "Videos"]);
  assert.deepEqual(first.next[lemmy.id], { page: 2 });
  assert.deepEqual(first.next[mastodon.id], { maxId: "100" });
  assert.ok(calls.every(c => c.options.credentials === "omit"));
  await M.catalog();
  assert.equal(calls.length, 6, "Repeated reads use the cache");
  const second = await M.catalog({ cursor: first.next });
  assert.notEqual(second.items[0].id, first.items[0].id);
  assert.equal(calls.find(c => c.url.searchParams.has("max_id")).url.searchParams.get("max_id"), "100");
  M.clearCache(); calls.length = 0;
  const clips = await M.catalog({ source: mastodon.id, category: "Videos", query: "maker", order: "newest" });
  assert.equal(clips.items.length, 1);
  assert.equal(calls.length, 1);
  const newest = await M.catalog({ source: lemmy.id, order: "newest" });
  assert.equal(calls.at(-1).url.searchParams.get("sort"), "New");
  assert.equal(newest.items.length, 1);
  await assert.rejects(M.catalog({ source: "https://attacker.example" }), /Choose/);

  M.clearCache(); mode = "partial";
  const partial = await M.catalog();
  assert.ok(partial.items.length);
  assert.match(partial.note, /Unavailable: Programmer humor/);
  assert.deepEqual(partial.next["programmer-humor"], {}, "A failed feed remains retryable");
  M.clearCache(); mode = "fail";
  await assert.rejects(M.catalog(), /loaded and saved memes are still available/);
  M.clearCache(); mode = "empty";
  const empty = await M.catalog();
  assert.deepEqual(empty.items, []);
  assert.equal(empty.next, null, "Exhausted sources stop pagination");
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(M.catalog({ signal: aborted.signal }), { name: "AbortError" });
  console.log("Meme normalization, media safety, attribution, filtering, deduplication, caching, pagination, partial failure, and cancellation passed");
})().catch(e => { console.error(e); process.exitCode = 1; });
