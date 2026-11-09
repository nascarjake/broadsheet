const assert = require("node:assert/strict"),
  fs = require("node:fs");
const N = require("../dist/news-model.js"),
  { NewspaperLayout } = require("../dist/news-layout.js");
const geography = JSON.parse(fs.readFileSync("dist/news-geography.json"));
const base = {
  date: "2026-11-09T12:00:00Z",
  sourceId: "a",
  source: "Publisher A",
  topics: ["World"],
  excerpt: "A short source-provided summary of the reporting.",
};
const sample = Array.from({ length: 272 }, (_, i) => ({
  ...base,
  id: String(i),
  url: "https://example.com/" + i,
  title:
    i % 3 === 0
      ? "Ukraine flooding closes roads across the region"
      : i % 3 === 1
        ? "Brief update"
        : "A long headline explains the discovery and the researchers conclusions",
  media:
    i % 3 === 2
      ? [
          {
            type: "image",
            src: "https://photos.example/" + i + ".jpg",
            width: 1000,
            height: 600,
          },
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
        entries[i].key + " overlaps " + entries[j].key,
      );
    }
}
function tightColumns(a, point) {
  for (let c = a.columnAt(point.x) - 1; c < a.columnAt(point.x) + 5; c++) {
    assert.ok(
      Math.abs(a.x(c + 1) - a.x(c) - a.columnWidth(c) - a.gap) < 0.001,
      "No unused horizontal slots",
    );
    const r = a.rowAt(c, point.y);
    for (let row = r - 2; row < r + 7; row++) {
      const e = a.entry(c + ":" + row),
        next = a.entry(c + ":" + (row + 1));
      assert.ok(
        Math.abs(next.rect.y - e.rect.y - e.rect.h - a.gap) < 0.001,
        "No vertical holes between adjacent stories",
      );
    }
  }
}
const overrides = {},
  pins = {},
  a = new NewspaperLayout(sample, { geography, overrides, pins });
for (const x of [-1000000, -5000, 0, 5000, 1000000])
  for (const y of [-1000000, 0, 1000000]) {
    const entries = a.visible({
      left: x,
      top: y,
      right: x + 2600,
      bottom: y + 1800,
    });
    assert.ok(entries.length > 0 && entries.length < 100);
    noOverlap(entries);
    assert.equal(
      new Set(entries.map((e) => e.item.id)).size,
      entries.length,
      "No nearby repeated articles",
    );
    tightColumns(a, { x, y });
  }
const key = "0:0",
  original = a.entry(key),
  neighbor = a.entry("1:0");
a.toggle(key, 1100);
a.measure(key, 3500);
assert.equal(a.entry(key).rect.h, 3500);
assert.equal(a.columnWidth(0), 1100);
assert.ok(
  a.entry("1:0").rect.x > neighbor.rect.x,
  "Neighbors follow the widened reading column",
);
tightColumns(a, { x: 0, y: 0 });
noOverlap(a.visible({ left: 0, top: 0, right: 3500, bottom: 6000 }));
const restored = new NewspaperLayout(sample, {
  geography,
  overrides: structuredClone(overrides),
  pins: structuredClone(pins),
});
assert.equal(restored.entry(key).item.id, original.item.id);
assert.equal(restored.entry(key).rect.h, 3500);
tightColumns(restored, { x: 0, y: 0 });
a.toggle(key);
assert.equal(a.columnWidth(0), a.baseWidth(0));
assert.equal(a.entry(key).rect.h, original.rect.h);
assert.equal(
  a.entry(key).autoHeight,
  true,
  "Closing an automatic reader must remeasure its card rather than freeze an estimated height",
);
a.measure(key, 333);
a.toggle(key, 1100);
a.measure(key, 2800);
a.toggle(key);
assert.equal(a.entry(key).rect.h, 333);
const measured = a.entry("1:2");
a.measure(measured.key, 187);
assert.equal(
  a.entry(measured.key).rect.h,
  187,
  "Use true natural height rather than leaving a minimum-height hole",
);
tightColumns(a, { x: 0, y: 0 });
const moved = a.entry("1:1"),
  destination = a.entry("2:1");
const movedKey = a.move(moved.key, 1, 0);
assert.equal(a.entry(movedKey).item.id, moved.item.id);
assert.equal(a.entry(moved.key).item.id, destination.item.id);
tightColumns(a, { x: 0, y: 0 });
a.commit(movedKey, { ...a.entry(movedKey).rect, w: 850, h: 1100 }, "resize");
assert.equal(a.columnWidth(2), 850);
a.toggle(movedKey, 1200);
a.measure(movedKey, 2400);
a.toggle(movedKey);
assert.equal(
  a.entry(movedKey).rect.h,
  1100,
  "An explicit manual card height survives opening and closing",
);
assert.equal(a.entry(movedKey).autoHeight, false);
tightColumns(a, { x: 0, y: 0 });
noOverlap(a.visible({ left: -1000, top: -1000, right: 5000, bottom: 6000 }));
for (const item of sample)
  assert.equal(a.find(item.id, { x: -9999, y: 22222 }).item.id, item.id);
const mobile = new NewspaperLayout(sample, {
  unit: 180,
  columns: 2,
  geography,
});
mobile.toggle("0:0", 1000);
assert.ok(
  mobile.columnWidth(0) <= mobile.spreadWidth,
  "Mobile readers fit the reading column",
);
tightColumns(mobile, { x: 0, y: 0 });
noOverlap(mobile.visible({ left: -300, top: -500, right: 1000, bottom: 3500 }));
const canonical = [
  {
    ...sample[0],
    id: "original",
    url: "https://example.com/report?utm_source=rss",
  },
  { ...sample[0], id: "tracking-copy", url: "https://example.com/report" },
];
assert.equal(
  new NewspaperLayout(canonical, { geography }).items.length,
  1,
  "Tracking URLs cannot create duplicate stories",
);
N.configureMedia({
  photos: {
    "https://a.example/p.jpg": { hashes: ["35c6a9f023e4b8d1"] },
    "https://b.example/cropped.jpg": { hashes: ["35c6a9f023e4b8d0"] },
  },
});
const photoA = { type: "image", src: "https://a.example/p.jpg" },
  photoB = { type: "image", src: "https://b.example/cropped.jpg" };
assert.ok(
  N.samePhoto(photoA, photoB),
  "Different publisher URLs can carry the same photo",
);
assert.ok(
  !N.samePhoto(photoA, {
    type: "image",
    src: "https://c.example/different.jpg",
  }),
);
const reports = [
  { ...sample[0], id: "photo-a", media: [photoA] },
  { ...sample[1], id: "photo-b", media: [photoB] },
];
const covers = N.coverPolicy(reports, geography);
assert.equal(covers.get("photo-a").hideImage, false);
assert.equal(covers.get("photo-b").hideImage, true);
assert.equal(
  N.media(reports[1])[0],
  photoB,
  "Original media stays available inside the article",
);
assert.equal(
  N.locations(
    { ...base, title: "Georgia and Jordan debate their next move" },
    geography,
  ).length,
  0,
);
assert.equal(N.locations(sample[0], geography)[0].country.id, "UKR");
assert.equal(
  N.locations({ ...base, title: "US economy grows" }, geography)[0].country.id,
  "USA",
);
assert.equal(N.publicURL("javascript:alert(1)"), "");
assert.equal(
  new NewspaperLayout([]).visible({ left: 0, top: 0, right: 100, bottom: 100 })
    .length,
  0,
);
const sameCoverage = [
  {
    ...base,
    id: "primary",
    url: "https://a.example/report",
    title: "Flooding closes roads across Ukraine after heavy rain",
    media: [photoA],
  },
  {
    ...base,
    id: "alternate",
    url: "https://b.example/report",
    sourceId: "b",
    title: "Ukraine flooding closes roads as rain continues",
    media: [photoB],
  },
];
const grouped = N.editionOrder(sameCoverage);
assert.equal(grouped.length, 1);
assert.equal(grouped[0].coverage.length, 2);
const groupedLayout = new NewspaperLayout(grouped, { geography });
assert.equal(
  groupedLayout.find("alternate").item.id,
  "primary",
  "Every original publisher report remains addressable through its shared card",
);
assert.equal(
  N.editionOrder([
    sameCoverage[0],
    { ...sameCoverage[1], title: "A bakery launches a lunch menu" },
  ]).length,
  2,
  "A shared file photo alone cannot merge unrelated reporting",
);
assert.equal(
  N.editionOrder([sameCoverage[0], { ...sameCoverage[1], date: "2020-01-01" }])
    .length,
  2,
);
// Off-screen overscan copies must never displace actual visible reports.
const small = new NewspaperLayout(sample.slice(0, 6), { geography });
const core = { left: 0, top: 0, right: 1100, bottom: 500 };
const wanted = small.collect(core).map((e) => e.item.id);
const shown = small.visible({
  left: -120,
  top: -120,
  right: 1220,
  bottom: 620,
  focus: core,
});
for (const id of wanted) assert.ok(shown.some((e) => e.item.id === id));
assert.equal(new Set(shown.map((e) => e.item.id)).size, shown.length);
const single = new NewspaperLayout([sample[0]], { geography });
assert.equal(
  single.visible({ left: -100, top: -100, right: 3000, bottom: 2000 }).length,
  1,
);
console.log(
  "Continuous newspaper coverage, distant duplicate repair, natural sizing, reading-column expansion, dense movement/resizing, persistence, mobile and shared-photo checks passed",
);
