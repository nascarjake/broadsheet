/* Public catalog APIs that work on static hosting. No account tokens live here. */
(function (root) {
  const cache = new Map();
  const PAGE_SIZE = 24;
  const safeURL = (value) => {
    try {
      const u = new URL(value);
      return ["https:", "http:"].includes(u.protocol) ? u.href : "";
    } catch {
      return "";
    }
  };
  async function json(url, signal) {
    signal?.throwIfAborted();
    const old = cache.get(url);
    if (old && Date.now() - old.time < 600000) return old.data;
    const response = await fetch(url, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
      credentials: "omit",
    });
    if (!response.ok)
      throw Error("The catalog is temporarily unavailable. Try again shortly.");
    const data = await response.json();
    if (data.error) throw Error("The catalog could not complete this search.");
    cache.set(url, { time: Date.now(), data });
    if (cache.size > 96) cache.delete(cache.keys().next().value);
    return data;
  }
  const mealURL = (path, params) =>
    "https://www.themealdb.com/api/json/v1/1/" +
    path +
    "?" +
    new URLSearchParams(params);
  function recipeItem(m, category = "Recipe") {
    const ingredients = Array.from({ length: 20 }, (_, n) => ({
      name: (m["strIngredient" + (n + 1)] || "").trim(),
      amount: (m["strMeasure" + (n + 1)] || "").trim(),
    })).filter((i) => i.name);
    const image = safeURL(m.strMealThumb);
    return {
      id: "recipe-" + m.idMeal,
      kind: "recipes",
      title: m.strMeal,
      image,
      images: image ? [image] : [],
      category: m.strCategory || category,
      cuisine: m.strArea || "",
      tags: [
        m.strCategory || category,
        m.strArea,
        ...(m.strTags || "").split(","),
      ].filter(Boolean),
      ingredients,
      steps: (m.strInstructions || "")
        .split(/\r?\n+/)
        .map((s) => s.trim())
        .filter(Boolean),
      instructions: m.strInstructions || "",
      description: ingredients
        .slice(0, 5)
        .map((i) => i.name)
        .join(", "),
      url:
        safeURL(m.strSource) ||
        "https://www.themealdb.com/meal/" + encodeURIComponent(m.idMeal),
      video: safeURL(m.strYoutube),
      source: "TheMealDB",
      sourceUrl: "https://www.themealdb.com/",
      imageCredit: "TheMealDB contributor photograph",
      imageLicense: "Provider terms; contributor rights retained",
      needsDetails: !m.strInstructions,
    };
  }
  async function recipes({
    query = "",
    category = "All",
    cuisine = "All",
    meal = "All",
    source = "photo",
    cursor = null,
    signal,
  } = {}) {
    if (source === "cookbook")
      return cookbookRecipes({
        query,
        category,
        cuisine,
        meal,
        cursor,
        signal,
      });
    query = query.trim().slice(0, 80);
    const mealCategories = {
      Breakfast: ["Breakfast"],
      Lunch: [
        "Chicken",
        "Seafood",
        "Pasta",
        "Vegetarian",
        "Vegan",
        "Side",
        "Starter",
        "Miscellaneous",
      ],
      Dinner: [
        "Beef",
        "Chicken",
        "Goat",
        "Lamb",
        "Pasta",
        "Pork",
        "Seafood",
        "Vegetarian",
        "Vegan",
        "Miscellaneous",
      ],
      Snacks: ["Side", "Starter"],
      Dessert: ["Dessert"],
    };
    if (meal !== "All" && !mealCategories[meal])
      throw Error("Choose a listed meal inspiration.");
    let offset = cursor?.offset || 0,
      letter = cursor?.letter || 0,
      meals = [];
    const alpha = "abcdefghijklmnopqrstuvwxyz";
    if (query) {
      const responses = await Promise.allSettled([
        json(mealURL("search.php", { s: query }), signal),
        json(mealURL("filter.php", { i: query.replace(/\s+/g, "_") }), signal),
      ]);
      if (responses.every((r) => r.status === "rejected"))
        throw responses[0].reason;
      const unique = new Map();
      for (const meal of responses.flatMap((r) =>
        r.status === "fulfilled" ? r.value.meals || [] : [],
      ))
        if (!unique.has(meal.idMeal) || meal.strInstructions)
          unique.set(meal.idMeal, meal);
      meals = [...unique.values()];
      if (category !== "All") {
        const allowed = new Set(
          (
            await json(mealURL("filter.php", { c: category }), signal)
          ).meals?.map((m) => m.idMeal) || [],
        );
        meals = meals.filter((m) => allowed.has(m.idMeal));
      }
    } else if (cuisine !== "All") {
      meals =
        (await json(mealURL("filter.php", { a: cuisine }), signal)).meals || [];
    } else if (meal !== "All") {
      const parts = await Promise.all(
        mealCategories[meal].map(async (c) =>
          ((await json(mealURL("filter.php", { c }), signal)).meals || []).map(
            (m) => ({ ...m, strCategory: c }),
          ),
        ),
      );
      meals = [...new Map(parts.flat().map((m) => [m.idMeal, m])).values()];
    } else if (category !== "All") {
      meals =
        (await json(mealURL("filter.php", { c: category }), signal)).meals ||
        [];
    } else {
      // Letter browsing is documented by the provider; no fixed 40/50-item ceiling.
      while (letter < alpha.length) {
        meals =
          (await json(mealURL("search.php", { f: alpha[letter] }), signal))
            .meals || [];
        if (offset < meals.length) break;
        offset = 0;
        letter++;
      }
    }
    if (cuisine !== "All") {
      const allowed = new Set(
        (
          (await json(mealURL("filter.php", { a: cuisine }), signal)).meals ||
          []
        ).map((m) => m.idMeal),
      );
      meals = meals
        .filter((m) => allowed.has(m.idMeal))
        .map((m) => ({ ...m, strArea: cuisine }));
    }
    if (category !== "All" && (cuisine !== "All" || meal !== "All")) {
      const allowed = new Set(
        (
          (await json(mealURL("filter.php", { c: category }), signal)).meals ||
          []
        ).map((m) => m.idMeal),
      );
      meals = meals
        .filter((m) => allowed.has(m.idMeal))
        .map((m) => ({ ...m, strCategory: category }));
    }
    if (meal !== "All") {
      const groups = await Promise.all(
        mealCategories[meal].map(async (c) =>
          ((await json(mealURL("filter.php", { c }), signal)).meals || []).map(
            (m) => ({ ...m, strCategory: c }),
          ),
        ),
      );
      const allowed = new Map(
        groups.flat().map((m) => [m.idMeal, m.strCategory]),
      );
      meals = meals
        .filter((m) => allowed.has(m.idMeal))
        .map((m) => ({
          ...m,
          strCategory: m.strCategory || allowed.get(m.idMeal),
        }));
    }
    const scoped =
      query || category !== "All" || cuisine !== "All" || meal !== "All";
    const end = offset + PAGE_SIZE;
    const next =
      end < meals.length
        ? { letter, offset: end }
        : !scoped && letter < 25
          ? { letter: letter + 1, offset: 0 }
          : null;
    return {
      items: meals
        .slice(offset, end)
        .map((m) => recipeItem(m, category === "All" ? "Recipe" : category)),
      provider: "TheMealDB",
      query,
      filter: category,
      cuisine,
      meal,
      next,
      live: true,
      total: scoped ? meals.length : null,
      collectedAt: new Date().toISOString(),
      note: [
        cuisine !== "All" ? cuisine + " cuisine" : "",
        meal !== "All"
          ? meal + " inspiration (editorial category grouping)"
          : "",
        query
          ? "Live dish and ingredient search · TheMealDB"
          : category !== "All"
            ? "Live " + category + " recipes · TheMealDB"
            : "Live recipe catalog · TheMealDB · browse A–Z",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
  const cookbookURL = (params) =>
    "https://en.wikibooks.org/w/api.php?" +
    new URLSearchParams({ format: "json", origin: "*", ...params });
  async function cookbookOptions(signal) {
    const categories = async (title) =>
      (
        await json(
          cookbookURL({
            action: "query",
            list: "categorymembers",
            cmtitle: "Category:" + title,
            cmtype: "subcat",
            cmlimit: 500,
          }),
          signal,
        )
      ).query?.categorymembers?.map((c) => c.title.slice(9)) || [];
    const [types, origins, meals] = await Promise.all([
      categories("Recipes by type"),
      categories("Recipes by origin"),
      categories("Recipes by meal or course"),
    ]);
    const sub = await Promise.all(origins.map(categories));
    const regional = [...new Set(sub.flat())].filter(
      (c) =>
        /^(?:East|South|Southeast|Central|North|West) (?:Asian|American|African) recipes$/.test(
          c,
        ) || c === "Caribbean recipes",
    );
    const countries = await Promise.all(regional.map(categories));
    return {
      categories: types,
      cuisines: [
        ...new Set([...origins, ...sub.flat(), ...countries.flat()]),
      ].sort(),
      meals,
    };
  }
  async function cookbookRecipes({
    query = "",
    category = "All",
    cuisine = "All",
    meal = "All",
    cursor,
    signal,
  }) {
    const term = query
      .trim()
      .slice(0, 80)
      .replace(/[^\p{L}\p{N}\s'’-]/gu, " ");
    const categoryTerm = (value) =>
      value === "All" ? "" : 'deepcat:"' + value.replace(/["|]/g, "") + '"';
    const search = [
      "incategory:Recipes",
      term,
      categoryTerm(category),
      categoryTerm(cuisine),
      categoryTerm(meal),
    ]
      .filter(Boolean)
      .join(" ");
    const data = await json(
      cookbookURL({
        action: "query",
        generator: "search",
        gsrnamespace: 102,
        gsrsearch: search,
        gsrlimit: 20,
        gsroffset: cursor?.offset || 0,
        gsrsort: term ? "relevance" : "last_edit_desc",
        list: "search",
        srnamespace: 102,
        srsearch: search,
        srlimit: 1,
        srinfo: "totalhits",
        prop: "pageimages|info",
        piprop: "thumbnail|name",
        pithumbsize: 600,
        pilicense: "any",
        inprop: "url",
      }),
      signal,
    );
    if (data.error)
      throw Error(
        "The community cookbook could not complete this search. Try a narrower culture or recipe type.",
      );
    return {
      items: Object.values(data.query?.pages || {})
        .sort((a, b) => a.index - b.index)
        .map((p) => ({
          id: "cookbook-" + p.pageid,
          kind: "recipes",
          title: p.title.replace(/^Cookbook:/, ""),
          wikiTitle: p.title,
          image: safeURL(p.thumbnail?.source),
          images: p.thumbnail?.source ? [safeURL(p.thumbnail.source)] : [],
          category: category === "All" ? "Community recipe" : category,
          cuisine: cuisine === "All" ? "" : cuisine,
          tags: [category, cuisine, meal].filter((t) => t !== "All"),
          ingredients: [],
          steps: [],
          needsDetails: true,
          source: "Wikibooks Cookbook",
          sourceUrl: "https://en.wikibooks.org/?curid=" + p.pageid,
          url:
            safeURL(p.fullurl) || "https://en.wikibooks.org/?curid=" + p.pageid,
          textLicense:
            "Wikibooks contributors · CC BY-SA 4.0 · formatting adapted",
          imageCredit:
            "Original file contributors; see image source for credits and license",
          imageSourceUrl: p.pageimage
            ? "https://en.wikibooks.org/wiki/File:" +
              encodeURIComponent(p.pageimage)
            : "",
        })),
      provider: "Wikibooks Cookbook",
      query: query.trim(),
      filter: category,
      cuisine,
      meal,
      total: data.query?.searchinfo?.totalhits || null,
      next: Number.isInteger(data.continue?.gsroffset)
        ? { offset: data.continue.gsroffset }
        : null,
      live: true,
      collectedAt: new Date().toISOString(),
      note: "Wikibooks community cookbook · source categories · CC BY-SA 4.0",
    };
  }
  async function cookbookDetails(item, signal) {
    const data = await json(
      cookbookURL({ action: "parse", pageid: item.id.slice(9), prop: "text" }),
      signal,
    );
    if (!data.parse?.text?.["*"])
      throw Error("This community recipe is unavailable.");
    const doc = new DOMParser().parseFromString(
      data.parse.text["*"],
      "text/html",
    );
    doc
      .querySelectorAll(
        "script,style,.mw-editsection,table,nav,.navbox,.metadata,.noprint",
      )
      .forEach((n) => n.remove());
    let section = "intro";
    const ingredients = [],
      steps = [],
      notes = [],
      intro = [];
    for (const n of doc.querySelectorAll("h2,h3,ul,ol,p")) {
      if (n.closest("li")) continue;
      const text = n.textContent.replace(/\s+/g, " ").trim();
      if (!text) continue;
      if (/^H[23]$/.test(n.tagName)) {
        section = /ingredients/i.test(text)
          ? "ingredients"
          : /procedure|method|directions|preparation|instructions/i.test(text)
            ? "method"
            : /notes|tips|variation|warning/i.test(text)
              ? "notes"
              : n.tagName === "H3"
                ? section
                : "other";
        continue;
      }
      const lines = /^[OU]L$/.test(n.tagName)
        ? [...n.children]
            .filter((c) => c.tagName === "LI")
            .map((c) => c.textContent.replace(/\s+/g, " ").trim())
        : [text];
      if (section === "ingredients")
        ingredients.push(...lines.map((name) => ({ name, amount: "" })));
      if (section === "method") steps.push(...lines);
      if (section === "notes") notes.push(...lines);
      if (
        section === "intro" &&
        n.tagName === "P" &&
        !/^Cookbook\s*\|/.test(text)
      )
        intro.push(text);
    }
    return {
      ...item,
      description: intro.join("\n"),
      ingredients,
      steps,
      instructions: steps.join("\n"),
      recipeNotes: notes,
      needsDetails: false,
    };
  }
  async function recipeOptions({ source = "photo", signal } = {}) {
    if (source === "cookbook") return cookbookOptions(signal);
    const [categories, areas] = await Promise.all([
      json(mealURL("list.php", { c: "list" }), signal),
      json(mealURL("list.php", { a: "list" }), signal),
    ]);
    return {
      categories: (categories.meals || [])
        .map((m) => m.strCategory)
        .filter(Boolean),
      cuisines: (areas.meals || [])
        .map((m) => m.strArea)
        .filter(Boolean)
        .sort(),
    };
  }
  async function recipeDetails(item, signal) {
    if (/^cookbook-\d+$/.test(item.id)) return cookbookDetails(item, signal);
    if (!/^recipe-\d+$/.test(item.id))
      throw Error("Recipe details unavailable.");
    const result = await json(
      mealURL("lookup.php", { i: item.id.slice(7) }),
      signal,
    );
    if (!result.meals?.[0])
      throw Error("The original recipe is no longer available.");
    return recipeItem(result.meals[0]);
  }
  function filmItem(p) {
    const image = safeURL(p.thumbnail?.source),
      file = p.pageimage;
    return {
      id: "wiki-film-" + p.pageid,
      kind: "movies",
      title: p.title,
      image,
      images: image ? [image] : [],
      description: p.extract || "Read the source article for film details.",
      tags: [],
      category: "Film",
      catalog: "Wikipedia film discovery",
      url: safeURL(p.fullurl) || "https://en.wikipedia.org/?curid=" + p.pageid,
      source: "Wikipedia",
      sourceUrl: "https://en.wikipedia.org/?curid=" + p.pageid,
      textLicense: "Wikipedia contributors · CC BY-SA 4.0",
      imageCredit:
        "Film artwork: original rights holders; see the image source for rights and credits",
      imageLicense: "See original file description",
      imageSourceUrl: file
        ? "https://en.wikipedia.org/wiki/File:" + encodeURIComponent(file)
        : "",
    };
  }
  async function movies({
    query = "",
    genre = "All",
    cursor = null,
    signal,
  } = {}) {
    const term = query
      .trim()
      .slice(0, 100)
      .replace(/[^\p{L}\p{N}\s'’-]/gu, " ");
    const genreTerm = genre === "All" ? "" : genre + " film";
    const params = {
      action: "query",
      format: "json",
      origin: "*",
      generator: "search",
      gsrsearch: [
        term,
        genreTerm,
        "hastemplate:Infobox_film",
        '-intitle:"List of"',
        "-intitle:trilogy",
      ]
        .filter(Boolean)
        .join(" "),
      gsrlimit: 20,
      gsroffset: cursor?.offset || 0,
      gsrnamespace: 0,
      gsrsort: term || genreTerm ? "relevance" : "last_edit_desc",
      prop: "pageimages|extracts|info",
      piprop: "thumbnail|name",
      pithumbsize: 500,
      pilicense: "any",
      exintro: 1,
      explaintext: 1,
      exsentences: 3,
      exlimit: 20,
      inprop: "url",
    };
    const data = await json(
      "https://en.wikipedia.org/w/api.php?" + new URLSearchParams(params),
      signal,
    );
    const pages = Object.values(data.query?.pages || {}).sort(
      (a, b) => a.index - b.index,
    );
    return {
      items: pages.map(filmItem),
      provider: "Wikipedia",
      query,
      filter: genre,
      live: true,
      next: Number.isInteger(data.continue?.gsroffset)
        ? { offset: data.continue.gsroffset }
        : null,
      collectedAt: new Date().toISOString(),
      note:
        "Live Wikipedia film discovery" +
        (genre !== "All" ? " · genre keywords: " + genre : "") +
        " · not cinema listings",
    };
  }
  const placeTags = {
    Restaurants: [
      "amenity:restaurant",
      "amenity:fast_food",
      "amenity:food_court",
    ],
    Cafés: ["amenity:cafe", "shop:bakery"],
    Cinema: ["amenity:cinema"],
    Museums: ["tourism:museum"],
    "Art & culture": [
      "tourism:gallery",
      "amenity:theatre",
      "amenity:arts_centre",
    ],
    "Things to do": [
      "tourism:attraction",
      "tourism:zoo",
      "tourism:aquarium",
      "tourism:theme_park",
      "tourism:viewpoint",
      "leisure:park",
      "leisure:garden",
      "leisure:bowling_alley",
    ],
  };
  const distance = (a, b) => {
    const r = Math.PI / 180,
      dlat = (b.lat - a.lat) * r,
      dlon = (b.lon - a.lon) * r;
    return (
      12742 *
      Math.asin(
        Math.min(
          1,
          Math.sqrt(
            Math.sin(dlat / 2) ** 2 +
              Math.cos(a.lat * r) *
                Math.cos(b.lat * r) *
                Math.sin(dlon / 2) ** 2,
          ),
        ),
      )
    );
  };
  function placeItem(p, city) {
    const t = p.tags || {},
      c = p.center || p,
      lat = Number(c.lat),
      lon = Number(c.lon);
    const category = Object.keys(placeTags).find((k) =>
      placeTags[k].some((tag) => {
        const [key, value] = tag.split(":");
        return t[key] === value;
      }),
    );
    if (
      !category ||
      !t.name ||
      !["node", "way", "relation"].includes(p.type) ||
      !Number.isSafeInteger(p.id) ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      return null;
    const image = safeURL(t.image),
      cuisine = (t.cuisine || "").replace(/;/g, ", ").replace(/_/g, " ");
    return {
      id: "osm-" + p.type + "-" + p.id,
      kind: "places",
      title: t.name,
      lat,
      lon,
      image,
      images: image ? [image] : [],
      category,
      tags: [category, ...(cuisine ? [cuisine] : [])],
      cuisine,
      address: [t["addr:housenumber"], t["addr:street"]]
        .filter(Boolean)
        .join(" "),
      city,
      hours: t.opening_hours || "",
      website: safeURL(t.website || t["contact:website"]),
      description: cuisine || category,
      url: "https://www.openstreetmap.org/" + p.type + "/" + p.id,
      source: "OpenStreetMap",
      sourceUrl: "https://www.openstreetmap.org/copyright",
      dataLicense: "ODbL 1.0",
      imageCredit: image ? "Image linked by OpenStreetMap contributor" : "",
      photoReference: t.wikimedia_commons || "",
      wikidata: /^Q\d+$/.test(t.wikidata || "") ? t.wikidata : "",
      brandWikidata: /^Q\d+$/.test(t["brand:wikidata"] || "")
        ? t["brand:wikidata"]
        : "",
      brand: t.brand || "",
    };
  }
  async function venuePhotos(items, { onUpdate = () => {} } = {}) {
    let stored = {};
    try {
      stored = JSON.parse(
        root.localStorage.getItem("broadsheet.venue-photos.v4") || "{}",
      );
    } catch {}
    const result = {},
      pending = items
        .filter((item) => {
          const old = stored[item.id];
          if (old && Date.now() - old.time < (old.photo ? 86400000 : 120000)) {
            if (old.photo) result[item.id] = old.photo;
            return false;
          }
          return /^osm-(node|way|relation)-\d+$/.test(item.id);
        })
        .slice(0, 150);
    const rank = { venue: 5, logo: 4, website: 2, icon: 1 };
    const add = (id, photo) => {
      if (!safeURL(photo?.url)) return;
      const candidates = [
        ...(result[id]?.alternatives || []),
        ...(result[id] ? [{ ...result[id], alternatives: undefined }] : []),
        photo,
      ];
      const sorted = [
        ...new Map(candidates.map((p) => [p.url, p])).values(),
      ].sort((a, b) => (rank[b.kind] || 3) - (rank[a.kind] || 3));
      result[id] = { ...sorted[0], alternatives: sorted.slice(1) };
    };
    const tags = new Map(
      pending.map((i) => [
        i.id,
        {
          image: i.image,
          website: i.website,
          wikimedia_commons: i.photoReference,
          wikidata: i.wikidata,
          "brand:wikidata": i.brandWikidata,
        },
      ]),
    );
    onUpdate(result);
    await Promise.all(
      ["node", "way", "relation"].map(async (type) => {
        const ids = pending
          .filter((i) => i.id.startsWith("osm-" + type + "-"))
          .map((i) => i.id.split("-")[2]);
        if (!ids.length) return;
        try {
          const data = await json(
            "https://api.openstreetmap.org/api/0.6/" +
              type +
              "s.json?" +
              new URLSearchParams({ [type + "s"]: ids.join(",") }),
          );
          for (const row of data.elements || [])
            tags.set("osm-" + row.type + "-" + row.id, {
              ...tags.get("osm-" + row.type + "-" + row.id),
              ...row.tags,
            });
        } catch {}
      }),
    );
    for (const item of pending) {
      const t = tags.get(item.id) || {},
        site = safeURL(t.website || t["contact:website"]).replace(
          /^http:/,
          "https:",
        );
      if (site) {
        item.website = site;
        add(item.id, {
          url: new URL("/favicon.ico", site).href,
          kind: "icon",
          label: "Business website icon",
          sourceUrl: site,
          credit: item.title + " · business website",
          license: "Website publisher rights; see source",
        });
      }
      if (safeURL(t.image))
        add(item.id, {
          url: safeURL(t.image),
          kind: "venue",
          label: "Mapped business photo",
          credit: "Image linked by OpenStreetMap contributor",
          license: "See linked source for image rights",
          sourceUrl: safeURL(t.image),
        });
    }
    onUpdate(result);
    const qids = [
        ...new Set(
          [...tags.values()]
            .flatMap((t) => [t.wikidata, t["brand:wikidata"]])
            .filter((q) => /^Q\d+$/.test(q || "")),
        ),
      ],
      entities = {};
    for (let i = 0; i < qids.length; i += 50)
      try {
        const data = await json(
          "https://www.wikidata.org/w/api.php?" +
            new URLSearchParams({
              action: "wbgetentities",
              format: "json",
              origin: "*",
              ids: qids.slice(i, i + 50).join("|"),
              props: "claims",
            }),
        );
        Object.assign(entities, data.entities);
      } catch {}
    const claim = (q, p) =>
      entities[q]?.claims?.[p]?.find(
        (c) => c.rank !== "deprecated" && c.mainsnak?.datavalue,
      )?.mainsnak.datavalue.value;
    const files = [];
    for (const item of pending) {
      const t = tags.get(item.id) || {},
        explicit = t.wikimedia_commons?.startsWith("File:")
          ? t.wikimedia_commons.slice(5)
          : "",
        geo = claim(t.wikidata, "P625"),
        venue =
          geo && distance(item, { lat: geo.latitude, lon: geo.longitude }) < 0.3
            ? claim(t.wikidata, "P18")
            : "";
      for (const [file, kind] of [
        [explicit || venue, "venue"],
        [
          claim(t["brand:wikidata"], "P154") || claim(t.wikidata, "P154"),
          "logo",
        ],
      ])
        if (typeof file === "string" && file.length < 500)
          files.push({ id: item.id, file: "File:" + file, kind });
    }
    const names = [...new Set(files.map((f) => f.file))];
    for (let offset = 0; offset < names.length; offset += 40)
      try {
        const data = await json(
          "https://commons.wikimedia.org/w/api.php?" +
            new URLSearchParams({
              action: "query",
              format: "json",
              origin: "*",
              redirects: 1,
              titles: names.slice(offset, offset + 40).join("|"),
              prop: "imageinfo",
              iiprop: "url|extmetadata|user",
              iiurlwidth: 600,
            }),
        );
        const pages = new Map(
            Object.values(data.query?.pages || {}).map((p) => [
              p.title.replace(/_/g, " "),
              p.imageinfo?.[0],
            ]),
          ),
          aliases = new Map(
            [
              ...(data.query?.normalized || []),
              ...(data.query?.redirects || []),
            ].map((p) => [p.from.replace(/_/g, " "), p.to.replace(/_/g, " ")]),
          );
        const clean = (s) =>
          String(s || "")
            .replace(/<[^>]*>/g, "")
            .replace(/&[^;]+;/g, " ")
            .trim()
            .slice(0, 200);
        for (const f of files) {
          let title = f.file.replace(/_/g, " ");
          for (let i = 0; i < 5 && aliases.has(title); i++)
            title = aliases.get(title);
          const info = pages.get(title),
            url = info?.thumburl || info?.url;
          if (!/^https:\/\/(?:upload|thumb)\.wikimedia.org\//.test(url || ""))
            continue;
          add(f.id, {
            url,
            kind: f.kind,
            label:
              f.kind === "logo" ? "Business brand logo" : "Business photograph",
            credit: clean(info.extmetadata?.Artist?.value || info.user),
            license: clean(
              info.extmetadata?.LicenseShortName?.value ||
                "See source for license",
            ),
            sourceUrl: safeURL(info.descriptionurl),
            source: "Wikimedia Commons",
          });
        }
        onUpdate(result);
      } catch {}
    const api = safeURL(root.BROADSHEET_CONFIG?.apiBase);
    if (api) {
      const batches = [];
      const uncovered = pending.filter(
        (item) => result[item.id]?.kind !== "venue",
      );
      for (let i = 0; i < uncovered.length; i += 5)
        batches.push(uncovered.slice(i, i + 5));
      // Two bounded requests at a time; early covers render before the rest finish.
      const work = async () => {
        while (batches.length) {
          const group = batches.shift();
          try {
            const u = new URL(
              "api/venue-covers",
              api.endsWith("/") ? api : api + "/",
            );
            u.searchParams.set("ids", group.map((i) => i.id).join(","));
            const data = await json(u.href);
            for (const [id, p] of Object.entries(data.covers || {}))
              if (group.some((i) => i.id === id)) add(id, p);
            onUpdate(result);
          } catch {}
        }
      };
      await Promise.all([work(), work()]);
    }
    for (const item of pending)
      stored[item.id] = { time: Date.now(), photo: result[item.id] || null };
    try {
      root.localStorage.setItem(
        "broadsheet.venue-photos.v4",
        JSON.stringify(
          Object.fromEntries(
            Object.entries(stored)
              .sort((a, b) => b[1].time - a[1].time)
              .slice(0, 400),
          ),
        ),
      );
    } catch {}
    return result;
  }
  async function places({
    city = "",
    lat,
    lon,
    signal,
    category = "All",
    radius = "auto",
  } = {}) {
    city = city.trim().slice(0, 100);
    let center;
    if (lat !== undefined || lon !== undefined) {
      if (
        typeof lat !== "number" ||
        typeof lon !== "number" ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      )
        throw Error("Invalid map coordinates.");
      center = {
        lat: Number(lat.toFixed(3)),
        lon: Number(lon.toFixed(3)),
        name: "Near your chosen location",
      };
    } else {
      if (city.length < 2)
        throw Error(
          "Enter a city or town, optionally followed by its country.",
        );
      const result = await json(
          "https://geocoding-api.open-meteo.com/v1/search?" +
            new URLSearchParams({
              name: city,
              count: 1,
              language: "en",
              format: "json",
            }),
          signal,
        ),
        first = result.results?.[0];
      if (!first)
        throw Error("City not found. Try adding a country or region.");
      center = {
        lat: Number(first.latitude),
        lon: Number(first.longitude),
        name: [
          ...new Set([first.name, first.admin1, first.country].filter(Boolean)),
        ].join(", "),
      };
      city = center.name;
      if (
        !Number.isFinite(center.lat) ||
        !Number.isFinite(center.lon) ||
        Math.abs(center.lat) > 90 ||
        Math.abs(center.lon) > 180
      )
        throw Error("The city provider returned invalid coordinates.");
    }
    if (category !== "All" && !placeTags[category])
      throw Error("Choose a valid place category.");
    if (radius !== "auto" && ![10, 25, 50, 100].includes(Number(radius)))
      throw Error("Choose a valid search distance.");
    let dataService = "Photon / komoot",
      searchRadiusKm = 0,
      success = false,
      lastError;
    const found = new Map();
    const search = async (kind, km) => {
      const tags =
        kind === "All" ? Object.values(placeTags).flat() : placeTags[kind];
      const params = new URLSearchParams({
        lat: center.lat,
        lon: center.lon,
        radius: km,
        limit: 100,
        lang: "en",
      });
      for (const tag of tags) params.append("osm_tag", tag);
      let rows;
      try {
        const data = await json(
          "https://photon.komoot.io/reverse?" + params,
          signal,
        );
        rows = (data.features || []).map((f) => {
          const p = f.properties || {},
            c = f.geometry?.coordinates || [];
          return {
            type: { N: "node", W: "way", R: "relation" }[p.osm_type],
            id: p.osm_id,
            lon: c[0],
            lat: c[1],
            tags: {
              ...p.extra,
              name: p.name,
              [p.osm_key]: p.osm_value,
              "addr:street": p.street,
              "addr:housenumber": p.housenumber,
            },
          };
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        const clauses = tags
          .map((tag) => {
            const [key, value] = tag.split(":");
            return `nwr(around:${km * 1000},${center.lat},${center.lon})[${key}="${value}"][name];`;
          })
          .join("");
        const data = await json(
          "https://overpass-api.de/api/interpreter?" +
            new URLSearchParams({
              data: `[out:json][timeout:12];(${clauses});out center 100;`,
            }),
          signal,
        );
        if (data.remark && !data.elements?.length)
          throw Error("The map provider is busy. Try this area again shortly.");
        rows = data.elements || [];
        dataService = "OpenStreetMap / Overpass";
      }
      success = true;
      searchRadiusKm = Math.max(searchRadiusKm, km);
      for (const row of rows) {
        const item = placeItem(row, city || "Near you");
        if (!item || (kind !== "All" && item.category !== kind)) continue;
        item.distanceKm = distance(center, item);
        if (item.distanceKm <= km + 0.1) found.set(item.id, item);
      }
    };
    const radii = radius === "auto" ? [5, 15, 35, 75] : [Number(radius)];
    for (const km of radii) {
      try {
        await search(category, km);
      } catch (error) {
        if (signal?.aborted) throw error;
        lastError = error;
      }
      const target =
        category === "All"
          ? 24
          : ["Restaurants", "Cafés"].includes(category)
            ? 18
            : 8;
      if (found.size >= target) break;
    }
    // Nearby food must not crowd museums, cinema and cultural venues out of All.
    if (category === "All")
      for (const kind of [
        "Museums",
        "Art & culture",
        "Cinema",
        "Things to do",
      ]) {
        if ([...found.values()].filter((i) => i.category === kind).length >= 5)
          continue;
        for (const km of radius === "auto" ? [15, 35, 75] : [Number(radius)]) {
          try {
            await search(kind, km);
          } catch (error) {
            if (signal?.aborted) throw error;
            lastError = error;
          }
          if (
            [...found.values()].filter((i) => i.category === kind).length >= 5
          )
            break;
        }
      }
    if (!success || (!found.size && lastError && searchRadiusKm < radii.at(-1)))
      throw lastError || Error("Map listings are temporarily unavailable.");
    const normalized = (value) =>
      String(value || "")
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
    const sorted = [];
    for (const item of [...found.values()].sort(
      (a, b) => a.distanceKm - b.distanceKm,
    )) {
      const duplicate = sorted.find(
        (other) =>
          other.category === item.category &&
          normalized(other.title) === normalized(item.title) &&
          distance(other, item) < 0.1 &&
          (!other.address ||
            !item.address ||
            normalized(other.address) === normalized(item.address)),
      );
      if (!duplicate) {
        sorted.push(item);
        continue;
      }
      // OSM may map the same venue as both a building and a point. Keep one
      // card, preserving useful references from either representation.
      for (const field of [
        "image",
        "website",
        "wikidata",
        "brandWikidata",
        "photoReference",
        "address",
        "cuisine",
        "hours",
      ])
        if (!duplicate[field] && item[field]) duplicate[field] = item[field];
      if (!duplicate.images?.length && item.images?.length)
        duplicate.images = item.images;
    }
    const counts = {};
    const items =
      category === "All"
        ? sorted
            .filter((i) => {
              counts[i.category] = (counts[i.category] || 0) + 1;
              return counts[i.category] <= 25;
            })
            .slice(0, 150)
        : sorted.slice(0, 100);
    return {
      items,
      provider: "OpenStreetMap",
      dataService,
      filter: category,
      city: city || "Near you",
      center,
      searchRadiusKm,
      radius,
      partial: !!lastError,
      live: true,
      collectedAt: new Date().toISOString(),
      geocoder: city ? "Open-Meteo / GeoNames" : "",
      note: `Community map listings within ${searchRadiusKm} km · nearest first · availability varies by area`,
    };
  }
  function streetViewURL(key, item) {
    if (
      !key ||
      !Number.isFinite(item.lat) ||
      !Number.isFinite(item.lon) ||
      Math.abs(item.lat) > 90 ||
      Math.abs(item.lon) > 180
    )
      return "";
    return (
      "https://www.google.com/maps/embed/v1/streetview?" +
      new URLSearchParams({
        key,
        location: item.lat + "," + item.lon,
        source: "outdoor",
        radius: 50,
        fov: 90,
      })
    );
  }
  const api = {
    recipes,
    recipeDetails,
    recipeOptions,
    recipeItem,
    movies,
    filmItem,
    places,
    venuePhotos,
    placeItem,
    safeURL,
    streetViewURL,
    PAGE_SIZE,
    clearCache: () => cache.clear(),
  };
  root.BroadsheetLive = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
