const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Execute both sides of the sandbox boundary: wheel input must reach the
// canvas exactly once, with a zoom anchor corrected for the scaled iframe.
let receive;
const dispatched = [];
const frame = {
  dataset: {}, style: {}, contentWindow: {}, clientWidth: 800, clientHeight: 2000,
  setAttribute(name, value) { this[name] = value; },
  getBoundingClientRect() { return { left: 100, top: -200, width: 400, height: 1000 }; },
  dispatchEvent(event) { dispatched.push(event); },
};
const scope = {
  crypto: require("node:crypto").webcrypto,
  URL,
  document: { createElement: () => frame, querySelectorAll: () => [frame] },
  addEventListener(type, listener) { if (type === "message") receive = listener; },
  WheelEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
  module: { exports: {} },
};
vm.createContext(scope);
vm.runInContext(fs.readFileSync("dist/article-reader.js", "utf8"), scope);
scope.module.exports.guardianFrame({ url: "https://www.theguardian.com/world/example", html: "<p>Full article</p>" });
assert.equal(frame.scrolling, "no");
assert.match(frame.srcdoc, /html,body\{[^}]*overflow:hidden/);
assert.match(frame.srcdoc, /body\{display:flow-root/);

const listeners = {};
let bodyHeight = 2000, reports = [], resize;
const child = {
  document: {
    querySelectorAll: () => [],
    body: { getBoundingClientRect: () => ({ height: bodyHeight }), get scrollHeight() { return bodyHeight; } },
  },
  innerHeight: 2000,
  parent: { postMessage(data) { reports.push(data); receive({ data, source: frame.contentWindow }); } },
  ResizeObserver: class { constructor(listener) { resize = listener; } observe() {} },
  addEventListener(type, listener, options) { listeners[type] = listener; if (type === "wheel") assert.equal(options.passive, false); },
};
vm.createContext(child);
vm.runInContext(frame.srcdoc.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1], child);
assert.equal(frame.style.height, "2002px");
bodyHeight = 1200;
resize();
assert.equal(frame.style.height, "1202px", "Wider cards shrink the reader instead of retaining the old viewport height");

let prevented = 0;
const wheel = { deltaX: 12, deltaY: 80, deltaMode: 0, clientX: 240, clientY: 600, ctrlKey: false, metaKey: false, preventDefault() { prevented++; } };
listeners.wheel(wheel);
assert.equal(prevented, 1, "Cancel native inner scrolling and scroll chaining");
assert.equal(dispatched.length, 1);
assert.deepEqual({ ...dispatched[0] }, {
  type: "wheel", bubbles: true, cancelable: true,
  deltaX: 12, deltaY: 80, clientX: 220, clientY: 100, ctrlKey: false, metaKey: false,
});
listeners.wheel({ ...wheel, deltaMode: 1, deltaY: -3, ctrlKey: true });
assert.equal(dispatched[1].deltaY, -54);
assert.equal(dispatched[1].ctrlKey, true, "Preserve pinch-to-zoom input");
listeners.wheel({ ...wheel, deltaMode: 2, deltaY: 1 });
assert.equal(dispatched[2].deltaY, 2000);

const valid = reports.at(-1);
receive({ data: valid, source: {} });
receive({ data: { ...valid, id: "another-reader" }, source: frame.contentWindow });
receive({ data: { ...valid, deltaY: Infinity }, source: frame.contentWindow });
receive({ data: { ...valid, clientX: NaN }, source: frame.contentWindow });
assert.equal(dispatched.length, 3, "Reject spoofed or malformed cross-frame gestures");
console.log("Article reader gesture bridge and responsive sizing passed");
