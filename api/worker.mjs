/* Read-only movie catalog gateway. Provider credentials never reach the browser. */
const genres = {
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
const originAllowed = (origin) =>
  origin === "https://nascarjake.github.io" ||
  /^http:\/\/(localhost|127\.0\.0\.1):(8000|8134|8767)$/.test(origin);
function reply(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(originAllowed(origin)
        ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
        : {}),
    },
  });
}
export function movieRequest(url) {
  const mode = url.searchParams.get("mode") || "popular";
  const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const region = (url.searchParams.get("region") || "US").toUpperCase();
  const page = Number(url.searchParams.get("page") || 1);
  const filter = url.searchParams.get("genre") || "All";
  if (
    !["popular", "search", "now-playing"].includes(mode) ||
    !/^[A-Z]{2}$/.test(region) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 500
  )
    throw Error("Invalid movie search.");
  const genre = Object.entries(genres).find(
    ([, name]) => name.toLowerCase() === filter.toLowerCase(),
  )?.[0];
  let endpoint = {
    popular: "movie/popular",
    search: "search/movie",
    "now-playing": "movie/now_playing",
  }[mode];
  const params = new URLSearchParams({
    language: "en-US",
    region,
    page: String(page),
  });
  if (mode === "search") {
    if (!q) throw Error("Enter a film title.");
    params.set("query", q);
    params.set("include_adult", "false");
  }
  if (mode === "popular" && genre) {
    endpoint = "discover/movie";
    params.set("with_genres", genre);
    params.set("include_adult", "false");
    params.set("sort_by", "popularity.desc");
  }
  return {
    providerURL: "https://api.themoviedb.org/3/" + endpoint + "?" + params,
    mode,
    q,
    region,
    page,
    filter,
    genre,
  };
}
export function movieResponse(data, search) {
  const { mode, q, region, page, filter, genre } = search;
  const items = (data.results || [])
    .filter(
      (f) =>
        !f.adult &&
        (!genre || (f.genre_ids || []).includes(Number(genre))) &&
        (mode !== "now-playing" ||
          !q ||
          (f.title + " " + f.overview).toLowerCase().includes(q.toLowerCase())),
    )
    .map((f) => {
      const tags = (f.genre_ids || []).map((g) => genres[g]).filter(Boolean);
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
        catalog: mode === "now-playing" ? "Now playing" : "TMDB film catalog",
      };
    });
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
    collectedAt: new Date().toISOString(),
    note:
      (mode === "now-playing" ? "Now playing" : "Live movie catalog") +
      " · TMDB · " +
      region +
      " · not local showtimes",
  };
}
async function boundedJSON(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error("Empty provider response");
  const decoder = new TextDecoder();
  let text = "",
    size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2000000) {
        await reader.cancel();
        throw Error("Provider response too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "",
      url = new URL(request.url);
    if (origin && !originAllowed(origin))
      return reply({ error: "Origin not allowed." }, 403, origin);
    if (request.method === "OPTIONS") {
      if (!originAllowed(origin))
        return reply({ error: "Origin not allowed." }, 403, origin);
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        },
      });
    }
    if (request.method !== "GET")
      return reply({ error: "Method not allowed." }, 405, origin);
    if (url.pathname === "/api/capabilities")
      return reply(
        { movies: !!env.TMDB_READ_TOKEN, nowPlaying: !!env.TMDB_READ_TOKEN },
        200,
        origin,
      );
    if (url.pathname !== "/api/movies")
      return reply({ error: "Not found." }, 404, origin);
    if (!env.TMDB_READ_TOKEN)
      return reply(
        { error: "The movie catalog is not connected yet." },
        503,
        origin,
      );
    let search;
    try {
      search = movieRequest(url);
    } catch {
      return reply(
        { error: "Enter a valid title, country, and page (1–500)." },
        400,
        origin,
      );
    }
    if (env.SEARCH_LIMIT) {
      const limit = await env.SEARCH_LIMIT.limit({
        key: request.headers.get("CF-Connecting-IP") || "unknown",
      });
      if (!limit.success)
        return reply(
          { error: "Please wait a minute before searching again." },
          429,
          origin,
        );
    }
    // Cache only public film metadata. The key never includes the private token.
    const cacheRequest = new Request(
      url.origin +
        "/_cache/movies?" +
        new URLSearchParams({
          mode: search.mode,
          q: search.q,
          region: search.region,
          page: String(search.page),
          genre: search.filter,
        }),
    );
    try {
      const cached = await caches.default.match(cacheRequest);
      if (cached) return reply(await cached.json(), 200, origin);
      const response = await fetch(search.providerURL, {
        headers: {
          Authorization: "Bearer " + env.TMDB_READ_TOKEN,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        return reply(
          { error: "The movie provider is temporarily unavailable." },
          503,
          origin,
        );
      const data = movieResponse(await boundedJSON(response), search);
      ctx.waitUntil(
        caches.default.put(
          cacheRequest,
          new Response(JSON.stringify(data), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=900",
            },
          }),
        ),
      );
      return reply(data, 200, origin);
    } catch {
      return reply(
        {
          error:
            "The movie provider could not be reached. Your loaded films are still available.",
        },
        503,
        origin,
      );
    }
  },
};
