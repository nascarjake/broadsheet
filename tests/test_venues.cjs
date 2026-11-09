const assert = require("node:assert/strict");
(async () => {
  const { publicSite, coverIDs, parseWebsite, venueCovers } =
    await import("../api/venues.mjs");
  for (const value of [
    "http://localhost/",
    "http://127.0.0.1",
    "https://[::1]",
    "file:///etc/passwd",
    "https://name:password@host.org",
    "https://host.org:8888",
    "https://a.internal",
    "",
  ])
    assert.equal(publicSite(value), "");
  assert.equal(
    publicSite("/photo.jpg", "https://business.org/menu"),
    "https://business.org/photo.jpg",
  );
  for (const ids of [
    "https://secret.org",
    "osm-node-0",
    "osm-node-1,osm-node-2,osm-node-3,osm-node-4,osm-node-5,osm-node-6",
  ])
    assert.throws(() => coverIDs(new URL("https://api.org/?ids=" + ids)));
  const row = {
    id: 1,
    type: "node",
    lat: 32.86,
    lon: -97.36,
    tags: {
      name: "Diner",
      "addr:housenumber": "100",
      "addr:street": "Main Street",
    },
  };
  const source = "https://diner.org/location";
  const website = JSON.stringify({
    "@type": "Restaurant",
    address: { streetAddress: "100 Main Street" },
    image: "/front.jpg",
  });
  assert.equal(
    parseWebsite(
      '<script type="application/ld+json">' + website + "</script>",
      source,
      row,
    ).kind,
    "venue",
  );
  assert.equal(
    parseWebsite('<meta content="/food.jpg" property="og:image">', source, row)
      .kind,
    "website",
  );
  assert.equal(
    parseWebsite(
      '<script type="application/ld+json">{"logo":"/logo.svg","image":"/headquarters.jpg"}</script>',
      source,
      row,
    ).kind,
    "logo",
  );
  assert.equal(
    parseWebsite('<meta name="robots" content="noimageindex">', source, row),
    null,
  );
  const cached = new Map(),
    cache = {
      match: async (r) => cached.get(r.url)?.clone(),
      put: async (r, v) => cached.set(r.url, v),
    };
  let requests = 0,
    siteRequests = 0;
  const writes = [];
  const ctx = { waitUntil: (p) => writes.push(p) };
  const get = async (input, options) => {
    requests++;
    const u = new URL(input);
    assert.ok(
      !options.headers.Authorization,
      "The movie token must never reach a business website",
    );
    if (u.hostname === "api.openstreetmap.org")
      return Response.json({ elements: [row] });
    if (u.hostname === "cloudflare-dns.com")
      return Response.json({
        Answer: [
          {
            type: u.searchParams.get("type") === "A" ? 1 : 28,
            data:
              u.searchParams.get("type") === "A"
                ? "93.184.216.34"
                : "2606:4700::1111",
          },
        ],
      });
    siteRequests++;
    assert.equal(options.redirect, "manual");
    return new Response('<meta property="og:image" content="/front.jpg">', {
      headers: { "Content-Type": "text/html" },
    });
  };
  row.tags.website = source;
  const first = await venueCovers(["osm-node-1"], { get, cache, ctx });
  await Promise.all(writes);
  assert.equal(first.covers["osm-node-1"].url, "https://diner.org/front.jpg");
  const count = requests;
  await venueCovers(["osm-node-1"], { get, cache, ctx });
  assert.equal(requests, count);
  assert.equal(siteRequests, 1);
  cached.clear();
  siteRequests = 0;
  const privateDNS = async (input, options) =>
    new URL(input).hostname === "cloudflare-dns.com"
      ? Response.json({ Answer: [{ type: 1, data: "169.254.169.254" }] })
      : get(input, options);
  const blocked = await venueCovers(["osm-node-1"], {
    get: privateDNS,
    cache,
    ctx,
  });
  assert.deepEqual(blocked.covers, {});
  assert.equal(siteRequests, 0);
  console.log(
    "Business-cover URL validation, bounded mapped IDs, website-image labeling, exact-branch matching, private-network protection, token isolation and edge cache passed",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
