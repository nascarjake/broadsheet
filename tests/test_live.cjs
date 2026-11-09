const assert = require("node:assert/strict");
const live = require("../dist/live.js");
const calls = [];
let respond;
global.fetch = async (input, options) => {
  const url = new URL(input);
  calls.push({ url, options });
  return { ok: true, json: async () => respond(url) };
};
const meal = (n) => ({
  idMeal: String(n),
  strMeal: "Dish " + n,
  strMealThumb: "https://www.themealdb.com/dish.jpg",
});
(async () => {
  // A large category is traversed completely, without the old 40/50 cap.
  respond = () => ({
    meals: Array.from({ length: 84 }, (_, n) => meal(n + 1)),
  });
  let cursor = null,
    found = [];
  do {
    const data = await live.recipes({ category: "Seafood", cursor });
    found.push(...data.items);
    cursor = data.next;
    assert.equal(data.total, 84);
  } while (cursor);
  assert.equal(found.length, 84);
  assert.equal(new Set(found.map((i) => i.id)).size, 84);
  assert.equal(calls.length, 1); // cache the provider response, page locally
  assert.ok(found[0].needsDetails);
  live.clearCache();
  calls.length = 0;
  respond = (u) =>
    u.pathname.endsWith("search.php")
      ? { meals: [{ ...meal(1), strInstructions: "Cook.\nServe." }] }
      : { meals: [meal(1), meal(2)] };
  const search = await live.recipes({ query: "chicken & rice" });
  assert.deepEqual(
    search.items.map((i) => i.id),
    ["recipe-1", "recipe-2"],
  );
  assert.equal(calls[0].url.searchParams.get("s"), "chicken & rice");
  assert.equal(calls[1].url.searchParams.get("i"), "chicken_&_rice");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(search.items[0].needsDetails, false);
  assert.equal(search.items[1].needsDetails, true);
  const count = calls.length;
  await assert.rejects(live.recipeDetails({ id: "recipe-https://elsewhere" }));
  assert.equal(calls.length, count);
  live.clearCache();
  calls.length = 0;
  respond = (u) => ({
    meals: u.searchParams.get("f") === "a" ? [] : [meal(30), meal(31)],
  });
  const alphabetical = await live.recipes();
  assert.equal(calls[0].url.searchParams.get("f"), "a");
  assert.equal(calls[1].url.searchParams.get("f"), "b");
  assert.equal(alphabetical.items.length, 2);
  assert.deepEqual(alphabetical.next, { letter: 2, offset: 0 });
  live.clearCache();
  calls.length = 0;
  respond = () => ({
    query: {
      pages: {
        a: {
          pageid: 1,
          index: 2,
          title: "Second film",
          extract: "Film description",
          thumbnail: { source: "https://upload.wikimedia.org/poster.jpg" },
          pageimage: "Second poster.jpg",
        },
        b: {
          pageid: 2,
          index: 1,
          title: "First film",
          fullurl: "https://en.wikipedia.org/wiki/First_film",
        },
      },
    },
    continue: { gsroffset: 48 },
  });
  const films = await live.movies({
    query: "space",
    genre: "Science fiction",
    cursor: { offset: 24 },
  });
  assert.equal(calls[0].url.searchParams.get("gsroffset"), "24");
  assert.equal(calls[0].url.searchParams.get("origin"), "*");
  assert.match(
    calls[0].url.searchParams.get("gsrsearch"),
    /hastemplate:Infobox_film/,
  );
  assert.equal(films.items[0].title, "First film");
  assert.deepEqual(films.next, { offset: 48 });
  assert.match(films.items[1].imageSourceUrl, /File:Second%20poster.jpg/);
  assert.equal(films.items[0].source, "Wikipedia");
  assert.match(films.items[0].textLicense, /CC BY-SA/);
  assert.ok(!("year" in films.items[0])); // do not infer film facts from an article
  assert.equal(live.safeURL("javascript:alert(1)"), "");
  const embed = new URL(
    live.streetViewURL("public-test-key", { lat: 41, lon: -87 }),
  );
  assert.equal(embed.pathname, "/maps/embed/v1/streetview");
  assert.equal(embed.searchParams.get("location"), "41,-87");
  assert.equal(live.streetViewURL("key", { lat: 100, lon: 0 }), "");
  assert.equal(
    calls[0].url.searchParams.get("gsrlimit"),
    "20",
    "Stay within the extract limit so the search continuation is returned",
  );
  console.log(
    "Live catalog pagination, deduplication, ingredient search, hydration, request boundaries, and film attribution passed",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
