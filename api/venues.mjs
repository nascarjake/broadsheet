// Public website previews derived only from an exact OpenStreetMap object.
// No caller-supplied URL, image proxy, cookies, Google scraping or paid API.
const types = { node: "nodes", way: "ways", relation: "relations" };
const clean = (s) =>
  String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
export function publicSite(value, base) {
  try {
    if (typeof value !== "string" || !value.trim() || value.length > 2048)
      return "";
    const u = new URL(value, base);
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      (u.port && !["80", "443"].includes(u.port))
    )
      return "";
    const h = u.hostname.toLowerCase();
    if (
      !h.includes(".") ||
      h.startsWith("[") ||
      /^\d+(?:\.\d+){3}$/.test(h) ||
      /(?:^|\.)(?:localhost|local|internal|invalid|test|example)$/.test(h)
    )
      return "";
    u.protocol = "https:";
    u.port = "";
    u.hash = "";
    return u.href;
  } catch {
    return "";
  }
}
async function text(response, limit = 524288, truncate = false) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let result = "",
    size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        if (!truncate) throw Error("Provider response too large");
        break;
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
async function json(url, get) {
  const r = await get(url, {
    headers: {
      Accept: url.includes("cloudflare-dns.com")
        ? "application/dns-json"
        : "application/json",
    },
    signal: AbortSignal.timeout(7000),
  });
  if (!r.ok) throw Error("Provider unavailable");
  return JSON.parse(await text(r));
}
function globalIPv4(address) {
  const p = address.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  const [a, b] = p;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && [18, 19].includes(b))
  );
}
async function resolvedPublic(url, get) {
  const u = new URL(url),
    endpoint = "https://cloudflare-dns.com/dns-query?";
  const data = await json(
      endpoint + new URLSearchParams({ name: u.hostname, type: "A" }),
      get,
    ),
    v6 = await json(
      endpoint + new URLSearchParams({ name: u.hostname, type: "AAAA" }),
      get,
    );
  const addresses = (data.Answer || [])
      .filter((a) => a.type === 1)
      .map((a) => a.data),
    ipv6 = (v6.Answer || []).filter((a) => a.type === 28).map((a) => a.data);
  return (
    addresses.length > 0 &&
    addresses.every(globalIPv4) &&
    ipv6.every((ip) => /^[23][0-9a-f]{0,3}:/i.test(ip))
  );
}
async function website(url, get) {
  let current = publicSite(url);
  if (!current) return null;
  for (let redirect = 0; redirect < 2; redirect++) {
    if (!(await resolvedPublic(current, get))) return null;
    const r = await get(current, {
      redirect: "manual",
      headers: {
        Accept: "text/html",
        "User-Agent": "Broadsheet/1.0 (business website preview)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status >= 300 && r.status < 400) {
      const next = publicSite(r.headers.get("Location"), current);
      await r.body?.cancel();
      if (!next) return null;
      current = next;
      continue;
    }
    if (!r.ok || !r.headers.get("Content-Type")?.includes("text/html")) {
      await r.body?.cancel();
      return null;
    }
    return { url: current, html: await text(r, 524288, true) };
  }
  return null;
}
const normalized = (s) =>
  clean(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
function imageURL(value, base) {
  return publicSite(
    typeof value === "string"
      ? value
      : value?.url || value?.contentUrl || value?.["@id"],
    base,
  );
}
function branchMatch(entity, row) {
  const address =
      typeof entity.address === "object" ? entity.address.streetAddress : "",
    t = row.tags || {},
    number = t["addr:housenumber"],
    street = t["addr:street"];
  if (
    number &&
    street &&
    address &&
    (" " + normalized(address) + " ").includes(
      " " + normalized(number) + " ",
    ) &&
    normalized(street)
      .split(" ")
      .filter((s) => s.length > 2)
      .every((s) => normalized(address).includes(s))
  )
    return true;
  const lat = Number(entity.geo?.latitude),
    lon = Number(entity.geo?.longitude);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    !Number.isFinite(row.lat) ||
    !Number.isFinite(row.lon)
  )
    return false;
  return (
    Math.hypot(
      (lat - row.lat) * 111,
      (lon - row.lon) * 111 * Math.cos((row.lat * Math.PI) / 180),
    ) < 0.2
  );
}
export function parseWebsite(html, site, row) {
  if (/<meta[^>]+(?:name|property)=["']robots["'][^>]+noimageindex/i.test(html))
    return null;
  const credit = clean(row.tags?.name) + " · business website",
    license = "Website publisher rights; see source";
  const record = (url, kind, label) =>
    url
      ? {
          url,
          kind,
          label,
          credit,
          license,
          sourceUrl: site,
          source: "Mapped business website",
        }
      : null;
  const entities = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const add = (x, depth = 0) => {
        if (!x || depth > 4) return;
        if (Array.isArray(x)) {
          for (const e of x.slice(0, 50)) add(e, depth + 1);
        } else if (typeof x === "object") {
          entities.push(x);
          add(x["@graph"], depth + 1);
          add(x.mainEntity, depth + 1);
        }
      };
      add(JSON.parse(match[1]));
    } catch {}
  }
  for (const entity of entities)
    if (branchMatch(entity, row))
      for (const image of Array.isArray(entity.image)
        ? entity.image
        : [entity.image]) {
        const u = imageURL(image, site);
        if (u) return record(u, "venue", "Business website photo");
      }
  for (const entity of entities) {
    const u = imageURL(entity.logo, site);
    if (u) return record(u, "logo", "Business website logo");
  }
  for (const match of html.matchAll(/<meta\b[^>]{0,4000}>/gi)) {
    const attrs = {};
    for (const a of match[0].matchAll(
      /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
    ))
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4];
    if (["og:image", "twitter:image"].includes(attrs.property || attrs.name)) {
      const u = publicSite(
        String(attrs.content || "")
          .replace(/&amp;/g, "&")
          .replace(/&#38;/g, "&"),
        site,
      );
      if (u)
        return /(?:logo|wordmark|brandmark)/i.test(new URL(u).pathname)
          ? record(u, "logo", "Business website logo")
          : record(u, "website", "Business website image");
    }
  }
  return record(
    publicSite("/favicon.ico", site),
    "icon",
    "Business website icon",
  );
}
export function coverIDs(url) {
  const ids = [
    ...new Set((url.searchParams.get("ids") || "").split(",").filter(Boolean)),
  ];
  if (
    !ids.length ||
    ids.length > 5 ||
    ids.some(
      (id) =>
        !/^osm-(node|way|relation)-[1-9]\d{0,15}$/.test(id) ||
        !Number.isSafeInteger(Number(id.split("-")[2])),
    )
  )
    throw Error("Choose one to five mapped venues.");
  return ids;
}
export async function venueCovers(
  ids,
  { get = fetch, cache = caches.default, ctx } = {},
) {
  const covers = {},
    pending = [];
  for (const id of ids) {
    const key = new Request(
        "https://broadsheet-cache.invalid/venue-covers/v2/" + id,
      ),
      old = await cache.match(key);
    if (old) {
      const stored = await old.json();
      if (stored) covers[id] = stored;
    } else pending.push({ id, key });
  }
  const rows = new Map();
  for (const [type, plural] of Object.entries(types)) {
    const list = pending.filter((p) => p.id.startsWith("osm-" + type + "-"));
    if (!list.length) continue;
    try {
      const data = await json(
        "https://api.openstreetmap.org/api/0.6/" +
          plural +
          ".json?" +
          new URLSearchParams({
            [plural]: list.map((p) => p.id.split("-")[2]).join(","),
          }),
        get,
      );
      for (const row of data.elements || [])
        rows.set("osm-" + row.type + "-" + row.id, row);
    } catch {}
  }
  await Promise.all(
    pending.map(async ({ id, key }) => {
      let photo = null;
      const row = rows.get(id),
        site = publicSite(row?.tags?.website || row?.tags?.["contact:website"]);
      if (site)
        try {
          const page = await website(site, get);
          if (page) photo = parseWebsite(page.html, page.url, row);
        } catch {}
      if (photo) covers[id] = photo;
      ctx?.waitUntil(
        cache
          .put(
            key,
            new Response(JSON.stringify(photo), {
              headers: {
                "Cache-Control": "public, max-age=" + (photo ? 86400 : 600),
              },
            }),
          )
          .catch(() => {}),
      );
    }),
  );
  return { covers };
}
