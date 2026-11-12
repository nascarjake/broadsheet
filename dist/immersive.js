/* Shared, screen-filling shell. Content keeps its own canvas and controls. */
const news = !document.body.dataset.space;
const label = news
  ? "News"
  : document.body.dataset.space.replace(/^./, (c) => c.toUpperCase());
const find = (selector) => document.querySelector(selector);
const header = find(news ? ".masthead" : ".global-header");
const sidebar = find(news ? "#sidebar" : ".space-sidebar");
const search = find(news ? "#search" : "#space-search");
const tools = find(news ? "#map-tools" : ".space-canvas-tools");
const hud = document.createElement("div");
hud.id = "immersive-hud";
hud.innerHTML = `
  <div class="imm-home imm-anchor" data-edge="top">
    <button class="imm-trigger imm-space-trigger" data-panel="spaces" aria-label="Switch spaces" aria-expanded="false"><span>${label}</span><span class="imm-chevron">⌄</span></button>
  </div>
  <button class="imm-trigger imm-browse imm-anchor" data-edge="left" data-panel="browse" aria-expanded="false"><span class="imm-icon">☷</span><span>Browse</span></button>
  <button class="imm-trigger imm-find imm-anchor" data-edge="top" data-panel="find" aria-expanded="false"><span class="imm-icon">⌕</span><span>Find & filter</span><kbd>/</kbd></button>
  <button class="imm-trigger imm-lens imm-anchor" data-edge="bottom" data-panel="lens" aria-expanded="false"><span class="imm-icon">⊙</span><span>Zoom & arrange</span></button>
  <p class="imm-arrival" aria-hidden="true">A little room to wander.<span>Drag to explore · zoom to discover</span></p>`;
document.body.prepend(hud);
const brand = header.querySelector(".brand");
hud.querySelector(".imm-home").prepend(brand);
const panels = new Map();
for (const [id, title] of [
  ["spaces", "Your spaces"],
  ["browse", `Browse ${label.toLowerCase()}`],
  ["find", "Find your next discovery"],
  ["lens", "Your point of view"],
]) {
  const panel = document.createElement("section");
  panel.id = `imm-panel-${id}`;
  panel.className = `imm-panel imm-panel-${id}`;
  panel.setAttribute("aria-label", title);
  panel.inert = true;
  panel.setAttribute("aria-hidden", "true");
  const top = document.createElement("div");
  top.className = "imm-panel-top";
  const caption = document.createElement("span");
  caption.textContent = title;
  const close = document.createElement("button");
  close.className = "imm-close";
  close.setAttribute("aria-label", `Close ${title.toLowerCase()}`);
  close.textContent = "×";
  close.onclick = () => dismiss(true);
  top.append(caption, close);
  panel.append(top);
  hud.append(panel);
  panels.set(id, panel);
  hud
    .querySelector(`[data-panel="${id}"]`)
    .setAttribute("aria-controls", panel.id);
}
panels.get("spaces").append(header);
if (news) {
  const nav = document.createElement("nav");
  nav.setAttribute("aria-label", "Spaces");
  nav.innerHTML =
    '<a href="index.html">Explore</a><a href="news.html" aria-current="page">News</a><a href="recipes.html">Recipes</a><a href="places.html">Places</a><a href="movies.html">Movies</a><a href="memes.html">Memes</a>';
  panels.get("spaces").insertBefore(nav, header);
}
panels.get("browse").append(sidebar);
for (const selector of news
  ? [".workspace-heading", ".toolbar", ".edition-strip", ".workspace > footer"]
  : [
      ".space-heading",
      ".discovery-toolbar",
      ".space-status",
      ".space-footer",
    ]) {
  const element = find(selector);
  if (element) panels.get("find").append(element);
}
panels.get("lens").append(tools);
// Help and attribution remain reachable without a permanently occupied sidebar.
if (news) {
  const help = find("#about");
  help.textContent = "How to wander ↗";
  panels.get("lens").append(help);
} else {
  panels.get("lens").append(find("#help-open"), find("#sources-open"));
}
let open = null;
let lastTrigger = null;
let idleTimer;
const triggers = [...hud.querySelectorAll("[data-panel]")];
function dismiss(restoreFocus = false) {
  for (const panel of panels.values()) {
    panel.classList.remove("is-open");
    panel.inert = true;
    panel.setAttribute("aria-hidden", "true");
  }
  triggers.forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
  open = null;
  document.body.classList.remove("imm-panel-open");
  if (restoreFocus) lastTrigger?.focus({ preventScroll: true });
}
function reveal(id, focusSearch = false) {
  dismiss();
  open = id;
  const panel = panels.get(id);
  panel.inert = false;
  panel.removeAttribute("aria-hidden");
  panel.classList.add("is-open");
  lastTrigger = triggers.find((trigger) => trigger.dataset.panel === id);
  lastTrigger.setAttribute("aria-expanded", "true");
  document.body.classList.add("imm-panel-open");
  if (focusSearch) {
    // Flush the hidden-to-visible style before focusing, including in background tabs.
    panel.getBoundingClientRect();
    search.focus({ preventScroll: true });
    setTimeout(() => {
      if (
        open === id &&
        (document.activeElement === lastTrigger ||
          document.activeElement === document.body ||
          document.activeElement?.matches("#viewport,#space-viewport"))
      )
        search.focus({ preventScroll: true });
    }, 0);
  }
}
for (const trigger of triggers)
  trigger.onclick = () => {
    if (open === trigger.dataset.panel) dismiss();
    else reveal(trigger.dataset.panel, trigger.dataset.panel === "find");
  };
// The existing news menu is also a working entry to the floating browser.
if (news) find("#menu-toggle").onclick = () => reveal("browse");
document.addEventListener(
  "pointerdown",
  (event) => {
    if (!hud.contains(event.target)) dismiss();
    document.body.classList.remove("imm-arriving");
  },
  { capture: true },
);
document.addEventListener(
  "keydown",
  (event) => {
    if (document.querySelector("dialog[open]")) return;
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopImmediatePropagation();
      dismiss(true);
      return;
    }
    if (
      event.key === "/" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.target.closest("input,textarea,select,[contenteditable=true]")
    ) {
      event.preventDefault();
      reveal("find", true);
    }
  },
  { capture: true },
);
// Approach an edge and its controls wake up. Moving through the canvas lets them recede.
document.addEventListener(
  "pointermove",
  (event) => {
    if (event.pointerType === "touch") return;
    clearTimeout(idleTimer);
    const top = event.clientY < 120;
    const left = event.clientX < 115;
    const bottom = event.clientY > innerHeight - 105;
    for (const anchor of hud.querySelectorAll(".imm-anchor"))
      anchor.classList.toggle(
        "is-near",
        { top, left, bottom }[anchor.dataset.edge],
      );
    idleTimer = setTimeout(() => {
      hud
        .querySelectorAll(".is-near")
        .forEach((anchor) => anchor.classList.remove("is-near"));
    }, 1800);
  },
  { passive: true },
);
document.addEventListener(
  "wheel",
  (event) => {
    document.body.classList.remove("imm-arriving");
    if (!hud.contains(event.target)) dismiss();
  },
  { passive: true },
);
// Keep an active search visible even when its panel is tucked away.
const filterChips = find(news ? "#topic-chips" : "#filter-pills");
function searchHint() {
  const terms = [
    search.value.trim(),
    ...[...filterChips.querySelectorAll('[aria-pressed="true"]')]
      .map((chip) => chip.textContent.trim())
      .filter((term) => !/^All(?: topics)?$/i.test(term)),
  ].filter(Boolean);
  const hint = terms.join(" · ");
  const trigger = hud.querySelector(".imm-find");
  trigger.querySelector("span:not(.imm-icon)").textContent =
    hint.length > 23 ? hint.slice(0, 21) + "…" : hint || "Find & filter";
  trigger.setAttribute(
    "aria-label",
    hint ? `Find & filter: ${hint}` : "Find & filter",
  );
}
search.addEventListener("input", searchHint);
new MutationObserver(searchHint).observe(filterChips, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["aria-pressed"],
});
searchHint();
if (!news) {
  const context = document.createElement("div");
  context.className = "imm-context";
  const scope = document.createElement("strong"),
    count = document.createElement("span");
  context.append(scope, count);
  hud.append(context);
  const update = () => {
    scope.textContent = find("#space-eyebrow").textContent;
    count.textContent = find("#result-status").textContent;
  };
  const observer = new MutationObserver(update);
  for (const selector of ["#space-eyebrow", "#result-status"])
    observer.observe(find(selector), {
      childList: true,
      characterData: true,
      subtree: true,
    });
  update();
}
document.body.classList.add("immersive", "imm-arriving");
setTimeout(() => document.body.classList.remove("imm-arriving"), 3200);
