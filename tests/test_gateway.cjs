const assert = require("node:assert/strict");
(async () => {
  const {
    default: worker,
    movieRequest,
    movieResponse,
  } = await import("../api/worker.mjs");
  const cached = new Map();
  global.caches = {
    default: {
      match: async (req) => cached.get(req.url)?.clone(),
      put: async (req, res) => cached.set(req.url, res),
    },
  };
  let calls = 0,
    header;
  global.fetch = async (url, options) => {
    calls++;
    header = options.headers.Authorization;
    return new Response(
      JSON.stringify({
        total_pages: 3,
        results: [
          {
            id: 42,
            title: "Space Movie",
            overview: "A test",
            poster_path: "/poster.jpg",
            genre_ids: [878],
            release_date: "2026-01-01",
          },
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  };
  const pending = [],
    ctx = { waitUntil: (p) => pending.push(p) },
    env = {
      TMDB_READ_TOKEN: "private-test-token",
      SEARCH_LIMIT: { limit: async () => ({ success: true }) },
    };
  const req = (path, origin = "https://nascarjake.github.io") =>
    new Request("https://catalog.example/api/" + path, {
      headers: { Origin: origin, "CF-Connecting-IP": "192.0.2.1" },
    });
  let res = await worker.fetch(
    req("movies?mode=search&q=space&page=2"),
    env,
    ctx,
  );
  assert.equal(res.status, 200);
  assert.equal(
    res.headers.get("access-control-allow-origin"),
    "https://nascarjake.github.io",
  );
  const data = await res.json();
  assert.equal(data.items[0].title, "Space Movie");
  assert.deepEqual(data.next, { page: 3 });
  assert.ok(!JSON.stringify(data).includes(env.TMDB_READ_TOKEN));
  assert.equal(header, "Bearer private-test-token");
  await Promise.all(pending);
  await worker.fetch(req("movies?mode=search&q=space&page=2"), env, ctx);
  assert.equal(calls, 1);
  res = await worker.fetch(
    req("movies?mode=search&q=space", "https://elsewhere.example"),
    env,
    ctx,
  );
  assert.equal(res.status, 403);
  assert.equal(calls, 1);
  res = await worker.fetch(req("movies?page=501"), env, ctx);
  assert.equal(res.status, 400);
  assert.equal(calls, 1);
  res = await worker.fetch(req("capabilities"), env, ctx);
  assert.deepEqual(await res.json(), { movies: true, nowPlaying: true });
  res = await worker.fetch(
    req("movies"),
    { ...env, SEARCH_LIMIT: { limit: async () => ({ success: false }) } },
    ctx,
  );
  assert.equal(res.status, 429);
  assert.match(
    movieRequest(new URL("https://app/api/movies?mode=popular&genre=Drama"))
      .providerURL,
    /discover\/movie/,
  );
  assert.throws(() =>
    movieRequest(new URL("https://app/api/movies?mode=search")),
  );
  // Local now-playing title filters must not contaminate the cache for another title.
  await worker.fetch(req("movies?mode=now-playing&q=space"), env, ctx);
  await Promise.all(pending);
  res = await worker.fetch(req("movies?mode=now-playing&q=other"), env, ctx);
  assert.deepEqual((await res.json()).items, []);
  assert.equal(calls, 3);
  assert.equal(
    movieResponse(
      { results: [{ id: 3, title: "adult", adult: true }], total_pages: 700 },
      movieRequest(new URL("https://app/api/movies?page=500")),
    ).next,
    null,
  );
  console.log(
    "Movie gateway origin restrictions, validation, pagination, private token isolation, rate limits, and cache separation passed",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
