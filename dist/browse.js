const $ = (s) => document.querySelector(s),
  S = window.BroadsheetSpaces,
  Live = window.BroadsheetLive,
  id = document.body.dataset.space,
  space = S.registry[id];
const initial = {
  query: "",
  filter: "All",
  sort: "collection",
  mode: "spatial",
  size: "comfortable",
  savedOnly: false,
  saved: [],
  layouts: {},
  atlasLayouts: {},
  atlasPins: {},
  liveCatalog: true,
  cameras: {},
  data: null,
};
const stored = S.load(id),
  state = {
    ...initial,
    ...stored,
    saved: Array.isArray(stored.saved) ? stored.saved : [],
    layouts: stored.layouts || {},
    atlasLayouts: stored.atlasLayouts || {},
    atlasPins: stored.atlasPins || {},
    cameras: stored.cameras || {},
  };
let bundle = {},
  base = {},
  items = [],
  visible = [],
  positions = {},
  capabilities = { places: true },
  canvas,
  atlas,
  map,
  mapLayer,
  mapMarkers = new Map(),
  toastTimer,
  saveTimer,
  currentDetail = null,
  pending = false;
let searchTimer,
  searchRevision = 0,
  catalogController;
let catalogBusy = false,
  wanderAnchor,
  wanderTimer;
const detailRequests = new Map();
const key = () =>
  [
    state.savedOnly ? "saved" : "all",
    state.filter,
    state.query.trim(),
    state.data?.provider || "",
    ...(id === "places" ? [state.data?.city || "preview"] : []),
  ].join("|");
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function http(s) {
  try {
    const u = new URL(s);
    return ["http:", "https:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}
function imageURL(s) {
  try {
    const u = new URL(s, location.href);
    return (u.origin === location.origin && u.pathname.includes("/images/")) ||
      [
        "www.themealdb.com",
        "themealdb.com",
        "image.tmdb.org",
        "upload.wikimedia.org",
        "images.unsplash.com",
      ].includes(u.hostname)
      ? u.href
      : "";
  } catch {
    return "";
  }
}
function photo(src, alt, cls = "") {
  const img = el("img", cls);
  const target = imageURL(src);
  if (target) img.src = target;
  else img.hidden = true;
  img.alt = alt || "";
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.onerror = () => {
    img.hidden = true;
    img.parentElement?.classList.add("image-missing");
  };
  return img;
}
function toast(text) {
  clearTimeout(toastTimer);
  $("#space-toast").textContent = text;
  $("#space-toast").hidden = false;
  toastTimer = setTimeout(() => ($("#space-toast").hidden = true), 6500);
}
function persist() {
  try {
    localStorage.setItem(S.storageKey(id), JSON.stringify(state));
    $("#save-status").textContent = "YOUR WORKSPACE STAYS ON THIS DEVICE";
  } catch {
    $("#save-status").textContent = "STORAGE UNAVAILABLE · SESSION ONLY";
  }
}
function saved(item) {
  return state.saved.some((s) => s.id === item.id);
}
function mergeItems() {
  const source = state.data?.items ? state.data : base;
  const merged = new Map(source.items.map((s) => [s.id, s]));
  if (state.savedOnly)
    for (const s of state.saved) if (!merged.has(s.id)) merged.set(s.id, s);
  items = [...merged.values()];
  return source;
}
function changeFilter(filter) {
  state.filter = filter;
  state.savedOnly = false;
  update(true);
  if (id !== "places" && state.liveCatalog) queueCatalogSearch(0);
  else if (id === "places" && state.locationChosen && state.data?.center)
    searchPlaces({
      lat: state.data.center.lat,
      lon: state.data.center.lon,
      city: state.data.city === "Near you" ? "" : state.data.city,
      category: filter,
      locationMode: state.locationMode,
    });
}
function filterOptions() {
  return [
    ...new Set(
      [
        ...space.filters,
        ...items.flatMap((i) => [
          i.category,
          ...(id === "movies" ? i.tags : []),
        ]),
      ].filter(Boolean),
    ),
  ];
}
function controls() {
  const options = filterOptions();
  for (const selector of ["#filter-pills", "#side-filters"])
    $(selector).replaceChildren(
      ...options.map((t) => {
        const b = el(
          "button",
          selector === "#side-filters"
            ? "side-button" + (state.filter === t ? " active" : "")
            : "pill" + (state.filter === t ? " active" : ""),
          t === "All" && selector === "#side-filters" ? "All " + space.noun : t,
        );
        b.setAttribute("aria-pressed", state.filter === t);
        b.onclick = () => changeFilter(t);
        return b;
      }),
    );
  $("#browse-all").classList.toggle("active", !state.savedOnly);
  $("#browse-saved").classList.toggle("active", state.savedOnly);
  $("#saved-count").textContent = state.saved.length;
  $("#item-count").textContent = items.length;
  $("#clear-space").hidden =
    state.filter === "All" && !state.query && !state.savedOnly;
  $("#collection-mode").classList.toggle("active", !state.liveCatalog);
  $("#live-catalog").classList.toggle(
    "active",
    state.liveCatalog && state.data?.catalog !== "now-playing",
  );
  $("#now-playing").classList.toggle(
    "active",
    state.data?.catalog === "now-playing",
  );
  $("#load-more").hidden = state.savedOnly || !state.data?.next;
  $("#refresh-catalog").hidden =
    id === "places" || !state.liveCatalog || state.savedOnly;
}
function update(reset = false) {
  const data = mergeItems();
  const remoteMatched =
    state.data?.live &&
    state.data.query === state.query.trim() &&
    state.data.filter === state.filter;
  visible = S.filter(
    items,
    remoteMatched ? { ...state, query: "", filter: "All" } : state,
  );
  const scale =
    state.size === "compact" ? 0.8 : state.size === "large" ? 1.22 : 1;
  state.atlasLayouts[key()] ??= {};
  state.atlasPins[key()] ??= {};
  atlas = new window.BroadsheetSpatial.InfiniteLayout(visible, {
    width: Math.round(space.card.w * scale),
    height: Math.round(space.card.h * scale),
    variation:
      id === "recipes"
        ? [0, 52, -30, 25].map((n) => Math.round(n * scale))
        : [0],
    overrides: state.atlasLayouts[key()],
    pins: state.atlasPins[key()],
  });
  canvas?.clear();
  controls();
  renderResultStatus();
  $("#collection-note").textContent = state.savedOnly
    ? "Saved items from your collection"
    : id === "places"
      ? !state.locationChosen
        ? "Chicago preview · choose your location to explore nearby"
        : (data.city || "Chosen area") + " · OpenStreetMap"
      : data.note || "";
  if (id === "places")
    $("#space-tip").textContent = state.locationChosen
      ? "MAP LISTINGS ARE COMMUNITY PROVIDED"
      : "CHOOSE YOUR LOCATION · OR SEARCH ANY CITY";
  $("#collection-note").textContent +=
    " · Endless canvas, repeating collection";
  $("#collection-note").title = data.collectedAt
    ? "Collected " + new Date(data.collectedAt).toLocaleString()
    : "";
  $("#no-results").hidden = visible.length > 0;
  $("#no-results-text").textContent = state.savedOnly
    ? "Save a few favorites with the heart to find them here."
    : id === "recipes"
      ? "Try another ingredient, dish name, or category. Live search checks the recipe catalog."
      : "Try another search or category.";
  if (reset) {
    const camera = state.cameras[key()];
    if (
      camera &&
      ["x", "y", "z"].every((k) => Number.isFinite(camera[k])) &&
      camera.z > 0
    ) {
      canvas.view = { ...camera };
      canvas.apply();
    } else home();
  } else canvas?.request();
  renderMode();
  persist();
}
function renderResultStatus() {
  const data = state.data;
  $("#result-status").textContent =
    `${visible.length} ${space.noun}${data?.live && !state.savedOnly ? " loaded" : ""}${data?.total && !state.savedOnly ? " of " + data.total : ""}${state.filter !== "All" ? " · " + state.filter : ""}${state.savedOnly ? " · saved" : ""}`;
}
function home() {
  const factor =
    state.size === "compact" ? 0.8 : state.size === "large" ? 1.22 : 1;
  canvas?.home({
    width: space.card.w * factor,
    height: space.card.h * factor,
    maxZoom: 0.92,
    availableWidth: $(".space-workspace").clientWidth,
    availableHeight:
      $("#space-viewport").clientHeight ||
      $(".space-workspace").clientHeight,
  });
}
function saveItem(item) {
  state.saved = saved(item)
    ? state.saved.filter((s) => s.id !== item.id)
    : [...state.saved, item];
  update();

  toast(
    saved(item) ? "Saved to your collection." : "Removed from your collection.",
  );
}
function gallery(item) {
  if (id !== "places" || item.images?.some(imageURL))
    return {
      images: (item.images || [item.image]).filter(imageURL),
      illustrative: false,
    };
  if (item.category !== "Restaurants" && item.category !== "Cafés")
    return { images: [], illustrative: false };
  const cuisine = (item.cuisine || "").toLowerCase();
  let matches = (bundle.recipes?.items || []).filter(
    (r) =>
      r.cuisine?.toLowerCase().includes(cuisine.split(",")[0]) ||
      r.title.toLowerCase().includes(cuisine.split(",")[0]),
  );
  if (!cuisine || matches.length < 2) matches = bundle.recipes?.items || [];
  const start = [...item.id].reduce((n, c) => n + c.charCodeAt(0), 0);
  return {
    images: [
      matches[start % matches.length]?.image,
      matches[(start + 3) % matches.length]?.image,
    ].filter(imageURL),
    illustrative: true,
  };
}
function businessPhoto(item, cls = "") {
  const browserKey = window.BROADSHEET_CONFIG?.googleMapsBrowserKey;
  const connected = capabilities.streetView || !!browserKey;
  const cover = el("div", "venue-static " + cls),
    placeholder = el(
      "span",
      "streetview-placeholder",
      connected ? "Street View unavailable" : "Street View not connected",
    );
  cover.append(placeholder);
  if (
    connected &&
    Number.isFinite(item.lat) &&
    Number.isFinite(item.lon) &&
    !window.BROADSHEET_OFFLINE
  ) {
    if (browserKey) {
      const frame = el("iframe", "streetview-embed");
      frame.title = "Google Street View near " + item.title;
      frame.loading = "lazy";
      frame.tabIndex = -1;
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.src = Live.streetViewURL(browserKey, item);
      frame.onload = () => (placeholder.hidden = true);
      cover.append(frame);
      return cover;
    }
    const img = el("img", "streetview-photo");
    img.alt = "Google Street View near " + item.title;
    img.loading = "lazy";
    img.decoding = "async";
    img.src =
      "api/streetview?" + new URLSearchParams({ lat: item.lat, lon: item.lon });
    img.onload = () => (placeholder.hidden = true);
    img.onerror = () => {
      img.hidden = true;
      placeholder.textContent = "Street View unavailable here";
    };
    cover.append(img);
  }
  return cover;
}
function makeCard(item, instance) {
  if (instance?.expanded) return expandedCard(item, instance);

  const card = el(
    "article",
    "visual-card " +
      { recipes: "recipe-card", movies: "movie-card", places: "place-card" }[
        id
      ],
  );
  card.dataset.id = item.id;
  card.setAttribute("aria-label", item.title);
  const imageButton = el(
    "button",
    "card-image" + (id === "places" ? " venue-cover" : ""),
  );
  imageButton.setAttribute("aria-label", "Open " + item.title);
  imageButton.onclick = () => openDetails(item, instance?.key);
  if (id === "places") {
    const g = gallery(item);
    card.classList.toggle("has-preview", g.images.length > 0);
    card.classList.toggle("single-preview", g.images.length === 1);
    imageButton.append(businessPhoto(item));
    g.images.slice(0, 2).forEach((src, i) => {
      const slide = el("span", "venue-slide" + (i === 0 ? " first-slide" : ""));
      slide.style.animationDelay = i === 0 ? "0s" : "-4s";
      slide.append(
        photo(
          src,
          g.illustrative
            ? "Illustrative food photograph; not this venue"
            : item.title,
        ),
      );
      imageButton.append(slide);
    });
    if (g.images.length)
      imageButton.append(
        el(
          "span",
          "image-disclosure",
          g.illustrative
            ? "Food inspiration · not venue photography"
            : "Photo linked by an OpenStreetMap contributor",
        ),
      );
  } else {
    imageButton.append(photo(item.image, item.title));
    if (id === "recipes")
      imageButton.append(
        el("span", "photo-badge", item.cuisine || item.category),
      );
  }
  card.append(imageButton);
  const heading = el("div", "card-heading");
  heading.append(
    el(
      "span",
      "eyebrow",
      id === "movies"
        ? (item.tags || []).slice(0, 2).join(" / ")
        : item.category,
    ),
  );
  const title = el("button", "card-title", item.title);
  title.onclick = () => openDetails(item, instance?.key);
  heading.append(title);
  const sub =
    id === "recipes"
      ? item.needsDetails
        ? "Recipe · details load when opened"
        : `${item.ingredients?.length || 0} ingredients · ${item.cuisine || ""}`
      : id === "movies"
        ? [
            item.year,
            item.runtime ? item.runtime + " min" : null,
            item.director,
          ]
            .filter(Boolean)
            .join(" · ")
        : item.cuisine || item.address || item.city;
  heading.append(el("p", "card-subtitle", sub));
  if (id === "recipes")
    heading.append(el("p", "recipe-detail-preview", item.description));
  card.append(heading);
  const actions = el("div", "card-actions"),
    move = el("button", "move-handle", "⠿");
  move.setAttribute("aria-label", "Move " + item.title);
  move.title = "Drag to move · arrow keys when focused";
  canvas.bindHandle(move, "move", item.id);
  const open = el(
    "button",
    "open-card",
    id === "recipes"
      ? "+ Unfold recipe"
      : id === "movies"
        ? "+ Unfold film"
        : "+ Unfold place",
  );
  open.onclick = () => openDetails(item, instance?.key);
  const heart = el(
    "button",
    "heart-button" + (saved(item) ? " saved" : ""),
    saved(item) ? "♥" : "♡",
  );
  heart.setAttribute(
    "aria-label",
    (saved(item) ? "Unsave " : "Save ") + item.title,
  );
  heart.setAttribute("aria-pressed", saved(item));
  heart.onclick = () => saveItem(item);
  const resize = el("button", "resize-handle");
  resize.setAttribute("aria-label", "Resize " + item.title);
  resize.title = "Drag to resize · arrow keys when focused";
  canvas.bindHandle(resize, "resize", item.id);
  actions.append(move, open, heart, resize);
  card.append(actions);
  return card;
}
function link(text, url, cls = "outline-button") {
  const a = el("a", cls, text);
  const target = http(url);
  if (target) {
    a.href = target;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  } else a.hidden = true;
  return a;
}
function fillDetails(item, root) {
  if (id === "places") root.append(businessPhoto(item, "detail-streetview"));
  if (item.image && imageURL(item.image) && id !== "places")
    root.append(
      photo(
        item.image,
        item.title,
        "detail-hero" + (id === "movies" ? " poster" : ""),
      ),
    );
  const content = el("div", "detail-content");
  content.append(
    el(
      "span",
      "eyebrow",
      id === "movies"
        ? item.catalog || "FILM COLLECTION"
        : id === "recipes"
          ? "FROM THE KITCHEN"
          : "OUT & ABOUT",
    ),
    el("h2", "", item.title),
  );
  const meta =
    id === "recipes"
      ? [
          item.cuisine,
          item.category,
          item.needsDetails
            ? "Loading recipe details…"
            : item.ingredients?.length + " ingredients",
        ]
      : id === "movies"
        ? [
            item.originalTitle,
            item.year,
            item.runtime ? item.runtime + " minutes" : null,
            item.director,
          ]
        : [item.category, item.cuisine, item.city];
  content.append(el("div", "detail-meta", meta.filter(Boolean).join(" · ")));
  const tags = el("div", "tag-row");
  for (const t of S.tags(item)) tags.append(el("span", "", t));
  content.append(tags);
  const actions = el("div", "detail-actions"),
    save = el(
      "button",
      "primary-button",
      saved(item) ? "♥ Saved to collection" : "♡ Save to collection",
    );
  save.onclick = () => saveItem(item);
  actions.append(
    save,
    link(
      id === "recipes"
        ? "Original recipe ↗"
        : id === "movies"
          ? "More about this film ↗"
          : "Open in OpenStreetMap ↗",
      item.url,
    ),
  );
  if (id === "places") {
    actions.append(
      link(
        "Directions in Google Maps ↗",
        "https://www.google.com/maps/dir/?api=1&destination=" +
          encodeURIComponent(item.lat + "," + item.lon),
      ),
    );
    actions.append(
      link(
        "Open Street View ↗",
        "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" +
          encodeURIComponent(item.lat + "," + item.lon),
      ),
    );
    if (item.website) actions.append(link("Venue website ↗", item.website));
  }
  content.append(actions);
  if (id === "recipes") {
    if (item.needsDetails) {
      const retry = el(
        "button",
        "link-button",
        detailRequests.has(item.id)
          ? "Loading ingredients and method…"
          : "Load ingredients and method ↻",
      );
      retry.onclick = () => hydrateRecipe(item);
      content.append(retry);
    }
    const cols = el("div", "detail-columns"),
      ingredients = el("div"),
      method = el("div"),
      list = el("ul", "ingredient-list");
    ingredients.append(el("h3", "", "What you’ll need"));
    for (const ingredient of item.ingredients || []) {
      const li = el("li");
      li.append(
        el("strong", "", ingredient.amount),
        document.createTextNode(" " + ingredient.name),
      );
      list.append(li);
    }
    ingredients.append(list);
    method.append(el("h3", "", "Make it happen"));
    const steps = el("ol", "method-list");
    for (const step of item.steps?.length
      ? item.steps
      : [item.instructions || "Read the original recipe for the method."])
      steps.append(el("li", "", step));
    method.append(steps);
    cols.append(ingredients, method);
    cols.hidden = !!item.needsDetails;
    content.append(cols);
    if (item.video)
      content.append(link("Watch the recipe video ↗", item.video));
  } else if (id === "movies")
    content.append(
      el("p", "description", item.description),
      el(
        "p",
        "small",
        item.catalog === "Now playing"
          ? "Cinema availability is regional and can change. This is a provider listing, not a showtime or ticket offer."
          : item.source === "Wikipedia"
            ? "Live film discovery from Wikipedia; this is not a cinema availability listing."
            : "This is a curated film collection, not a list of films currently in theaters.",
      ),
    );
  else {
    const facts = el("dl", "place-facts");
    for (const [label, value] of [
      ["Address", item.address || "Not supplied by the map contributor"],
      ["Cuisine", item.cuisine || "Not specified"],
      ["Hours", item.hours || "Not listed; check with the venue"],
    ])
      facts.append(el("dt", "", label), el("dd", "", value));
    content.append(
      facts,
      el(
        "p",
        "",
        "Map listings are contributed by the community and may be incomplete. Check with the venue before visiting.",
      ),
    );
    const g = gallery(item);
    if (g.images.length) {
      const sample = photo(
        g.images[0],
        g.illustrative ? "Illustrative food, not a venue photo" : item.title,
        "detail-hero",
      );
      content.append(
        sample,
        el(
          "p",
          "source-note",
          g.illustrative
            ? "Food inspiration from TheMealDB. These are not photographs of this venue."
            : item.imageCredit,
        ),
      );
    }
  }
  const sourceNote = el("p", "source-note");
  sourceNote.append(
    document.createTextNode(
      `Source: ${item.source}. ${item.imageCredit || ""}. `,
    ),
    link("Source & attribution ↗", item.sourceUrl, "link-button"),
  );
  content.append(sourceNote);
  if (item.textLicense) {
    const credit = el("p", "source-note", item.textLicense + " · ");
    credit.append(
      link(
        "Text license ↗",
        "https://creativecommons.org/licenses/by-sa/4.0/",
      ),
    );
    content.append(credit);
  }
  if (item.imageSourceUrl)
    content.append(
      link("Artwork source and credits ↗", item.imageSourceUrl, "link-button"),
    );
  root.append(content);
}
function expandedCard(item, instance) {
  const card = el(
    "article",
    "visual-card expanded-card " +
      { recipes: "recipe-card", places: "place-card", movies: "movie-card" }[
        id
      ],
  );
  card.dataset.id = item.id;
  card.dataset.expanded = "true";
  card.dataset.autoHeight = String(instance.autoHeight);
  card.setAttribute("aria-label", item.title + " — expanded");
  const bar = el("div", "card-actions expanded-controls"),
    move = el("button", "move-handle", "⠿");
  move.setAttribute("aria-label", "Move " + item.title);
  canvas.bindHandle(move, "move", instance.key);
  const fold = el("button", "open-card", "− Fold card");
  fold.setAttribute("aria-label", "Collapse " + item.title);
  fold.onclick = () => openDetails(item, instance.key);
  const resize = el("button", "resize-handle");
  resize.setAttribute("aria-label", "Resize " + item.title);
  canvas.bindHandle(resize, "resize", instance.key);
  bar.append(move, fold);
  const body = el("div", "expanded-card-content detail-scroll");
  fillDetails(item, body);
  card.append(bar, body, resize);
  return card;
}
function openDetails(item, cellKey) {
  if (!visible.some((i) => i.id === item.id)) {
    state.savedOnly = false;
    state.filter = "All";
    state.query = "";
    $("#space-search").value = "";
    if (!items.some((i) => i.id === item.id)) {
      const current = state.data || base;
      state.data = { ...current, items: [item, ...current.items] };
    }
    update();
  }
  const explicit = typeof cellKey === "string",
    entry = explicit ? atlas.entry(cellKey) : canvas.openItem(item.id);
  if (!entry) return;
  state.mode = "spatial";
  renderMode();
  if (explicit || !entry.expanded) {
    const width =
      canvas.viewport.clientWidth < 600
        ? Math.max(
            entry.rect.w + 40,
            Math.min(760, (canvas.viewport.clientWidth - 40) / canvas.view.z),
          )
        : atlas.width * 2 + atlas.gap;
    atlas.toggle(entry.key, width);
    canvas.reflow(entry.key);
    canvas.invalidateItem(item.id);
  }
  if (!explicit) canvas.focus(entry.key);
  if (atlas.entry(entry.key)?.expanded) {
    S.record(item);
    if (item.needsDetails) hydrateRecipe(item);
  }
  persist();
}
function renderList() {
  $("#space-list").replaceChildren(
    ...visible.map((item) => {
      const row = el("article", "list-item");
      row.append(
        id === "places"
          ? businessPhoto(item, "list-streetview")
          : photo(item.image || gallery(item).images[0], item.title),
      );
      const main = el("button");
      main.append(
        el("span", "eyebrow", item.category || ""),
        el("h3", "", item.title),
        el(
          "p",
          "",
          id === "movies"
            ? [item.year, item.director].filter(Boolean).join(" · ")
            : item.description || item.city,
        ),
      );
      main.onclick = () => openDetails(item);
      const heart = el("button", "heart-button", saved(item) ? "♥" : "♡");
      heart.setAttribute(
        "aria-label",
        (saved(item) ? "Unsave " : "Save ") + item.title,
      );
      heart.onclick = () => saveItem(item);
      row.append(main, heart);
      return row;
    }),
  );
}
function renderMap() {
  if (!window.L) {
    toast(
      "The map library could not be loaded. The spatial view is still available.",
    );
    return;
  }
  if (!map) {
    map = L.map("place-map", { zoomControl: true }).setView(
      [base.center?.lat || 0, base.center?.lon || 0],
      13,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    mapLayer = L.layerGroup().addTo(map);
    map.on("moveend", () => {
      const c = map.getCenter();
      state.mapView = { lat: c.lat, lon: c.lng, zoom: map.getZoom() };
      persist();
    });
  }
  map.invalidateSize();
  mapLayer.clearLayers();
  mapMarkers.clear();
  for (const item of visible) {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) continue;
    const marker = L.circleMarker([item.lat, item.lon], {
      radius: 7,
      color: "#fffefa",
      weight: 2,
      fillColor: space.accent,
      fillOpacity: 0.95,
    }).addTo(mapLayer);
    const popup = el("div"),
      button = el("button", "", item.title);
    button.onclick = () => openDetails(item);
    popup.append(button, el("small", "", item.category));
    marker.bindPopup(popup);
    mapMarkers.set(item.id, marker);
  }
  const data = state.data || base;
  if (state.mapView && !state.mapNeedsFit)
    map.setView([state.mapView.lat, state.mapView.lon], state.mapView.zoom);
  else if (visible.length) {
    const bounds = L.latLngBounds(
      visible.filter((i) => Number.isFinite(i.lat)).map((i) => [i.lat, i.lon]),
    );
    if (bounds.isValid())
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    state.mapNeedsFit = false;
  } else map.setView([data.center?.lat || 0, data.center?.lon || 0], 13);
}
function renderMode() {
  if (
    !["spatial", "list", "map"].includes(state.mode) ||
    (state.mode === "map" && id !== "places")
  )
    state.mode = "spatial";
  $("#space-viewport").hidden = state.mode !== "spatial";
  $("#space-list").hidden = state.mode !== "list";
  $("#place-map").hidden = state.mode !== "map";
  $(".space-canvas-tools").hidden = state.mode !== "spatial";
  for (const m of ["spatial", "list", "map"]) {
    $("#" + m + "-mode").classList.toggle("active", state.mode === m);
    $("#" + m + "-mode").setAttribute("aria-pressed", state.mode === m);
  }
  if (state.mode === "list") renderList();
  else if (state.mode === "map") requestAnimationFrame(renderMap);
  else canvas.request();
}
async function request(path, options = {}) {
  const target = window.BROADSHEET_CONFIG?.apiBase
    ? new URL(path, window.BROADSHEET_CONFIG.apiBase).href
    : path;
  const r = await fetch(target, {
    ...options,
    signal: options.signal || AbortSignal.timeout(40000),
  });
  let body;
  try {
    body = await r.json();
  } catch {
    throw Error(
      "Live search is available through the local Broadsheet server. The saved collection is available here.",
    );
  }
  if (!r.ok) throw Error(body.error || "The provider is unavailable.");
  return body;
}
async function busy(button, fn) {
  if (pending) return;
  pending = true;
  button.disabled = true;
  try {
    await fn();
  } catch (e) {
    toast(
      e.name === "TimeoutError"
        ? "The search timed out. Your previous collection is still here."
        : e.message,
    );
  } finally {
    pending = false;
    button.disabled = false;
    renderResultStatus();
  }
}
async function searchRecipes() {
  state.liveCatalog = true;
  await loadCatalog();
}
function pinLoadedCards() {
  const pins = state.atlasPins[key()] || (state.atlasPins[key()] = {});
  for (const cell of new Set([
    ...Object.keys(canvas.instancePositions),
    ...Object.keys(state.atlasLayouts[key()] || {}),
  ])) {
    const entry = atlas.entry(cell);
    if (entry) pins[cell] = entry.item.id;
  }
}
function queueCatalogSearch(delay = 650) {
  clearTimeout(searchTimer);
  clearTimeout(wanderTimer);
  searchRevision++;
  catalogController?.abort();
  if (
    id === "places" ||
    !state.liveCatalog ||
    state.savedOnly ||
    window.BROADSHEET_OFFLINE
  )
    return;
  searchTimer = setTimeout(() => loadCatalog(), delay);
}
function exploreAsYouWander(view) {
  const viewKey = key();
  if (
    !wanderAnchor ||
    wanderAnchor.key !== viewKey ||
    Math.abs(wanderAnchor.z - view.z) > 0.01
  ) {
    wanderAnchor = { ...view, key: viewKey };
    return;
  }
  if (
    !canvas ||
    id === "places" ||
    !state.liveCatalog ||
    state.savedOnly ||
    !state.data?.next ||
    catalogBusy ||
    window.BROADSHEET_OFFLINE ||
    state.data.query !== state.query.trim() ||
    state.data.filter !== state.filter
  )
    return;
  const distance = Math.hypot(
    (view.x - wanderAnchor.x) / canvas.viewport.clientWidth,
    (view.y - wanderAnchor.y) / canvas.viewport.clientHeight,
  );
  if (distance < 1.5) return;
  wanderAnchor = { ...view, key: viewKey };
  clearTimeout(wanderTimer);
  wanderTimer = setTimeout(() => {
    if (!catalogBusy && key() === viewKey && state.data?.next)
      loadCatalog({ append: true });
  }, 350);
}
async function loadCatalog({
  append = false,
  catalog = "all",
  refresh = false,
} = {}) {
  if (window.BROADSHEET_OFFLINE) {
    toast("Open the hosted site or local server to search live catalogs.");
    return;
  }
  if (append && !state.data?.next) return;
  if (
    append &&
    (state.data.query !== state.query.trim() ||
      state.data.filter !== state.filter)
  )
    append = false;
  clearTimeout(searchTimer);
  clearTimeout(wanderTimer);
  catalogController?.abort();
  const revision = ++searchRevision;
  catalogBusy = true;
  const controller = (catalogController = new AbortController());
  const timeout = setTimeout(() => controller.abort(), 30000);
  const query = state.query.trim(),
    filter = state.filter;
  const previous = state.data;
  const cursor = append ? previous.next : null;
  if (append) catalog = previous.catalog || "all";
  if (refresh) Live.clearCache();
  $("#load-more").disabled = true;
  $("#refresh-catalog").disabled = true;
  $("#result-status").textContent = append
    ? "Loading more…"
    : "Searching live catalog…";
  try {
    let data;
    if (id === "recipes")
      data = await Live.recipes({
        query,
        category: filter,
        cursor,
        signal: controller.signal,
      });
    else if (capabilities.movies) {
      const mode =
        catalog === "now-playing"
          ? "now-playing"
          : query
            ? "search"
            : "popular";
      data = await request(
        "api/movies?" +
          new URLSearchParams({
            q: query,
            genre: filter,
            mode,
            region: "US",
            page: cursor?.page || 1,
          }),
        { signal: controller.signal },
      );
    } else {
      if (catalog === "now-playing")
        throw Error(
          "Current cinema listings require a connected TMDB account. Live film discovery is available now.",
        );
      data = await Live.movies({
        query,
        genre: filter,
        cursor,
        signal: controller.signal,
      });
    }
    if (revision !== searchRevision) return;
    const refreshSameView =
      refresh &&
      previous?.live &&
      previous.query === query &&
      previous.filter === filter &&
      previous.provider === data.provider;
    if (append || refreshSameView) {
      pinLoadedCards();
      data.items = [
        ...new Map(
          [...previous.items, ...data.items].map((item) => [item.id, item]),
        ).values(),
      ];
      if (refreshSameView && previous.next) data.next = previous.next;
    }
    state.data = data;
    state.liveCatalog = true;
    update(!(append || refreshSameView));
    if (!data.items.length)
      toast(
        "No matches from this catalog. Try another title, ingredient, or category.",
      );
  } catch (error) {
    if (revision !== searchRevision) return;
    toast(
      error.name === "AbortError"
        ? "The catalog took too long. Try again; your loaded collection is still here."
        : error.message,
    );
  } finally {
    clearTimeout(timeout);
    if (revision === searchRevision) {
      catalogBusy = false;
      $("#load-more").disabled = false;
      $("#refresh-catalog").disabled = false;
      renderResultStatus();
    }
  }
}
async function hydrateRecipe(item) {
  if (detailRequests.has(item.id)) return detailRequests.get(item.id);
  const task = (async () => {
    try {
      const full = await Live.recipeDetails(item);
      Object.assign(item, full);
      for (const collection of [state.data?.items, base.items, state.saved]) {
        for (const record of collection || [])
          if (record.id === full.id) Object.assign(record, full);
      }
      S.record(item);
      canvas.invalidateItem(item.id);
      persist();
    } catch (error) {
      toast(error.message);
    } finally {
      detailRequests.delete(item.id);
      canvas.invalidateItem(item.id);
    }
  })();
  detailRequests.set(item.id, task);
  return task;
}
async function searchPlaces(query) {
  await busy($("#city-form button"), async () => {
    $("#result-status").textContent = "Searching map listings…";
    const data = await Live.places(query);
    if (!data.items?.length) {
      toast(
        "No mapped places were returned for that area. Try a nearby city or neighborhood.",
      );
      return;
    }
    state.data = data;
    state.query = "";
    state.filter = query.category || "All";
    state.savedOnly = false;
    state.mapView = null;
    state.mapNeedsFit = true;
    state.locationChosen = true;
    state.locationMode =
      query.locationMode || (query.lat === undefined ? "city" : "browser");
    $("#city-input").value = data.city === "Near you" ? "" : data.city;
    $("#space-search").value = "";
    update(true);
    toast("Exploring " + data.city + " · " + data.items.length + " places.");
  });
}
async function useLocation() {
  if (!navigator.geolocation) {
    toast(
      "Location is unavailable in this browser. Search for a city or town instead.",
    );
    return;
  }
  if (!capabilities.places) {
    toast(
      "Location search is unavailable. You can still browse the preview collection.",
    );
    return;
  }
  const button = $("#use-location");
  button.disabled = true;
  button.textContent = "Finding your location…";
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      button.disabled = false;
      button.textContent = "◎ Use my location";
      await searchPlaces({
        lat: Number(position.coords.latitude.toFixed(3)),
        lon: Number(position.coords.longitude.toFixed(3)),
      });
    },
    (error) => {
      button.disabled = false;
      button.textContent = "◎ Use my location";
      toast(
        error.code === 1
          ? "Location permission was declined. You can still search for any city or town."
          : "Your location could not be found. Try a city or town instead.",
      );
    },
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
  );
}
async function loadNowPlaying() {
  state.liveCatalog = true;
  state.query = "";
  state.filter = "All";
  $("#space-search").value = "";
  await loadCatalog({ catalog: "now-playing" });
}
function showSources() {
  const root = $("#source-detail");
  root.replaceChildren();
  const data = state.data || base;
  root.append(
    el("p", "", data.note || ""),
    el(
      "p",
      "",
      "Collected " +
        (data.collectedAt
          ? new Date(data.collectedAt).toLocaleString()
          : "date unavailable"),
    ),
  );
  if (id === "recipes")
    root.append(
      el(
        "p",
        "",
        "Live recipe search, categories, ingredients, methods, and photographs come from TheMealDB. More results load on demand; the provider catalog is finite. Personal/development access uses its public test key. Public production use should have a supporter key. No preparation times, nutrition, or allergy guarantees have been inferred.",
      ),
      link("TheMealDB ↗", "https://www.themealdb.com/api.php"),
    );
  else if (id === "movies")
    root.append(
      el(
        "p",
        "",
        "The starter poster collection uses the Studio Ghibli API. Poster images are hosted by TMDB; film artwork belongs to its respective copyright holders. Genres are curated browse labels. This is not an official Studio Ghibli application.",
      ),
      el(
        "p",
        "",
        "Live film discovery searches Wikipedia and loads further result pages on demand. Text is credited to Wikipedia contributors under CC BY-SA 4.0. Images retain their original rights; each film links its artwork source. TMDB provides broader film search and now-playing listings when connected to a server. Regional cinema listings do not include local showtimes.",
      ),
      link("Studio Ghibli API ↗", "https://ghibliapi.vercel.app/"),
      link("TMDB ↗", "https://www.themoviedb.org/"),
      link("Wikipedia ↗", "https://en.wikipedia.org/wiki/Portal:Film"),
    );
  else
    root.append(
      el(
        "p",
        "",
        "Map data © OpenStreetMap contributors, available under the Open Database License. Geographic map tiles are provided by OpenStreetMap. Leaflet is used under its BSD 2-Clause license.",
      ),
      el(
        "p",
        "",
        "Use your browser location or search for a city or town. Your rounded search area is sent to Photon (komoot), with Overpass as a fallback, for OpenStreetMap listings. City names are resolved with Open-Meteo's GeoNames database. Location permission is controlled by your browser. Community services may be busy and listings may be incomplete. The initial Chicago collection is a preview, not a claim about where you are.",
      ),
      el(
        "p",
        "",
        "Business covers use Google's free Maps Embed API in Street View mode when connected and available. The full Google frame and attribution stay visible. The panorama shows the street near a business and may face away from its entrance. Hover food previews are illustrative TheMealDB photographs, not venue photos. Open Street View to explore the panorama interactively.",
      ),
      link(
        "OpenStreetMap attribution ↗",
        "https://www.openstreetmap.org/copyright",
      ),
      link(
        "City lookup: Open-Meteo / GeoNames ↗",
        "https://open-meteo.com/en/docs/geocoding-api",
      ),
      link(
        "Nearby search: Photon / komoot ↗",
        "https://github.com/komoot/photon",
      ),
    );
  if (id === "movies") {
    const logo = el("img", "provider-logo");
    logo.src = "vendor/tmdb-logo.svg";
    logo.alt = "TMDB";
    root.append(
      logo,
      el(
        "p",
        "",
        "This product uses the TMDB API but is not endorsed or certified by TMDB.",
      ),
    );
  }
  $("#space-sources").showModal();
}
function configure() {
  document.documentElement.style.setProperty("--accent", space.accent);
  document.querySelector('[data-nav="' + id + '"]').classList.add("active");
  $("#sidebar-title").textContent = space.label;
  $("#space-symbol").textContent = { recipes: "✳", places: "◎", movies: "◧" }[
    id
  ];
  $("#space-eyebrow").textContent = space.eyebrow;
  $("#space-title").textContent = space.title + ".";
  $("#space-description").textContent = space.subtitle;
  $("#space-search").placeholder = space.search;
  $("#space-search").value = state.query;
  $("#filter-kind").textContent =
    id === "movies" ? "GENRE" : id === "places" ? "KIND" : "CATEGORY";
  $("#space-size").value = state.size;
  $("#space-sort").value = state.sort;
  $("#search-provider").hidden = id !== "recipes";
  $("#city-label").hidden = id !== "places";
  $("#movie-catalog").hidden = id !== "movies";
  $("#map-mode").hidden = id !== "places";
  if (id === "movies") {
    const o = el("option", "", "Newest year");
    o.value = "year";
    $("#space-sort").append(o);
    $("#space-sort").value = state.sort;
  }
}
configure();
canvas = new window.BroadsheetCanvas({
  viewport: $("#space-viewport"),
  world: $("#space-world"),
  container: $("#space-cards"),
  getItems: () => visible,
  getPositions: () => positions,
  getAtlas: () => atlas,
  isActive: () => state.mode === "spatial",
  createCard: makeCard,
  onCommit: () => persist(),
  onLayout: () => persist(),
  onView: (view) => {
    $("#space-zoom").value = Math.round(view.z * 100) + "%";
    $("#zoom-level").textContent =
      view.z < 0.5 ? "OVERVIEW" : view.z >= 1.08 ? "DETAIL" : "BROWSE";
    state.cameras[key()] = { ...view };
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 180);
    exploreAsYouWander(view);
  },
});
$("#space-home").onclick = home;
$("#space-plus").onclick = () => canvas.zoom(1.2);
$("#space-minus").onclick = () => canvas.zoom(1 / 1.2);
$("#space-fit").onclick = () => canvas.fit();
$("#space-tidy").onclick = () => {
  state.atlasLayouts[key()] = {};
  delete state.cameras[key()];
  update(true);
  toast("A little tidier. Your cards are back in place.");
};
$("#space-search").oninput = (e) => {
  state.query = e.target.value;
  update(true);
  queueCatalogSearch();
};
$("#space-search").onkeydown = (e) => {
  if (e.key === "Enter" && id !== "places") {
    state.liveCatalog = true;
    loadCatalog();
  }
};
$("#space-sort").onchange = (e) => {
  state.sort = e.target.value;
  update(true);
};
$("#space-size").onchange = (e) => {
  state.size = e.target.value;
  state.atlasLayouts[key()] = {};
  delete state.cameras[key()];
  update(true);
};
for (const m of ["spatial", "list", "map"])
  $("#" + m + "-mode").onclick = () => {
    state.mode = m;
    renderMode();
    persist();
  };
$("#browse-all").onclick =
  $("#reset-space").onclick =
  $("#clear-space").onclick =
    () => {
      state.query = "";
      state.filter = "All";
      state.savedOnly = false;
      $("#space-search").value = "";
      if (id === "recipes") state.data = null;
      update(true);
      queueCatalogSearch(0);
    };
$("#browse-saved").onclick = () => {
  clearTimeout(searchTimer);
  searchRevision++;
  catalogController?.abort();
  state.savedOnly = true;
  state.query = "";
  state.filter = "All";
  $("#space-search").value = "";
  update(true);
};
$("#search-provider").onclick = searchRecipes;
$("#city-form").onsubmit = (e) => {
  e.preventDefault();
  const city = $("#city-input").value.trim();
  if (city) searchPlaces({ city });
  else toast("Enter a city or town, or choose Use my location.");
};
$("#use-location").onclick = useLocation;
$("#now-playing").onclick = loadNowPlaying;
$("#live-catalog").onclick = () => {
  state.liveCatalog = true;
  loadCatalog();
};
$("#load-more").onclick = () => loadCatalog({ append: true });
$("#refresh-catalog").onclick = () =>
  loadCatalog({ refresh: true, catalog: state.data?.catalog || "all" });
$("#collection-mode").onclick = () => {
  clearTimeout(searchTimer);
  searchRevision++;
  catalogController?.abort();
  state.liveCatalog = false;
  state.data = null;
  state.query = "";
  state.filter = "All";
  $("#space-search").value = "";
  update(true);
};
$("#help-open").onclick = () => $("#space-help").showModal();
$("#sources-open").onclick = showSources;
for (const d of document.querySelectorAll("dialog")) {
  d.querySelectorAll(".dialog-close").forEach((b) => {
    if (b.id !== "close-item") b.onclick = () => d.close();
  });
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
}
window.addEventListener("pagehide", persist);
function refreshVisibleCatalog() {
  if (
    id === "places" ||
    !state.liveCatalog ||
    state.savedOnly ||
    window.BROADSHEET_OFFLINE ||
    document.visibilityState !== "visible" ||
    document.activeElement === $("#space-search")
  )
    return;
  const age = Date.now() - Date.parse(state.data?.collectedAt || 0);
  if (age > 900000)
    loadCatalog({ refresh: true, catalog: state.data?.catalog || "all" });
}
document.addEventListener("visibilitychange", refreshVisibleCatalog);
setInterval(refreshVisibleCatalog, 900000);
window.addEventListener("keydown", (e) => {
  if (
    e.target.closest("input,select,button,a,textarea") ||
    document.querySelector("dialog[open]")
  )
    return;
  if (e.key === "+" || e.key === "=") canvas.zoom(1.2);
  else if (e.key === "-") canvas.zoom(1 / 1.2);
  else if (e.key.toLowerCase() === "h") home();
  else if (e.key.startsWith("Arrow")) {
    e.preventDefault();
    canvas.pan(
      e.key === "ArrowLeft" ? 100 : e.key === "ArrowRight" ? -100 : 0,
      e.key === "ArrowUp" ? 100 : e.key === "ArrowDown" ? -100 : 0,
    );
  }
});
async function init() {
  try {
    bundle =
      window.BROADSHEET_DISCOVERY ||
      (await (await fetch("discovery.json")).json());
    base = bundle[id] || { items: [] };
    if (!Array.isArray(base.items)) throw Error("Collection unavailable");
    if (state.data && !Array.isArray(state.data.items)) state.data = null;
    const params = new URLSearchParams(location.search);
    if (params.get("saved") === "1") {
      state.savedOnly = true;
      state.query = "";
      state.filter = "All";
      $("#space-search").value = "";
    }
    update(true);
    const focus = params.get("focus");
    if (focus) {
      const item =
        items.find((i) => i.id === focus) ||
        S.recent().find((i) => i.id === focus && i.kind === id);
      if (item) openDetails(item);
    }
    try {
      if (window.BROADSHEET_OFFLINE) throw Error("Offline snapshot");
      if (
        location.hostname.endsWith("github.io") &&
        !window.BROADSHEET_CONFIG?.apiBase
      )
        throw Error("Static host");
      capabilities = { places: true, ...(await request("api/capabilities")) };
      if (id === "places") {
        canvas.clear();
        canvas.request();
        if (state.mode === "list") renderList();
      }
    } catch {}
    if (id !== "places" && state.liveCatalog && !state.savedOnly && !focus)
      queueCatalogSearch(0);
    if (id === "places") {
      if (!$("#city-input").value)
        $("#city-input").value =
          state.locationChosen && state.data?.city !== "Near you"
            ? state.data?.city || ""
            : "";
      if (state.locationMode !== "city" && capabilities.places) {
        try {
          if (
            (await navigator.permissions.query({ name: "geolocation" }))
              .state === "granted"
          )
            useLocation();
        } catch {}
      }
    }
  } catch (e) {
    $("#result-status").textContent = "This collection could not be loaded.";
    toast(e.message);
  }
}
init();
