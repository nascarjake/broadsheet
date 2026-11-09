export const genres = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science fiction",
  10770: "TV movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};
const numberID = (value) =>
  !value
    ? ""
    : /^[1-9]\d{0,8}$/.test(value)
      ? value
      : (() => {
          throw Error("Choose a result from the suggestions.");
        })();
const text = (value) =>
  String(value || "")
    .trim()
    .slice(0, 80);
export function movieRequest(url) {
  const p = url.searchParams,
    mode = p.get("mode") || "popular",
    q = text(p.get("q")),
    region = (p.get("region") || "US").toUpperCase(),
    page = Number(p.get("page") || 1),
    filter = p.get("genre") || "All";
  const year = p.get("year") || "",
    provider = numberID(p.get("provider")),
    cast = numberID(p.get("cast")),
    company = numberID(p.get("company")),
    keyword = numberID(p.get("keyword")),
    availability = p.get("availability") || "all";
  if (
    !["popular", "search", "now-playing", "streaming"].includes(mode) ||
    !/^[A-Z]{2}$/.test(region) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 500 ||
    (year &&
      (!/^\d{4}$/.test(year) ||
        Number(year) < 1874 ||
        Number(year) > new Date().getUTCFullYear() + 3)) ||
    !["all", "flatrate", "free", "ads", "rent", "buy"].includes(availability)
  )
    throw Error("Choose valid movie filters.");
  const genre = Object.entries(genres).find(
    ([, name]) => name.toLowerCase() === filter.toLowerCase(),
  )?.[0];
  if (filter !== "All" && !genre) throw Error("Choose a listed genre.");
  const sort = p.get("order") || "popularity.desc";
  if (
    ![
      "popularity.desc",
      "vote_average.desc",
      "primary_release_date.desc",
      "primary_release_date.asc",
    ].includes(sort)
  )
    throw Error("Choose a listed movie order.");
  const params = new URLSearchParams({
    language: "en-US",
    region,
    page: String(page),
    include_adult: "false",
  });
  let endpoint = "discover/movie";
  const advanced = !!(
    year ||
    provider ||
    cast ||
    company ||
    keyword ||
    availability !== "all" ||
    sort !== "popularity.desc"
  );
  if (mode === "search") {
    if (!q) throw Error("Enter a film title.");
    endpoint = "search/movie";
    params.set("query", q);
    if (year) params.set("primary_release_year", year);
  } else if (mode === "now-playing" && !genre && !advanced)
    endpoint = "movie/now_playing";
  else {
    // The general catalog is worldwide; country scopes cinemas and watch offers,
    // rather than excluding films without a theatrical release in that country.
    if (mode !== "now-playing") params.delete("region");
    params.set("sort_by", sort);
    if (sort === "vote_average.desc") params.set("vote_count.gte", "100");
    if (genre) params.set("with_genres", genre);
    if (year) params.set("primary_release_year", year);
    if (cast) params.set("with_cast", cast);
    if (company) params.set("with_companies", company);
    if (keyword) params.set("with_keywords", keyword);
    if (provider) params.set("with_watch_providers", provider);
    if (provider || mode === "streaming" || availability !== "all") {
      params.set("watch_region", region);
      if (availability !== "all" || mode === "streaming")
        params.set(
          "with_watch_monetization_types",
          availability === "all" ? "flatrate|free|ads|rent|buy" : availability,
        );
    }
    if (mode === "now-playing") {
      const today = new Date(),
        start = new Date(today);
      start.setUTCDate(start.getUTCDate() - 42);
      params.set("with_release_type", "2|3");
      params.set("release_date.gte", start.toISOString().slice(0, 10));
      params.set("release_date.lte", today.toISOString().slice(0, 10));
    }
  }
  return {
    providerURL: "https://api.themoviedb.org/3/" + endpoint + "?" + params,
    mode,
    q,
    region,
    page,
    filter,
    genre,
    year,
    provider,
    cast,
    company,
    keyword,
    availability,
    sort,
    advanced,
  };
}
export function film(f, mode = "popular") {
  const tags = (f.genre_ids || f.genres?.map((g) => g.id) || [])
    .map((g) => genres[g])
    .filter(Boolean);
  const image = /^\/[A-Za-z0-9_.-]+$/.test(f.poster_path || "")
    ? "https://image.tmdb.org/t/p/w500" + f.poster_path
    : "";
  return {
    id: "tmdb-" + f.id,
    kind: "movies",
    title: String(f.title || ""),
    image,
    images: image ? [image] : [],
    description: String(f.overview || ""),
    year: (f.release_date || "").slice(0, 4),
    releaseDate: f.release_date || "",
    tags,
    category: tags[0] || "Film",
    source: "TMDB",
    sourceUrl: "https://www.themoviedb.org/",
    url: "https://www.themoviedb.org/movie/" + f.id,
    imageCredit: "TMDB / original film rights holders",
    catalog:
      mode === "now-playing"
        ? "In theaters"
        : mode === "streaming"
          ? "Streaming"
          : "Movie catalog",
    needsMovieDetails: true,
  };
}
export function movieResponse(data, search) {
  const { mode, q, region, page, filter, genre } = search;
  const items = (data.results || [])
    .filter(
      (f) =>
        !f.adult &&
        (!genre ||
          (f.genre_ids || f.genres?.map((g) => g.id) || []).includes(
            Number(genre),
          )) &&
        (mode !== "now-playing" ||
          !q ||
          (f.title + " " + f.overview).toLowerCase().includes(q.toLowerCase())),
    )
    .map((f) => film(f, mode));
  const pages = Math.min(Number(data.total_pages) || page, 500);
  return {
    items,
    provider: "TMDB",
    region,
    query: q,
    filter,
    live: true,
    catalog: mode,
    page,
    next: page < pages ? { page: page + 1 } : null,
    total: search.postFiltered ? null : Number(data.total_results) || null,
    accessiblePages: pages,
    collectedAt: new Date().toISOString(),
    note:
      (mode === "now-playing"
        ? "In theaters"
        : mode === "streaming"
          ? "Streaming"
          : "Movie catalog") +
      " · " +
      (mode === "popular" ? "worldwide" : region) +
      " · TMDB" +
      (mode === "now-playing"
        ? " · regional releases, not local showtimes"
        : "") +
      (search.postFiltered ? " · filtering title results across pages" : "") +
      (Number(data.total_results) > 10000 && pages === 500
        ? " · up to 10,000 results per query; narrow filters for other films"
        : ""),
  };
}
export async function movieCatalog(search, get) {
  const data = await get(
    search.providerURL.slice("https://api.themoviedb.org/3/".length),
  );
  // TMDB's title endpoint does not accept cast/company/watch-provider filters.
  // Check every title-result page on demand instead of silently ignoring them.
  if (
    search.mode === "search" &&
    (search.provider ||
      search.cast ||
      search.company ||
      search.keyword ||
      search.availability !== "all")
  ) {
    const rows = data.results || [];
    const detailed = await Promise.all(
      rows.map(async (f) => {
        if (f.adult) return null;
        const append = [
          search.cast ? "credits" : "",
          search.keyword ? "keywords" : "",
          search.provider || search.availability !== "all"
            ? "watch/providers"
            : "",
        ].filter(Boolean);
        const full = await get(
          `movie/${f.id}?append_to_response=${append.join(",")}`,
        );
        const watch = full["watch/providers"]?.results?.[search.region] || {};
        const kinds =
          search.availability === "all"
            ? ["flatrate", "free", "ads", "rent", "buy"]
            : [search.availability];
        if (
          search.cast &&
          !full.credits?.cast?.some((c) => String(c.id) === search.cast)
        )
          return null;
        if (
          search.company &&
          !full.production_companies?.some(
            (c) => String(c.id) === search.company,
          )
        )
          return null;
        if (
          search.keyword &&
          !full.keywords?.keywords?.some((k) => String(k.id) === search.keyword)
        )
          return null;
        if (
          (search.provider || search.availability !== "all") &&
          !kinds.some((k) =>
            (watch[k] || []).some(
              (p) =>
                !search.provider || String(p.provider_id) === search.provider,
            ),
          )
        )
          return null;
        return f;
      }),
    );
    data.results = detailed.filter(Boolean);
    search = { ...search, postFiltered: true };
  }
  return movieResponse(data, search);
}
export async function movieDetails(url, get) {
  const id = numberID(url.searchParams.get("id")),
    region = (url.searchParams.get("region") || "US").toUpperCase();
  if (!id || !/^[A-Z]{2}$/.test(region))
    throw Error("Choose a valid film and country.");
  const f = await get(
    `movie/${id}?language=en-US&append_to_response=videos,credits,watch/providers`,
  );
  if (f.adult) throw Error("Choose a non-adult film.");
  const videos = (f.videos?.results || [])
    .filter(
      (v) =>
        v.site === "YouTube" &&
        v.type === "Trailer" &&
        /^[\w-]{11}$/.test(v.key),
    )
    .sort((a, b) => Number(b.official) - Number(a.official));
  const w = f["watch/providers"]?.results?.[region] || {};
  const groups = Object.fromEntries(
    ["flatrate", "free", "ads", "rent", "buy"].map((k) => [
      k,
      (w[k] || []).map((p) => ({
        id: p.provider_id,
        name: p.provider_name,
        logo: /^\/[\w.-]+$/.test(p.logo_path || "")
          ? "https://image.tmdb.org/t/p/w92" + p.logo_path
          : "",
      })),
    ]),
  );
  return {
    ...film(f),
    runtime: f.runtime || null,
    director:
      f.credits?.crew
        ?.filter((c) => c.job === "Director")
        .map((c) => c.name)
        .join(", ") || "",
    cast: (f.credits?.cast || [])
      .slice(0, 12)
      .map((c) => ({ id: c.id, name: c.name, character: c.character })),
    studios: (f.production_companies || []).map((c) => ({
      id: c.id,
      name: c.name,
    })),
    trailer: videos[0]
      ? {
          key: videos[0].key,
          name: videos[0].name,
          official: !!videos[0].official,
        }
      : null,
    watch: {
      region,
      groups,
      url: /^https:\/\/www.themoviedb.org\//.test(w.link || "")
        ? w.link
        : `https://www.themoviedb.org/movie/${id}/watch?locale=${region}`,
      credit: "JustWatch",
      checkedAt: new Date().toISOString(),
    },
    needsMovieDetails: false,
  };
}
export async function movieOptions(url, get) {
  const region = (url.searchParams.get("region") || "US").toUpperCase();
  if (!/^[A-Z]{2}$/.test(region)) throw Error("Choose a country.");
  const [providers, regions] = await Promise.all([
    get("watch/providers/movie?language=en-US&watch_region=" + region),
    get("watch/providers/regions?language=en-US"),
  ]);
  return {
    genres: Object.values(genres),
    providers: (providers.results || [])
      .sort((a, b) => (a.display_priority || 0) - (b.display_priority || 0))
      .map((p) => ({ id: p.provider_id, name: p.provider_name })),
    regions: (regions.results || [])
      .map((r) => ({ id: r.iso_3166_1, name: r.english_name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
export async function movieLookup(url, get) {
  const type = url.searchParams.get("type"),
    q = text(url.searchParams.get("q"));
  if (!["cast", "company", "keyword"].includes(type) || q.length < 2)
    throw Error("Enter at least two letters.");
  const endpoint = { cast: "person", company: "company", keyword: "keyword" }[
    type
  ];
  const data = await get(
    `search/${endpoint}?include_adult=false&query=${encodeURIComponent(q)}`,
  );
  return {
    items: (data.results || [])
      .filter((x) => !x.adult)
      .slice(0, 10)
      .map((x) => ({
        id: x.id,
        name: x.name,
        description:
          type === "cast"
            ? (x.known_for || [])
                .map((f) => f.title || f.name)
                .filter(Boolean)
                .slice(0, 2)
                .join(" · ")
            : "",
      })),
  };
}
