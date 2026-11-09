const assert = require("node:assert/strict");
const fs = require("node:fs");
const N = require("../dist/news-model.js");
const { NewspaperLayout } = require("../dist/news-layout.js");
const geography = JSON.parse(fs.readFileSync("dist/news-geography.json"));
const base = {
  date: "2026-11-09T12:00:00Z",
  sourceId: "a",
  source: "Publisher A",
  topics: ["World"],
  excerpt: "A short, source-provided summary of the reporting.",
};
const sample = Array.from({ length: 51 }, (_, i) => ({
  ...base,
  id: String(i),
  url: "https://example.com/" + i,
  title:
    i % 4 === 0
      ? "Ukraine flooding closes roads across the region"
      : i % 4 === 1
        ? "Brief update"
        : i % 4 === 2
          ? "A long headline explains the discovery and how the researchers reached their conclusions"
          : "A video report from the science team",
  media:
    i % 4 === 2
      ? [
          {
            type: "image",
            src: "https://example.com/image.jpg",
            width: 1200,
            height: 700,
          },
        ]
      : i % 4 === 3
        ? [
            {
              type: "image",
              src: "https://example.com/video.jpg",
              width: 800,
              height: 450,
            },
            { type: "video", provider: "YouTube", id: "abcdefghijk" },
          ]
        : [],
}));
function noOverlap(entries) {
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i].rect,
        b = entries[j].rect;
      assert.ok(
        !(
          a.x < b.x + b.w - 0.01 &&
          a.x + a.w > b.x + 0.01 &&
          a.y < b.y + b.h - 0.01 &&
          a.y + a.h > b.y + 0.01
        ),
        `${entries[i].key} overlaps ${entries[j].key}`,
      );
    }
}
const options = { geography, overrides: {} };
const atlas = new NewspaperLayout(sample, options);
assert.ok(
  new Set(sample.map((s) => N.profile(s, { geography }).width)).size >= 3,
  "briefs, reports and media leads have distinct widths",
);
for (const x of [-1000000, -5000, 0, 5000, 1000000])
  for (const y of [-1000000, 0, 1000000]) {
    const entries = atlas.visible({
      left: x,
      top: y,
      right: x + 2200,
      bottom: y + 1400,
    });
    assert.ok(entries.length > 0 && entries.length < 100);
    noOverlap(entries);
  }
const key = "0:0:0",
  original = atlas.entry(key),
  other = atlas.entry("0:0:1");
atlas.toggle(key, 1000);
assert.equal(atlas.entry(key).expanded, true);
atlas.measure(key, 3200);
assert.equal(atlas.entry(key).rect.h, 3200);
noOverlap(
  atlas.visible({ left: 0, top: 0, right: atlas.pitch * 2, bottom: 8000 }),
);
const restored = new NewspaperLayout(sample, {
  ...options,
  overrides: structuredClone(options.overrides),
});
assert.equal(restored.entry(key).rect.h, 3200);
assert.equal(restored.entry(key).item.id, original.item.id);
atlas.toggle(key);
assert.equal(atlas.entry(key).expanded, false);
assert.equal(atlas.entry(key).rect.w, original.rect.w);
atlas.measure("0:0:2", 980);
assert.equal(
  atlas.find("2").rect.h,
  980,
  "intrinsic heights are shared by story/width",
);
atlas.commit(
  "0:0:1",
  { ...other.rect, x: 800, y: 1000, w: 490, h: 450 },
  "move",
);
noOverlap(
  atlas.visible({ left: 0, top: 0, right: atlas.pitch * 2, bottom: 8000 }),
);
atlas.commit(
  "0:0:1",
  { ...atlas.entry("0:0:1").rect, w: 720, h: 1000 },
  "resize",
);
noOverlap(
  atlas.visible({
    left: -500,
    top: -500,
    right: atlas.pitch * 2,
    bottom: 8000,
  }),
);
for (const s of sample)
  assert.equal(atlas.find(s.id, { x: -999999, y: 123456 }).item.id, s.id);
const mobile = new NewspaperLayout(sample, { columns: 2, geography });
mobile.toggle("0:0:0", 1100);
assert.ok(mobile.entry("0:0:0").rect.w <= mobile.spreadWidth);
noOverlap(
  mobile.visible({ left: -500, top: -1000, right: 1000, bottom: 4000 }),
);
const changed = new NewspaperLayout(
  [{ ...sample[0], id: "new" }, ...sample.slice(1)],
  { ...options, overrides: structuredClone(options.overrides) },
);
assert.equal(
  changed.entry(key).expanded,
  false,
  "edits cannot be applied to a replacement story",
);
assert.deepEqual(
  N.locations(
    { ...base, title: "Georgia and Jordan debate their next move" },
    geography,
  ),
  [],
);
assert.equal(N.locations(sample[0], geography)[0].country.id, "UKR");
assert.equal(
  N.locations({ ...base, title: "US economy grows" }, geography)[0].country.id,
  "USA",
);
assert.equal(
  N.locations({ ...base, title: "Tell us what you think" }, geography).length,
  0,
);
assert.equal(N.publicURL("javascript:alert(1)"), "");
assert.equal(N.publicURL("http://127.0.0.1/private"), "");
assert.equal(N.publicURL("https://name:pass@example.com/x"), "");
const related = N.related(sample[0], [
  {
    ...sample[0],
    id: "other",
    url: "https://other.example/story",
    sourceId: "b",
  },
  {
    ...sample[0],
    id: "old",
    url: "https://example.com/old",
    date: "2020-01-01",
  },
]);
assert.equal(related.length, 1);
assert.equal(related[0].story.id, "other");
assert.equal(
  new NewspaperLayout([]).visible({ left: 0, top: 0, right: 100, bottom: 100 })
    .length,
  0,
);
console.log(
  "News editorial sizing, source context, distant quadrants, intrinsic sizing, inline expansion, persistence and collision checks passed.",
);
