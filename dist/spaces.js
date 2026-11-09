/* Adding a domain requires a registry entry, normalized items, and a card renderer. */
(function (root) {
  const registry = {
    recipes: {
      id: "recipes",
      title: "The kitchen",
      label: "Recipes",
      subtitle: "Something delicious is just around the corner.",
      eyebrow: "FOLLOW YOUR APPETITE",
      noun: "recipes",
      accent: "#a35a3b",
      card: { w: 300, h: 420 },
      filters: [
        "All",
        "Vegetarian",
        "Chicken",
        "Seafood",
        "Pasta",
        "Dessert",
        "Beef",
        "Vegan",
        "Breakfast",
        "Goat",
        "Lamb",
        "Miscellaneous",
        "Pork",
        "Side",
        "Starter",
      ],
      search: "Find a recipe or ingredient…",
      source: "TheMealDB",
      view: "mosaic",
      link: "recipes.html",
    },
    places: {
      id: "places",
      title: "Out & about",
      label: "Places",
      subtitle: "A table, a good coffee, a little adventure.",
      eyebrow: "MAKE A DAY OF IT",
      noun: "places",
      accent: "#50766f",
      card: { w: 330, h: 430 },
      filters: [
        "All",
        "Restaurants",
        "Cafés",
        "Museums",
        "Art & culture",
        "Cinema",
        "Things to do",
      ],
      search: "Search places or cuisines…",
      source: "OpenStreetMap",
      view: "mosaic",
      link: "places.html",
    },
    movies: {
      id: "movies",
      title: "Find your next film",
      label: "Movies",
      subtitle: "Follow a poster. Find a whole new world.",
      eyebrow: "FOR THE LOVE OF CINEMA",
      noun: "films",
      accent: "#826393",
      card: { w: 270, h: 470 },
      filters: [
        "All",
        "Fantasy",
        "Adventure",
        "Drama",
        "Family",
        "Romance",
        "Comedy",
        "Mystery",
        "Action",
        "Science fiction",
        "Thriller",
        "Horror",
        "Documentary",
        "Crime",
        "History",
        "War",
      ],
      search: "Search films, genres, directors…",
      source: "Studio Ghibli API",
      view: "posters",
      link: "movies.html",
    },
  };
  const storageKey = (id) => "broadsheet.space." + id + ".v1";
  function tags(item) {
    return [...new Set([item.category, ...(item.tags || [])].filter(Boolean))];
  }
  function filter(items, state) {
    const q = (state.query || "").toLocaleLowerCase().trim(),
      selected = state.filter || "All";
    return items
      .filter(
        (i) =>
          (!state.savedOnly ||
            (state.saved || []).some((s) => s.id === i.id)) &&
          (selected === "All" ||
            tags(i).some((t) => t.toLowerCase() === selected.toLowerCase())) &&
          (!q ||
            [
              i.title,
              i.description,
              i.cuisine,
              i.director,
              i.city,
              ...tags(i),
              ...(i.ingredients || []).map((x) => x.name),
            ]
              .join(" ")
              .toLocaleLowerCase()
              .includes(q)),
      )
      .sort((a, b) =>
        state.sort === "title"
          ? a.title.localeCompare(b.title)
          : state.sort === "year"
            ? (Number(b.year) || 0) - (Number(a.year) || 0)
            : 0,
      );
  }
  function arrange(items, space, size = "comfortable") {
    const base = registry[space].card,
      scale = size === "compact" ? 0.8 : size === "large" ? 1.22 : 1,
      w = Math.round(base.w * scale),
      columns = space === "movies" ? 5 : 4,
      ys = Array(columns).fill(0),
      result = {};
    items.forEach((item, i) => {
      const col = ys.indexOf(Math.min(...ys)),
        variation = space === "recipes" ? [0, 52, -30, 25][i % 4] : 0,
        h = Math.round((base.h + variation) * scale);
      result[item.id] = { x: col * (w + 22), y: ys[col], w, h };
      ys[col] += h + 22;
    });
    return result;
  }
  function load(id) {
    let value = {};
    try {
      value = JSON.parse(localStorage.getItem(storageKey(id)) || "{}");
    } catch {}
    return value && typeof value === "object" ? value : {};
  }
  function collection() {
    const all = [];
    for (const id of Object.keys(registry)) {
      const data = load(id);
      for (const item of data.saved || [])
        if (item?.id && item?.title) all.push({ ...item, kind: id });
    }
    try {
      const news = JSON.parse(
        localStorage.getItem("broadsheet.workspace.v3") || "{}",
      );
      for (const item of news.savedStories || [])
        if (news.saved?.includes(item.id))
          all.push({
            ...item,
            kind: "news",
            image: item.blocks?.find((b) => b.type === "image")?.src || "",
          });
    } catch {}
    return all;
  }
  function record(item) {
    try {
      const key = "broadsheet.recent.v1",
        old = JSON.parse(localStorage.getItem(key) || "[]");
      localStorage.setItem(
        key,
        JSON.stringify(
          [
            { ...item, image: item.image || "", at: Date.now() },
            ...old.filter((x) => x.kind !== item.kind || x.id !== item.id),
          ].slice(0, 12),
        ),
      );
    } catch {}
  }
  function recent() {
    try {
      return JSON.parse(
        localStorage.getItem("broadsheet.recent.v1") || "[]",
      ).filter(
        (i) => i?.source && i?.id && (registry[i.kind] || i.kind === "news"),
      );
    } catch {
      return [];
    }
  }
  const api = {
    recent,
    registry,
    tags,
    filter,
    arrange,
    load,
    storageKey,
    collection,
    record,
  };
  root.BroadsheetSpaces = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
