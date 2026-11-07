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
