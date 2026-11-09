# Broadsheet / 07

A modular, zoomable browser. News is one space in a larger hub for recipes, places, and movies. Each space has its own content model, filters, visual cards, layout, and saved items, with one shared endless spatial interaction engine.

## Open locally

Double-click **Play Broadsheet.command**, or run `python3 server.py` and open the printed URL. The hub links to four spaces:

- **News:** an endless newspaper with publisher photos, source video, regional locators, source context, related headlines, variable story sizes, channels, RSS imports, saved articles and in-card NASA reading. See [NEWS.md](NEWS.md).
- **Recipes:** TheMealDB’s photo collection plus the much larger Wikibooks community cookbook. Browse live recipe types, cultures, ingredients, and meal/course categories; unfold ingredients, directions, notes, and attribution in place.
- **Places:** community map listings on a visual canvas or an actual geographic map. Use browser location or search for any city/address. Business covers use credited Wikimedia Commons photos linked to the exact venue when available; missing photos use a name tile. Street View opens only through an explicit link. Restaurant cards preview food photographs on hover or keyboard focus; illustrative food is labeled. The saved Chicago collection is only a preview; the application is not bound to Chicago.
- **Movies:** regional theater releases by default, all-movie and streaming catalogs, genre/year/service/cast/studio/interest filters, and in-card trailers and JustWatch watch offers. A Ghibli starter collection remains selectable.

**Your collection** on the hub combines saved items from every space. **Recently explored** keeps a local trail of opened items and can be cleared from the hub. Opening a saved item returns to its original space and detail view. Existing news bookmarks and channel preferences remain in the original storage namespace.

## Endless browsing and in-place reading

Every browsing space fills the window. A shared floating control layer replaces the fixed masthead, sidebar, and toolbar: the space switcher is at the top left, **Browse** at the left edge, **Find & filter** at the top right, and **Zoom & arrange** below. Controls brighten near the pointer and recede while exploring. Panels overlay the canvas without changing its dimensions; clicking the canvas or pressing Escape dismisses them. Press `/` to open search. Touch controls remain visible, closed panels leave the keyboard tab order, and reduced-motion preferences disable transitions. Active searches and topics remain named on the Find control.

All four spatial modules continue left, right, up, and down. There is no outermost row or column. The loaded source collection is finite and repeats deterministically across that endless layout; the unique-item count is separate from the number of visible card instances. Catalog-sized two-dimensional spacing keeps repeats out of large nearby neighborhoods; the former fixed seven-column diagonal cycle has been removed. Retained card positions permute the source deck instead of adding extra copies, and redundant old automatic pins are repaired while opened/edited cards are preserved. Filters and list views still describe the actual unique collection.

Click a photo, title, or read button to unfold that particular card **inside the canvas**. Its width grows to span neighboring columns and its height grows to fit its details. Nearby cards reflow around the opened panel. Several cards can remain open. Fold a card to restore its compact size and release its space. Source links still open the original publisher/provider externally.

Drag the background to pan; zoom with + / −, Ctrl/Command + scroll, or two touches on the canvas background. Natural-height opened cards read by scrolling through the world. Manually height-bounded cards scroll their content internally; horizontal gestures continue moving the canvas. On a touchscreen, reading surfaces can pan or scroll as appropriate. Physical touch behavior still needs device validation.

Move cards with the dotted handle; resize from the bottom corner. Focus either handle and use arrow keys (Shift increases the step). **Tidy up** resets the current view's card edits. **Overview** zooms out around the current location rather than pretending to fit an endless world into one screen. List view remains available, and Places has a separate geographic map.

Only nearby cells are mounted. Open state, size, movement, and source identity are stored per cell and per filtered view. Panning away and returning restores the same opened card. Source changes do not silently replace its content with another item. Existing saved items, followed sources, and channels are preserved. News uses continuous content-sized newspaper columns, shared-photo cover suppression, nearby article de-duplication, and `pressLayouts`/`pressPins`; the other modules use `atlasLayouts`. These separate storage fields preserve old layouts, so legacy finite-layout edits are retained without applying obsolete coordinates to the new grid.

Live catalogs are not limited to the bundled recipes or 22 Ghibli films. Search automatically queries the provider after typing; Enter searches immediately. Category changes query the live recipe catalog. Wandering more than a screenful automatically fetches another batch while one is available. **Load more** also appends a batch and pins visible/open cards so their content stays in place as the collection grows. The spatial view initially fetches enough available pages for roughly two screens of distinct items, up to 200 items, stopping on exhaustion, failure, or a page with no new items. Previously visited viewports are retained when later pages arrive. Reloading refreshes a matching live catalog while retaining its loaded pages and pagination cursor. Counts distinguish loaded items from known category totals. Recipe stubs load their ingredients and methods by ID when opened. **Refresh** rechecks the provider; visible catalogs older than 15 minutes refresh automatically. Provider failure preserves the current collection. Provider cursors determine whether more unique results exist; the endless canvas repeats currently loaded items.

Recipe and Wikipedia requests use documented cross-origin APIs directly from the browser, including on GitHub Pages. GitHub Pages cannot run `server.py`; server-only integrations remain separate. Wikipedia provides articles and available artwork, not current cinema availability or verified genres. Its genre controls are keyword searches. TMDB supplies structured genres and current releases when connected.

## Location and maps

Places uses the browser Geolocation API and OpenStreetMap services; it needs no Google Maps API key. If location permission is already granted, an uninitialized Places space can adapt automatically. Otherwise choose **Use my location** to invoke the browser permission flow. A declined/unavailable location leaves manual city/address search available. Location lookup needs localhost or HTTPS and a browser that provides geolocation.

On GitHub Pages, rounded browser coordinates go to Photon's OpenStreetMap index for a bounded nearby sample, with Overpass as a fallback. City or town names are resolved by Open-Meteo's GeoNames-based geocoding API (free for non-commercial use, with provider rate limits), then nearby businesses are fetched from Photon. Searches are user-triggered and cached for ten minutes in the browser. No paid Places API or hosted backend is needed. Precise browser geolocation still requires the visitor's permission.

The optional local server retains its existing Nominatim/Overpass adapter, including serialized, cached city lookup and configurable `NOMINATIM_URL` / `OVERPASS_URL`. That adapter's Nominatim use is subject to its public-service policy and is separate from the hosted site's Open-Meteo city lookup. Geographic tiles come from OpenStreetMap; directions open Google Maps.

Map listings may be incomplete or outdated; live search returns a bounded sample, not every venue. Provider failure keeps the previous collection. Venue ratings, “open now” claims, distances from an unknown location, and unverified logos are not invented. Restaurant photo previews distinguish sourced venue media from illustrative TheMealDB photos. See [SOURCES.md](SOURCES.md).

### Lightweight business photos

Cards no longer load Google panorama iframes. A bounded batch of exact OpenStreetMap IDs retrieves community photo references, or the venue's Wikidata P18 image. Wikimedia Commons supplies thumbnails and author/license/source metadata. Photo metadata is cached on this device for one day (missing photos for ten minutes), capped at 200 venue records; repeated canvas instances share the same reference and normal browser image cache. Photo coverage varies. Images are never inferred from a similar business or a chain logo. Unsupported or absent media falls back to an explicitly labeled name tile. Illustrative food remains labeled separately.

**Open Street View** opens Google explicitly. Google's Places Photo API is a separately metered product and forbids caching photo names; it has not been enabled. The existing Embed-only browser key remains restricted, but the current cards do not use it. The legacy local `/api/streetview` adapter remains optional and separately priced; no paid image API is required.

### Movie and recipe discovery

A fresh browser session lands Movies on TMDB's regional **In theaters** listing, using the selected country (US initially). This is not a local showtime or ticket feed. **All movies** and **Streaming** expose the wider catalog. Filters query TMDB across result pages: genre, year, service, subscription/free/ads/rent/buy availability, cast, production company, and interest keywords. Actor/studio/interest fields resolve actual provider IDs through explicit suggestions. Structured theater filters use a recent regional theatrical-release window; they cannot certify that a particular cinema still screens a film. Title search checks unsupported advanced constraints against each source result page instead of ignoring them. A page can have no matches while later pages remain; **Continue searching** advances it.

Counts show unique items loaded versus provider-reported matches, rather than implying a 100/200-film catalog. TMDB limits a query to 500 pages (10,000 results), even if its total is larger; narrowing the filters exposes other windows of the catalog. Opening a TMDB film loads its runtime, director, cast, studios, available YouTube trailer, and watch offers for the chosen country. Trailers do not autoplay. Availability is attributed to JustWatch via TMDB and links to the supplied TMDB watch page; these are not guaranteed prices or direct service deep links.

Recipes can switch between **Photo kitchen / TheMealDB** and **Community cookbook / Wikibooks**. Both paginate and support source-backed discovery. TheMealDB's lunch/dinner/snack suggestions group actual recipe categories editorially, with a visible label; no author meal assignment is invented. Wikibooks uses its native recipe, culture, and course categories (including regional subcategories), and displays provider totals. Its community recipes retain source links, contributor/CC BY-SA attribution, instructions, and notes; image rights remain linked separately. Missing recipe photos use a labeled text cover. Both catalogs are finite and source-dependent.

For local access to the hosted movie features, launch with `BROADSHEET_API_BASE=https://broadsheet-catalog.nascarjake.workers.dev/ python3 server.py`. This public endpoint URL is not a credential. The local Python adapter remains available for basic movie catalogs; advanced discovery and details use the gateway.

## Live providers

The local Python server exposes fixed-provider adapters, not an open URL proxy:

| Route | Data |
| --- | --- |
| `POST /api/refresh` | News feed catalog; retains last available stories on partial failure |
| `GET /api/recipes?q=...` | TheMealDB dish-name search; ingredient search works over loaded recipes |
| `POST /api/places` | `{city}` or `{lat, lon}` searches through Nominatim / Overpass |
| `GET /api/movies?mode=popular&region=US&page=1` | Paginated TMDB title, genre, popular, or now-playing lists when configured |
| `GET /api/streetview?lat=...&lon=...` | On-demand Google Street View business cover when configured |
| `GET /api/capabilities` | Available server integrations; never returns credentials |

TheMealDB documents its test key for development/personal use and recommends a supporter key for public production applications. The free personal browser path uses that test key. Set `MEALDB_KEY` for the optional server adapter when appropriate. Current cinema listings need a TMDB API Read Access Token in the server's `TMDB_READ_TOKEN` environment variable. The local launcher also reads allowlisted values from ignored `.env.local`; process environment takes precedence. A local `GOOGLE_MAPS_BROWSER_KEY` serves the public Embed-only configuration to localhost without exposing server tokens. The optional hosted gateway stores the TMDB token as a Worker secret and is selected with repository variable `BROADSHEET_API_BASE`. Do not paste credentials into chat or browser storage. Without it, Movies uses free live Wikipedia discovery; the Ghibli collection remains selectable. TMDB requests follow page cursors up to its 500-page limit. Now-playing searches remain within current releases; title searches use the separate movie search endpoint. These are not local showtimes.

Provider terms and image rights apply. TheMealDB development access, Ghibli metadata, and original film artwork do not imply a blanket license for commercial distribution. Collection source/credit metadata is retained per item and surfaced in details. Leaflet's license is retained in `dist/vendor/LEAFLET-LICENSE`.

## Source layout

- `dist/spatial.js`: unbounded coordinates, stable source assignment, per-cell state, span-aware masonry, and local reflow. Unedited row ranges are calculated analytically rather than enumerated.
- `dist/canvas.js`: shared canvas virtualization, in-place height measurement, zoom/pan/pinch, focus, and pointer/keyboard move/resize. Used by **all four spaces**, including News.
- `dist/spaces.js`: domain registry, filtering, mosaic placement, independent storage keys, shared collection, and recent-item records.
- `dist/browse.js`: common visual-space controller with recipe/place/film card and detail renderers.
- `dist/live.js`: browser-side recipe catalogs, cookbook hydration, pagination, nearby places, and attributed venue-photo metadata.
- `dist/facets.js`, `dist/discovery.css`: source-aware discovery controls, trailers, watch offers, and photo fallbacks.
- `dist/config.js`: generated public configuration; no server tokens.
- `space-shell.html` → `build_spaces.py`: one HTML shell generates `recipes.html`, `places.html`, and `movies.html`.
- `dist/index.html`, `dist/hub.js`: hub and cross-space saved collection.
- `dist/news.html`, `dist/app.js`, `dist/model.js`: retained News domain and its reader-specific behavior.
- `providers.py`: server adapters and development-time starter collection capture.
- `api/worker.mjs`, `api/movies.mjs`, `api/wrangler.jsonc`: read-only TMDB gateway, with server-side token, fixed upstream, per-IP rate limit, CORS allowlist, and public-metadata cache. The hosted site connects through `BROADSHEET_API_BASE`. Deploy only with the verified personal profile. The current deployment uses Workers Free and its built-in CPU limit; a custom `limits.cpu_ms` setting requires a paid plan and is deliberately omitted. No subscription change is performed by this repository. Free request allowances are shared with the account's other Workers; requests stop when that allowance is exhausted.
- `streetview.py`: metadata-first, uncached Google Street View image delivery.
- `dist/discovery.json`: attributed starter data; recipe/film images remain provider-hosted.

To add a domain, add its registry entry and normalized item adapter, add its card/detail renderer, and expose it in the hub and shared shell. Keep interaction logic in the common canvas. No framework or package dependency is needed to run the application; Leaflet is vendored for maps.

## Build and verify

```sh
npm run build
npm test
node --check dist/app.js
node --check dist/canvas.js
node --check dist/spatial.js
node --check dist/browse.js
node --check dist/hub.js
```

`npm test` runs Python tests plus JavaScript checks for news filtering, domain filtering and ingredient search, storage isolation, non-overlapping mosaics, canvas virtualization, zoom anchors, keyboard movement/resizing, focus, and cleanup. Endless-grid tests cover distant quadrants, negative coordinates, multiple open panels, collision-free span packing, persistence, and source-identity changes. Provider tests cover global coordinate search, city changes, invalid coordinates, API boundaries, caching, attribution, and explicit missing movie credentials. `tests/ui.cjs` remains an optional Playwright News smoke test; Playwright is not a runtime dependency.

Desktop/mobile browser QA covers hub navigation, recipe details and live search, movie genre filtering, cross-space saved items, map markers/tiles, and canvas controls. The current correction was browser-checked for inline expansion in all four modules, far panning past every former edge, continued reading inside the world, and reopening after virtual unmount. Live map lookup has been intermittent in this environment; the previous collection is retained on failure. Actual permission-granted geolocation and physical touch pinch require checking on the user's browser/device. Live theater results, combined streaming/year/genre filters, cast lookup, trailers/watch offers, Wikibooks pagination and in-place recipe parsing, and exact-venue photo retrieval were verified against live sources. Geographic permission and physical touch still require device validation.

## Captured editions and hosting

`python3 providers.py` refreshes starter recipes/films and the explicitly labeled map preview; `python3 feed.py` refreshes news. `npm run build` generates separate standalone snapshots:

- `Broadsheet-preview.html` — hub, linking to sibling snapshots.
- `Broadsheet-news-preview.html` — retained fully embedded NASA/news reader.
- `Broadsheet-recipes-preview.html`, `Broadsheet-places-preview.html`, `Broadsheet-movies-preview.html` — self-contained application/data shells; remote photos and map tiles still need a connection.

The existing GitHub Pages deployment can serve the static `dist/` hub and spaces, but cannot execute the local Python APIs. Live recipe sources, fallback Wikipedia film discovery, city/nearby place lookup, and open-source business photo discovery work directly from the hosted site. TMDB requires its private server token through the optional gateway. The starter collections and saved browsing remain available.

Core layout JS/CSS URLs carry content hashes, so a new published layout does not reuse a previous cached script. Standalone builds inline the corresponding assets. News photo fingerprints are optional maintenance metadata; the shipped reader/build has no Pillow dependency.
