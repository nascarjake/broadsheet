/* Source media and context, rendered without publisher HTML or arbitrary embeds. */
(function (root) {
  const N = root.BroadsheetNews,
    ns = "http://www.w3.org/2000/svg";
  let geography = { countries: [] };
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const svg = (tag) => document.createElementNS(ns, tag);
  function link(text, url) {
    const a = el("a", "news-source-link", text);
    a.href = N.publicURL(url);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }
  function configure(data) {
    geography = data || geography;
    document.querySelector("#news-map-definitions")?.remove();
    const sprite = svg("svg");
    sprite.id = "news-map-definitions";
    sprite.setAttribute("aria-hidden", "true");
    sprite.style.cssText =
      "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    const defs = svg("defs"),
      world = svg("g");
    world.id = "news-map-world";
    for (const c of geography.countries) {
      const path = svg("path");
      path.id = "news-country-" + c.id;
      path.setAttribute("d", c.path);
      path.setAttribute("vector-effect", "non-scaling-stroke");
      defs.append(path);
      const use = svg("use");
      use.setAttribute("href", "#" + path.id);
      world.append(use);
    }
    defs.append(world);
    sprite.append(defs);
    document.body.append(sprite);
  }
  function figure(image, full = true) {
    const f = el("figure", "story-photo news-photo"),
      img = el("img");
    img.src = N.publicURL(image.src);
    img.alt = image.alt || image.caption || "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.onerror = () => {
      f.classList.add("media-unavailable");
      img.remove();
      const note = el(
        "span",
        "media-fallback",
        "Photo unavailable · open the publisher for the original",
      );
      f.prepend(note);
    };
    f.append(img);
    const caption = el("figcaption");
    caption.append(
      document.createTextNode(
        [
          full ? image.caption : "",
          image.credit || "Photo supplied by publisher",
        ]
          .filter(Boolean)
          .join(" — "),
      ),
    );
    if (full && (image.sourceUrl || image.url))
      caption.append(
        " · ",
        link("Image source ↗", image.sourceUrl || image.url),
      );
    if (full && image.rightsUrl)
      caption.append(" · ", link("Image rights ↗", image.rightsUrl));
    f.append(caption);
    return f;
  }
  function locator(
    story,
    places = N.locations(story, geography),
    full = false,
  ) {
    if (!places.length) return null;
    const f = el("figure", "news-locator"),
      map = svg("svg");
    const centers = places.map((p) =>
        p.coordinate ? [p.lon, p.lat] : p.country.center,
      ),
      lon = centers.reduce((n, p) => n + p[0], 0) / centers.length,
      lat = centers.reduce((n, p) => n + p[1], 0) / centers.length;
    const large = places.some((p) =>
      ["USA", "RUS", "CHN", "CAN", "AUS", "BRA"].includes(p.country?.id),
    );
    const box = large
      ? [0, 0, 720, 360]
      : [
          Math.max(0, Math.min(360, (lon + 180) * 2 - 180)),
          Math.max(0, Math.min(120, (90 - lat) * 2 - 120)),
          360,
          240,
        ];
    map.setAttribute("viewBox", box.join(" "));
    map.setAttribute("role", "img");
    map.setAttribute(
      "aria-label",
      "Regional locator: " + places.map((p) => p.name).join(", "),
    );
    const water = svg("rect");
    water.setAttribute("x", 0);
    water.setAttribute("y", 0);
    water.setAttribute("width", 720);
    water.setAttribute("height", 360);
    water.setAttribute("fill", "#e2eceb");
    map.append(water);
    const world = svg("use");
    world.setAttribute("href", "#news-map-world");
    world.setAttribute("fill", "#f5f2e6");
    world.setAttribute("stroke", "#bdceca");
    world.setAttribute("stroke-width", ".45");
    map.append(world);
    for (const place of places) {
      if (place.country) {
        const use = svg("use");
        use.setAttribute("href", "#news-country-" + place.country.id);
        use.setAttribute("fill", "#758e77");
        use.setAttribute("stroke", "#45694e");
        use.setAttribute("stroke-width", "1");
        map.append(use);
      }
      const point = place.coordinate
          ? [place.lon, place.lat]
          : place.country.center,
        marker = svg("circle");
      marker.setAttribute("cx", (point[0] + 180) * 2);
      marker.setAttribute("cy", (90 - point[1]) * 2);
      marker.setAttribute("r", large ? 4 : 3);
      marker.setAttribute("fill", "#aa5a3d");
      map.append(marker);
    }
    f.append(
      map,
      el(
        "figcaption",
        "",
        (full ? "" : "Regional locator · ") +
          places
            .map((p) =>
              p.coordinate
                ? p.name
                : p.name + (p.term !== p.name ? " · “" + p.term + "”" : ""),
            )
            .join(" / "),
      ),
    );
    if (full)
      f.append(
        el(
          "p",
          "small",
          places[0].coordinate
            ? "The feed supplies this coordinate; it does not establish a verified incident site."
            : "Country/territory context for places named in the headline. The marker is a regional label, not an incident location.",
        ),
        link(
          "Explore region in OpenStreetMap ↗",
          "https://www.openstreetmap.org/#map=4/" +
            lat.toFixed(3) +
            "/" +
            lon.toFixed(3),
        ),
        el("span", "map-credit", " · Made with Natural Earth"),
      );
    return f;
  }
  function cover(story, profile, open) {
    let f =
      profile.shape === "locator"
        ? locator(story, profile.places)
        : profile.image
          ? figure(profile.image, false)
          : null;
    if (!f) return null;
    f.classList.add("news-cover");
    const target = f.querySelector("img,svg");
    target.setAttribute("tabindex", "0");
    target.setAttribute("role", "button");
    target.setAttribute("aria-label", "Unfold " + story.title);
    target.onclick = open;
    target.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    };
    if (profile.clip) f.append(el("span", "video-badge", "▶ Video report"));
    return f;
  }
  function videos(story) {
    const wrap = el("section", "news-video-section");
    for (const m of N.media(story).filter((m) => m.type === "video")) {
      let player;
      if (["YouTube", "Vimeo"].includes(m.provider)) {
        if (m.provider === "YouTube" && !/^[\w-]{11}$/.test(m.id || ""))
          continue;
        if (m.provider === "Vimeo" && !/^\d{4,12}$/.test(m.id || "")) continue;
        player = el("iframe", "news-video");
        player.title = story.title + " — video";
        player.src =
          m.provider === "YouTube"
            ? "https://www.youtube-nocookie.com/embed/" + m.id
            : "https://player.vimeo.com/video/" + m.id;
        player.loading = "lazy";
        player.allow = "encrypted-media; picture-in-picture; fullscreen";
        player.allowFullscreen = true;
        player.referrerPolicy = "strict-origin-when-cross-origin";
      } else if (
        N.publicURL(m.src) &&
        /\.(mp4|webm|ogv)(?:$|\?)/i.test(m.src)
      ) {
        player = el("video", "news-video");
        player.controls = true;
        player.preload = "none";
        player.playsInline = true;
        player.src = N.publicURL(m.src);
        if (m.poster) player.poster = N.publicURL(m.poster);
      }
      if (player)
        wrap.append(
          player,
          el("p", "small", [m.caption, m.credit].filter(Boolean).join(" · ")),
        );
      if (N.publicURL(m.url)) wrap.append(link("Watch at source ↗", m.url));
    }
    return wrap;
  }
  function context(story, { publisher, stories, open, collectedAt }) {
    const section = el("section", "news-context");
    section.append(el("h3", "", "The story, in context."));
    const facts = el("dl", "news-facts");
    for (const [name, value] of [
      ["Source", publisher.name],
      ["Source type", publisher.kind],
      ["Publisher base", publisher.region],
      [
        "Published",
        Number.isFinite(Date.parse(story.date))
          ? new Date(story.date).toLocaleString()
          : "Not supplied",
      ],
      ["Byline", story.author],
      [
        "Reading",
        story.wordCount
          ? story.wordCount.toLocaleString() + " words · NASA archive prose"
          : "",
      ],
      [
        "Collected",
        collectedAt ? new Date(collectedAt).toLocaleString() : "Not supplied",
      ],
    ])
      if (value) facts.append(el("dt", "", name), el("dd", "", value));
    section.append(facts);
    const places = N.locations(story, geography);
    if (places.length) {
      section.append(
        el("h3", "", "Places in this reporting"),
        locator(story, places, true),
      );
    }
    const related = N.related(story, stories);
    if (related.length) {
      const group = el("div", "news-related");
      group.append(el("h3", "", "Related headlines"));
      for (const match of related) {
        const b = el("button", "related-headline");
        b.append(
          el(
            "small",
            "",
            match.story.source +
              " · " +
              (Number.isFinite(Date.parse(match.story.date))
                ? new Date(match.story.date).toLocaleDateString()
                : "Undated"),
          ),
          el("span", "", match.story.title),
          el("small", "", "Shared headline terms: " + match.shared.join(", ")),
        );
        b.onclick = () => open(match.story);
        group.append(b);
      }
      section.append(group);
    }
    return section;
  }
  root.BroadsheetNewsView = {
    configure,
    figure,
    locator,
    cover,
    videos,
    context,
  };
})(window);
