/* Unbounded cell coordinates over a finite, attributed collection.
 * Event rows use a span-aware masonry skyline. Between edits, row positions
 * are calculated analytically, so far panning never builds an enormous grid.
 */
(function (root) {
  const mod = (n, m) => ((n % m) + m) % m,
    clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function parse(key) {
    const match = /^(-?\d+):(-?\d+)$/.exec(key || "");
    if (!match) return null;
    const c = Number(match[1]),
      r = Number(match[2]);
    return Number.isSafeInteger(c) && Number.isSafeInteger(r) ? { c, r } : null;
  }
  class InfiniteLayout {
    constructor(
      items,
      {
        width = 300,
        height = 420,
        variation = [0],
        gap = 22,
        overrides = {},
        pins = {},
      } = {},
    ) {
      Object.assign(this, {
        items,
        width,
        height,
        variation,
        gap,
        overrides,
        pins,
      });
      this.itemById = new Map(items.map((item) => [item.id, item]));
      for (const [key, itemId] of Object.entries(pins))
        if (!parse(key) || !this.itemById.has(itemId)) delete pins[key];
      this.stride = this.distributionStride(items.length);
      this.permutation = items.map((_, i) => i);
      this.inverse = [...this.permutation];
      this.reconcilePins();
      for (const [key, v] of Object.entries(overrides)) {
        const cell = parse(key);
        if (
          !cell ||
          !v ||
          ["w", "h", "dx", "dy"].some(
            (k) => v[k] !== undefined && !Number.isFinite(v[k]),
          )
        ) {
          delete overrides[key];
          continue;
        }
        if (
          items.length &&
          v.itemId &&
          v.itemId !== (pins[key] || this.itemAt(cell.c, cell.r).id)
        )
          delete overrides[key];
      }
      this.invalidate();
    }
    distributionStride(count) {
      if (count < 2) return 1;
      // Maximize the nearest repeated cell in both axes. A landscape viewport
      // typically spans about three times as many columns as rows. The old
      // fixed stride of seven aliased nearby diagonals regardless of catalog size.
      const aspect = Math.sqrt(3),
        target = Math.sqrt(count * 3);
      let best = 1,
        bestScore = -1;
      const rows = Math.ceil(Math.sqrt(count / 3) * 2);
      for (
        let stride = 1;
        stride <= Math.min(count - 1, Math.ceil(target * 2));
        stride++
      ) {
        let score = count / aspect;
        for (let r = 1; r <= rows; r++) {
          const residue = mod(r * stride, count);
          score = Math.min(
            score,
            Math.max(Math.min(residue, count - residue) / aspect, r * aspect),
          );
          if (score < bestScore - 1e-9) break;
        }
        if (
          score > bestScore + 1e-9 ||
          (Math.abs(score - bestScore) < 1e-9 &&
            Math.abs(stride - target) < Math.abs(best - target))
        ) {
          best = stride;
          bestScore = score;
        }
      }
      return best;
    }
    indexAt(c, r) {
      return mod(c + r * this.stride, this.items.length);
    }
    itemAt(c, r) {
      return this.items[this.permutation[this.indexAt(c, r)]];
    }
    reconcilePins() {
      const byId = new Map(this.items.map((item, i) => [item.id, i]));
      const occupied = new Set(),
        assigned = new Set();
      // Edited/open cards take priority, then the most recently retained cells.
      // Pins permute the deck instead of adding extra copies of those films.
      const pins = Object.entries(this.pins)
        .reverse()
        .sort(
          ([a], [b]) =>
            Number(!!this.overrides[b]) - Number(!!this.overrides[a]),
        );
      for (const [key, id] of pins) {
        const cell = parse(key),
          index = this.indexAt(cell.c, cell.r),
          wanted = byId.get(id);
        if (occupied.has(index) || assigned.has(wanted)) {
          if (!this.overrides[key]) delete this.pins[key];
          continue;
        }
        const previous = this.permutation[index],
          from = this.inverse[wanted];
        this.permutation[index] = wanted;
        this.permutation[from] = previous;
        this.inverse[wanted] = index;
        this.inverse[previous] = from;
        occupied.add(index);
        assigned.add(wanted);
      }
    }
    baseHeight(c, r) {
      return (
        this.height + this.variation[mod(r + c * 3, this.variation.length)]
      );
    }
    baseY(c, r) {
      const len = this.variation.length,
        cycle = this.variation.reduce(
          (n, v) => n + this.height + v + this.gap,
          0,
        );
      let y = Math.floor(r / len) * cycle;
      for (let i = 0; i < mod(r, len); i++)
        y += this.baseHeight(c, i) + this.gap;
      return y;
    }
    x(c) {
      return c * (this.width + this.gap);
    }
    columnWidth() {
      return this.width;
    }
    size(c, r) {
      const o = this.overrides[c + ":" + r] || {};
      return {
        w: clamp(o.w || this.width, 220, 1600),
        h: clamp(o.h || this.baseHeight(c, r), 220, 50000),
        dx: clamp(o.dx || 0, -100000, 100000),
        dy: clamp(o.dy || 0, -100000, 100000),
      };
    }
    span(c, size) {
      const x = this.x(c) + size.dx;
      return {
        first: Math.min(c, Math.floor(x / (this.width + this.gap))),
        last: Math.max(
          c,
          Math.floor((x + size.w - 0.001) / (this.width + this.gap)),
        ),
      };
    }
    invalidate() {
      this.cells = new Map();
      this.timelines = new Map();
      this.extraY = new Map();
      const edits = Object.keys(this.overrides)
        .map((key) => {
          const cell = parse(key);
          if (!cell) return null;
          return {
            ...cell,
            key,
            ...this.span(cell.c, this.size(cell.c, cell.r)),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.first - b.first);
      const groups = [];
      for (const edit of edits) {
        const last = groups.at(-1);
        if (last && edit.first <= last.last) {
          last.last = Math.max(last.last, edit.last);
          last.edits.push(edit);
        } else
          groups.push({ first: edit.first, last: edit.last, edits: [edit] });
      }
      for (const group of groups) {
        const rows = [...new Set(group.edits.map((e) => e.r))].sort(
            (a, b) => a - b,
          ),
          sky = new Map();
        let cursor = rows[0];
        for (let c = group.first; c <= group.last; c++)
          sky.set(c, this.baseY(c, cursor));
        for (const r of rows) {
          for (let c = group.first; c <= group.last; c++)
            sky.set(c, sky.get(c) + this.baseY(c, r) - this.baseY(c, cursor));
          for (let c = group.first; c <= group.last; c++) {
            const size = this.size(c, r),
              span = this.span(c, size),
              x = this.x(c) + size.dx;
            let y = -Infinity;
            for (let at = span.first; at <= span.last; at++)
              y = Math.max(y, sky.get(at) ?? this.baseY(at, r));
            y += Math.max(0, size.dy);
            const rect = { x, y, w: size.w, h: size.h };
            this.cells.set(c + ":" + r, rect);
            for (let at = span.first; at <= span.last; at++)
              sky.set(at, y + size.h + this.gap + Math.max(0, -size.dy));
          }
          cursor = r + 1;
          for (let c = group.first; c <= group.last; c++) {
            const offset = sky.get(c) - this.baseY(c, cursor),
              list = this.timelines.get(c) || [];
            list.push({ from: cursor, offset });
            this.timelines.set(c, list);
            this.extraY.set(
              c,
              Math.max(this.extraY.get(c) || 0, Math.abs(offset)),
            );
          }
        }
      }
    }
    offset(c, r) {
      const list = this.timelines.get(c) || [];
      let low = 0,
        high = list.length - 1,
        result = 0;
      while (low <= high) {
        const i = (low + high) >> 1;
        if (list[i].from <= r) {
          result = list[i].offset;
          low = i + 1;
        } else high = i - 1;
      }
      return result;
    }
    y(c, r) {
      return (
        this.cells.get(c + ":" + r)?.y ?? this.baseY(c, r) + this.offset(c, r)
      );
    }
    rowHeight(c, r) {
      return this.size(c, r).h;
    }
    columnAt(x) {
      return Math.floor(x / (this.width + this.gap));
    }
    rowAt(c, y) {
      const extra =
        (this.extraY.get(c) || 0) +
        Math.abs(y) * 0.3 +
        this.variation.reduce((n, v) => n + Math.abs(v), 0);
      let low = Math.floor((y - extra) / (this.height + this.gap)) - 5,
        high = Math.ceil((y + extra) / (this.height + this.gap)) + 5;
      while (low <= high) {
        const r = Math.floor((low + high) / 2),
          start = this.y(c, r);
        if (y < start) high = r - 1;
        else if (y >= start + this.rowHeight(c, r) + this.gap) low = r + 1;
        else return r;
      }
      return low;
    }
    entry(key) {
      const cell = parse(key);
      if (!cell || !this.items.length) return null;
      const { c, r } = cell,
        o = this.overrides[key] || {},
        size = this.size(c, r);
      return {
        key,
        c,
        r,
        item: this.itemById.get(this.pins[key]) || this.itemAt(c, r),
        expanded: !!o.expanded,
        autoHeight: o.autoHeight !== false,
        rect: this.cells.get(key) || {
          x: this.x(c),
          y: this.y(c, r),
          w: size.w,
          h: size.h,
        },
      };
    }
    visible({ left, top, right, bottom }) {
      if (!this.items.length) return [];
      const result = [],
        seen = new Set(),
        add = (entry) => {
          const p = entry.rect;
          if (
            !seen.has(entry.key) &&
            p.x + p.w >= left &&
            p.x <= right &&
            p.y + p.h >= top &&
            p.y <= bottom
          ) {
            result.push(entry);
            seen.add(entry.key);
          }
        };
      for (
        let c = this.columnAt(left) - 1;
        this.x(c) <= right + this.width;
        c++
      )
        for (
          let r = this.rowAt(c, top) - 1;
          this.y(c, r) <= bottom + this.height;
          r++
        )
          add(this.entry(c + ":" + r));
      // A wide/moved card can extend into view from a column outside the viewport.
      for (const key of Object.keys(this.overrides)) add(this.entry(key));
      return result;
    }
    intersects(a, b) {
      return (
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
      );
    }
    commit(key, p, type) {
      const before = this.entry(key);
      if (!before) return;
      const o = this.overrides[key] || {};
      this.overrides[key] = {
        ...o,
        itemId: before.item.id,
        dx: (o.dx || 0) + p.x - before.rect.x,
        dy: (o.dy || 0) + p.y - before.rect.y,
        w: p.w,
        h: p.h,
        ...(type === "resize" && Math.abs(p.h - before.rect.h) > 1
          ? { autoHeight: false }
          : {}),
      };
      this.invalidate();
    }
    toggle(key, width = 760) {
      const e = this.entry(key);
      if (!e) return;
      const o = this.overrides[key] || {};
      this.overrides[key] = o.expanded
        ? {
            ...o,
            itemId: e.item.id,
            expanded: false,
            w: o.closedW || this.width,
            h: o.closedH || this.baseHeight(e.c, e.r),
            autoHeight: false,
          }
        : {
            ...o,
            itemId: e.item.id,
            expanded: true,
            closedW: e.rect.w,
            closedH: e.rect.h,
            w: Math.max(width, e.rect.w),
            h: Math.max(800, e.rect.h),
            autoHeight: true,
          };
      this.invalidate();
    }
    measure(key, height) {
      const o = this.overrides[key];
      if (
        !o?.expanded ||
        o.autoHeight === false ||
        !Number.isFinite(height) ||
        Math.abs((o.h || 0) - height) < 2
      )
        return false;
      o.h = clamp(Math.ceil(height), 220, 50000);
      this.invalidate();
      return true;
    }
    find(itemId, point = { x: 0, y: 0 }) {
      const sourceIndex = this.items.findIndex((i) => i.id === itemId);
      if (sourceIndex < 0) return null;
      const index = this.inverse[sourceIndex];
      const centerC = this.columnAt(point.x),
        centerR = this.rowAt(centerC, point.y),
        n = this.items.length;
      let best = null,
        distance = Infinity;
      for (
        let r = centerR - Math.min(32, n);
        r <= centerR + Math.min(32, n);
        r++
      ) {
        const residue = mod(index - r * this.stride, n),
          c = residue + Math.round((centerC - residue) / n) * n,
          e = this.entry(c + ":" + r),
          p = e.rect,
          d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
        if (e.item.id === itemId && d < distance) {
          best = e;
          distance = d;
        }
      }
      for (const [key, pinned] of Object.entries(this.pins)) {
        if (pinned !== itemId) continue;
        const entry = this.entry(key),
          p = entry.rect;
        const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
        if (d < distance) {
          best = entry;
          distance = d;
        }
      }
      return best;
    }
  }
  const api = { InfiniteLayout, parse, mod };
  root.BroadsheetSpatial = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
