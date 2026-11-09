const assert = require("node:assert/strict"),
  S = require("../dist/spaces.js");
const items = [
  {
    id: "a",
    title: "Tomato pasta",
    kind: "recipes",
    category: "Vegetarian",
    cuisine: "Italian",
    tags: ["Dinner"],
    ingredients: [{ name: "Basil" }],
  },
  {
    id: "b",
    title: "Curry",
    kind: "recipes",
    category: "Chicken",
    tags: ["Dinner"],
  },
  { id: "c", title: "Salad", kind: "recipes", category: "Vegan", tags: [] },
];
assert.deepEqual(
  S.filter(items, { query: "BASIL" }).map((i) => i.id),
  ["a"],
);
assert.deepEqual(
  S.filter(items, { filter: "Vegetarian", query: "basil" }).map((i) => i.id),
  ["a"],
);
assert.deepEqual(S.filter(items, { filter: "Chicken", query: "basil" }), []);
assert.deepEqual(
  S.filter(items, { savedOnly: true, saved: [items[1]] }).map((i) => i.id),
  ["b"],
);
assert.deepEqual(
  S.filter(items, { sort: "title" }).map((i) => i.id),
  ["b", "c", "a"],
);
assert.notEqual(S.storageKey("recipes"), S.storageKey("movies"));
for (const kind of Object.keys(S.registry))
  for (const size of ["compact", "comfortable", "large"]) {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: String(i) })),
      positions = S.arrange(many, kind, size);
    assert.equal(Object.keys(positions).length, 150);
    const values = Object.values(positions);
    for (let i = 0; i < values.length; i++)
      for (let j = i + 1; j < values.length; j++) {
        const a = values[i],
          b = values[j];
        assert.ok(
          a.x + a.w <= b.x ||
            b.x + b.w <= a.x ||
            a.y + a.h <= b.y ||
            b.y + b.h <= a.y,
          "Mosaic cards may not overlap",
        );
      }
  }
console.log(
  "Space filters, ingredient search, saved selection, independent storage, and mosaic layouts passed",
);
