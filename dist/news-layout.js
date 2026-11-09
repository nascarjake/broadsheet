/* Continuous newspaper columns: no chunk boundaries, reserved spans or empty
 * trailing column slots. A wider reader widens its column; neighbors follow. */
(function (root) {
  const Spatial =
    root.BroadsheetSpatial ||
    (typeof require !== "undefined" ? require("./spatial.js") : null);
  const N = root.BroadsheetNews,
    mod = Spatial.mod,
    parse = Spatial.parse;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  class NewspaperLayout extends Spatial.InfiniteLayout {
    constructor(
      items,
      {
        unit = 240,
        columns = 6,
        gap = 18,
        overrides = {},
        pins = {},
        geography,
        onRepair,
      } = {},
    ) {
      const unique = [
        ...new Map(items.map((s) => [N.articleKey(s), s])).values(),
      ];
      super(unique, {
        width: unit * 2 + gap,
        height: 420,
        gap,
        overrides,
        pins,
      });
      Object.assign(this, { unit, columns, geography, onRepair });
      this.aliases = new Map();
      for (const item of unique)
        for (const report of item.coverage || [])
          this.aliases.set(report.id, item.id);
      this.measured = new Map();
      this.spreadWidth = columns * (unit + gap) - gap;
      this.pattern =
        columns <= 2
          ? [2]
          : [
              unique.filter((s) => N.media(s).some((m) => m.type === "image"))
                .length >
              unique.length * 0.4
                ? 3
                : 2,
              2,
              2,
            ];
      this.coverPolicy = N.coverPolicy(unique, geography);
      this.ready = true;
      this.invalidate();
    }
    baseWidth(c) {
      const span = this.pattern[mod(c, this.pattern.length)];
      return span * this.unit + (span - 1) * this.gap;
    }
    columnWidth(c) {
      return this.widthEdits.get(c) || this.baseWidth(c);
    }
    baseX(c) {
      const n = this.pattern.length,
        cycle = this.pattern.reduce(
          (s, _, i) => s + this.baseWidth(i) + this.gap,
          0,
        );
      let x = Math.floor(c / n) * cycle;
      for (let i = 0; i < mod(c, n); i++) x += this.baseWidth(i) + this.gap;
      return x;
    }
    x(c) {
      let x = this.baseX(c);
      for (const [at, w] of this.widthEdits)
        if (c >= 0 && at >= 0 && at < c) x += w - this.baseWidth(at);
        else if (c < 0 && at >= c && at < 0) x -= w - this.baseWidth(at);
      return x;
    }
    columnAt(x) {
      let lo = Math.floor(x / (this.width + this.gap)) - 2,
        hi = lo + 4,
        step = 4;
      while (this.x(lo) > x) {
        lo -= step;
        step *= 2;
      }
      step = 4;
      while (this.x(hi + 1) <= x) {
        hi += step;
        step *= 2;
      }
      while (lo < hi) {
        const m = Math.ceil((lo + hi) / 2);
        if (this.x(m) <= x) lo = m;
        else hi = m - 1;
      }
      return lo;
    }
    storyAt(c, r) {
      return this.itemById.get(this.pins[c + ":" + r]) || this.itemAt(c, r);
    }
    profileFor(item, c) {
      return N.profile(item, {
        unit: this.unit,
        columns: this.columns,
        geography: this.geography,
        width: this.columnWidth(c),
        ...this.coverPolicy.get(item.id),
      });
    }
    naturalHeight(item, c) {
      const width = this.columnWidth(c);
      return (
        this.measured.get(item.id + "|" + width) ||
        this.profileFor(item, c).height
      );
    }
    baseHeight(c, r) {
      return this.naturalHeight(this.itemAt(c, r), c);
    }
    size(c, r) {
      const o = this.overrides[c + ":" + r] || {},
        item = this.storyAt(c, r);
      return {
        w: this.columnWidth(c),
        h: Math.max(
          80,
          o.expanded || o.autoHeight === false
            ? o.h || this.naturalHeight(item, c)
            : this.naturalHeight(item, c),
        ),
      };
    }
    cycleFor(c) {
      if (this.cycles.has(c)) return this.cycles.get(c);
      const prefix = [0];
      for (let r = 0; r < this.items.length; r++)
        prefix.push(prefix.at(-1) + this.baseHeight(c, r) + this.gap);
      const cycle = { prefix, total: prefix.at(-1) || 1 };
      this.cycles.set(c, cycle);
      return cycle;
    }
    baseY(c, r) {
      if (!this.items.length) return 0;
      const cycle = this.cycleFor(c);
      return (
        Math.floor(r / this.items.length) * cycle.total +
        cycle.prefix[mod(r, this.items.length)]
      );
    }
    y(c, r) {
      let y = this.baseY(c, r);
      for (const [at, delta] of this.heightEdits.get(c) || [])
        if (r >= 0 && at >= 0 && at < r) y += delta;
        else if (r < 0 && at >= r && at < 0) y -= delta;
      return y;
    }
    rowHeight(c, r) {
      return this.size(c, r).h;
    }
    rowAt(c, y) {
      const avg = this.cycleFor(c).total / Math.max(1, this.items.length);
      let lo = Math.floor(y / avg) - 2,
        hi = lo + 4,
        step = 4;
      while (this.y(c, lo) > y) {
        lo -= step;
        step *= 2;
      }
      step = 4;
      while (this.y(c, hi + 1) <= y) {
        hi += step;
        step *= 2;
      }
      while (lo < hi) {
        const m = Math.ceil((lo + hi) / 2);
        if (this.y(c, m) <= y) lo = m;
        else hi = m - 1;
      }
      return lo;
    }
    invalidate() {
      if (!this.ready) return;
      this.cycles = new Map();
      this.widthEdits = new Map();
      this.heightEdits = new Map();
      for (const [key, o] of Object.entries(this.overrides)) {
        const p = parse(key);
        if (p && (o.expanded || o.resized))
          this.widthEdits.set(
            p.c,
            Math.max(
              this.widthEdits.get(p.c) || 0,
              clamp(o.w || this.baseWidth(p.c), 180, this.spreadWidth),
            ),
          );
      }
      for (const key of new Set([
        ...Object.keys(this.pins),
        ...Object.keys(this.overrides),
      ])) {
        const p = parse(key);
        if (!p) continue;
        const delta = this.size(p.c, p.r).h - this.baseHeight(p.c, p.r);
        if (Math.abs(delta) < 0.1) continue;
        if (!this.heightEdits.has(p.c)) this.heightEdits.set(p.c, new Map());
        this.heightEdits.get(p.c).set(p.r, delta);
      }
    }
    entry(key) {
      const p = parse(key);
      if (!p || !this.items.length) return null;
      const item = this.storyAt(p.c, p.r),
        o = this.overrides[key] || {},
        size = this.size(p.c, p.r);
      return {
        key,
        ...p,
        item,
        profile: this.profileFor(item, p.c),
        expanded: !!o.expanded,
        autoHeight: o.autoHeight !== false,
        rect: { x: this.x(p.c), y: this.y(p.c, p.r), w: size.w, h: size.h },
      };
    }
    collect(bounds) {
      const result = [];
      for (let c = this.columnAt(bounds.left); this.x(c) < bounds.right; c++)
        for (
          let r = this.rowAt(c, bounds.top);
          this.y(c, r) < bounds.bottom;
          r++
        ) {
          const e = this.entry(c + ":" + r);
          if (
            this.intersects(e.rect, {
              x: bounds.left,
              y: bounds.top,
              w: bounds.right - bounds.left,
              h: bounds.bottom - bounds.top,
            })
          )
            result.push(e);
        }
      return result;
    }
    visible(bounds) {
      if (!this.items.length) return [];
      const focus = bounds.focus || bounds;
      const inFocus = (e) =>
        this.intersects(e.rect, {
          x: focus.left,
          y: focus.top,
          w: focus.right - focus.left,
          h: focus.bottom - focus.top,
        });
      const distance = (e) =>
        (e.rect.x + e.rect.w / 2 - (focus.left + focus.right) / 2) ** 2 +
        (e.rect.y + e.rect.h / 2 - (focus.top + focus.bottom) / 2) ** 2;
      const priority = (a, b) =>
        Number(!!this.overrides[b.key]) - Number(!!this.overrides[a.key]) ||
        Number(inFocus(b)) - Number(inFocus(a)) ||
        distance(a) - distance(b);
      let padding = 1.5,
        area,
        entries;
      do {
        area = {
          left: bounds.left - (bounds.right - bounds.left) * padding,
          right: bounds.right + (bounds.right - bounds.left) * padding,
          top: bounds.top - (bounds.bottom - bounds.top) * padding,
          bottom: bounds.bottom + (bounds.bottom - bounds.top) * padding,
        };
        entries = this.collect(area);
        padding /= 2;
      } while (entries.length > this.items.length && padding > 0.09);
      let repaired = false;
      for (let pass = 0; pass < 5; pass++) {
        const used = new Set(),
          duplicates = [];
        // An opened/edited card retains its identity; the nearest normal copy
        // receives another real article from the current filtered edition.
        entries.sort(priority);
        for (const e of entries)
          if (used.has(e.item.id) && !e.expanded) duplicates.push(e);
          else used.add(e.item.id);
        if (!duplicates.length) break;
        for (const e of duplicates) {
          let candidate;
          const start = this.indexAt(e.c, e.r);
          for (let k = 0; k < this.items.length; k++) {
            const s = this.items[mod(start + k, this.items.length)];
            if (!used.has(s.id)) {
              candidate = s;
              break;
            }
          }
          if (candidate) {
            delete this.overrides[e.key];
            this.pins[e.key] = candidate.id;
            used.add(candidate.id);
            repaired = true;
          }
        }
        if (!repaired) break;
        this.invalidate();
        entries = this.collect(area);
      }
      if (repaired) this.onRepair?.();
      const seen = new Set();
      return this.collect(bounds)
        .sort(priority)
        .filter((e) => {
          if (seen.has(e.item.id) && !e.expanded) return false;
          seen.add(e.item.id);
          return true;
        });
    }
    toggle(key, width = 800) {
      const entry = this.entry(key);
      if (!entry) return;
      const previous = this.overrides[key] || {};
      const natural = entry.autoHeight || !previous.resized;
      super.toggle(key, Math.min(width, this.spreadWidth));
      const next = this.overrides[key];
      if (entry.expanded) {
        next.autoHeight = previous.closedAutoHeight !== false;
        if (next.autoHeight) delete next.h;
        this.invalidate();
      } else next.closedAutoHeight = natural;
    }
    measure(key, height) {
      const e = this.entry(key);
      if (
        !e ||
        !e.autoHeight ||
        !Number.isFinite(height) ||
        Math.abs(e.rect.h - height) < 2
      )
        return false;
      const h = clamp(Math.ceil(height), 80, 50000);
      if (e.expanded) this.overrides[key].h = h;
      else this.measured.set(e.item.id + "|" + e.rect.w, h);
      this.invalidate();
      return true;
    }
    commit(key, p, type) {
      const e = this.entry(key);
      if (!e) return;
      if (type === "move") {
        const c = this.columnAt(p.x + p.w / 2),
          r = this.rowAt(c, p.y + p.h / 2);
        return this.swap(key, c + ":" + r);
      }
      const o = this.overrides[key] || {};
      this.overrides[key] = {
        ...o,
        itemId: e.item.id,
        resized: true,
        w: clamp(p.w, 180, this.spreadWidth),
        h: clamp(p.h, 220, 50000),
        ...(Math.abs(p.h - e.rect.h) > 1 ? { autoHeight: false } : {}),
      };
      this.invalidate();
    }
    swap(a, b) {
      if (a === b) return a;
      const first = this.entry(a),
        second = this.entry(b);
      if (!first || !second || first.item.id === second.item.id) return a;
      const oa = this.overrides[a],
        ob = this.overrides[b];
      this.pins[a] = second.item.id;
      this.pins[b] = first.item.id;
      delete this.overrides[a];
      delete this.overrides[b];
      if (oa) this.overrides[b] = oa;
      if (ob) this.overrides[a] = ob;
      this.invalidate();
      return b;
    }
    move(key, dc, dr) {
      const e = this.entry(key);
      return e ? this.swap(key, e.c + dc + ":" + (e.r + dr)) : key;
    }
    find(id, point) {
      return super.find(this.aliases?.get(id) || id, point);
    }
  }
  root.BroadsheetNewspaper = { NewspaperLayout };
  if (typeof module !== "undefined") module.exports = { NewspaperLayout };
})(globalThis);
