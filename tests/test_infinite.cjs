const assert = require("node:assert/strict"),
  { InfiniteLayout } = require("../dist/spatial.js");
const items = Array.from({ length: 40 }, (_, i) => ({
  id: "recipe-" + i,
  title: "Recipe " + i,
}));
const overrides = {},
  layout = new InfiniteLayout(items, {
    width: 300,
    height: 420,
    variation: [0, 52, -30, 25],
    overrides,
  });
function overlap(a, b) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}
function checkRegion(left, top) {
  const cells = layout.visible({
    left,
    top,
    right: left + 1600,
    bottom: top + 1400,
  });
  assert.ok(cells.length > 0 && cells.length < 70);
  for (const cell of cells) assert.ok(items.includes(cell.item));
  for (let i = 0; i < cells.length; i++)
    for (let j = i + 1; j < cells.length; j++)
      assert.ok(
        !overlap(cells[i].rect, cells[j].rect),
        "Cards overlap: " + cells[i].key + " / " + cells[j].key,
      );
  return cells;
}
for (const x of [-1e6, -1500, 0, 1500, 1e6])
  for (const y of [-1e6, -1500, 0, 1500, 1e6]) checkRegion(x, y);
for (const c of [-10000, -2, -1, 0, 1, 10000])
  for (const r of [-10000, -2, -1, 0, 1, 10000]) {
    assert.equal(layout.x(c) + layout.columnWidth(c) + 22, layout.x(c + 1));
    assert.equal(
      layout.y(c, r) + layout.rowHeight(c, r) + 22,
      layout.y(c, r + 1),
    );
    assert.equal(layout.columnAt(layout.x(c) + 10), c);
    assert.equal(layout.rowAt(c, layout.y(c, r) + 10), r);
  }
const before = layout.entry("1:0").rect.x,
  below = layout.entry("0:1").rect.y;
layout.toggle("0:0");
layout.measure("0:0", 1900);
assert.ok(layout.entry("1:0").rect.y > 0);
assert.ok(layout.entry("0:1").rect.y > below);
checkRegion(-2000, -2000);
checkRegion(0, 0);
layout.toggle("-1:-1", 900);
layout.measure("-1:-1", 2300);
checkRegion(-3000, -3000);
checkRegion(0, 0);
const entry = layout.entry("2:-2");
layout.commit(
  entry.key,
  {
    ...entry.rect,
    x: entry.rect.x - 90,
    y: entry.rect.y + 140,
    w: 820,
    h: 950,
  },
  "resize",
);
checkRegion(-3000, -2000);
checkRegion(0, 0);
const restored = new InfiniteLayout(items, {
  width: 300,
  height: 420,
  variation: [0, 52, -30, 25],
  overrides: JSON.parse(JSON.stringify(overrides)),
});
for (const k of ["0:0", "-1:-1", "2:-2"])
  assert.deepEqual(restored.entry(k).rect, layout.entry(k).rect);
layout.toggle("0:0");
layout.toggle("-1:-1");
assert.equal(layout.entry("0:0").rect.w, 300);
assert.equal(layout.entry("0:0").rect.h, 420);
const one = new InfiniteLayout([items[0]]);
const distant = one.visible({
  left: -1e7,
  top: 1e7,
  right: -1e7 + 1000,
  bottom: 1e7 + 1000,
});
assert.ok(distant.length > 0);
assert.ok(distant.every((e) => e.item === items[0]));
assert.equal(new Set(distant.map((e) => e.key)).size, distant.length);
for (const item of items) {
  const match = layout.find(item.id, { x: -16000, y: 14000 });
  assert.equal(match.item.id, item.id);
}
console.log(
  "Endless quadrants, negative-coordinate boundaries, expansion reflow, collision-free resizing, restoration, and finite-source identity passed",
);
layout.toggle("0:0");
const changed = new InfiniteLayout([...items].reverse(), {
  width: 300,
  height: 420,
  variation: [0, 52, -30, 25],
  overrides: JSON.parse(JSON.stringify(overrides)),
});
assert.equal(
  changed.entry("0:0").expanded,
  false,
  "Refresh must not replace an opened recipe with a different recipe",
);

// Multiple panels in both directions must remain packed after each edit.
const many = new InfiniteLayout(items, {
  width: 300,
  height: 420,
  variation: [0, 52, -30, 25],
});
let seed = 41;
const random = (n) => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed % n;
};
for (let i = 0; i < 25; i++) {
  const key = random(7) - 3 + ":" + (random(7) - 3);
  many.toggle(key);
  many.measure(key, 700 + random(1600));
  const cells = many.visible({
    left: -2500,
    top: -4000,
    right: 3500,
    bottom: 7000,
  });
  for (let a = 0; a < cells.length; a++)
    for (let b = a + 1; b < cells.length; b++)
      assert.ok(
        !many.intersects(cells[a].rect, cells[b].rect),
        "Multiple panels must not collide",
      );
}

const natural = new InfiniteLayout(items);
natural.toggle("0:0");
natural.measure("0:0", 2400);
let naturalRect = natural.entry("0:0").rect;
natural.commit("0:0", { ...naturalRect, w: naturalRect.w + 10 }, "resize");
assert.equal(
  natural.entry("0:0").autoHeight,
  true,
  "Width-only edits should preserve natural reading height",
);
naturalRect = natural.entry("0:0").rect;
natural.commit("0:0", { ...naturalRect, h: naturalRect.h + 10 }, "resize");
assert.equal(
  natural.entry("0:0").autoHeight,
  false,
  "Height edits make an internally scrolling window",
);

const pinnedOverrides = {},
  pins = {};
const beforeAppend = new InfiniteLayout(items, {
  overrides: pinnedOverrides,
  pins,
});
const stableCell = "-3:2";
const stableId = beforeAppend.entry(stableCell).item.id;
beforeAppend.toggle(stableCell);
pins[stableCell] = stableId;
const afterAppend = new InfiniteLayout([...items, { id: "new-recipe" }], {
  overrides: pinnedOverrides,
  pins,
});
assert.equal(afterAppend.entry(stableCell).item.id, stableId);
assert.ok(
  afterAppend.entry(stableCell).expanded,
  "Loading more must preserve an open card",
);
assert.equal(
  afterAppend.find(stableId, afterAppend.entry(stableCell).rect).item.id,
  stableId,
);
const refreshed = new InfiniteLayout([{ id: "replacement" }], {
  overrides: pinnedOverrides,
  pins,
});
assert.deepEqual(pins, {});
assert.equal(refreshed.entry(stableCell).expanded, false);
