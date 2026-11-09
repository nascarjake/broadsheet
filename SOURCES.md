# Sources and lessons

## Precedents

- Newsmap (2004), MoMA: https://www.moma.org/interactives/exhibitions/2011/talktome/objects/146231/ . Uses topic-colored rectangles sized by coverage. Lesson: hierarchy can show relationships and editorial attention, but size should not imply truth or importance automatically.
- NewsStand, UMD paper: https://www.cs.umd.edu/~hjs/pubs/newsstand-acmgis2008.pdf . Spatial RSS clustering and pan/zoom. Lesson: orientation and stable context matter; this prototype uses topic neighborhoods instead of geographic claims.
- Pad++ HTML browser: https://www.cs.umd.edu/projects/hcil/pad%2B%2B/tour/html1.html and https://www.cs.umd.edu/projects/hcil/pad%2B%2B/tour/conclusion.html . Linked documents appear beside parents and retain peripheral context. This directly informed unfolding without a separate full-screen page.
- Flipboard layout engineering: https://about.flipboard.com/engineering/layout-in-flipboard-for-web-and-windows/ . Human-designed layout templates inform the editorial rhythm rather than arbitrary masonry.

These lessons are design interpretations, not claims that these products solved every usability issue.

## Content

NASA official RSS directory: https://www.nasa.gov/rss-feeds/
Main feed: https://www.nasa.gov/feed/
Secondary official feed: https://www.nasa.gov/news-release/feed/
Media guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/

NASA permits factual informational use with source acknowledgment and no implied endorsement. Third-party material may have separate rights. The first edition used brief feed excerpts. The current edition contains the curated full-story archive described below, with attributed source links and NASA-credited imagery. NASA does not endorse this prototype.

- Earth: https://science.nasa.gov/resource/the-blue-marble/ . Credit: NASA Johnson Space Center. Local file images/earth.jpg. Direct asset: https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/i/IMG004849.jpg/jcr:content/renditions/cq5dam.web.1280.1280.jpeg
- Spacewalk: https://www.nasa.gov/image-article/astronauts-anil-menon-and-sophie-adenot-on-spacewalk/ . Credit: NASA. Local file images/spacewalk.jpg. Direct asset: https://www.nasa.gov/wp-content/uploads/2026/08/55474999794-5b0f1a2c92-o.jpg

Images are editorial illustrations and visibly labeled as such, not presented as photos of unrelated feed events. The remaining abstract artwork is CSS drawn for this prototype.

## Expanded full-story archive (edition 02)

`dist/corpus.json` contains 53 NASA-authored article prose texts, original source URLs/dates, and individually credited NASA images. Read `contentNote` for extraction boundaries: navigation, videos, widgets and unlicensed images are not reproduced. The complete authored prose is included, not synthetic expanded summaries. Source dates span September 11–November 5, 2026. It is a captured archive, not an assertion of live freshness.

NASA usage guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/ . Selection excludes images with third-party ownership credits. Logos/insignia are not used as branding, and no NASA endorsement is claimed. Individual story and image metadata preserve credits and usage-guidance links.

The UI repeats this finite corpus across an unbounded virtual canvas, visibly disclosed under “How this world works.” New unique stories require refreshing/expanding the source corpus; the UI does not generate factual articles.

## Multi-source edition (03)

`dist/sources.json` is the canonical feed catalog. Each record retains the feed URL, publisher site, feed directory/evidence link, configured topic scope, publisher-base label, and descriptive source type. `dist/feed.json` contains collected headlines, brief plain-text excerpts (bounded to 350 characters), original article URLs/dates, and per-feed collection status. It contains no imported third-party full articles or newly downloaded third-party image assets.

Publisher references checked while extending the reader:

- BBC feed documentation: https://support.bbc.co.uk/platform/feeds/NewsFeeds.htm
- Guardian feed instructions: https://www.theguardian.com/help/feeds (section pages expose `/rss`, including World and Food).
- NASA feed directory: https://www.nasa.gov/rss-feeds/
- Le Monde feed directory: https://www.lemonde.fr/en/rss/article/2022/06/23/the-rss-feeds-of-monde-fr_5987755_165.html
- ScienceDaily feed directory: https://www.sciencedaily.com/newsfeeds.htm (requests attribution/source links and excludes full-text republication).
- Other feed endpoints and publisher URLs are retained directly in the catalog. All nine endpoints returned parseable items during local verification on November 8, 2026. Future availability and third-party terms can change.

Names identify the sources of the reporting; they do not imply endorsement or independent verification. Source avatars are typographic initials rendered in CSS, not downloaded publisher logos. Source types and publisher bases are manually curated descriptions and are not political bias/reliability ratings. No Ground News or other proprietary ratings are copied or invented. The initial source list is illustrative, not comprehensive. User-imported feed metadata is explicitly unverified and stays on that user's device.

The original NASA archive and all of its attribution, historical notes, image files, and rights metadata remain retained. No new image packs, external font files, or library assets were added. The reading UI uses system Arial and Georgia fonts.

## Modular spaces (04)

`dist/discovery.json` retains normalized items with source URLs and image-credit metadata. The new starter spaces were collected on November 8, 2026. These bounded samples are not exhaustive or continuously refreshed.

- **Recipes:** [TheMealDB API](https://www.themealdb.com/api.php), development key `1`; recipe titles, ingredient measures, method text, and contributor photo URLs are retained. Photos stay hosted on TheMealDB. The provider permits the test key during development/educational use; it is not represented as a universal production license. No preparation times or nutritional values are fabricated. Full original source links are preserved where supplied, otherwise the meal's TheMealDB page is linked.
- **Films:** [Studio Ghibli API](https://ghibliapi.vercel.app/films); film metadata and poster/banner URLs are retained. This is an unofficial starter collection, not current cinema listings. Posters are hosted by TMDB and belong to the film artwork's respective rights holders; no general artwork redistribution license is asserted. Browse genres are editorial labels in `providers.py`. Original descriptions are provider-supplied, not generated reviews. Per-film source and image-credit fields remain attached to saved items.
- **Live cinema adapter:** [TMDB authentication](https://developer.themoviedb.org/docs/authentication-application), [Now Playing](https://developer.themoviedb.org/reference/movie-now-playing-list), [attribution/usage](https://developer.themoviedb.org/docs/faq). Requires a user-configured server-side token. No token has been bundled or obtained from another application. The default collection must not be mislabeled as now playing.
- **Places:** data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL 1.0. Nominatim provides chosen-city/address geocoding; Overpass provides bounded nearby listings. [Nominatim service policy](https://operations.osmfoundation.org/policies/nominatim/) informs identifying requests, serialized geocoding, caching, and configurable server endpoints. Initial Chicago venue records retain OSM element URLs and actual contributor coordinates. That initial city is only a preview; live requests use browser-provided or user-entered locations. Opening-hour strings are displayed as provided, not interpreted as reliable “open now” claims.
- **Venue previews:** when verified venue imagery/logos are absent, the interface uses typographic initials and explicitly labeled illustrative TheMealDB food images. The food is not claimed to be served by a displayed venue. Real external imagery linked in OSM remains credited separately; unsupported media hosts are not rendered.
- **Maps library:** Leaflet 1.9.4 by Volodymyr Agafonkin and contributors / CloudMade; BSD 2-Clause. Unmodified JS/CSS retrieved from `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` and `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`; retained license at `dist/vendor/LEAFLET-LICENSE`. On-demand map tiles use `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with visible attribution. No bulk tile archive is included.
- **Hub visual:** the small conceptual map is original SVG interface artwork, not a geographic map. NASA photography comes from the already attributed local corpus (Hubble telescope story); recipe and film covers use the same credited provider items as their spaces. No generated food, venue logos, or fictitious movie posters were substituted for sourced material.

The new spaces are local development work. Commercial/public provider access and original artwork rights remain provider-specific; logging or retaining an image URL does not establish ownership or a new license.

TMDB's unmodified approved blue short logo is retained at `dist/vendor/tmdb-logo.svg`, retrieved from `https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg`. The Movies source-information panel includes the logo and TMDB's required non-endorsement notice. Logo use follows the provider's linked attribution policy; trademark ownership is retained by TMDB.

## Endless spatial interaction and Street View (05)

The current canvas repeats its finite, attributed collection across unbounded positive/negative cell coordinates. This supersedes edition 04's finite mosaic; unique source-item counts remain visible. Replication preserves each item's source identity and credits. No additional recipes, reports, or business photos are fabricated to fill the world. Opened details expand inside their cell, and local span packing reserves room for them.

Google Street View business covers use the documented [Street View Static API](https://developers.google.com/maps/documentation/streetview/request-streetview), [metadata endpoint](https://developers.google.com/maps/documentation/streetview/metadata), and [API key setup](https://developers.google.com/maps/documentation/streetview/get-api-key). The server checks for a nearby panorama, calculates the camera heading toward the existing business coordinates, and streams a bounded image response. It does not save or cache Google's images/metadata, put image URLs into saved items, or include Google content/keys in snapshots. The client uses uncropped imagery so returned Google copyright and attribution remain present. [Google policies](https://developers.google.com/maps/documentation/streetview/policies) apply.

No Google Maps API key was configured during implementation; provider behavior was tested with fixtures, and the UI's honest unavailable state was browser-checked. Venue cover initials have been replaced with this Street View cover path/fallback. Food imagery remains explicitly illustrative and appears on hover, rather than masquerading as a business exterior. The geographic map continues to use separately attributed OpenStreetMap data and tiles.

## Edition 06 — live catalogs and free Street View

- [TheMealDB API guide](https://www.themealdb.com/docs_api_guide.php): documented dish-name search, first-letter browsing, main-ingredient/category filtering, and ID-based detail lookup. The browser uses anonymous cross-origin requests and the provider's personal/development test key. Public production applications should obtain supporter access. There is no application-imposed 40/50-item search cap. Categories/results remain limited by the provider's actual database; letter browsing and local batches do not imply an infinite recipe source. Complete records take priority when merging name and ingredient matches.
- [MediaWiki search](https://www.mediawiki.org/wiki/API:Search), [page information](https://www.mediawiki.org/wiki/API:Page_info_in_search_results), and [anonymous CORS](https://www.mediawiki.org/wiki/API:Cross-site_requests): live film discovery uses Wikipedia film-infobox searches, provider continuation offsets, article summaries, and available page images. Pages are requested in groups of 20 so TextExtracts continuation does not hide search pagination. Descriptions retain Wikipedia contributor and CC BY-SA 4.0 attribution, original article links, and image-file credit links. Film artwork retains its original copyright; missing images/facts are not fabricated. Genre fallback controls are keyword searches, not verified structured metadata. This source is not now-playing data.
- [TMDB movie search](https://developer.themoviedb.org/reference/search-movie), [popular](https://developer.themoviedb.org/reference/movie-popular-list), and [now playing](https://developer.themoviedb.org/reference/movie-now-playing-list): the optional server adapter now follows result pages, accepts structured genre filters, and keeps title search distinct from now-playing. API account registration and terms are managed by the user. Private tokens are not bundled in client files.
- [Google Maps Embed billing](https://developers.google.com/maps/documentation/embed/usage-and-billing), [Street View mode](https://developers.google.com/maps/documentation/embed/embedding-map), and [key restrictions](https://developers.google.com/maps/api-security-best-practices): the hosted cover path uses free, unlimited Maps Embed requests rather than the separately priced Street View Static image API. Google renders the panorama directly in a minimum 200×200 iframe. Attribution and controls are not cropped, and imagery is not extracted, cached, or redistributed. Browser keys must be restricted to the intended website origins and Maps Embed API only. The legacy optional Static API server adapter is separate and is not required by the free embed path.

Hosted Places uses [Open-Meteo geocoding](https://open-meteo.com/en/docs/geocoding-api), with GeoNames attribution and its [non-commercial free API terms](https://open-meteo.com/en/terms), for explicit city/town searches. The returned city center or rounded browser-provided coordinates query a bounded area through [Photon / komoot](https://github.com/komoot/photon/blob/master/docs/api-v1.md), with [Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) as a fallback. Photon permits reasonable-volume personal projects on its public demo service; responses retain OpenStreetMap source/ODbL attribution. Browser requests omit credentials and cache results briefly; errors retain the previous collection. The hosted site does not call Nominatim, implement address autocomplete, or attempt systematic extraction of all venues. Legacy local Nominatim lookup remains subject to its service policy.
