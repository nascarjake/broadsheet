import {
  movieRequest,
  movieResponse,
  movieCatalog,
  movieDetails,
  movieOptions,
  movieLookup,
} from "./movies.mjs";
export { movieRequest, movieResponse };
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
async function providerJSON(path, env, ctx, cacheBudget) {
  const target = "https://api.themoviedb.org/3/" + path;
  const key = new Request("https://broadsheet-cache.invalid/tmdb/" + path);
  const old = await caches.default.match(key);
  if (old) return old.json();
  const response = await fetch(target, {
    headers: {
      Authorization: "Bearer " + env.TMDB_READ_TOKEN,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Error("The movie provider is temporarily unavailable.");
  const data = await boundedJSON(response);
  // A cold title search can check 20 films plus its search page. Cache reads,
  // fetches, and writes share the Free plan's 50-subrequest budget (42 + 4).
  if (cacheBudget.writes-- > 0)
    ctx.waitUntil(
      caches.default
        .put(
          key,
          new Response(JSON.stringify(data), {
            headers: { "Cache-Control": "public, max-age=900" },
          }),
        )
        .catch(() => {}),
    );
  return data;
}
export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "",
      url = new URL(request.url);
    if (origin && !originAllowed(origin))
      return reply({ error: "Origin not allowed." }, 403, origin);
    if (request.method === "OPTIONS")
      return originAllowed(origin)
        ? new Response(null, {
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": origin,
              "Access-Control-Allow-Methods": "GET, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
              "Access-Control-Max-Age": "86400",
              Vary: "Origin",
            },
          })
        : reply({ error: "Origin not allowed." }, 403, origin);
    if (request.method !== "GET")
      return reply({ error: "Method not allowed." }, 405, origin);
    if (url.pathname === "/api/capabilities")
      return reply(
        {
          movies: !!env.TMDB_READ_TOKEN,
          nowPlaying: !!env.TMDB_READ_TOKEN,
          movieDiscovery: true,
          movieDetails: true,
        },
        200,
        origin,
      );
    if (
      ![
        "/api/movies",
        "/api/movie-details",
        "/api/movie-options",
        "/api/movie-lookup",
      ].includes(url.pathname)
    )
      return reply({ error: "Not found." }, 404, origin);
    if (!env.TMDB_READ_TOKEN)
      return reply(
        { error: "The movie catalog is not connected yet." },
        503,
        origin,
      );
    let search;
    try {
      if (url.pathname === "/api/movies") search = movieRequest(url);
    } catch (error) {
      return reply({ error: error.message }, 400, origin);
    }
    if (
      env.SEARCH_LIMIT &&
      !(
        await env.SEARCH_LIMIT.limit({
          key: request.headers.get("CF-Connecting-IP") || "unknown",
        })
      ).success
    )
      return reply(
        { error: "Please wait a minute before searching again." },
        429,
        origin,
      );
    const cacheBudget = { writes: 4 };
    const get = (path) => providerJSON(path, env, ctx, cacheBudget);
    try {
      const data =
        url.pathname === "/api/movies"
          ? await movieCatalog(search, get)
          : url.pathname === "/api/movie-details"
            ? await movieDetails(url, get)
            : url.pathname === "/api/movie-options"
              ? await movieOptions(url, get)
              : await movieLookup(url, get);
      return reply(data, 200, origin);
    } catch (error) {
      return reply(
        {
          error:
            error.message.startsWith("Choose") ||
            error.message.startsWith("Enter")
              ? error.message
              : "The movie provider could not be reached. Your loaded films are still available.",
        },
        error.message.startsWith("Choose") || error.message.startsWith("Enter")
          ? 400
          : 503,
        origin,
      );
    }
  },
};
