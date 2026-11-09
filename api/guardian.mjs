// The registered Guardian Open Platform integration. Credentials stay upstream;
// its supplied HTML, links, notices, and advertising markup are retained intact.
export async function guardianArticle(
  url,
  publisher,
  key,
  { get = fetch, cache, ctx } = {},
) {
  const unavailable = (reason, message) => ({
    status: "unavailable",
    reason,
    message,
    url: url.href,
    publisher: publisher.name,
    blocks: [],
  });
  if (!key)
    return unavailable(
      "setup",
      "Guardian article reading needs its free Open Platform connection.",
    );
  const cacheKey = new Request(
    "https://broadsheet-cache.invalid/guardian-article/v1" + url.pathname,
  );
  const old = await cache?.match(cacheKey);
  if (old) return old.json();
  const api = new URL("https://content.guardianapis.com" + url.pathname);
  api.searchParams.set("api-key", key);
  api.searchParams.set("show-fields", "body,headline,byline,wordcount");
  const response = await get(api.href, {
    redirect: "error",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return unavailable(
      response.status === 429 ? "limit" : "unavailable",
      response.status === 429
        ? "The Guardian API is busy or has reached its allowance. Please try again later."
        : "The Guardian could not supply this article through its API. Retry or open the original.",
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("Empty article");
  let text = "",
    size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1200000) {
        await reader.cancel();
        throw Error("Article too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  const result = JSON.parse(text).response,
    article = result?.content,
    fields = article?.fields;
  if (
    result?.status !== "ok" ||
    !fields?.body ||
    typeof fields.body !== "string" ||
    fields.body.length > 500000
  )
    return unavailable(
      "unavailable",
      "The Guardian did not supply this article’s full text. Open the original for available access options.",
    );
  const data = {
    status: "ready",
    format: "guardian",
    url: url.href,
    publisher: "The Guardian",
    title: fields.headline || article.webTitle || "",
    author: fields.byline || "",
    html: fields.body,
    wordCount:
      Number(fields.wordcount) ||
      fields.body
        .replace(/<[^>]*>/g, " ")
        .trim()
        .split(/\s+/).length,
    publishedAt: article.webPublicationDate || "",
    retrievedAt: new Date().toISOString(),
    source: "Guardian Open Platform",
  };
  if (
    JSON.stringify(data).includes(key) ||
    JSON.stringify(data).includes(encodeURIComponent(key))
  )
    throw Error("Article response contained a credential.");
  if (cache && ctx)
    ctx.waitUntil(
      cache
        .put(
          cacheKey,
          new Response(JSON.stringify(data), {
            headers: { "Cache-Control": "public, max-age=900" },
          }),
        )
        .catch(() => {}),
    );
  return data;
}
