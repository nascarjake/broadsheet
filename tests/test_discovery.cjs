const assert = require("node:assert/strict");
(async () => {
  const { movieRequest, movieResponse, movieCatalog, movieDetails } =
    await import("../api/movies.mjs");
  const request = movieRequest(
    new URL(
      "https://app/api/movies?mode=streaming&region=GB&provider=8&availability=flatrate&genre=Drama&year=2014&cast=6193&company=174&keyword=9882",
    ),
  );
  const p = new URL(request.providerURL).searchParams;
  assert.equal(
    p.has("region"),
    false,
    "Streaming uses watch_region, not an unrelated theatrical-release country filter",
  );
  for (const [key, value] of Object.entries({
    watch_region: "GB",
    with_watch_providers: "8",
    with_watch_monetization_types: "flatrate",
    with_genres: "18",
    primary_release_year: "2014",
    with_cast: "6193",
    with_companies: "174",
    with_keywords: "9882",
  }))
    assert.equal(p.get(key), value);
  const theatrical = new URL(
    movieRequest(new URL("https://app/api/movies?mode=now-playing&genre=Drama"))
      .providerURL,
  );
  assert.equal(theatrical.searchParams.get("with_release_type"), "2|3");
  assert.ok(theatrical.searchParams.get("release_date.gte"));
  assert.equal(
    new URL(
      movieRequest(new URL("https://app/api/movies?mode=now-playing"))
        .providerURL,
    ).pathname,
    "/3/movie/now_playing",
  );
  for (const query of [
    "cast=https://bad",
    "provider=-1",
    "region=USA",
    "year=1000",
    "availability=illegal",
    "genre=madeup",
  ])
    assert.throws(() =>
      movieRequest(new URL("https://app/api/movies?" + query)),
    );
  const get = async (path) =>
    path.startsWith("search/movie")
      ? {
          page: 1,
          total_pages: 5,
          total_results: 93,
          results: [
            { id: 1, title: "Title A", genre_ids: [18] },
            { id: 2, title: "Title B", genre_ids: [18] },
          ],
        }
      : {
          credits: { cast: [{ id: path.startsWith("movie/1?") ? 99 : 55 }] },
          production_companies: [{ id: 7 }],
          keywords: { keywords: [{ id: 8 }] },
          "watch/providers": {
            results: { US: { flatrate: [{ provider_id: 9 }] } },
          },
        };
  const filtered = await movieCatalog(
    movieRequest(
      new URL(
        "https://app/api/movies?mode=search&q=Title&cast=99&company=7&keyword=8&provider=9&availability=flatrate",
      ),
    ),
    get,
  );
  assert.deepEqual(
    filtered.items.map((f) => f.id),
    ["tmdb-1"],
  );
  assert.deepEqual(filtered.next, { page: 2 });
  assert.equal(
    filtered.total,
    null,
    "Do not present the unfiltered title count as the number satisfying advanced filters",
  );
  const detail = await movieDetails(
    new URL("https://app/api/movie-details?id=42&region=GB"),
    async () => ({
      id: 42,
      title: "Test",
      runtime: 100,
      genres: [{ id: 18 }],
      credits: {
        cast: [{ id: 99, name: "Actor" }],
        crew: [{ job: "Director", name: "Director" }],
      },
      videos: {
        results: [
          {
            site: "YouTube",
            type: "Trailer",
            official: false,
            key: "abcdef12345",
            name: "Unofficial",
          },
          {
            site: "YouTube",
            type: "Trailer",
            official: true,
            key: "abcDEF12345",
            name: "Official",
          },
          {
            site: "YouTube",
            type: "Trailer",
            official: true,
            key: "javascript:bad",
          },
        ],
      },
      "watch/providers": {
        results: {
          US: { flatrate: [{ provider_id: 8, provider_name: "US only" }] },
          GB: {
            link: "https://elsewhere.invalid",
            rent: [
              {
                provider_id: 9,
                provider_name: "GB rental",
                logo_path: "/logo.jpg",
              },
            ],
          },
        },
      },
    }),
  );
  assert.equal(detail.trailer.name, "Official");
  assert.equal(detail.watch.groups.flatrate.length, 0);
  assert.equal(detail.watch.groups.rent[0].name, "GB rental");
  assert.match(detail.watch.url, /themoviedb.org/);
  assert.equal(detail.director, "Director");
  assert.equal(
    movieResponse(
      { total_results: 100000, total_pages: 5000, results: [] },
      movieRequest(new URL("https://app/api/movies?page=499")),
    ).total,
    100000,
  );
  const live = require("../dist/live.js");
  live.clearCache();
  let calls = 0;
  const recipe = (id, category) => ({
    idMeal: String(id),
    strMeal: "Dish " + id,
    strCategory: category,
    strMealThumb: "https://www.themealdb.com/photo.jpg",
  });
  global.fetch = async (input) => ({
    ok: true,
    json: async () => {
      calls++;
      const u = new URL(input);
      if (u.searchParams.has("a")) return { meals: [recipe(1), recipe(2)] };
      return {
        meals:
          u.searchParams.get("c") === "Pasta"
            ? [recipe(1, "Pasta"), recipe(3, "Pasta")]
            : [],
      };
    },
  });
  const meals = await live.recipes({
    cuisine: "Italian",
    category: "Pasta",
    meal: "Dinner",
  });
  assert.deepEqual(
    meals.items.map((m) => m.id),
    ["recipe-1"],
  );
  assert.equal(meals.items[0].cuisine, "Italian");
  assert.equal(meals.total, 1);
  assert.match(meals.note, /editorial/);
  live.clearCache();
  let cookbookQuery;
  global.fetch = async (input) => {
    cookbookQuery = new URL(input).searchParams;
    return {
      ok: true,
      json: async () => ({
        query: {
          searchinfo: { totalhits: 3802 },
          pages: {
            3: {
              pageid: 3,
              index: 1,
              title: "Cookbook:Whole Wheat Pancakes",
              fullurl:
                "https://en.wikibooks.org/wiki/Cookbook:Whole_Wheat_Pancakes",
              thumbnail: { source: "https://upload.wikimedia.org/pancake.jpg" },
              pageimage: "Pancakes.jpg",
            },
          },
        },
        continue: { gsroffset: 20 },
      }),
    };
  };
  const cookbook = await live.recipes({
    source: "cookbook",
    query: "pancakes",
    cuisine: "American recipes",
    meal: "Breakfast recipes",
  });
  assert.equal(cookbook.items[0].title, "Whole Wheat Pancakes");
  assert.equal(cookbook.total, 3802);
  assert.deepEqual(cookbook.next, { offset: 20 });
  assert.match(cookbookQuery.get("gsrsearch"), /deepcat:"American recipes"/);
  assert.equal(cookbookQuery.get("gsrnamespace"), "102");
  assert.match(cookbook.items[0].textLicense, /CC BY-SA/);
  assert.match(cookbook.items[0].imageSourceUrl, /File:/);
  live.clearCache();
  calls = 0;
  const storage = new Map();
  global.localStorage = {
    getItem: (k) => storage.get(k),
    setItem: (k, v) => storage.set(k, v),
  };
  global.fetch = async (input) => ({
    ok: true,
    json: async () => {
      calls++;
      const u = new URL(input);
      if (u.hostname === "api.openstreetmap.org")
        return {
          elements: [{ id: 123, type: "node", tags: { wikidata: "Q1" } }],
        };
      if (u.hostname === "www.wikidata.org")
        return {
          entities: {
            Q1: {
              claims: {
                P18: [{ mainsnak: { datavalue: { value: "Venue.jpg" } } }],
              },
            },
          },
        };
      return {
        query: {
          pages: {
            1: {
              title: "File:Venue.jpg",
              imageinfo: [
                {
                  thumburl: "https://thumb.wikimedia.org/photo.jpg",
                  descriptionurl:
                    "https://commons.wikimedia.org/wiki/File:Venue.jpg",
                  extmetadata: {
                    Artist: { value: "<a>Photographer</a>" },
                    LicenseShortName: { value: "CC BY-SA 4.0" },
                  },
                },
              ],
            },
          },
        },
      };
    },
  });
  const venue = { id: "osm-node-123" };
  const photos = await live.venuePhotos([venue]);
  assert.equal(photos[venue.id].credit, "Photographer");
  assert.equal(photos[venue.id].license, "CC BY-SA 4.0");
  assert.equal(calls, 3);
  await live.venuePhotos([venue]);
  assert.equal(
    calls,
    3,
    "Repeating cards reuse cached photo metadata without another venue query",
  );
  delete global.localStorage;
  console.log(
    "Regional movie discovery, cross-page title filtering, trailer safety, watch-country isolation, recipe facet intersections, and venue-photo caching passed",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
