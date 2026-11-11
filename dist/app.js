const $ = (s) => document.querySelector(s),
  M = window.BroadsheetModel,
  N = window.BroadsheetNews,
  V = window.BroadsheetNewsView;
const viewport = $("#viewport"),
  world = $("#world"),
  STORE = "broadsheet.workspace.v3";
const defaults = {
  sourceCatalogVersion: 2,
  sources: [
    "globalvoices",
    "eff",
    "guardian",
    "aljazeera",
    "lemonde",
    "nasa",
    "verge",
    "ars",
    "sciencedaily",
    "guardian-food",
  ],
  interests: ["World", "Space", "Technology", "AI", "Cooking"],
  topics: [],
  filterSources: [],
  query: "",
  saved: [],
  savedStories: [],
  savedSources: [],
  openCards: [],
  savedOnly: false,
  activeChannel: null,
  sort: "latest",
  size: "comfortable",
  mode: "canvas",
  layouts: {},
  atlasLayouts: {},
  pressLayouts: {},
  pressPins: {},
  media: "all",
  channels: [
    {
      id: "space-science",
      name: "Space & science",
      topics: ["Space", "Science"],
      sources: [],
    },
    {
      id: "tech-ai",
      name: "Tech & AI",
      topics: ["Technology", "AI"],
      sources: [],
    },
    {
      id: "the-kitchen",
      name: "The kitchen",
      topics: ["Cooking"],
      sources: [],
    },
  ],
  customSources: [],
  customStories: [],
};
let state = structuredClone(defaults),
  catalog = [],
  stories = [],
  edition = {},
  geography = { countries: [] },
  layoutSaveTimer,
  filtered = [],
  nodes = new Map(),
  positions = {},
  atlas,
  atlasKey,
  view = { x: 26, y: 18, z: 0.85 },
  toastTimer,
  editingChannel = null,
  refreshAvailable = false,
  storageOK = true;
try {
  const stored = JSON.parse(localStorage.getItem(STORE) || "null");
  if (stored && typeof stored === "object") {
    for (const key of Object.keys(defaults))
      if (
        Array.isArray(defaults[key])
          ? Array.isArray(stored[key])
          : typeof defaults[key] === "object"
            ? stored[key] && typeof stored[key] === "object"
            : typeof stored[key] === typeof defaults[key]
      )
        state[key] = stored[key];
    if ((stored.sourceCatalogVersion || 0) < 2) {
      state.sources = [...new Set([...state.sources, "globalvoices", "eff"])];
      state.filterSources = state.filterSources.filter((id) => id !== "bbc");
      state.sourceCatalogVersion = 2;
    }
    state.activeChannel =
      typeof stored.activeChannel === "string" ? stored.activeChannel : null;
    state.layouts = Object.fromEntries(
      Object.entries(state.layouts).map(([k, v]) => [k, M.cleanLayout(v)]),
    );
  }
} catch {
  storageOK = false;
}
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function safeURL(value) {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}
function imageURL(value) {
  return N.publicURL(value);
}
function date(value, year = false) {
  const d = new Date(value);
  return Number.isFinite(+d)
    ? d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        ...(year ? { year: "numeric" } : {}),
      })
    : "Undated";
}
function timestamp(value) {
  const d = new Date(value);
  return Number.isFinite(+d)
    ? d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "not yet fetched";
}
function source(id) {
  return (
    catalog.find((s) => s.id === id) ||
    state.savedSources.find((s) => s.id === id) || {
      id,
      name: "Unknown source",
      short: "?",
      color: "#737e68",
      topics: [],
      region: "Unknown",
      kind: "Imported feed",
    }
  );
}
function avatar(s) {
  const a = el("span", "source-avatar", s.short);
  a.style.setProperty("--source-color", s.color);
  return a;
}
function persist() {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
    storageOK = true;
    $("#storage-status").textContent = "WORKSPACE SAVED ON THIS DEVICE";
  } catch {
    storageOK = false;
    $("#storage-status").textContent =
      "WORKSPACE NOT SAVED · STORAGE UNAVAILABLE";
    toast(
      "Browser storage is unavailable or full. Changes will last only for this session.",
    );
  }
}
function toast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 5500);
}
function showDialog(id) {
  $(id).showModal();
}
function closeNav() {
  document.body.classList.remove("sidebar-open");
  $("#menu-toggle").setAttribute("aria-expanded", "false");
}
function channel() {
  return state.channels.find((c) => c.id === state.activeChannel);
}
function selection() {
  const c = channel();
  let sources = state.savedOnly
    ? [
        ...new Set([
          ...state.sources,
          ...state.savedStories.map((s) => s.sourceId),
        ]),
      ]
    : state.sources;
  if (c?.sources.length)
    sources = sources.filter((id) => c.sources.includes(id));
  if (state.filterSources.length)
    sources = sources.filter((id) => state.filterSources.includes(id));
  return {
    ...state,
    sources,
    topics: state.topics.length ? state.topics : c?.topics || [],
  };
}
function layoutKey() {
  return [
    "press-v2",
    innerWidth <= 600 ? 2 : 6,
    state.size,
    state.sort,
    state.query,
    state.media,
    state.activeChannel || "all",
    state.savedOnly ? "saved" : "",
    state.topics.join(","),
    state.filterSources.join(","),
  ].join("|");
}
function clearNodes() {
  canvas.clear();
}
function setView({
  topics = [],
  sources = [],
  saved = false,
  active = null,
} = {}) {
  state.topics = topics;
  state.filterSources = sources;
  state.savedOnly = saved;
  state.activeChannel = active;
  state.query = "";
  state.media = "all";
  $("#news-media-filter").value = "all";
  $("#search").value = "";
  closeNav();
  update(true);
}
function rebuildAtlas() {
  const currentKey = layoutKey(),
    legacy = state.pressLayouts[currentKey.replace("press-v2|", "press-v1|")];
  const fresh = !state.pressLayouts[currentKey];
  state.pressLayouts[currentKey] ??= {};
  state.pressPins[currentKey] ??= {};
  if (atlas && atlasKey === currentKey)
    for (const key of new Set([
      ...Object.keys(canvas.instancePositions),
      ...Object.keys(atlas.overrides),
    ])) {
      const entry = atlas.entry(key);
      if (entry) state.pressPins[currentKey][key] = entry.item.id;
    }
  atlas = new window.BroadsheetNewspaper.NewspaperLayout(
    N.editionOrder(filtered),
    {
      unit:
        innerWidth <= 600
          ? state.size === "compact"
            ? 160
            : state.size === "large"
              ? 220
              : 180
          : state.size === "compact"
            ? 200
            : state.size === "large"
              ? 290
              : 240,
      columns: innerWidth <= 600 ? 2 : 6,
      geography,
      overrides: state.pressLayouts[currentKey],
      pins: state.pressPins[currentKey],
      onRepair: () => {
        clearTimeout(layoutSaveTimer);
        layoutSaveTimer = setTimeout(persist, 350);
      },
    },
  );
  atlasKey = currentKey;
  if (fresh && legacy)
    for (const o of Object.values(legacy)) {
      if (!o?.itemId) continue;
      const entry = atlas.find(o.itemId);
      if (entry) {
        atlas.pins[entry.key] = entry.item.id;
        atlas.overrides[entry.key] = {
          ...o,
          itemId: entry.item.id,
          reportId:
            o.reportId || (o.itemId !== entry.item.id ? o.itemId : undefined),
        };
      }
    }
  if (fresh && legacy) atlas.invalidate();
}
function update(reset = false) {
  filtered = M.filter(stories, selection()).filter((s) => {
    if (state.media === "all") return true;
    if (state.media === "maps") return N.locations(s, geography).length > 0;
    if (state.media === "depth") return s.wordCount > 600;
    return N.media(s).some(
      (m) => m.type === (state.media === "photos" ? "image" : "video"),
    );
  });
  rebuildAtlas();
  clearNodes();
  sidebar();
  heading();
  if (reset) home();
  else queue();
  renderList();
  setMode(state.mode, false);
  persist();
}
function heading() {
  const c = channel(),
    s = state.filterSources[0];
  let title = state.savedOnly
    ? "Saved for later"
    : c
      ? c.name
      : s
        ? state.filterSources.length > 1
          ? "Selected sources"
          : source(s).name
        : state.topics.length
          ? state.topics.join(" + ")
          : "All stories";
  $("#view-title").replaceChildren(
    document.createTextNode(title),
    el("span", "", "."),
  );
  $("#view-eyebrow").textContent = state.savedOnly
    ? "YOUR NEXT GOOD READ"
    : c
      ? "YOUR PERSONAL CHANNEL"
      : state.topics.length
        ? "FOLLOW YOUR CURIOSITY"
        : "THE OPEN EDITION";
  $("#view-description").textContent = state.savedOnly
    ? "Good stories, kept close. Saved on this device."
    : c
      ? "Your chosen topics and sources, together in one place."
      : "Different sources. More perspectives. A space to make your own.";
  const count = new Set(filtered.map((s) => s.sourceId)).size;
  $("#edition-status").textContent =
    `${filtered.length} ${filtered.length === 1 ? "story" : "stories"}${atlas.items.length < filtered.length ? " · " + atlas.items.length + " cards" : ""} · ${count} ${count === 1 ? "feed" : "feeds"}${state.query ? " · matching “" + state.query + "”" : ""}`;
  $("#clear-filters").hidden = !(
    state.topics.length ||
    state.filterSources.length ||
    state.query ||
    state.savedOnly ||
    state.activeChannel ||
    state.media !== "all"
  );
  $("#empty-state").hidden = filtered.length > 0;
  $("#empty-message").textContent =
    state.sources.length === 0
      ? "Follow a source in the source library to start your edition."
      : state.savedOnly
        ? "Use “Save” on any story to keep it here."
        : "No saved stories match this view. Try another topic, follow a source, or refresh feeds.";
  $("#status").textContent =
    `${filtered.length} stories · ${state.mode === "canvas" ? "Endless canvas · collection repeats" : "Reading list"}`;
  $("#all-count").textContent = stories.filter((s) =>
    state.sources.includes(s.sourceId),
  ).length;
  $("#saved-count").textContent = state.saved.length;
}
function sidebar() {
  const all =
    !state.activeChannel &&
    !state.topics.length &&
    !state.filterSources.length &&
    !state.savedOnly;
  $("#all-news").classList.toggle("active", all);
  $("#saved-news").classList.toggle("active", state.savedOnly);
  $("#channels").replaceChildren(
    ...state.channels.map((c) => {
      const row = el("div", "channel-row"),
        b = el(
          "button",
          "side-link" + (state.activeChannel === c.id ? " active" : ""),
        );
      b.append(el("span", "", "#"), el("span", "", c.name));
      b.onclick = () => setView({ active: c.id });
      const edit = el("button", "channel-edit", "⋯");
      edit.setAttribute("aria-label", "Edit channel " + c.name);
      edit.onclick = () => openChannel(c);
      row.append(b, edit);
      return row;
    }),
  );
  $("#topic-list").replaceChildren(
    ...state.interests.map((t) => {
      const b = el(
        "button",
        "side-link" + (state.topics.includes(t) ? " active" : ""),
      );
      b.append(el("span", "", "◦"), el("span", "", t));
      b.onclick = () => setView({ topics: [t] });
      return b;
    }),
  );
  $("#source-list").replaceChildren(
    ...catalog
      .filter((s) => state.sources.includes(s.id))
      .map((s) => {
        const b = el(
          "button",
          "side-link source-link-row" +
            (state.filterSources.includes(s.id) ? " active" : ""),
        );
        b.append(avatar(s), document.createTextNode(s.name));
        b.onclick = () => setView({ sources: [s.id] });
        return b;
      }),
  );
  $("#source-summary").textContent =
    `${state.sources.length} feeds in your reading room`;
  $("#topic-chips").replaceChildren(
    ...["All topics", ...state.interests].map((t, i) => {
      const active =
          i === 0 ? !selection().topics.length : selection().topics.includes(t),
        b = el("button", "chip" + (active ? " active" : ""), t);
      b.setAttribute("aria-pressed", active);
      b.onclick = () => {
        if (i === 0)
          setView({ sources: channel()?.sources || state.filterSources });
        else
          setView({
            topics: [t],
            sources: channel()?.sources || state.filterSources,
          });
      };
      return b;
    }),
  );
}
function place(n, p) {
  n.style.left = p.x + "px";
  n.style.top = p.y + "px";
  n.style.width = p.w + "px";
  n.style.height = p.h + "px";
}
function makeCard(s, instance) {
  const reports = s.coverage || [s];
  const selected = instance && atlas.overrides[instance.key]?.reportId;
  if (instance?.expanded && selected)
    s = reports.find((r) => r.id === selected) || s;
  const pub = source(s.sourceId),
    card = el("article", "story press-story");
  const profile = instance?.profile || N.profile(s, { geography });
  card.dataset.shape = profile.shape;
  card.dataset.autoHeight = String(instance?.autoHeight !== false);
  card.style.setProperty("--headline-size", profile.headlineSize + "px");
  card.style.setProperty("--cover-height", profile.coverHeight + "px");
  card.dataset.id = s.id;
  card.dataset.reportId = s.id;
  card.setAttribute("aria-label", s.title);
  const top = el("div", "card-top");
  const move = el("button", "move-handle", "⠿");
  move.setAttribute("aria-label", "Move article: " + s.title);
  move.title = "Drag to swap positions · Arrow keys when focused";
  move.onpointerdown = (e) => startGesture(e, "move", s.id);
  move.onkeydown = (e) => handleKeys(e, "move", s.id);
  top.append(avatar(pub), el("span", "card-source", pub.name));
  const time = el("time", "", date(s.date));
  if (Number.isFinite(Date.parse(s.date))) time.dateTime = s.date;
  time.title = date(s.date, true);
  top.append(time, move);
  if (instance?.expanded) {
    const fold = el("button", "fold-story", "− Fold");
    fold.setAttribute("aria-label", "Collapse " + s.title);
    fold.onclick = () => openReader(s, instance.key);
    top.append(fold);
  }
  card.append(top);
  const content = el("div", "card-content");
  const tags = M.tags(s);
  content.append(el("div", "eyebrow", tags.join(" / ") || "FROM YOUR SOURCES"));
  const unfolded = !!instance?.expanded;
  if (unfolded) {
    card.classList.add("spatial-expanded");
    card.dataset.expanded = "true";
    card.dataset.autoHeight = String(instance.autoHeight);
  }
  if (!unfolded) {
    const cover = V.cover(s, profile, () => openReader(s, instance?.key));
    if (cover) content.prepend(cover);
  }
  const headline = el("button", "headline", s.title);
  headline.onclick = () => openReader(s, instance?.key);
  content.append(headline);
  if (reports.length > 1) {
    const coverage = el("section", "coverage-reports");
    coverage.append(
      el("span", "", `Shared photo · ${reports.length} source reports`),
    );
    for (const report of reports) {
      const b = el("button", "", source(report.sourceId).name);
      b.setAttribute(
        "aria-label",
        "Read " + source(report.sourceId).name + " report: " + report.title,
      );
      b.setAttribute("aria-pressed", String(s.id === report.id));
      b.onclick = () => selectCoverage(report, instance?.key);
      coverage.append(b);
    }
    content.append(coverage);
  }
  if (unfolded) {
    const body = el("div", "inline-body");
    body.append(V.videos(s));
    if (!s.blocks?.length && !N.media(s).some((m) => m.type === "video"))
      for (const image of N.media(s).filter((m) => m.type === "image"))
        body.append(figure(image));
    for (const b of s.blocks || []) {
      if (b.type === "image" && imageURL(b.src)) body.append(figure(b));
      else if (b.text)
        body.append(el(b.type === "heading" ? "h3" : "p", "", b.text));
    }
    if (!s.blocks?.some((block) => block.text))
      body.append(window.BroadsheetArticleReader.mount(s));
    const link = el("a", "source-link", "Original story ↗");
    link.href = safeURL(s.url);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    body.append(link);
    if (s.rights) body.append(el("p", "small", s.rights));
    body.append(
      V.context(s, {
        publisher: pub,
        stories,
        open: openReader,
        collectedAt: health(s.sourceId)?.retrievedAt || edition.retrievedAt,
      }),
    );
    content.append(body);
  } else
    content.append(
      el(
        "p",
        "excerpt",
        s.excerpt || "Open this story at its publisher to read more.",
      ),
    );
  if (!unfolded) {
    const context = el("div", "reading-context");
    for (const label of [
      profile.clip ? "▶ Video report" : "",
      profile.sharedPhoto ? "Photo in full story" : "",
      profile.places.length ? "◉ Regional context" : "",
      s.wordCount ? Math.ceil(s.wordCount / 220) + " min read" : "",
      N.related(s, stories, 1).length ? "Related headlines" : "",
    ].filter(Boolean)) {
      const b = el("button", "", label);
      b.onclick = () => openReader(s, instance?.key);
      context.append(b);
    }
    content.append(context);
  }
  const kind = el("div", "card-kind", pub.kind + " · " + pub.region);
  const tagList = el("div", "card-tags");
  for (const t of tags.slice(0, 3)) tagList.append(el("span", "", t));
  content.append(kind, tagList);
  card.append(content);
  const bottom = el("div", "card-bottom"),
    read = el(
      "button",
      "read-button",
      unfolded ? "− Fold story" : "+ Unfold story",
    );
  read.onclick = () => openReader(s, instance?.key);
  const save = el(
    "button",
    "save-button" + (state.saved.includes(s.id) ? " saved" : ""),
    state.saved.includes(s.id) ? "✓ Saved" : "+ Save",
  );
  save.setAttribute(
    "aria-label",
    (state.saved.includes(s.id) ? "Unsave " : "Save ") + s.title,
  );
  save.setAttribute("aria-pressed", state.saved.includes(s.id));
  save.onclick = () => toggleSaved(s);
  const resize = el("button", "resize-handle");
  resize.setAttribute("aria-label", "Resize article: " + s.title);
  resize.title = "Drag to resize · neighboring columns adapt to stay full";
  resize.onpointerdown = (e) => startGesture(e, "resize", s.id);
  resize.onkeydown = (e) => handleKeys(e, "resize", s.id);
  bottom.append(read, save, resize);
  card.append(bottom);
  return card;
}
function figure(b, caption = true) {
  return V.figure(b, caption);
}
const canvas = new window.BroadsheetCanvas({
  viewport,
  world,
  container: $("#cards"),
  nodes,
  minZoom: 0.25,
  minWidth: 280,
  minHeight: 300,
  getItems: () => filtered,
  getPositions: () => positions,
  getAtlas: () => atlas,
  isActive: () => state.mode === "canvas",
  createCard: makeCard,
  updateCard: (node, entry) => {
    node.style.setProperty(
      "--headline-size",
      entry.profile.headlineSize + "px",
    );
    node.style.setProperty("--cover-height", entry.profile.coverHeight + "px");
  },
  onCommit: () => persist(),
  onLayout: () => {
    clearTimeout(layoutSaveTimer);
    layoutSaveTimer = setTimeout(persist, 350);
  },
  onView: (next) => {
    view = next;
    $("#zoom-label").value = Math.round(next.z * 100) + "%";
  },
});
function queue() {
  canvas.request();
}
function transform() {
  canvas.view = view;
  canvas.apply();
}
function home() {
  const available = $("#viewport").clientWidth || $(".workspace").clientWidth;
  const height = $("#viewport").clientHeight || $(".workspace").clientHeight;
  canvas.home({
    width:
      filtered.length < 10 && innerWidth > 600
        ? atlas.width * 2 + atlas.gap
        : atlas.spreadWidth,
    height: filtered.length < 10 ? 420 : innerWidth <= 600 ? 760 : 1050,
    maxZoom: filtered.length < 10 ? 1.15 : 0.85,
    availableWidth: available,
    availableHeight: height,
  });
}
function zoom(f, x, y) {
  canvas.zoom(f, x, y);
}
function startGesture(e, type, id) {
  canvas.startGesture(e, type, id);
}
function handleKeys(e, type, id) {
  if (
    type === "move" &&
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
  ) {
    e.preventDefault();
    e.stopPropagation();
    const key = canvas.cellKey(e, id),
      entry = atlas.entry(key);
    if (!entry) return;
    const amount = e.shiftKey ? 2 : 1;
    const moved = atlas.move(
      key,
      (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0) * amount,
      (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0) * amount,
    );
    canvas.reflow(moved);
    persist();
    requestAnimationFrame(() =>
      nodes
        .get(moved)
        ?.querySelector(".move-handle")
        ?.focus({ preventScroll: true }),
    );
    return;
  }
  canvas.handleKeys(e, type, id);
}
function toggleSaved(s) {
  const was = state.saved.includes(s.id);
  state.saved = was
    ? state.saved.filter((id) => id !== s.id)
    : [...state.saved, s.id];
  state.savedStories = state.savedStories.filter((x) => x.id !== s.id);
  if (!was) {
    state.savedStories.push(s);
    if (!state.savedSources.some((x) => x.id === s.sourceId))
      state.savedSources.push(source(s.sourceId));
  }
  if (state.savedOnly) update();
  else {
    canvas.invalidateItem(s.id);
    heading();
    renderList();
    persist();
  }
  toast(
    was ? "Removed from saved stories." : "Saved for later on this device.",
  );
}
function selectCoverage(report, key) {
  const entry = key && atlas.entry(key);
  if (!entry?.expanded) {
    openReader(report, key);
    return;
  }
  atlas.overrides[key].reportId = report.id;
  canvas.invalidateItem(entry.item.id);
  canvas.reflow(key);
  persist();
}
function openReader(s, cellKey) {
  if (!filtered.some((item) => item.id === s.id)) {
    state.savedOnly = false;
    state.media = "all";
    $("#news-media-filter").value = "all";
    state.topics = [];
    state.filterSources = [];
    state.activeChannel = null;
    state.query = "";
    $("#search").value = "";
    if (!stories.some((item) => item.id === s.id)) stories.unshift(s);
    update();
    if (!filtered.some((item) => item.id === s.id)) {
      filtered.unshift(s);
      rebuildAtlas();
      clearNodes();
      heading();
      queue();
    }
  }
  const explicit = typeof cellKey === "string",
    entry = explicit ? atlas.entry(cellKey) : canvas.openItem(s.id);
  if (!entry) return;
  if (state.mode !== "canvas") setMode("canvas", false);
  if (explicit || !entry.expanded) {
    if (!entry.expanded)
      for (const [key, o] of Object.entries(atlas.overrides))
        if (key !== entry.key && o.expanded && o.itemId === entry.item.id)
          atlas.toggle(key);
    const width =
      viewport.clientWidth < 600
        ? Math.max(
            entry.rect.w + 40,
            Math.min(760, (viewport.clientWidth - 40) / view.z),
          )
        : atlas.width * 2 + atlas.gap;
    atlas.toggle(entry.key, Math.min(atlas.spreadWidth, width));
    canvas.reflow(entry.key);
    canvas.invalidateItem(entry.item.id);
  }
  const opened = atlas.overrides[entry.key];
  if (opened?.expanded) {
    opened.reportId = s.id;
    canvas.invalidateItem(entry.item.id);
  } else if (opened) delete opened.reportId;
  if (!explicit) canvas.focus(entry.key);
  if (atlas.entry(entry.key)?.expanded)
    window.BroadsheetSpaces?.record({
      id: s.id,
      kind: "news",
      title: s.title,
      url: s.url,
      date: s.date,
      excerpt: s.excerpt,
      source: s.source,
      sourceId: s.sourceId,
      image: N.media(s).find((b) => b.type === "image")?.src || "",
    });
  persist();
}
function setMode(mode, save = true) {
  state.mode = mode === "list" ? "list" : "canvas";
  const list = state.mode === "list";
  viewport.hidden = list;
  $("#list-view").hidden = !list;
  $("#map-tools").hidden = list;
  for (const [id, on] of [
    ["#canvas-mode", !list],
    ["#list-mode", list],
  ]) {
    $(id).classList.toggle("active", on);
    $(id).setAttribute("aria-pressed", on);
  }
  if (list) renderList();
  else {
    clearNodes();
    queue();
  }
  if (save) {
    heading();
    persist();
  }
}
function renderList() {
  if (state.mode !== "list") return;
  $("#list-results").replaceChildren(
    ...N.editionOrder(filtered).map((s) => {
      const row = el("article", "list-story"),
        pub = source(s.sourceId),
        meta = el("div", "list-meta");
      meta.append(
        avatar(pub),
        document.createTextNode(pub.name),
        el("time", "", date(s.date)),
      );
      const content = el("div"),
        title = el("button", "headline", s.title);
      title.onclick = () => openReader(s);
      const photo = N.media(s).find((m) => m.type === "image");
      if (photo && !atlas.coverPolicy.get(s.id)?.hideImage) {
        const img = el("img", "news-list-photo");
        img.src = imageURL(photo.src);
        img.alt = photo.alt || "";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        content.append(img);
      }
      content.append(title, el("p", "excerpt", s.excerpt));
      if (s.coverage?.length > 1) {
        const group = el("div", "coverage-reports");
        for (const report of s.coverage) {
          const b = el("button", "", source(report.sourceId).name);
          b.onclick = () => openReader(report);
          group.append(b);
        }
        content.append(group);
      }
      const b = el(
        "button",
        "button",
        state.saved.includes(s.id) ? "✓ Saved" : "+ Save",
      );
      b.setAttribute(
        "aria-label",
        (state.saved.includes(s.id) ? "Unsave " : "Save ") + s.title,
      );
      b.onclick = () => toggleSaved(s);
      row.append(meta, content, b);
      return row;
    }),
  );
  if (!filtered.length)
    $("#list-results").append(
      el(
        "p",
        "small",
        "No stories match this view. Try another topic or source.",
      ),
    );
}
function health(id) {
  return edition.sources?.find((s) => s.id === id);
}
function renderLibrary() {
  const q = $("#source-search").value.toLowerCase();
  $("#library-sources").replaceChildren(
    ...catalog
      .filter((s) => [s.name, ...s.topics].join(" ").toLowerCase().includes(q))
      .map((s) => {
        const row = el("div", "library-source"),
          body = el("div"),
          title = el("h3", "", s.name);
        body.append(
          title,
          el(
            "p",
            "",
            `${s.kind} · ${s.region} · ${s.topics.join(", ") || "Your feed"}`,
          ),
        );
        const a = el("a", "", "Publisher feed ↗");
        a.href = safeURL(s.feed) || safeURL(s.url);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        body.append(a);
        if (s.reading) {
          const rights = el("a", "source-health", s.reading + " ↗");
          rights.href = safeURL(s.rightsUrl);
          rights.target = "_blank";
          rights.rel = "noopener noreferrer";
          body.append(rights);
        }
        const h = health(s.id),
          label = el(
            "span",
            "source-health",
            h
              ? `${h.count} stories · ${h.status === "ok" ? "collected " + timestamp(h.retrievedAt) : h.status === "stale" ? "using last saved stories" : "currently unavailable"}`
              : s.id.startsWith("custom-")
                ? "Imported on this device"
                : s.id === "nasa"
                  ? "Retained NASA archive"
                  : "Not yet collected",
          );
        body.append(label);
        if (s.id.startsWith("custom-")) {
          const remove = el("button", "remove-import", "Remove imported feed");
          remove.onclick = () => {
            state.customSources = state.customSources.filter(
              (x) => x.id !== s.id,
            );
            state.customStories = state.customStories.filter(
              (x) => x.sourceId !== s.id,
            );
            state.sources = state.sources.filter((id) => id !== s.id);
            catalog = catalog.filter((x) => x.id !== s.id);
            normalize(window._corpus, edition);
            renderLibrary();
            update(true);
            toast("Imported feed removed. Saved articles are retained.");
          };
          body.append(remove);
        }
        const followed = state.sources.includes(s.id),
          b = el(
            "button",
            "button follow-button" + (followed ? " following" : ""),
            followed ? "✓ Following" : "+ Follow",
          );
        b.setAttribute(
          "aria-label",
          (followed ? "Unfollow " : "Follow ") + s.name,
        );
        b.setAttribute("aria-pressed", followed);
        b.onclick = () => {
          state.sources = followed
            ? state.sources.filter((id) => id !== s.id)
            : [...state.sources, s.id];
          renderLibrary();
          update(true);
        };
        row.append(avatar(s), body, b);
        return row;
      }),
  );
}
function openLibrary() {
  renderLibrary();
  showDialog("#library-dialog");
}
function check(label, value, on, cls = "check-chip") {
  const l = el("label", cls),
    input = el("input");
  input.type = "checkbox";
  input.value = value;
  input.checked = on;
  l.append(input, document.createTextNode(label));
  return l;
}
function openTopics() {
  $("#topic-options").replaceChildren(
    ...M.TOPICS.map((t) => check(t, t, state.interests.includes(t))),
  );
  showDialog("#topics-dialog");
}
function checked(selector) {
  return [...document.querySelectorAll(selector + " input:checked")].map(
    (n) => n.value,
  );
}
function openChannel(c = null) {
  editingChannel = c?.id || null;
  $("#channel-dialog-title").textContent = c
    ? "Edit your channel."
    : "Create a channel.";
  $("#channel-name").value = c?.name || "";
  const current = selection();
  $("#channel-topics").replaceChildren(
    ...M.TOPICS.map((t) =>
      check(t, t, (c?.topics || current.topics).includes(t)),
    ),
  );
  $("#channel-sources").replaceChildren(
    ...catalog.map((s) =>
      check(
        s.name,
        s.id,
        (c?.sources.length ? c.sources : current.sources).includes(s.id),
        "source-check",
      ),
    ),
  );
  $("#delete-channel").hidden = !c;
  showDialog("#channel-dialog");
}
$("#channel-form").onsubmit = (e) => {
  e.preventDefault();
  const name = $("#channel-name").value.trim(),
    sources = checked("#channel-sources"),
    topics = checked("#channel-topics");
  if (!name) {
    $("#channel-name").setCustomValidity("Enter a channel name.");
    $("#channel-name").reportValidity();
    return;
  }
  if (!sources.length) {
    toast("Choose at least one source for this channel.");
    return;
  }
  const c = {
    id: editingChannel || "channel-" + crypto.randomUUID(),
    name,
    topics,
    sources,
  };
  state.channels = state.channels.filter((x) => x.id !== c.id).concat(c);
  state.sources = [...new Set([...state.sources, ...sources])];
  $("#channel-dialog").close();
  setView({ active: c.id });
};
$("#channel-name").oninput = () => $("#channel-name").setCustomValidity("");
$("#delete-channel").onclick = () => {
  state.channels = state.channels.filter((c) => c.id !== editingChannel);
  $("#channel-dialog").close();
  setView();
};
function coverage() {
  const counts = new Map();
  for (const s of filtered)
    counts.set(s.sourceId, (counts.get(s.sourceId) || 0) + 1);
  const regions = new Set([...counts.keys()].map((id) => source(id).region));
  const box = el("div", "coverage-stat");
  for (const [value, label] of [
    [filtered.length, "stories in this view"],
    [counts.size, "feeds represented"],
    [regions.size, "publisher bases"],
  ]) {
    const item = el("div");
    item.append(el("strong", "", value), el("span", "", label));
    box.append(item);
  }
  $("#coverage-summary").replaceChildren(box);
  $("#coverage-sources").replaceChildren(
    ...[...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => {
        const pub = source(id),
          row = el("div", "coverage-row"),
          label = el("div", "", pub.name);
        label.append(el("small", "", `${pub.kind} · ${pub.region}`));
        const bar = el("div", "coverage-bar"),
          fill = el("span");
        bar.style.setProperty("--source-color", pub.color);
        fill.style.width = (count / filtered.length) * 100 + "%";
        bar.append(fill);
        row.append(
          label,
          bar,
          el("strong", "", Math.round((count / filtered.length) * 100) + "%"),
        );
        return row;
      }),
  );
  if (!counts.size)
    $("#coverage-sources").append(
      el("p", "", "There are no stories in this view to analyze."),
    );
  showDialog("#coverage-dialog");
}
function normalize(corpus, feed) {
  const merged = new Map();
  for (const s of feed.stories || [])
    merged.set(N.articleKey(s), {
      ...s,
      sourceId: s.sourceId || "nasa",
      topics: M.tags(s),
    });
  for (const s of corpus.stories || []) {
    const previous = merged.get(N.articleKey(s));
    merged.set(N.articleKey(s), {
      ...previous,
      ...s,
      sourceId: "nasa",
      topics: M.tags({ ...s, sourceId: "nasa" }),
      ...(previous ? { id: previous.id } : {}),
      excerpt:
        (s.excerpt || "").length > 350
          ? s.excerpt.slice(0, 350).replace(/\s+\S*$/, "") + "…"
          : s.excerpt || "",
      archive: true,
    });
  }
  for (const s of state.customStories) merged.set(N.articleKey(s), s);
  for (const saved of state.savedStories) {
    const latest = merged.get(N.articleKey(saved));
    merged.set(
      N.articleKey(saved),
      latest ? { ...latest, id: saved.id } : saved,
    );
  }
  stories = [...merged.values()];
}
async function refreshFeeds() {
  if (!refreshAvailable) {
    toast(
      "This is the saved static edition. Use the local Python server to refresh publisher feeds.",
    );
    return;
  }
  const b = $("#refresh");
  b.disabled = true;
  b.lastElementChild.textContent = "Refreshing…";
  $("#status").textContent = "Collecting publisher feeds…";
  try {
    const r = await fetch("api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(45000),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || "Refresh unavailable");
    edition = data;
    normalize(window._corpus, data);
    update();
    editionLabel();
    const unavailable = data.sources.filter((s) => s.status !== "ok").length;
    toast(
      `Edition refreshed${unavailable ? " · " + unavailable + " feeds unavailable; saved stories retained" : ""}.`,
    );
  } catch (e) {
    toast(
      e.name === "TimeoutError"
        ? "Feed refresh timed out. Your saved edition is still available."
        : e.message,
    );
  } finally {
    b.disabled = false;
    b.lastElementChild.textContent = "Refresh feeds";
    heading();
  }
}
function editionLabel() {
  const ok = edition.sources?.filter((s) => s.status === "ok").length || 0;
  $("#edition-date").textContent =
    `Saved edition · ${timestamp(edition.retrievedAt)}`;
  $("#edition-date").title =
    `Last collection attempt: ${timestamp(edition.retrievedAt)}. ${ok} feeds collected successfully. Individual feed dates are in the source library.`;
  $("#refresh").title = refreshAvailable
    ? "Fetch the latest stories from the source catalog"
    : "Static saved edition · run the local server for live refresh";
}
function parseImport(text, feedURL, fileName) {
  if (text.length > 5000000 || /<!DOCTYPE|<!ENTITY/i.test(text))
    throw Error(
      "Use an RSS/Atom file under 5 MB without XML entity declarations.",
    );
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.querySelector("parsererror"))
    throw Error("This is not a valid XML feed.");
  const root = xml.documentElement,
    atom = root.localName === "feed",
    get = (n, name) => [...n.children].find((c) => c.localName === name),
    txt = (n, name) => get(n, name)?.textContent || "",
    plain = (s) =>
      s
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
  if (!["feed", "rss", "RDF"].includes(root.localName))
    throw Error("Choose an RSS or Atom feed.");
  const parent = atom ? root : get(root, "channel") || root;
  const name = plain(txt(parent, "title")) || fileName || "Imported feed";
  const url =
    feedURL ||
    safeURL(
      atom ? get(parent, "link")?.getAttribute("href") : txt(parent, "link"),
    );
  const id = "custom-" + hash(feedURL || name);
  const pub = {
    id,
    name,
    short: name.slice(0, 2).toUpperCase(),
    feed: feedURL || "",
    url,
    topics: [],
    region: "Unknown",
    kind: "Imported feed · unverified",
    color: "#6b7861",
  };
  const result = [];
  for (const item of [...xml.getElementsByTagName("*")]
    .filter((n) => ["item", "entry"].includes(n.localName))
    .slice(0, 80)) {
    const title = plain(txt(item, "title")),
      link = atom
        ? [...item.children]
            .find(
              (n) =>
                n.localName === "link" &&
                (!n.getAttribute("rel") ||
                  n.getAttribute("rel") === "alternate"),
            )
            ?.getAttribute("href")
        : txt(item, "link");
    const resolved = link
      ? M.resolveURL(link, feedURL || url || undefined)
      : "";
    if (!title || !resolved) continue;
    let rawDate =
      txt(item, atom ? "published" : "pubDate") || txt(item, "updated");
    const topics = [...item.children]
      .filter((n) => n.localName === "category")
      .map((n) => n.getAttribute("term") || n.textContent)
      .filter((t) => M.TOPICS.includes(t));
    const mediaNS = "http://search.yahoo.com/mrss/",
      media = [];
    const fields = [...item.getElementsByTagName("*")];
    if (
      !fields.some(
        (n) => n.namespaceURI === mediaNS && n.localName === "restriction",
      )
    ) {
      for (const n of fields) {
        const kind = n.getAttribute("type") || "",
          mrss = n.namespaceURI === mediaNS;
        if (!(
          (mrss && ["content", "thumbnail"].includes(n.localName)) ||
          n.localName === "enclosure" ||
          (n.localName === "link" && n.getAttribute("rel") === "enclosure")
        ))
          continue;
        const src = N.publicURL(
          M.resolveURL(
            n.getAttribute("url") || n.getAttribute("href"),
            resolved,
          ),
        );
        if (
          !src ||
          !(
            kind.startsWith("image/") ||
            (mrss &&
              (n.localName === "thumbnail" ||
                n.getAttribute("medium") === "image" ||
                /\.(jpe?g|png|webp|avif)(?:$|\?)/i.test(src)))
          )
        )
          continue;
        const scope = n.parentElement,
          field = (name) =>
            [...scope.children, ...n.children].find(
              (c) => c.namespaceURI === mediaNS && c.localName === name,
            )?.textContent || "";
        media.push({
          type: "image",
          src,
          width: Math.max(0, Math.min(20000, +n.getAttribute("width") || 0)),
          height: Math.max(0, Math.min(20000, +n.getAttribute("height") || 0)),
          caption: plain(field("description")),
          credit: plain(field("credit")) || "Image supplied by " + name,
          sourceUrl: resolved,
        });
      }
      media.sort((a, b) => b.width - a.width);
    }
    result.push({
      id: "import-" + hash(resolved),
      media: [...new Map(media.map((m) => [m.src, m])).values()].slice(0, 3),
      title,
      url: resolved,
      sourceId: id,
      source: name,
      excerpt: plain(
        txt(item, "description") ||
          txt(item, "summary") ||
          txt(item, "content"),
      ).slice(0, 350),
      date: Number.isFinite(Date.parse(rawDate))
        ? new Date(rawDate).toISOString()
        : "",
      topics: M.tags({ title, topics }),
    });
  }
  if (!result.length)
    throw Error(
      "No usable stories with public HTTP(S) article links were found.",
    );
  return { pub, stories: result };
}
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
function importFeed(text, url, name) {
  const data = parseImport(text, url, name);
  state.customSources = state.customSources
    .filter((s) => s.id !== data.pub.id)
    .concat(data.pub);
  state.customStories = state.customStories
    .filter((s) => s.sourceId !== data.pub.id)
    .concat(data.stories);
  state.sources = [...new Set([...state.sources, data.pub.id])];
  catalog = catalog.filter((s) => s.id !== data.pub.id).concat(data.pub);
  normalize(window._corpus, edition);
  $("#import-status").textContent =
    `Added ${data.stories.length} ${data.stories.length === 1 ? "story" : "stories"} from ${data.pub.name}.`;
  renderLibrary();
  update(true);
  persist();
}
$("#import-form").onsubmit = async (e) => {
  e.preventDefault();
  const url = safeURL($("#feed-url").value);
  if (!url) {
    $("#import-status").textContent = "Enter an HTTP(S) feed URL.";
    return;
  }
  const b = e.submitter;
  b.disabled = true;
  $("#import-status").textContent = "Fetching feed…";
  try {
    const r = await fetch(url, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw Error("Publisher returned " + r.status);
    const reader = r.body.getReader();
    let size = 0,
      parts = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 5000000) {
        await reader.cancel();
        throw Error("Feed exceeds 5 MB.");
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    importFeed(new TextDecoder().decode(bytes), url);
  } catch (e) {
    $("#import-status").textContent =
      `Could not import feed: ${e.message}. If browser access is blocked, download the XML feed and import that file below.`;
  } finally {
    b.disabled = false;
  }
};
$("#feed-file").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.size > 5000000) throw Error("File exceeds 5 MB.");
    importFeed(await f.text(), "", f.name);
  } catch (err) {
    $("#import-status").textContent = err.message;
  }
  e.target.value = "";
};
for (const b of document.querySelectorAll(".close-dialog"))
  b.onclick = () => b.closest("dialog").close();
for (const d of document.querySelectorAll("dialog"))
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  });
$("#all-news").onclick = () => setView();
$("#saved-news").onclick = () => setView({ saved: true });
$("#clear-filters").onclick = $("#empty-reset").onclick = () => setView();
$("#home").onclick = home;
$("#plus").onclick = () => zoom(1.2);
$("#minus").onclick = () => zoom(1 / 1.2);
$("#canvas-mode").onclick = () => setMode("canvas");
$("#list-mode").onclick = () => setMode("list");
$("#source-library").onclick = $("#manage-sources").onclick = openLibrary;
$("#library-done").onclick = () => $("#library-dialog").close();
$("#source-search").oninput = renderLibrary;
$("#manage-topics").onclick = openTopics;
$("#topics-done").onclick = () => {
  state.interests = checked("#topic-options");
  $("#topics-dialog").close();
  sidebar();
  persist();
};
$("#add-channel").onclick = () => openChannel();
$("#coverage").onclick = $("#coverage-top").onclick = coverage;
$("#about").onclick = () => showDialog("#help");
$("#refresh").onclick = refreshFeeds;
$("#sort").value = state.sort;
$("#sort").onchange = (e) => {
  state.sort = e.target.value;
  update();
};
$("#card-size").value = state.size;
$("#card-size").onchange = (e) => {
  state.size = e.target.value;
  state.pressLayouts[layoutKey()] = {};
  update(true);
  toast("Applied " + state.size + " cards to this view.");
};
$("#arrange").onclick = () => {
  state.pressLayouts[layoutKey()] = {};
  state.pressPins[layoutKey()] = {};
  atlasKey = null;
  update(true);
  toast("Your stories are back in a compact layout.");
};
$("#news-media-filter").value = state.media;
$("#news-media-filter").onchange = (e) => {
  state.media = e.target.value;
  update(true);
};
matchMedia("(max-width:600px)").addEventListener("change", () => update(true));
$("#search").value = state.query;
$("#search").oninput = (e) => {
  state.query = e.target.value;
  update(true);
};
$("#menu-toggle").onclick = () => {
  const on = document.body.classList.toggle("sidebar-open");
  $("#menu-toggle").setAttribute("aria-expanded", on);
};
window.addEventListener("keydown", (e) => {
  if (
    e.target.closest("input,textarea,select,button,a") ||
    document.querySelector("dialog[open]")
  )
    return;
  if (e.key.toLowerCase() === "h") home();
  else if (e.key === "+" || e.key === "=") zoom(1.2);
  else if (e.key === "-") zoom(1 / 1.2);
  else if (
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
  ) {
    e.preventDefault();
    view.x += e.key === "ArrowLeft" ? 100 : e.key === "ArrowRight" ? -100 : 0;
    view.y += e.key === "ArrowUp" ? 100 : e.key === "ArrowDown" ? -100 : 0;
    transform();
  }
});

async function init() {
  try {
    const data =
      window.BROADSHEET_DATA ||
      (await Promise.all(
        [
          "corpus.json",
          "feed.json",
          "sources.json",
          "news-geography.json",
          "news-media-index.json",
        ].map(async (path) => {
          const r = await fetch(path, { cache: "no-cache" });
          if (!r.ok) throw Error("Could not load " + path);
          return r.json();
        }),
      ).then(([corpus, feed, sources, geography, mediaIndex]) => ({
        corpus,
        feed,
        sources,
        geography,
        mediaIndex,
      })));
    geography = data.geography || { countries: [] };
    V.configure(geography);
    N.configureMedia(data.mediaIndex);
    window._corpus = data.corpus || data;
    edition = data.feed || { stories: [] };
    catalog = [...(data.sources || []), ...state.customSources];
    if (!catalog.length) throw Error("Source catalog is missing.");
    normalize(window._corpus, edition);
    state.sources = state.sources.filter((id) =>
      catalog.some((s) => s.id === id),
    );
    if (new URLSearchParams(location.search).get("saved") === "1") {
      state.savedOnly = true;
      state.query = "";
      state.topics = [];
      state.filterSources = [];
      state.activeChannel = null;
      $("#search").value = "";
    }
    update(true);
    const focusId = new URLSearchParams(location.search).get("focus");
    if (focusId) {
      const story =
        stories.find((s) => s.id === focusId) ||
        window.BroadsheetSpaces?.recent().find(
          (s) => s.id === focusId && s.kind === "news",
        );
      if (story) openReader(story);
    }
    editionLabel();
    if (location.protocol !== "file:" && !window.BROADSHEET_DATA) {
      try {
        const r = await fetch("api/capabilities");
        if (
          r.ok &&
          (r.headers.get("content-type") || "").includes("application/json")
        )
          refreshAvailable = (await r.json()).refresh === true;
      } catch {}
    }
    editionLabel();
    if (!storageOK)
      $("#storage-status").textContent = "BROWSER STORAGE UNAVAILABLE";
  } catch (e) {
    $("#status").textContent = "Could not load the saved edition.";
    $("#empty-message").textContent =
      "The edition files could not be loaded. Start the local server or open the standalone preview.";
    $("#empty-state").hidden = false;
    console.error(e);
  }
}
window.broadsheetDebug = {
  get state() {
    return {
      stories: stories.length,
      filtered: filtered.length,
      rendered: nodes.size,
      view: { ...view },
      positions: structuredClone(canvas.positions),
      selection: selection(),
      refreshAvailable,
    };
  },
  pan(x, y) {
    view.x -= x;
    view.y -= y;
    transform();
  },
  parseImport,
};
init();
