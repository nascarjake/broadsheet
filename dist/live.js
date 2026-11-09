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
      signal: signal || AbortSignal.timeout(20000),
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
  function placeItem(p, city) {
    const t = p.tags || {},
      center = p.center || p;
    const lat = Number(center.lat),
      lon = Number(center.lon);
    if (
      !t.name ||
      !["node", "way", "relation"].includes(p.type) ||
      !Number.isSafeInteger(p.id) ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      return null;
    const category =
      {
        restaurant: "Restaurants",
        cafe: "Cafés",
        cinema: "Cinema",
        museum: "Museums",
        gallery: "Art & culture",
        attraction: "Things to do",
      }[t.amenity || t.tourism] || "Things to do";
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
    };
  }
  async function venuePhotos(items) {
    // One small metadata batch per collection, shared by every repeated card.
    let stored = {};
    try {
      stored = JSON.parse(
        root.localStorage.getItem("broadsheet.venue-photos.v2") || "{}",
      );
    } catch {}
    const result = {},
      pending = items
        .filter((item) => {
          const old = stored[item.id];
          if (old && Date.now() - old.time < (old.photo ? 86400000 : 600000)) {
            if (old.photo) result[item.id] = old.photo;
            return false;
          }
          return /^osm-(node|way|relation)-\d+$/.test(item.id);
        })
        .slice(0, 50);
    const tags = new Map(
      pending.map((item) => [
        item.id,
        { wikimedia_commons: item.photoReference, wikidata: item.wikidata },
      ]),
    );
    for (const type of ["node", "way", "relation"]) {
      const ids = pending
        .filter((item) => item.id.startsWith("osm-" + type + "-"))
        .map((item) => item.id.split("-")[2]);
      if (!ids.length) continue;
      try {
        const data = await json(
          "https://api.openstreetmap.org/api/0.6/" +
            type +
            "s.json?" +
            new URLSearchParams({ [type + "s"]: ids.join(",") }),
        );
        for (const row of data.elements || [])
          tags.set("osm-" + row.type + "-" + row.id, row.tags || {});
      } catch {}
    }
    const entities = [
      ...new Set(
        [...tags.values()]
          .map((t) => t.wikidata)
          .filter((id) => /^Q\d+$/.test(id || "")),
      ),
    ];
    const pictures = new Map();
    if (entities.length) {
      try {
        const data = await json(
          "https://www.wikidata.org/w/api.php?" +
            new URLSearchParams({
              action: "wbgetentities",
              format: "json",
              origin: "*",
              ids: entities.join("|"),
              props: "claims",
            }),
        );
        for (const [id, e] of Object.entries(data.entities || {})) {
          const image = e.claims?.P18?.find(
            (c) =>
              c.rank !== "deprecated" &&
              typeof c.mainsnak?.datavalue?.value === "string",
          );
          if (image) pictures.set(id, image.mainsnak.datavalue.value);
        }
      } catch {}
    }
    const files = new Map();
    for (const [id, t] of tags) {
      let file = t.wikimedia_commons?.startsWith("File:")
        ? t.wikimedia_commons.slice(5)
        : pictures.get(t.wikidata);
      if (
        !file &&
        /^https:\/\/upload.wikimedia.org\/wikipedia\/commons\//.test(
          t.image || "",
        )
      ) {
        try {
          file = decodeURIComponent(
            new URL(t.image).pathname.split("/").at(-1),
          );
        } catch {}
      }
      if (file && file.length < 500) files.set(id, "File:" + file);
    }
    if (files.size) {
      try {
        const data = await json(
          "https://commons.wikimedia.org/w/api.php?" +
            new URLSearchParams({
              action: "query",
              format: "json",
              origin: "*",
              redirects: 1,
              titles: [...new Set(files.values())].join("|"),
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
        );
        const aliases = new Map(
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
        for (const [id, file] of files) {
          let title = file.replace(/_/g, " ");
          for (let i = 0; i < 5 && aliases.has(title); i++)
            title = aliases.get(title);
          const info = pages.get(title),
            src = info?.thumburl || info?.url;
          if (!/^https:\/\/(?:upload|thumb)\.wikimedia.org\//.test(src || ""))
            continue;
          result[id] = {
            url: src,
            credit: clean(info.extmetadata?.Artist?.value || info.user),
            license: clean(
              info.extmetadata?.LicenseShortName?.value ||
                "See source for license",
            ),
            sourceUrl: safeURL(info.descriptionurl),
            source: "Wikimedia Commons",
          };
        }
      } catch {}
    }
    for (const item of pending)
      stored[item.id] = { time: Date.now(), photo: result[item.id] || null };
    stored = Object.fromEntries(
      Object.entries(stored)
        .sort((a, b) => b[1].time - a[1].time)
        .slice(0, 200),
    );
    try {
      root.localStorage.setItem(
        "broadsheet.venue-photos.v2",
        JSON.stringify(stored),
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
      );
      const first = result.results?.[0];
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
    const categories = {
      Restaurants: "amenity:restaurant",
      Cafés: "amenity:cafe",
      Cinema: "amenity:cinema",
      Museums: "tourism:museum",
      "Art & culture": "tourism:gallery",
      "Things to do": "tourism:attraction",
    };
    if (category !== "All" && !categories[category])
      throw Error("Choose a valid place category.");
    const params = new URLSearchParams({
      lat: center.lat,
      lon: center.lon,
      radius: 3,
      limit: 50,
      lang: "en",
    });
    for (const tag of category === "All"
      ? Object.values(categories)
      : [categories[category]])
      params.append("osm_tag", tag);
    let data,
      dataService = "Photon / komoot";
    try {
      const result = await json(
        "https://photon.komoot.io/reverse?" + params,
        signal,
      );
      data = {
        elements: (result.features || []).map((feature) => {
          const p = feature.properties || {},
            coordinates = feature.geometry?.coordinates || [];
          return {
            type: { N: "node", W: "way", R: "relation" }[p.osm_type],
            id: p.osm_id,
            lon: coordinates[0],
            lat: coordinates[1],
            tags: {
              ...p.extra,
              name: p.name,
              [p.osm_key]: p.osm_value,
              "addr:street": p.street,
              "addr:housenumber": p.housenumber,
            },
          };
        }),
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      dataService = "Overpass";
      const clauses = (
        category === "All" ? Object.values(categories) : [categories[category]]
      )
        .map((tag) => {
          const [key, value] = tag.split(":");
          return `node(around:1500,${center.lat},${center.lon})[${key}="${value}"][name];`;
        })
        .join("");
      const query = `[out:json][timeout:10];(${clauses});out 50;`;
      data = await json(
        "https://overpass-api.de/api/interpreter?" +
          new URLSearchParams({ data: query }),
        signal,
      );
    }
    if (data.remark && !data.elements?.length)
      throw Error("The map provider is busy. Try this area again shortly.");
    return {
      items: (data.elements || [])
        .map((p) => placeItem(p, city || "Near you"))
        .filter(Boolean),
      provider: "OpenStreetMap",
      dataService,
      filter: category,
      city: city || "Near you",
      center,
      collectedAt: new Date().toISOString(),
      geocoder: city ? "Open-Meteo / GeoNames" : "",
      note: "Nearby OpenStreetMap listings · bounded area, not every business",
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
