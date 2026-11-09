/* Shared spatial browser. Domain renderers own content; this owns interaction. */
(function (root) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  class BroadsheetCanvas {
    constructor(options) {
      this.options = options;
      this.viewport = options.viewport;
      this.world = options.world;
      this.container = options.container;
      this.nodes = options.nodes || new Map();
      this.view = { x: 24, y: 20, z: 0.85 };
      this.gesture = null;
      this.pointers = new Map();
      this.frame = 0;
      this.instancePositions = {};
      this.cardResize = new ResizeObserver((entries) => {
        for (const entry of entries) this.measureExpanded(entry.target);
      });
      this.abort = new AbortController();
      const signal = this.abort.signal;
      this.viewport.addEventListener(
        "pointerdown",
        (e) => this.pointerDown(e),
        { signal },
      );
      window.addEventListener("pointermove", (e) => this.pointerMove(e), {
        signal,
      });
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
        window.addEventListener(type, (e) => this.endGesture(e), { signal });
      window.addEventListener("blur", () => this.endGesture(), { signal });
      this.viewport.addEventListener(
        "wheel",
        (e) => {
          const scroller = e.target.closest(".card-content,.detail-scroll");
          if (
            !e.ctrlKey &&
            !e.metaKey &&
            Math.abs(e.deltaY) > Math.abs(e.deltaX) &&
            scroller &&
            !scroller.closest('[data-auto-height="true"]') &&
            scroller.scrollHeight > scroller.clientHeight + 2
          )
            return;
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            const r = this.viewport.getBoundingClientRect();
            this.zoom(
              Math.exp(-e.deltaY * 0.004),
              e.clientX - r.left,
              e.clientY - r.top,
            );
          } else this.pan(-e.deltaX, -e.deltaY);
        },
        { passive: false, signal },
      );
      this.viewport.addEventListener(
        "focusin",
        (e) => {
          if (!e.target.closest("[data-instance]") || this.gesture) return;
          const target = e.target.getBoundingClientRect(),
            area = this.viewport.getBoundingClientRect();
          const dx =
            target.left < area.left + 12
              ? area.left + 12 - target.left
              : target.right > area.right - 12
                ? area.right - 12 - target.right
                : 0;
          const dy =
            target.top < area.top + 12
              ? area.top + 12 - target.top
              : target.bottom > area.bottom - 12
                ? area.bottom - 12 - target.bottom
                : 0;
          if (dx || dy) this.pan(dx, dy);
        },
        { signal },
      );
      this.resize = new ResizeObserver(() => this.request());
      this.resize.observe(this.viewport);
    }
    get atlas() {
      return this.options.getAtlas?.();
    }
    get positions() {
      return this.atlas ? this.instancePositions : this.options.getPositions();
    }
    cellKey(e, id) {
      return (
        e.currentTarget?.closest?.("[data-instance]")?.dataset.instance || id
      );
    }
    measureExpanded(node) {
      const key = node.dataset.instance;
      if (
        node.dataset.autoHeight !== "true" ||
        node.isConnected === false ||
        this.nodes.get(key) !== node
      )
        return;
      if (this.atlas?.measure(key, node.offsetHeight)) {
        // Initial, natural card measurements must not drag the camera toward
        // whichever off-screen neighbor happened to finish loading last.
        if (node.dataset.expanded === "true") this.reflow(key);
        else this.request();
        this.options.onLayout?.();
      }
    }
    reflow(anchor) {
      const before = this.instancePositions[anchor];
      const next = this.atlas?.entry(anchor)?.rect;
      if (before && next) {
        this.view.x += (before.x - next.x) * this.view.z;
        this.view.y += (before.y - next.y) * this.view.z;
      }
      this.apply();
    }
    invalidateItem(id) {
      for (const [key, node] of this.nodes)
        if (node.dataset.id === id) {
          this.cardResize.unobserve(node);
          node.remove();
          this.nodes.delete(key);
        }
      this.request();
    }
    openItem(id) {
      const center = {
        x: (this.viewport.clientWidth / 2 - this.view.x) / this.view.z,
        y: (this.viewport.clientHeight / 2 - this.view.y) / this.view.z,
      };
      return this.atlas?.find(id, center);
    }

    active() {
      return !this.options.isActive || this.options.isActive();
    }
    request() {
      if (!this.frame)
        this.frame = requestAnimationFrame(() => {
          this.frame = 0;
          this.render();
        });
    }
    place(node, p) {
      for (const k of ["left", "top", "width", "height"])
        node.style[k] =
          k === "height" && node.dataset.autoHeight === "true"
            ? "auto"
            : p[{ left: "x", top: "y", width: "w", height: "h" }[k]] + "px";
    }
    clear() {
      for (const n of this.nodes.values()) {
        this.cardResize.unobserve(n);
        n.remove();
      }
      this.nodes.clear();
      this.instancePositions = {};
    }
    apply() {
      if (this.atlas) this.view.z = clamp(this.view.z, 0.3, 2.2);
      this.world.style.transform = `translate(${this.view.x}px,${this.view.y}px) scale(${this.view.z})`;
      this.world.classList.toggle("overview", this.view.z < 0.5);
      this.world.dataset.detail =
        this.view.z < 0.5
          ? "overview"
          : this.view.z >= 1.08
            ? "detail"
            : "browse";
      this.options.onView?.(this.view);
      this.request();
    }
    render() {
      if (!this.active() || !this.viewport.clientWidth) return;
      const v = this.view,
        left = -v.x / v.z,
        top = -v.y / v.z,
        right = left + this.viewport.clientWidth / v.z,
        bottom = top + this.viewport.clientHeight / v.z,
        keep = new Set();
      if (this.atlas) {
        const entries = this.atlas.visible({
          left: left - 120,
          top: top - 120,
          right: right + 120,
          bottom: bottom + 120,
        });
        for (const entry of entries) {
          const { key, item, rect } = entry;
          keep.add(key);
          this.instancePositions[key] = { ...rect };
          let node = this.nodes.get(key);
          if (!node) {
            node = this.options.createCard(item, entry);
            node.dataset.instance = key;
            node.dataset.id = item.id;
            this.nodes.set(key, node);
            this.container.append(node);
            if (node.dataset.autoHeight === "true")
              this.cardResize.observe(node);
          }
          if (entry.expanded || node.dataset.autoHeight !== undefined) {
            node.dataset.autoHeight = String(entry.autoHeight);
            node.style.minHeight = entry.expanded && entry.autoHeight
              ? (this.atlas.overrides[key]?.closedH || this.atlas.height) +
                80 +
                "px"
              : "0px";
          }
          this.place(node, rect);
        }
        for (const [key, node] of this.nodes)
          if (
            !keep.has(key) &&
            this.gesture?.id !== key &&
            !node.contains?.(document.activeElement)
          ) {
            this.cardResize.unobserve(node);
            node.remove();
            this.nodes.delete(key);
            delete this.instancePositions[key];
          }
        this.viewport.dataset.rendered = this.nodes.size;
        document.body.dataset.rendered = this.nodes.size;
        return;
      }
      for (const item of this.options.getItems()) {
        const p = this.positions[item.id];
        if (!p) continue;
        const focused =
          document.activeElement?.closest("[data-id]")?.dataset.id === item.id;
        if (
          p.x + p.w < left - 180 ||
          p.x > right + 180 ||
          p.y + p.h < top - 180 ||
          p.y > bottom + 180
        )
          if (this.gesture?.id !== item.id && !focused) continue;
        keep.add(item.id);
        let node = this.nodes.get(item.id);
        if (!node) {
          node = this.options.createCard(item);
          this.nodes.set(item.id, node);
          this.container.append(node);
        }
        this.place(node, p);
      }
      for (const [id, node] of this.nodes)
        if (!keep.has(id)) {
          node.remove();
          this.nodes.delete(id);
        }
      this.viewport.dataset.rendered = this.nodes.size;
      document.body.dataset.rendered = this.nodes.size;
    }
    pan(x, y) {
      this.view.x += x;
      this.view.y += y;
      this.apply();
    }
    home({
      width = 400,
      height = 420,
      maxZoom = 0.85,
      availableWidth,
      availableHeight,
    } = {}) {
      const w =
        availableWidth ||
        this.viewport.clientWidth ||
        this.viewport.parentElement.clientWidth;
      const h = availableHeight || this.viewport.clientHeight || 400;
      this.view = {
        x: 24,
        y: 20,
        z: clamp(
          Math.min(maxZoom, (w - 48) / width, (h - 40) / height),
          0.25,
          1.8,
        ),
      };
      this.apply();
    }
    zoom(
      f,
      x = this.viewport.clientWidth / 2,
      y = this.viewport.clientHeight / 2,
    ) {
      const old = this.view.z,
        z = clamp(old * f, this.options.minZoom || 0.001, 2.2);
      this.view.x = x - ((x - this.view.x) * z) / old;
      this.view.y = y - ((y - this.view.y) * z) / old;
      this.view.z = z;
      this.apply();
    }
    focus(id) {
      const p = this.positions[id] || this.atlas?.entry(id)?.rect;
      if (!p) return;
      const z = clamp(
        Math.min(
          1.15,
          (this.viewport.clientWidth - 60) / p.w,
          (this.viewport.clientHeight - 50) / p.h,
        ),
        0.25,
        1.5,
      );
      this.view = {
        x: (this.viewport.clientWidth - p.w * z) / 2 - p.x * z,
        y: 24 - p.y * z,
        z,
      };
      this.apply();
    }
    fit() {
      if (this.atlas) {
        this.zoom(0.35 / this.view.z);
        return;
      }
      const ps = Object.values(this.positions);
      if (!ps.length) return;
      const x = Math.min(...ps.map((p) => p.x)),
        y = Math.min(...ps.map((p) => p.y)),
        r = Math.max(...ps.map((p) => p.x + p.w)),
        b = Math.max(...ps.map((p) => p.y + p.h));
      const z = clamp(
        Math.min(
          (this.viewport.clientWidth - 50) / (r - x),
          (this.viewport.clientHeight - 50) / (b - y),
        ),
        0.001,
        1.2,
      );
      this.view = { x: 24 - x * z, y: 24 - y * z, z };
      this.apply();
    }
    bindHandle(node, type, id) {
      node.addEventListener("pointerdown", (e) =>
        this.startGesture(e, type, id),
      );
      node.addEventListener("keydown", (e) => this.handleKeys(e, type, id));
    }
    startGesture(e, type, id) {
      id = this.cellKey(e, id);
      if (e.button !== 0 || !this.positions[id]) return;
      e.preventDefault();
      e.stopPropagation();
      this.gesture = {
        type,
        id,
        startX: e.clientX,
        startY: e.clientY,
        p: { ...this.positions[id] },
        pointer: e.pointerId,
        target: e.currentTarget,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      this.nodes.get(id)?.classList.add("selected");
    }
    handleKeys(e, type, id) {
      id = this.cellKey(e, id);
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) ||
        !this.positions[id]
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      const p = { ...this.positions[id] },
        step = e.shiftKey ? 40 : 10,
        dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0,
        dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
      if (type === "move") {
        p.x = clamp(
          p.x + dx,
          this.atlas ? -Infinity : -100000,
          this.atlas ? Infinity : 100000,
        );
        p.y = clamp(
          p.y + dy,
          this.atlas ? -Infinity : -100000,
          this.atlas ? Infinity : 100000,
        );
      } else {
        p.w = clamp(
          p.w + dx,
          this.options.minWidth || 220,
          this.atlas ? 1600 : 1000,
        );
        p.h = clamp(
          p.h + dy,
          this.options.minHeight || 260,
          this.atlas ? 50000 : 1400,
        );
      }
      this.commit(id, p, type);
    }
    commit(id, p, type) {
      if (this.atlas) {
        this.atlas.commit(id, p, type);
        this.instancePositions[id] = { ...p };
        this.reflow(id);
        this.instancePositions[id] = { ...this.atlas.entry(id).rect };
        this.options.onCommit?.(id, p);
        return;
      }
      this.positions[id] = { ...p };
      const node = this.nodes.get(id);
      if (node) this.place(node, p);
      this.options.onCommit?.(id, p);
    }
    pointerDown(e) {
      if (e.button !== 0 || e.target.closest("button,a,input,select")) return;
      const surface = e.target.closest(".card-content,.detail-scroll");
      const touchRead = e.pointerType === "touch" && surface;
      if (e.target.closest("[data-id]") && !touchRead) return;
      if (
        touchRead &&
        !surface.closest('[data-auto-height="true"]') &&
        surface.scrollHeight > surface.clientHeight + 2
      ) {
        this.gesture = {
          type: "scroll",
          scroller: surface,
          top: surface.scrollTop,
          startX: e.clientX,
          startY: e.clientY,
          pointer: e.pointerId,
          target: this.viewport,
        };
        this.viewport.setPointerCapture(e.pointerId);
        return;
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.viewport.setPointerCapture(e.pointerId);
      if (this.pointers.size === 2) {
        this.gesture = { type: "pinch" };
        return;
      }
      this.gesture = {
        type: "pan",
        startX: e.clientX,
        startY: e.clientY,
        p: { ...this.view },
        pointer: e.pointerId,
        target: this.viewport,
      };
    }
    pointerMove(e) {
      if (this.pointers.has(e.pointerId) && this.pointers.size === 2) {
        const old = [...this.pointers.values()],
          before = Math.hypot(old[0].x - old[1].x, old[0].y - old[1].y),
          cx = (old[0].x + old[1].x) / 2,
          cy = (old[0].y + old[1].y) / 2;
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pts = [...this.pointers.values()],
          distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          nx = (pts[0].x + pts[1].x) / 2,
          ny = (pts[0].y + pts[1].y) / 2,
          r = this.viewport.getBoundingClientRect();
        if (before) this.zoom(distance / before, cx - r.left, cy - r.top);
        this.pan(nx - cx, ny - cy);
        return;
      }
      if (!this.gesture || this.gesture.pointer !== e.pointerId) return;
      const g = this.gesture,
        dx = e.clientX - g.startX,
        dy = e.clientY - g.startY;
      if (this.pointers.has(e.pointerId))
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (g.type === "scroll") {
        g.scroller.scrollTop = g.top - dy;
        return;
      }
      if (g.type === "pan") {
        this.view.x = g.p.x + dx;
        this.view.y = g.p.y + dy;
        this.apply();
        return;
      }
      const p = { ...g.p };
      if (g.type === "move") {
        p.x = clamp(
          p.x + dx / this.view.z,
          this.atlas ? -Infinity : -100000,
          this.atlas ? Infinity : 100000,
        );
        p.y = clamp(
          p.y + dy / this.view.z,
          this.atlas ? -Infinity : -100000,
          this.atlas ? Infinity : 100000,
        );
      } else {
        p.w = clamp(
          p.w + dx / this.view.z,
          this.options.minWidth || 220,
          this.atlas ? 1600 : 1000,
        );
        p.h = clamp(
          p.h + dy / this.view.z,
          this.options.minHeight || 260,
          this.atlas ? 50000 : 1400,
        );
      }
      this.positions[g.id] = p;
      const node = this.nodes.get(g.id);
      if (node && g.type === "resize") node.dataset.autoHeight = "false";
      if (node) this.place(node, p);
    }
    endGesture(e) {
      if (e && this.pointers.has(e.pointerId)) {
        this.pointers.delete(e.pointerId);
        if (this.pointers.size === 1) {
          const [id, p] = [...this.pointers][0];
          this.gesture = {
            type: "pan",
            pointer: id,
            startX: p.x,
            startY: p.y,
            p: { ...this.view },
            target: this.viewport,
          };
          return;
        }
      }
      if (
        !this.gesture ||
        (e &&
          this.gesture.pointer !== undefined &&
          e.pointerId !== this.gesture.pointer)
      )
        return;
      const g = this.gesture;
      this.gesture = null;
      if (g.id) {
        this.commit(g.id, this.positions[g.id], g.type);
        this.nodes.get(g.id)?.classList.remove("selected");
      }
      if (g.target?.hasPointerCapture?.(g.pointer))
        g.target.releasePointerCapture(g.pointer);
      if (!e) this.pointers.clear();
      this.request();
    }
    destroy() {
      this.abort.abort();
      this.resize.disconnect();
      this.cardResize.disconnect();
      cancelAnimationFrame(this.frame);
      this.clear();
    }
  }
  root.BroadsheetCanvas = BroadsheetCanvas;
})(globalThis);
