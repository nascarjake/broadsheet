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
    cursor = null,
    signal,
  } = {}) {
    query = query.trim().slice(0, 80);
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
    const end = offset + PAGE_SIZE;
    const next =
      end < meals.length
        ? { letter, offset: end }
        : !query && category === "All" && letter < 25
          ? { letter: letter + 1, offset: 0 }
          : null;
    return {
      items: meals
        .slice(offset, end)
        .map((m) => recipeItem(m, category === "All" ? "Recipe" : category)),
      provider: "TheMealDB",
      query,
      filter: category,
      next,
      live: true,
      total: query || category !== "All" ? meals.length : null,
      collectedAt: new Date().toISOString(),
      note: query
        ? "Live dish and ingredient search · TheMealDB"
        : category !== "All"
          ? "Live " + category + " recipes · TheMealDB"
          : "Live recipe catalog · TheMealDB · browse A–Z",
    };
  }
  async function recipeDetails(item, signal) {
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
    };
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
    recipeItem,
    movies,
    filmItem,
    places,
    placeItem,
    safeURL,
    streetViewURL,
    PAGE_SIZE,
    clearCache: () => cache.clear(),
  };
  root.BroadsheetLive = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
