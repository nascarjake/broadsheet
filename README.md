# Broadsheet / 05

A modular, zoomable browser. News is one space in a larger hub for recipes, places, and movies. Each space has its own content model, filters, visual cards, layout, and saved items, with one shared endless spatial interaction engine.

## Open locally

Double-click **Play Broadsheet.command**, or run `python3 server.py` and open the printed URL. The hub links to four spaces:

- **News:** the existing multi-source reading room, channels, RSS imports, source mix, saved articles, and in-card NASA reading. See [NEWS.md](NEWS.md).
- **Recipes:** a photo-led mosaic, dish/ingredient search, category filters, complete sourced ingredient lists and methods, and live dish-name search through TheMealDB.
- **Places:** community map listings on a visual canvas or an actual geographic map. Use browser location or search for any city/address. Business covers use Google Street View when configured and available. Restaurant cards preview food photographs on hover or keyboard focus; illustrative food is labeled. The saved Chicago collection is only a preview; the application is not bound to Chicago.
- **Movies:** a poster-led starter film collection, genre/director search, year sorting, and a provider adapter for regional “now playing” listings.

**Your collection** on the hub combines saved items from every space. **Recently explored** keeps a local trail of opened items and can be cleared from the hub. Opening a saved item returns to its original space and detail view. Existing news bookmarks and channel preferences remain in the original storage namespace.

## Endless browsing and in-place reading

All four spatial modules continue left, right, up, and down. There is no outermost row or column. The loaded source collection is finite and repeats deterministically across that endless layout; the unique-item count is separate from the number of visible card instances. Filters and list views still describe the actual unique collection.

Click a photo, title, or read button to unfold that particular card **inside the canvas**. Its width grows to span neighboring columns and its height grows to fit its details. Nearby cards reflow around the opened panel. Several cards can remain open. Fold a card to restore its compact size and release its space. Source links still open the original publisher/provider externally.

Drag the background to pan; zoom with + / −, Ctrl/Command + scroll, or two touches on the canvas background. Natural-height opened cards read by scrolling through the world. Manually height-bounded cards scroll their content internally; horizontal gestures continue moving the canvas. On a touchscreen, reading surfaces can pan or scroll as appropriate. Physical touch behavior still needs device validation.

Move cards with the dotted handle; resize from the bottom corner. Focus either handle and use arrow keys (Shift increases the step). **Tidy up** resets the current view's card edits. **Overview** zooms out around the current location rather than pretending to fit an endless world into one screen. List view remains available, and Places has a separate geographic map.

Only nearby cells are mounted. Open state, size, movement, and source identity are stored per cell and per filtered view. Panning away and returning restores the same opened card. Source changes do not silently replace its content with another item. Existing saved items, followed sources, and channels are preserved. New grid edits use a separate `atlasLayouts` storage field, so legacy finite-layout edits are retained without applying obsolete coordinates to the new grid.

## Location and maps

Places uses the browser Geolocation API and OpenStreetMap services; it needs no Google Maps API key. If location permission is already granted, an uninitialized Places space can adapt automatically. Otherwise choose **Use my location** to invoke the browser permission flow. A declined/unavailable location leaves manual city/address search available. Location lookup needs localhost or HTTPS and a browser that provides geolocation.

The browser sends rounded coordinates to the local server using a POST body. The server queries nearby OpenStreetMap listings. A manual city/address uses Nominatim for geocoding. Queries are bounded, results are cached, geocoding is serialized to respect the public service limit, and the provider cache is bounded. Optional server environment variables `NOMINATIM_URL` and `OVERPASS_URL` can point to alternative compatible services. Geographic tiles are loaded on demand from OpenStreetMap. Google Maps is offered as an external directions link for an individual place.

Map listings may be incomplete or outdated; live search returns a bounded sample, not every venue. Provider failure keeps the previous collection. Venue ratings, “open now” claims, distances from an unknown location, and unverified logos are not invented. Restaurant photo previews distinguish sourced venue media from illustrative TheMealDB photos. See [SOURCES.md](SOURCES.md).

### Google Street View business covers

Set `GOOGLE_MAPS_API_KEY` in the server environment, with the Street View Static API enabled in a billing-enabled Google Maps Platform project, then restart the server. Keep the key out of chat and browser storage. [Google setup instructions](https://developers.google.com/maps/documentation/streetview/get-api-key).

Covers load through `GET /api/streetview?lat=...&lon=...`. The server first checks panorama metadata, aims the image toward the business coordinates, and returns the photo with `Cache-Control: no-store`. Google imagery and metadata are not placed in the general provider cache or standalone snapshots. The client displays the full image without cropping its Google attribution. The API key stays on the server. Cross-site browser image requests are rejected.

No Street View key is configured in this workspace, so live Google photos could not be verified. Missing credentials, unavailable coverage, or provider failures show a labeled fallback, with an external **Open Street View** link. These fallbacks are not claimed to be Street View photographs. Street imagery may show a nearby frontage rather than the exact entrance. The metadata/image path is covered by mocked provider tests. Public use must follow [Google's service policies](https://developers.google.com/maps/documentation/streetview/policies).

## Live providers

The local Python server exposes fixed-provider adapters, not an open URL proxy:

| Route | Data |
| --- | --- |
| `POST /api/refresh` | News feed catalog; retains last available stories on partial failure |
| `GET /api/recipes?q=...` | TheMealDB dish-name search; ingredient search works over loaded recipes |
| `POST /api/places` | `{city}` or `{lat, lon}` searches through Nominatim / Overpass |
| `GET /api/movies?region=US` | TMDB now-playing list when configured |
| `GET /api/streetview?lat=...&lon=...` | On-demand Google Street View business cover when configured |
| `GET /api/capabilities` | Available server integrations; never returns credentials |

Recipes use TheMealDB's development key by default. Set `MEALDB_KEY` on the server for your provider account when needed. Current cinema listings need a TMDB API Read Access Token in the server's `TMDB_READ_TOKEN` environment variable; restart the server after setting it locally. Do not paste credentials into chat or browser storage. Without this connection, Movies clearly identifies its 22-film Studio Ghibli starter collection as a collection, not current theater releases. Now-playing currently requests the first provider page for the US region; it is not a showtime or ticketing service.

Provider terms and image rights apply. TheMealDB development access, Ghibli metadata, and original film artwork do not imply a blanket license for commercial distribution. Collection source/credit metadata is retained per item and surfaced in details. Leaflet's license is retained in `dist/vendor/LEAFLET-LICENSE`.

## Source layout

- `dist/spatial.js`: unbounded coordinates, stable source assignment, per-cell state, span-aware masonry, and local reflow. Unedited row ranges are calculated analytically rather than enumerated.
- `dist/canvas.js`: shared canvas virtualization, in-place height measurement, zoom/pan/pinch, focus, and pointer/keyboard move/resize. Used by **all four spaces**, including News.
- `dist/spaces.js`: domain registry, filtering, mosaic placement, independent storage keys, shared collection, and recent-item records.
- `dist/browse.js`: common visual-space controller with recipe/place/film card and detail renderers.
- `space-shell.html` → `build_spaces.py`: one HTML shell generates `recipes.html`, `places.html`, and `movies.html`.
- `dist/index.html`, `dist/hub.js`: hub and cross-space saved collection.
- `dist/news.html`, `dist/app.js`, `dist/model.js`: retained News domain and its reader-specific behavior.
- `providers.py`: server adapters and development-time starter collection capture.
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

`npm test` runs 38 Python tests plus JavaScript checks for news filtering, domain filtering and ingredient search, storage isolation, non-overlapping mosaics, canvas virtualization, zoom anchors, keyboard movement/resizing, focus, and cleanup. Endless-grid tests cover distant quadrants, negative coordinates, multiple open panels, collision-free span packing, persistence, and source-identity changes. Provider tests cover global coordinate search, city changes, invalid coordinates, API boundaries, caching, attribution, and explicit missing movie credentials. `tests/ui.cjs` remains an optional Playwright News smoke test; Playwright is not a runtime dependency.

Desktop/mobile browser QA covers hub navigation, recipe details and live search, movie genre filtering, cross-space saved items, map markers/tiles, and canvas controls. The current correction was browser-checked for inline expansion in all four modules, far panning past every former edge, continued reading inside the world, and reopening after virtual unmount. Live map lookup has been intermittent in this environment; the previous collection is retained on failure. Actual permission-granted geolocation and physical touch pinch require checking on the user's browser/device. Live now-playing and Google Street View imagery cannot be verified without their configured provider credentials.

## Captured editions and hosting

`python3 providers.py` refreshes starter recipes/films and the explicitly labeled map preview; `python3 feed.py` refreshes news. `npm run build` generates separate standalone snapshots:

- `Broadsheet-preview.html` — hub, linking to sibling snapshots.
- `Broadsheet-news-preview.html` — retained fully embedded NASA/news reader.
- `Broadsheet-recipes-preview.html`, `Broadsheet-places-preview.html`, `Broadsheet-movies-preview.html` — self-contained application/data shells; remote photos and map tiles still need a connection.

The existing GitHub Pages deployment can serve the static `dist/` hub and spaces, but cannot execute the local Python APIs. Static live search and location queries need a hosted backend before they can work there. The starter collections and saved browsing remain available. Changes in this working copy have not been published.
