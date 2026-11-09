const assert = require("node:assert/strict");
const live = require("../dist/live.js");
const feature = (id, kind, lat = 32.86, lon = -97.36) => ({
  geometry: { coordinates: [lon, lat] },
  properties: {
    osm_type: "W",
    osm_id: id,
    osm_key: kind.split(":")[0],
    osm_value: kind.split(":")[1],
    name: "Venue " + id,
  },
});
(async () => {
  let calls = [];
  global.fetch = async (input) => {
    const u = new URL(input);
    calls.push(u);
    return {
      ok: true,
      json: async () => ({
        features:
          Number(u.searchParams.get("radius")) < 35
            ? []
            : [
                feature(1, "tourism:museum", 32.7),
                feature(1, "tourism:museum", 32.7),
                feature(2, "amenity:restaurant"),
                feature(3, "tourism:museum", 30),
              ],
      }),
    };
  };
  const expanded = await live.places({
    lat: 32.86,
    lon: -97.36,
    category: "Museums",
  });
  assert.deepEqual(
    expanded.items.map((i) => i.id),
    ["osm-way-1"],
  );
  assert.equal(expanded.searchRadiusKm, 75);
  assert.ok(expanded.items[0].distanceKm > 10);
  assert.deepEqual(
    calls.map((u) => Number(u.searchParams.get("radius"))),
    [5, 15, 35, 75],
  );
  live.clearCache();
  calls = [];
  const bounded = await live.places({
    lat: 32.86,
    lon: -97.36,
    category: "Museums",
    radius: 10,
  });
  assert.equal(bounded.items.length, 0);
  assert.equal(calls.length, 1);
  assert.equal(bounded.searchRadiusKm, 10);
  await assert.rejects(live.places({ lat: 32.86, lon: -97.36, radius: 1000 }));
  live.clearCache();
  calls = [];
  global.fetch = async (input) => {
    const u = new URL(input);
    calls.push(u);
    if (u.hostname === "photon.komoot.io") throw Error("Busy");
    return {
      ok: true,
      json: async () => ({
        elements: [
          {
            id: 9,
            type: "way",
            center: { lat: 32.86, lon: -97.36 },
            tags: { name: "Art hall", amenity: "arts_centre" },
          },
        ],
      }),
    };
  };
  const fallback = await live.places({
    lat: 32.86,
    lon: -97.36,
    category: "Art & culture",
    radius: 25,
  });
  assert.equal(fallback.items[0].category, "Art & culture");
  assert.match(calls[1].searchParams.get("data"), /nwr\(around:25000/);
  assert.match(calls[1].searchParams.get("data"), /arts_centre/);
  assert.doesNotMatch(calls[1].searchParams.get("data"), /restaurant/);
  live.clearCache();
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      features: [
        {
          ...feature(20, "tourism:museum"),
          properties: {
            ...feature(20, "tourism:museum").properties,
            name: "Local Museum",
            street: "Main Street",
            housenumber: "100",
          },
        },
        {
          ...feature(21, "tourism:museum"),
          properties: {
            ...feature(21, "tourism:museum").properties,
            osm_type: "N",
            name: "Local Museum",
            street: "Main Street",
            housenumber: "100",
          },
        },
        {
          ...feature(22, "tourism:museum"),
          properties: {
            ...feature(22, "tourism:museum").properties,
            name: "Local Museum",
            street: "Main Street",
            housenumber: "200",
          },
        },
      ],
    }),
  });
  const deduped = await live.places({
    lat: 32.86,
    lon: -97.36,
    category: "Museums",
    radius: 25,
  });
  assert.equal(
    deduped.items.length,
    2,
    "A building and point for the same venue share one card; separate addresses survive",
  );
  const fastFood = live.placeItem(
    {
      id: 1,
      type: "node",
      lat: 0,
      lon: 0,
      tags: {
        name: "Diner",
        amenity: "fast_food",
        "brand:wikidata": "Q123",
        image: "https://diner.example.org/front.jpg",
      },
    },
    "City",
  );
  assert.equal(fastFood.category, "Restaurants");
  assert.equal(fastFood.brandWikidata, "Q123");
  assert.equal(
    live.placeItem({
      id: 2,
      type: "node",
      lat: 0,
      lon: 0,
      tags: { name: "Road", highway: "residential" },
    }),
    null,
  );
  const storage = new Map();
  global.localStorage = {
    getItem: (k) => storage.get(k),
    setItem: (k, v) => storage.set(k, v),
  };
  live.clearCache();
  calls = [];
  const updates = [];
  global.BROADSHEET_CONFIG = { apiBase: "https://catalog.example.org/" };
  global.fetch = async (input) => {
    const u = new URL(input);
    calls.push(u);
    return {
      ok: true,
      json: async () => {
        if (u.hostname === "api.openstreetmap.org")
          return {
            elements: [
              {
                id: 1,
                type: "node",
                tags: {
                  website: "https://diner.example.org",
                  wikidata: "Q1",
                  "brand:wikidata": "Q123",
                },
              },
            ],
          };
        if (u.hostname === "www.wikidata.org")
          return {
            entities: {
              Q1: {
                claims: {
                  P18: [
                    { mainsnak: { datavalue: { value: "Corporate HQ.jpg" } } },
                  ],
                  P625: [
                    {
                      mainsnak: {
                        datavalue: { value: { latitude: 50, longitude: 50 } },
                      },
                    },
                  ],
                },
              },
              Q123: {
                claims: {
                  P154: [{ mainsnak: { datavalue: { value: "Brand.svg" } } }],
                },
              },
            },
          };
        if (u.hostname === "commons.wikimedia.org")
          return {
            query: {
              pages: {
                1: {
                  title: "File:Brand.svg",
                  imageinfo: [
                    {
                      thumburl: "https://upload.wikimedia.org/brand.png",
                      descriptionurl:
                        "https://commons.wikimedia.org/wiki/File:Brand.svg",
                      extmetadata: {
                        LicenseShortName: { value: "Public domain" },
                      },
                    },
                  ],
                },
              },
            },
          };
        return {
          covers: {
            "osm-node-1": {
              url: "https://diner.example.org/actual-front.jpg",
              kind: "venue",
              label: "Business website photo",
              sourceUrl: "https://diner.example.org/location",
            },
          },
        };
      },
    };
  };
  fastFood.image = "";
  const photos = await live.venuePhotos([fastFood], {
    onUpdate: (r) => updates.push(JSON.parse(JSON.stringify(r))),
  });
  assert.equal(
    photos[fastFood.id].url,
    "https://diner.example.org/actual-front.jpg",
  );
  assert.ok(
    updates.some((r) => r[fastFood.id]?.kind === "logo"),
    "Brand logo renders before the website lookup completes",
  );
  assert.ok(photos[fastFood.id].alternatives.some((p) => p.kind === "logo"));
  assert.ok(!JSON.stringify(photos).includes("Corporate HQ"));
  const requests = calls.length;
  await live.venuePhotos([fastFood]);
  assert.equal(
    calls.length,
    requests,
    "Every canvas instance shares cached image metadata",
  );
  delete global.localStorage;
  delete global.BROADSHEET_CONFIG;
  console.log(
    "Places adaptive radius, category correctness, building footprints, duplicate removal, source priority, verified venue photos, brand fallback, progressive rendering and caching passed",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
