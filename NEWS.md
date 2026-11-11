# Broadsheet / 03

A personal news reading room. Follow sources, combine topics into channels, and arrange a spatial workspace of movable, resizable article windows. A conventional list view is available too.

## Run locally

Double-click **Play Broadsheet.command**, or run:

```sh
python3 server.py
```

Open the printed localhost address and choose **News**. No dependency install or API key is needed. **Refresh feeds** collects the latest RSS/Atom items from ten configured feeds: Global Voices, EFF Updates, The Guardian, Al Jazeera, Le Monde (English), NASA, The Verge, Ars Technica, ScienceDaily AI, and Guardian Food. The local server performs bounded requests concurrently, keeps each failed source's previous stories, and records collection status and dates. Refreshes are limited to once per minute. It only fetches the explicit catalog; it is not an arbitrary URL proxy.

The Python adapter verifies HTTPS certificates. On python.org macOS installations without a configured default CA bundle it uses the system `/etc/ssl/cert.pem`; certificate verification is never disabled.

## Read and customize

- **Sources:** follow or unfollow feeds in **Add sources**. Click a source in the sidebar for only its stories, such as NASA.
- **Topics:** filter World, Space, Science, Technology, AI, Climate, or Cooking. **Edit** beside Following chooses your sidebar topics.
- **Channels:** combine any selected topics and sources. Topics are ORed together, then intersected with the selected sources. Following controls the available feeds. The built-in Space & science, Tech & AI, and The kitchen channels are editable.
- **Workspace:** drag the background to pan, a card's dotted handle to move it, and its bottom corner to resize it. Focus either handle and use arrow keys; Shift increases the step. Use the size menu for presets and **Tidy layout** to reset the current view's manual positions. Filtering has its own saved layout and does not destroy other views.
- **Reading:** scroll within a card to read. Headlines unfold the card in place with its original source link; neighboring cards reflow. Retained NASA stories can also unfold inside their card; multiple complete stories may remain open together.
- **Save:** keep an article for later. Its saved text and source metadata survive feed updates, unfollowing, and removal of an imported feed. There is no cross-device account sync.
- **Search and sort:** search titles, excerpts, sources, and topic labels within the current selection. Sort by date or source. Switch between canvas and list views.

Channels, followed sources/topics, saved stories, manual card positions/sizes, and view preferences persist in browser local storage. Panning and zoom are session controls; **Home** resets them. Storage failures are disclosed. The canvas continues in every direction and repeats the loaded source collection. Counts and list views refer to unique stories. Only cards near the canvas viewport are mounted.

## A newspaper in an endless space

The canvas uses continuous newspaper columns with wider photo-led columns and narrower report columns. Every column flows directly into the next story with a consistent gutter; there are no chunk boundaries, reserved span slots or empty rows under a neighboring lead. Natural heights are measured from rendered content. Opening or widening a card widens its reading column and shifts neighboring columns, keeping the surrounding page full. Dragging swaps story positions instead of leaving a vacant slot. Tidy resets the current view's arrangements and retained positions.

News uses `press-v2` layout keys with `pressLayouts` and `pressPins`. Existing saved stories and filters are preserved; older open/size records are migrated by story identity into the compact layout. Nearby viewport neighborhoods are checked for duplicate article IDs and backfilled from the actual filtered collection, including at distant/negative coordinates and after measurements or edits. Very small result sets show each available report once in the visible area rather than filling the screen with copies. The world remains pannable; a finite edition cannot supply unlimited distinct reporting.

Publisher photos appear directly on the canvas. Reports with a matching photograph, at least three significant shared headline terms, and publication dates within seven days share one canvas card with publisher buttons. Each publisher’s own title, excerpt, image credit and original link opens in that card. Counts distinguish reports from cards. Unrelated uses of a file photo are kept separate; repeated photo covers are suppressed while original media remains available inside each report. Repeated regional locator covers are also reduced. Optional photo fingerprints are retained in `dist/news-media-index.json`; regenerate them after collecting a new snapshot with `python3 news_fingerprints.py` (requires Pillow locally; the normal build and reader do not require it). Supplied video opens with playback controls inside the expanded card, without autoplay. **Find & filter → Story media** selects photographs, video reports, regional locators or retained in-depth NASA reading. Source facts, publication/collection dates, supplied bylines, related headlines and regional context appear inside expanded stories. Regional maps are labeled overviews from named headline places, not verified event locations. Related headlines are lexical suggestions, not an assertion that the stories describe the same event. Sources and media rights remain linked. See [SOURCES.md](SOURCES.md).

## Expanded full-text sources (November 11, 2026)

BBC has been removed from the source catalog, default follows, snapshot, and gateway host allowlist. Existing saved user data is not deleted. Global Voices and EFF Updates are followed once for existing workspaces; later unfollows are respected.

- **Global Voices:** global community reporting, full-text RSS and public article text under CC BY 3.0. Original author and translator credits, original article, license, and presentation changes appear before the text.
- **EFF Updates:** digital-rights reporting and advocacy, full-text RSS and original EFF article text under CC BY 4.0. EFF is labeled as an advocacy source. Author, original article and license are retained.
- Third-party photographs, players and illustrations from these sources are excluded. The reader provides a text-only adaptation and retains article reference links in a disclosure below the prose. Partner-republication notices, explicit separate text-rights notices, or missing author credits lead to the original instead of full-text reading.
- New adapters accept only dated article paths, keep redirects inside the publisher, honor access denials and restrictive preview metadata, and have no API keys. Their successful readings share a 15-minute edge cache. There is no publisher full-text bulk archive.
- Opening many cards uses at most three concurrent article requests and twelve queued requests. Repeated/rapid opens share one request. The reader keeps up to thirty settled article records; excess openings offer a retry rather than an unbounded queue. Cards still load text only when opened and remain viewport-virtualized.

All ten feeds returned usable items during the refresh: 250 total stories, including 15 Global Voices and 40 EFF items (the collector's existing per-feed cap). The public static edition remains a dated snapshot, not a continuously polled feed service. See [SOURCES.md](SOURCES.md) for permissions, rejected candidates and capacity caveats.

## Import another feed

In the source library, expand **Add your own RSS or Atom feed**. Paste a feed URL or import a downloaded XML/RSS/Atom file. URL import requires the publisher to allow browser CORS access. Imported feeds are local snapshots: re-import the URL or file to update them. File imports support absolute links, and relative links when the feed has a valid website URL. Imports reject entity declarations, non-HTTP(S) article links, and files over 5 MB. Text is rendered without publisher HTML/scripts. Remove an import from the library without deleting saved stories.

## Source context and limitations

**Source mix** shows the distribution of stories in the current selection, publisher base, and source type. Counts are feed shares, not a measure of the world's reporting. Guardian World and Guardian Food are two feeds from the same publisher. Location does not imply the location of a story or a political viewpoint.

Political bias and reliability are explicitly **unrated**. No third-party rating dataset, political scoring model, or same-event clustering is integrated. Topic classification uses source-feed topics, imported categories, and simple headline rules; it is approximate. The initial catalog is a starting selection, not comprehensive world coverage.

Publisher feeds supply headlines and excerpts for browsing. Unfolding a story loads public article text on demand through the existing gateway and renders paragraphs, headings, lists, supplied bylines and source links inside that card. Guardian uses its official Open Platform API with the registered gateway secret; its full body HTML and original links/notices are retained in a sandboxed frame that grows with the card, alongside the official attribution logo. It supports the configured publishers; custom sources need an adapter. The gateway accepts only HTTPS article URLs on explicit publisher hosts, validates every redirect, never forwards cookies or credentials, and keeps the original page's access restrictions. Subscriber flags, publisher preview restrictions, denial/challenge pages and failed extraction produce an in-card retry/source option rather than a pretend full article. It does not obtain subscription-only content. Article text is not added to GitHub, feed snapshots, saved stories or localStorage. Successful readings are shared briefly by repeated cards in a bounded memory cache; the browser response is not cached. Guardian and explicitly CC-licensed sources share a 15-minute edge cache. Loading updates the existing prose container, preserving reading position while the card grows and neighboring columns reflow. The previously curated NASA full-text archive and its credited local images remain available, with original dates and source/rights metadata. See [SOURCES.md](SOURCES.md).

## Static and offline editions

The existing public site is hosted on GitHub Pages: https://nascarjake.github.io/broadsheet/ . Pages serves `dist/`; it cannot execute the Python feed adapter. The static UI identifies its collection time and explains that live publisher refresh needs the local server. New collected snapshots must be published to update that static edition.

To refresh and rebuild an offline snapshot:

```sh
python3 feed.py
python3 build_standalone.py
```

Open `Broadsheet-news-preview.html` directly. It contains the source catalog, feed snapshot, retained NASA archive, embedded NASA archive images, and locator geography. This retained text and geography can be read offline; publisher-hosted photos and video need an internet connection. A browser may restrict persistence for file URLs; the UI reports storage failures. No synthetic articles are generated.

## Validation

```sh
npm test
node tests/test_layout.cjs
node --check dist/app.js
node --check dist/model.js
```

Tests additionally cover Media RSS variants/credits, safe video references, inline-photo order, geographic aliases, negative/distant newspaper coordinates, natural sizing, expansion, reflow, persistence and collision-free movement/resizing. Tests cover corpus attribution, RSS/Atom parsing, unsafe links and entities, feed size bounds, partial failure retention, complete failure preservation, filtering and source/topic intersections, saved filtering, sorting, safe import URL resolution, layout bounds, and non-overlapping automatic placement. `tests/ui.cjs` is an optional Playwright smoke test for a locally running server; install Playwright separately to run it.

Browser checks were performed on desktop and a 390px mobile viewport for source/topic filtering, channel creation and reload persistence, saving, card keyboard move/resize and persistence, in-card NASA reading, source mix, follow/unfollow empty states, and feed import. Physical touch/pinch and cross-browser performance are not certified. The canvas supports one-pointer panning and Ctrl/Command+scroll zoom; two-finger pinch on the background is implemented by the shared canvas but requires physical-device validation.

Optional native Worker parser verification uses Node 22 and Miniflare after a Wrangler dry-run build:

```sh
MINIFLARE_PATH=/path/to/node_modules/miniflare BROADSHEET_WORKER_BUNDLE=/path/to/dry-run/worker.js node tests/test_article_runtime.cjs
```

This checks the real HTMLRewriter engine with original fixture prose, including the final paragraph, nested lists, bylines, suppressed navigation/scripts, and restricted or unavailable content.
