/* A repeating newspaper made from real story-sized, collision-free spreads.
 * Spreads are analytical in every quadrant; only edited spreads are repacked.
 */
(function (root) {
  const mod = (n, m) => ((n % m) + m) % m,
    clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const parse = (key) => {
    const m = /^(-?\d+):(-?\d+):(\d+)$/.exec(key || "");
    return m ? { c: Number(m[1]), r: Number(m[2]), i: Number(m[3]) } : null;
  };
  class NewspaperLayout {
    constructor(
      items,
      { unit = 240, columns = 6, gap = 18, overrides = {}, geography } = {},
    ) {
      Object.assign(this, { items, unit, columns, gap, overrides, geography });
      this.measured = new Map();
      this.width = unit * 2 + gap;
      this.height = 420;
      this.spreadWidth = columns * (unit + gap) - gap;
      this.pitch = this.spreadWidth + gap * 2;
      this.chunks = [];
      for (let i = 0; i < items.length; i += 12)
        this.chunks.push(items.slice(i, i + 12));
      this.stride = 5;
      while (this.gcd(this.stride, Math.max(1, this.chunks.length)) !== 1)
        this.stride += 2;
      for (const [key, o] of Object.entries(overrides)) {
        const cell = parse(key),
          item = cell && this.chunk(cell.c, cell.r)?.[cell.i];
        if (
          !item ||
          !o ||
          o.itemId !== item.id ||
          ["w", "h", "column", "order"].some(
            (k) => o[k] !== undefined && !Number.isFinite(o[k]),
          )
        )
          delete overrides[key];
      }
      this.blueprints = this.chunks.map((items) => this.pack(items));
      this.cycle =
        this.blueprints.reduce((n, p) => n + p.height + gap * 2, 0) || 1;
      this.invalidate();
    }
    gcd(a, b) {
      while (b) [a, b] = [b, a % b];
      return a;
    }
    chunk(c, r) {
      return this.chunks[mod(r + c * this.stride, this.chunks.length)];
    }
    blueprint(c, r) {
      return this.blueprints[mod(r + c * this.stride, this.chunks.length)];
    }
    pack(items, c, r) {
      const sky = Array(this.columns).fill(0),
        entries = [];
      const order = items
        .map((item, i) => ({
          item,
          i,
          o: c === undefined ? {} : this.overrides[`${c}:${r}:${i}`] || {},
        }))
        .sort((a, b) => (a.o.order ?? a.i) - (b.o.order ?? b.i) || a.i - b.i);
      for (const { item, i, o } of order) {
        const p = root.BroadsheetNews.profile(item, {
          unit: this.unit,
          columns: this.columns,
          geography: this.geography,
        });
        const w = clamp(o.w || p.width, 180, this.spreadWidth),
          h = clamp(
            o.h || this.measured.get(item.id + "|" + w) || p.height,
            220,
            50000,
          ),
          span = Math.min(
            this.columns,
            Math.ceil((w + this.gap) / (this.unit + this.gap)),
          );
        let best = 0,
          y = Infinity;
        for (let at = 0; at <= this.columns - span; at++) {
          const level = Math.max(...sky.slice(at, at + span));
          const preference =
            o.column === undefined ? 0 : Math.abs(at - o.column) * 0.001;
          if (level + preference < y) {
            y = level + preference;
            best = at;
          }
        }
        if (o.column !== undefined)
          best = clamp(o.column, 0, this.columns - span);
        y = Math.max(...sky.slice(best, best + span));
        const rect = { x: best * (this.unit + this.gap), y, w, h };
        entries[i] = { item, rect, profile: p };
        for (let at = best; at < best + span; at++) sky[at] = y + h + this.gap;
      }
      return { entries, height: Math.max(0, ...sky) - this.gap };
    }
    invalidate() {
      this.edits = new Map();
      this.deltas = new Map();
      for (const key of Object.keys(this.overrides)) {
        const p = parse(key);
        if (!p) continue;
        const macro = `${p.c}:${p.r}`;
        if (!this.edits.has(macro))
          this.edits.set(macro, this.pack(this.chunk(p.c, p.r), p.c, p.r));
      }
      for (const [macro, packed] of this.edits) {
        const [c, r] = macro.split(":").map(Number);
        if (!this.deltas.has(c)) this.deltas.set(c, new Map());
        this.deltas.get(c).set(r, packed.height - this.blueprint(c, r).height);
      }
    }
    baseY(c, r) {
      const n = this.chunks.length;
      if (!n) return 0;
      let y = Math.floor(r / n) * this.cycle;
      for (let i = 0; i < mod(r, n); i++)
        y += this.blueprint(c, i).height + this.gap * 2;
      return y;
    }
    y(c, r) {
      let y = this.baseY(c, r);
      for (const [at, delta] of this.deltas.get(c) || [])
        if (r >= 0 && at >= 0 && at < r) y += delta;
        else if (r < 0 && at >= r && at < 0) y -= delta;
      return y;
    }
    x(c) {
      return c * this.pitch;
    }
    rowAt(c, y) {
      const average = this.cycle / Math.max(1, this.chunks.length);
      let lo = Math.floor(y / average) - 2,
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
        const mid = Math.ceil((lo + hi) / 2);
        if (this.y(c, mid) <= y) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    }
    entry(key) {
      const p = parse(key);
      if (!p || !this.chunks.length) return null;
      const packed =
          this.edits.get(`${p.c}:${p.r}`) || this.blueprint(p.c, p.r),
        cell = packed.entries[p.i];
      if (!cell) return null;
      const o = this.overrides[key] || {};
      return {
        key,
        ...p,
        item: cell.item,
        profile: cell.profile,
        expanded: !!o.expanded,
        autoHeight: o.autoHeight !== false,
        rect: {
          ...cell.rect,
          x: this.x(p.c) + cell.rect.x,
          y: this.y(p.c, p.r) + cell.rect.y,
        },
      };
    }
    visible({ left, top, right, bottom }) {
      if (!this.chunks.length) return [];
      const found = [];
      for (
        let c = Math.floor(left / this.pitch) - 1;
        c <= Math.floor(right / this.pitch) + 1;
        c++
      )
        for (let r = this.rowAt(c, top); this.y(c, r) <= bottom; r++) {
          const items = this.chunk(c, r);
          for (let i = 0; i < items.length; i++) {
            const e = this.entry(`${c}:${r}:${i}`);
            if (
              this.intersects(e.rect, {
                x: left,
                y: top,
                w: right - left,
                h: bottom - top,
              })
            )
              found.push(e);
          }
        }
      return found;
    }
    intersects(a, b) {
      return (
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
      );
    }
    toggle(key, width = 800) {
      const e = this.entry(key);
      if (!e) return;
      const o = this.overrides[key] || {};
      this.overrides[key] = o.expanded
        ? {
            ...o,
            expanded: false,
            w: o.closedW || e.profile.width,
            h: o.closedH || e.profile.height,
            autoHeight: false,
          }
        : {
            ...o,
            itemId: e.item.id,
            expanded: true,
            closedW: e.rect.w,
            closedH: e.rect.h,
            w: Math.min(this.spreadWidth, Math.max(width, e.rect.w)),
            h: Math.max(850, e.rect.h),
            autoHeight: true,
          };
      this.invalidate();
    }
    measure(key, height) {
      const e = this.entry(key),
        o = this.overrides[key];
      if (
        !e ||
        o?.autoHeight === false ||
        !Number.isFinite(height) ||
        Math.abs(e.rect.h - height) < 2
      )
        return false;
      if (o) {
        o.h = clamp(Math.ceil(height), 220, 50000);
      } else {
        this.measured.set(
          e.item.id + "|" + e.rect.w,
          clamp(Math.ceil(height), 220, 50000),
        );
        this.blueprints = this.chunks.map((items) => this.pack(items));
        this.cycle =
          this.blueprints.reduce((n, p) => n + p.height + this.gap * 2, 0) || 1;
      }
      this.invalidate();
      return true;
    }
    commit(key, p, type) {
      const e = this.entry(key);
      if (!e) return;
      const o = this.overrides[key] || {};
      this.overrides[key] = {
        ...o,
        itemId: e.item.id,
        w: clamp(p.w, 180, this.spreadWidth),
        h: p.h,
        ...(type === "move"
          ? {
              column: clamp(
                Math.round((p.x - this.x(e.c)) / (this.unit + this.gap)),
                0,
                this.columns - 1,
              ),
              order: (o.order ?? e.i) + (p.y - e.rect.y) / 240,
            }
          : {}),
        ...(type === "resize" && Math.abs(p.h - e.rect.h) > 1
          ? { autoHeight: false }
          : {}),
      };
      this.invalidate();
    }
    find(itemId, point = { x: 0, y: 0 }) {
      let chunk = -1,
        index = -1;
      this.chunks.some((items, i) => {
        index = items.findIndex((s) => s.id === itemId);
        if (index >= 0) {
          chunk = i;
          return true;
        }
        return false;
      });
      if (chunk < 0) return null;
      let best = null,
        distance = Infinity,
        center = Math.floor(point.x / this.pitch);
      for (let c = center - 2; c <= center + 2; c++) {
        const near = this.rowAt(c, point.y),
          residue = mod(chunk - c * this.stride, this.chunks.length),
          r =
            residue +
            Math.round((near - residue) / this.chunks.length) *
              this.chunks.length,
          e = this.entry(`${c}:${r}:${index}`),
          d = (e.rect.x - point.x) ** 2 + (e.rect.y - point.y) ** 2;
        if (d < distance) {
          best = e;
          distance = d;
        }
      }
      return best;
    }
  }
  root.BroadsheetNewspaper = { NewspaperLayout };
  if (typeof module !== "undefined") module.exports = { NewspaperLayout };
})(globalThis);
