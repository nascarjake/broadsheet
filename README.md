# Broadsheet / 02

A spatial reading experiment. Full stories unfold in place, with neighboring columns continuing around them. Panning is unbounded and virtualized; the finite archive repeats rather than inventing new news.

## Open

On this Mac, double-click **Play Broadsheet.command** in this folder. It starts the local server and opens your browser. Keep its Terminal window open; Control-C stops it. No dependency install is needed to read the saved edition.

Download and open `Broadsheet-preview.html` in a browser. It is self-contained, works offline, and needs no installation. This snapshot contains 53 complete NASA article prose texts, approximately 33,000 words, and 95 image placements. 27 articles have multiple images. Original publication dates are shown (September–November 2026). No auto-refresh or claim of unlimited unique stories.

For source development, run `python3 server.py`, then visit the printed localhost URL. Python standard library suffices for serving. To rebuild the offline preview, run `python3 build_standalone.py`.

`collect_corpus.py --refresh` is a development-time source refresh, not a runtime news scraper. It uses public NASA APIs, selecting NASA-attributed material and credited NASA imagery. Its curation needs lxml and Pillow; the saved preview and server do not. Read `SOURCES.md` and each story's source/rights metadata before extending sources. A free RSS feed does not by itself license full article republication.

## Controls

- Drag or scroll anywhere on the canvas to discover more neighboring stories.
- Click a headline or Read full story to unfold it; multiple remain open.
- Scroll down to read the text while surrounding stories remain present.
- Pinch, Ctrl/Command+scroll, or + / − zoom. Arrow keys pan.
- H returns home; F opens the searchable archive. Escape refolds the selected story.
- Click a photograph to enlarge it. Text remains selectable.

## Architecture

A single CSS-composited world transform moves selectable DOM text. Cards are created only around the viewport and removed offscreen. Unfolded heights persist in a small state map so a story remains unfolded after wandering away. No continuous animation or draw loop runs at idle. Images are bounded JPEGs with lazy decoding. The file snapshot is around 10 MB rather than requiring a live external service.

Deterministic column/row indexing supplies content at arbitrary coordinates. The map is infinite; the archive is not. This is deliberately disclosed in the interface. Story positions are stable until a story in the same column unfolds/refolds, which shifts later cards to avoid overlap.

## Validation

- 12 Python adapter/corpus tests pass; JavaScript syntax check passes.
- Cloud browser QA confirmed two complete stories open together, six photos in those stories, search-to-canvas navigation, and persistent unfolding after far panning in all directions.
- In eight large pan samples, the DOM held 21–24 cards and the measured synchronous render pass took 6.1–10.6 ms. These are cloud-browser samples, not FPS or a guarantee on Jake's hardware.
- Desktop and 390px iframe layout visually inspected. Physical touch gestures and Mac performance remain untested.

Installed in the user-requested Source/broadsheet project on the Mac. Public demo: https://nascarjake.github.io/broadsheet/

GitHub Pages deploys the static `dist/` directory on each push to main. The public demo is a captured edition, not a live news service. NASA does not endorse this independent interface experiment.
