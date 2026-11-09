# Broadsheet / 03

A personal news reading room. Follow sources, combine topics into channels, and arrange a spatial workspace of movable, resizable article windows. A conventional list view is available too.

## Run locally

Double-click **Play Broadsheet.command**, or run:

```sh
python3 server.py
```

Open the printed localhost address and choose **News**. No dependency install or API key is needed. **Refresh feeds** collects the latest RSS/Atom items from nine configured feeds: BBC News, The Guardian, Al Jazeera, Le Monde (English), NASA, The Verge, Ars Technica, ScienceDaily AI, and Guardian Food. The local server performs bounded requests concurrently, keeps each failed source's previous stories, and records collection status and dates. Refreshes are limited to once per minute. It only fetches the explicit catalog; it is not an arbitrary URL proxy.

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

## Import another feed

In the source library, expand **Add your own RSS or Atom feed**. Paste a feed URL or import a downloaded XML/RSS/Atom file. URL import requires the publisher to allow browser CORS access. Imported feeds are local snapshots: re-import the URL or file to update them. File imports support absolute links, and relative links when the feed has a valid website URL. Imports reject entity declarations, non-HTTP(S) article links, and files over 5 MB. Text is rendered without publisher HTML/scripts. Remove an import from the library without deleting saved stories.

## Source context and limitations

**Source mix** shows the distribution of stories in the current selection, publisher base, and source type. Counts are feed shares, not a measure of the world's reporting. Guardian World and Guardian Food are two feeds from the same publisher. Location does not imply the location of a story or a political viewpoint.

Political bias and reliability are explicitly **unrated**. No third-party rating dataset, political scoring model, or same-event clustering is integrated. Topic classification uses source-feed topics, imported categories, and simple headline rules; it is approximate. The initial catalog is a starting selection, not comprehensive world coverage.

Publisher feeds supply bounded excerpts and links to original articles. Broadsheet does not bypass paywalls or republish third-party full articles. The previously curated NASA full-text archive and its credited local images remain available, with original dates and source/rights metadata. See [SOURCES.md](SOURCES.md).

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
