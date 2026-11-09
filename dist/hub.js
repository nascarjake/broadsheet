const $ = (s) => document.querySelector(s),
  S = window.BroadsheetSpaces;
let selected = "All";
const names = {
  news: "News",
  recipes: "Recipes",
  places: "Places",
  movies: "Movies",
};
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function image(src) {
  try {
    const u = new URL(src, location.href);
    return (u.origin === location.origin && u.pathname.includes("/images/")) ||
      [
        "www.themealdb.com",
        "themealdb.com",
        "image.tmdb.org",
        "upload.wikimedia.org",
      ].includes(u.hostname)
      ? u.href
      : "";
  } catch {
    return "";
  }
}
function renderRecent() {
  const items = S.recent().slice(0, 6);
  $("#recent-section").hidden = !items.length;
  $("#recent-grid").replaceChildren(
    ...items.map((item) => {
      const a = el("a", "collection-card");
      a.href =
        (item.kind === "news" ? "news.html" : S.registry[item.kind].link) +
        "?focus=" +
        encodeURIComponent(item.id);
      const src = image(item.image);
      if (src) {
        const img = el("img");
        img.src = src;
        img.alt = item.title;
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        a.append(img);
      }
      a.append(el("small", "", names[item.kind]), el("h3", "", item.title));
      return a;
    }),
  );
}
$("#clear-recent").onclick = () => {
  try {
    localStorage.removeItem("broadsheet.recent.v1");
  } catch {}
  renderRecent();
};
function renderCollection() {
  renderRecent();
  const all = S.collection(),
    items = all.filter((i) => selected === "All" || i.kind === selected);
  $("#total-saved").textContent = all.length ? "(" + all.length + ")" : "";
  $("#collection-filters").replaceChildren(
    ...["All", ...Object.keys(names)].map((id) => {
      const b = el(
        "button",
        "pill" + (id === selected ? " active" : ""),
        id === "All" ? "Everything" : names[id],
      );
      b.setAttribute("aria-pressed", id === selected);
      b.onclick = () => {
        selected = id;
        renderCollection();
      };
      return b;
    }),
  );
  const grid = $("#collection-grid");
  grid.replaceChildren();
  if (!items.length) {
    const empty = el("div", "collection-empty");
    empty.append(
      el("span", "", "♡"),
      document.createTextNode(
        selected === "All"
          ? "A little space for your next good find."
          : "Nothing saved here just yet.",
      ),
      el(
        "p",
        "",
        "Tap the heart on a recipe, place, or film—or Save on a news story. It will be waiting here when you come back.",
      ),
    );
    grid.append(empty);
    return;
  }
  for (const item of items) {
    const a = el("a", "collection-card");
    a.href =
      (item.kind === "news" ? "news.html" : S.registry[item.kind].link) +
      "?saved=1&focus=" +
      encodeURIComponent(item.id);
    const src = image(item.image);
    if (src) {
      const img = el("img");
      img.src = src;
      img.alt = item.title;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => (img.hidden = true);
      a.append(img);
    }
    a.append(el("small", "", names[item.kind]), el("h3", "", item.title));
    grid.append(a);
  }
}
async function init() {
  renderCollection();
  try {
    const data =
      window.BROADSHEET_DISCOVERY ||
      (await (await fetch("discovery.json")).json());
    const recipe =
      data.recipes.items.find((r) => /salmon/i.test(r.title)) ||
      data.recipes.items[0];
    if (recipe?.image) $("#recipe-cover").src = image(recipe.image);
    const movies = data.movies.items;
    const one = movies.find((m) => m.title === "Spirited Away") || movies[0],
      two = movies.find((m) => m.title === "Howl's Moving Castle") || movies[1];
    if (one?.image) {
      $("#film-cover-one").src = image(one.image);
      $("#film-cover-one").alt = one.title + " poster";
    }
    if (two?.image) {
      $("#film-cover-two").src = image(two.image);
      $("#film-cover-two").alt = two.title + " poster";
    }
  } catch {}
}
window.addEventListener("pageshow", renderCollection);
window.addEventListener("storage", renderCollection);
init();
