const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
function element() {
  return {
    style: {},
    dataset: {},
    clientWidth: 1000,
    clientHeight: 650,
    parentElement: { clientWidth: 1000 },
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(type, handler) {
      this.listeners ??= {};
      this.listeners[type] = handler;
    },
    setPointerCapture() {},
    hasPointerCapture() {
      return false;
    },
    append() {},
    getBoundingClientRect() {
      return { left: 0, top: 0 };
    },
    remove() {},
  };
}
const scope = {
  AbortController,
  Map,
  Set,
  Math,
  Number,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
    unobserve() {}
  },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame() {},
  window: { addEventListener() {} },
  document: { activeElement: null, body: { dataset: {} } },
};
vm.createContext(scope);
vm.runInContext(fs.readFileSync("dist/canvas.js", "utf8"), scope);
const viewport = element(),
  world = element(),
  items = Array.from({ length: 500 }, (_, i) => ({ id: String(i) })),
  positions = Object.fromEntries(
    items.map((s, i) => [
      s.id,
      { x: (i % 5) * 330, y: Math.floor(i / 5) * 440, w: 300, h: 400 },
    ]),
  );
let commits = 0;
const canvas = new scope.BroadsheetCanvas({
  viewport,
  world,
  container: element(),
  getItems: () => items,
  getPositions: () => positions,
  createCard: () => element(),
  onCommit: () => commits++,
});
canvas.home();
assert.ok(canvas.view.z > 0);
canvas.render();
assert.ok(
  canvas.nodes.size < 25 && canvas.nodes.size > 0,
  "Canvas should virtualize a finite collection",
);
const before = { ...canvas.view },
  anchor = { x: 400, y: 250 },
  point = {
    x: (anchor.x - before.x) / before.z,
    y: (anchor.y - before.y) / before.z,
  };
canvas.zoom(1.2, anchor.x, anchor.y);
assert.ok(Math.abs(point.x * canvas.view.z + canvas.view.x - anchor.x) < 0.001);
assert.ok(Math.abs(point.y * canvas.view.z + canvas.view.y - anchor.y) < 0.001);
canvas.handleKeys(
  { key: "ArrowRight", preventDefault() {}, stopPropagation() {} },
  "move",
  "0",
);
assert.equal(positions["0"].x, 10);
assert.equal(commits, 1);
canvas.handleKeys(
  { key: "ArrowRight", preventDefault() {}, stopPropagation() {} },
  "resize",
  "0",
);
assert.equal(positions["0"].w, 310);
canvas.pan(-100000, -100000);
canvas.render();
assert.equal(
  canvas.nodes.size,
  0,
  "Panning beyond a finite collection must not invent/repeat content",
);
canvas.focus("0");
canvas.render();
assert.ok(canvas.nodes.has("0"));
canvas.fit();
assert.ok(canvas.view.z > 0);
const bottom = Math.max(...Object.values(positions).map((p) => p.y + p.h));
assert.ok(
  bottom * canvas.view.z + canvas.view.y <= viewport.clientHeight,
  "See all must fit the finite collection",
);
canvas.destroy();
assert.equal(canvas.nodes.size, 0);
console.log(
  "Shared canvas virtualization, anchor zoom, keyboard move/resize, finite bounds, focus, and cleanup passed",
);

// The same renderer must populate every quadrant when supplied an endless layout.
const { InfiniteLayout } = require("../dist/spatial.js");
const atlas = new InfiniteLayout(
  Array.from({ length: 40 }, (_, i) => ({ id: String(i) })),
);
const infiniteViewport = element(),
  infinite = new scope.BroadsheetCanvas({
    viewport: infiniteViewport,
    world: element(),
    container: element(),
    getAtlas: () => atlas,
    createCard: () => element(),
  });
infinite.home();
infinite.render();
for (const coordinate of [-1000000, 1000000]) {
  infinite.view = { x: coordinate, y: coordinate, z: 0.85 };
  infinite.render();
  assert.ok(
    infinite.nodes.size > 0 && infinite.nodes.size < 100,
    "Far quadrants must remain populated with bounded DOM",
  );
}
infinite.home();
infinite.render();
const right = { key: "ArrowRight", preventDefault() {}, stopPropagation() {} };
infinite.handleKeys(right, "move", "0:0");
infinite.handleKeys(right, "move", "0:0");
assert.equal(
  atlas.entry("0:0").rect.x,
  20,
  "Successive keyboard edits must not be lost before the next paint",
);
const scroller = { scrollHeight: 900, clientHeight: 200, closest: () => null },
  target = { closest: () => scroller };
let prevented = false;
const oldX = infinite.view.x;
infiniteViewport.listeners.wheel({
  target,
  deltaX: 120,
  deltaY: 0,
  preventDefault() {
    prevented = true;
  },
});
assert.equal(infinite.view.x, oldX - 120);
assert.equal(
  prevented,
  true,
  "Horizontal browsing must work over reader content",
);
const oldY = infinite.view.y;
infiniteViewport.listeners.wheel({
  target,
  deltaX: 0,
  deltaY: 120,
  preventDefault() {},
});
assert.equal(
  infinite.view.y,
  oldY,
  "Bounded reader panels retain internal vertical scrolling",
);
scroller.closest = () => ({});
infiniteViewport.listeners.wheel({
  target,
  deltaX: 0,
  deltaY: 120,
  preventDefault() {},
});
assert.equal(
  infinite.view.y,
  oldY - 120,
  "Natural-height expanded cards must read by panning the canvas",
);
atlas.toggle("0:0");
atlas.measure("0:0", 2400);
infinite.clear();
infinite.render();
infinite.handleKeys(right, "resize", "0:0");
assert.equal(atlas.entry("0:0").rect.h, 2400);
assert.equal(
  atlas.entry("0:0").autoHeight,
  true,
  "Width resize must preserve a long natural-height card",
);
infinite.handleKeys(
  { key: "ArrowDown", preventDefault() {}, stopPropagation() {} },
  "resize",
  "0:0",
);
assert.equal(atlas.entry("0:0").rect.h, 2410);
assert.equal(
  atlas.entry("0:0").autoHeight,
  false,
  "Explicit height changes create a bounded reading window",
);
infinite.destroy();
console.log(
  "Endless renderer quadrants, bounded DOM, repeated edits, and inline reading scroll routes passed",
);
// Natural closed-card measurements may reflow neighbors but must not move the
// camera toward an off-screen image that finishes loading during initial paint.
const naturalAtlas = {
  measure: () => true,
  entry: () => ({ rect: { x: 100, y: 200, w: 300, h: 900 } }),
};
const naturalCanvas = new scope.BroadsheetCanvas({
  viewport: element(),
  world: element(),
  container: element(),
  getAtlas: () => naturalAtlas,
  getItems: () => [],
  getPositions: () => ({}),
  createCard: () => element(),
});
const measuredNode = element();
measuredNode.dataset = { instance: "0:0:0", autoHeight: "true" };
measuredNode.isConnected = true;
measuredNode.offsetHeight = 900;
naturalCanvas.nodes.set("0:0:0", measuredNode);
naturalCanvas.instancePositions["0:0:0"] = { x: 0, y: 0, w: 300, h: 600 };
const naturalView = { ...naturalCanvas.view };
naturalCanvas.measureExpanded(measuredNode);
assert.deepEqual({ ...naturalCanvas.view }, naturalView);
measuredNode.dataset.expanded = "true";
naturalCanvas.measureExpanded(measuredNode);
assert.ok(
  naturalCanvas.view.y < naturalView.y,
  "Expanded reading keeps its existing screen anchor",
);
naturalCanvas.destroy();

canvas.home({ width: 447, height: 610, maxZoom: 1, availableWidth: 1161, availableHeight: 650 });
assert.equal(canvas.view.z, 1, "Reading home must not shrink type to fit multiple rows");
