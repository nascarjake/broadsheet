const assert = require("node:assert/strict");
const M = require("../dist/model.js");
const stories = [
  {
    id: "nasa",
    sourceId: "nasa",
    source: "NASA",
    title: "Lunar mission",
    topic: "Human frontiers",
    date: "2026-11-01",
  },
  {
    id: "ai",
    sourceId: "ars",
    source: "Ars Technica",
    title: "AI chips",
    topics: ["Technology", "AI"],
    date: "2026-11-02",
  },
  {
    id: "food",
    sourceId: "food",
    source: "Food",
    title: "A recipe",
    topics: ["Cooking"],
    date: "2026-11-03",
  },
  {
    id: "world",
    sourceId: "bbc",
    source: "BBC News",
    title: "World briefing",
    topics: ["World"],
    date: "",
  },
];
const all = { sources: ["nasa", "ars", "food", "bbc"], saved: [], topics: [] };
assert.deepEqual(
  M.filter(stories, all).map((s) => s.id),
  ["food", "ai", "nasa", "world"],
);
assert.deepEqual(
  M.filter(stories, { ...all, topics: ["Space"] }).map((s) => s.id),
  ["nasa"],
);
assert.deepEqual(
  M.filter(stories, { ...all, topics: ["Space", "AI"] }).map((s) => s.id),
  ["ai", "nasa"],
);
assert.deepEqual(
  M.filter(stories, { ...all, sources: ["nasa"], topics: ["AI"] }),
  [],
);
assert.deepEqual(
  M.filter(stories, { ...all, query: "CHIPS" }).map((s) => s.id),
  ["ai"],
);
assert.deepEqual(
  M.filter(stories, { ...all, savedOnly: true, saved: ["food"] }).map(
    (s) => s.id,
  ),
  ["food"],
);
assert.deepEqual(M.filter(stories, { ...all, sources: [] }), []);
assert.deepEqual(
  M.filter(stories, { ...all, sort: "source" }).map((s) => s.id),
  ["ai", "world", "food", "nasa"],
);
for (const size of ["compact", "comfortable", "large"]) {
  const p = M.arrange(stories, size);
  for (const a of Object.values(p))
    for (const b of Object.values(p))
      if (a !== b)
        assert.ok(
          a.x + a.w <= b.x ||
            b.x + b.w <= a.x ||
            a.y + a.h <= b.y ||
            b.y + b.h <= a.y,
          "Cards must not overlap",
        );
  assert.deepEqual(p, M.arrange(stories, size));
}
assert.deepEqual(
  M.cleanLayout({
    bad: { x: NaN, y: 0, w: 400, h: 500 },
    good: { x: 0, y: -10, w: 50, h: 9999 },
  }),
  { good: { x: 0, y: -10, w: 280, h: 1400 } },
);
assert.equal(M.tags(stories[0]).includes("Space"), true);
console.log(
  "Workspace filtering, channel intersections, sorting, layout bounds, and non-overlap checks passed",
);
assert.equal(
  M.resolveURL("https://example.org/story", ""),
  "https://example.org/story",
);
assert.equal(
  M.resolveURL("/story", "https://example.org/feed"),
  "https://example.org/story",
);
assert.equal(
  M.resolveURL("javascript:alert(1)", "https://example.org/feed"),
  "",
);
assert.equal(M.resolveURL("/story", ""), "");
