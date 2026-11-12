/* Provider-backed discovery. Selections store IDs, never guessed names. */
(function (root) {
  const node = (tag, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  function mount({ id, state, request, changed, notify }) {
    const root = document.querySelector("#discovery-facets");
    if (id === "places" || window.BROADSHEET_OFFLINE)
      return {
        key: () => "",
        params: () => ({}),
        load: async () => {},
        reset: () => {},
        genres: [],
      };
    root.hidden = false;
    const fields = {},
      lookups = {};
    const active = id === "movies" ? state.movie : id === "memes" ? state.meme : state.recipe;
    function select(key, label, choices, after) {
      const wrap = node("label"),
        caption = node("span", label),
        control = node("select");
      control.setAttribute("aria-label", label);
      for (const [value, label] of choices) {
        const opt = node("option", label);
        opt.value = value;
        control.append(opt);
      }
      control.value = active[key] || choices[0]?.[0] || "";
      control.onchange = () => {
        active[key] = control.value;
        after?.();
        changed();
      };
      wrap.append(caption, control);
      root.append(wrap);
      fields[key] = control;
      return control;
    }
    function lookup(key, label) {
      const wrap = node("div"),
        caption = node("label", label),
        line = node("div"),
        input = node("input"),
        button = node("button", "Find"),
        results = node("div"),
        chosen = node("button");
      wrap.className = "facet-lookup";
      line.className = "facet-search-line";
      results.className = "facet-results";
      chosen.className = "facet-selection";
      chosen.hidden = !active[key];
      input.id = "movie-" + key;
      caption.htmlFor = input.id;
      input.placeholder = {
        cast: "Actor name",
        company: "Production studio",
        keyword: "Space, cooking, time travel…",
      }[key];
      input.maxLength = 80;
      button.type = "button";
      button.setAttribute("aria-label", "Find " + label.toLowerCase());
      chosen.textContent = (active[key + "Name"] || "") + " ×";
      chosen.setAttribute(
        "aria-label",
        "Remove " + label.toLowerCase() + ": " + (active[key + "Name"] || ""),
      );
      chosen.onclick = () => {
        active[key] = "";
        active[key + "Name"] = "";
        chosen.hidden = true;
        changed();
      };
      let revision = 0;
      const run = async () => {
        const q = input.value.trim(),
          version = ++revision;
        if (q.length < 2) {
          notify("Enter at least two letters.");
          return;
        }
        button.disabled = true;
        results.replaceChildren(node("p", "Finding matches…"));
        try {
          const data = await request(
            "api/movie-lookup?" + new URLSearchParams({ type: key, q }),
          );
          if (version !== revision) return;
          results.replaceChildren();
          if (!data.items.length)
            results.append(
              node("p", "No matching names. Try another spelling."),
            );
          for (const item of data.items) {
            const choice = node(
              "button",
              item.name + (item.description ? " · " + item.description : ""),
            );
            choice.type = "button";
            choice.onclick = () => {
              active[key] = String(item.id);
              active[key + "Name"] = item.name;
              chosen.textContent = item.name + " ×";
              chosen.setAttribute(
                "aria-label",
                "Remove " + label.toLowerCase() + ": " + item.name,
              );
              chosen.hidden = false;
              input.value = "";
              results.replaceChildren();
              changed();
            };
            results.append(choice);
          }
        } catch (e) {
          results.replaceChildren(node("p", e.message));
        } finally {
          button.disabled = false;
        }
      };
      button.onclick = run;
      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          run();
        }
      };
      line.append(input, button);
      wrap.append(caption, line, chosen, results);
      root.append(wrap);
      lookups[key] = { chosen, input, results };
    }
    const api = {
      genres: [],
      key: () => JSON.stringify(active),
      params: () => ({ ...active }),
      sync: () => {
        if (id === "movies" && fields.order) {
          fields.order.disabled = !!state.query;
          fields.order.title = state.query ? "Title search uses relevance" : "";
        }
        if (id === "recipes") active.category = state.filter;
        for (const [k, c] of Object.entries(fields)) c.value = active[k];
        for (const [k, item] of Object.entries(lookups)) {
          item.chosen.hidden = !active[k];
          item.chosen.textContent = (active[k + "Name"] || "") + " ×";
          item.chosen.setAttribute(
            "aria-label",
            "Remove " + k + ": " + (active[k + "Name"] || ""),
          );
        }
      },
      reset: () => {
        for (const [k, v] of Object.entries(
          id === "memes"
            ? { source: "all", order: "mixed" }
            : id === "movies"
            ? {
                year: "",
                provider: "",
                cast: "",
                company: "",
                keyword: "",
                availability: "all",
                order: "popularity.desc",
              }
            : { category: "All", cuisine: "All", meal: "All" },
        ))
          active[k] = v;
        for (const [k, c] of Object.entries(fields)) c.value = active[k];
        for (const item of Object.values(lookups)) {
          item.chosen.hidden = true;
          item.input.value = "";
          item.results.replaceChildren();
        }
      },
    };
    function options(control, choices, value) {
      control.replaceChildren(
        ...choices.map(([id, label]) => {
          const option = node("option", label);
          option.value = id;
          return option;
        }),
      );
      control.value = value;
      if (control.selectedIndex < 0) control.selectedIndex = 0;
    }
    if (id === "memes") {
      select("source", "Meme source", [["all", "Mix every source"], ...window.BroadsheetMemes.sources.map(s => [s.id, s.label])]);
      select("order", "Feed order", [["mixed", "Community favorites + recent hashtags"], ["newest", "Newest posts"]]);
      const note = node("small", "Pictures, clips, and GIFs from public communities. Search captions on fetched pages; Load more keeps looking. Clips play when opened and started.");
      note.className = "facet-note";
      root.append(note);
      api.load = async () => {};
    } else if (id === "recipes") {
      const title = node(
        "p",
        "Follow a culture, an ingredient, or a mealtime.",
      );
      title.className = "facet-intro";
      root.append(title);
      active.category = state.filter;
      select(
        "source",
        "Recipe collection",
        [
          ["photo", "Photo kitchen · TheMealDB"],
          ["cookbook", "Community cookbook · thousands of recipes"],
        ],
        () => {
          state.filter = "All";
          active.category = "All";
          active.cuisine = "All";
          active.meal = "All";
          void api
            .load()
            .then(changed)
            .catch((e) => notify(e.message));
        },
      );
      select(
        "category",
        "Recipe type",
        [["All", "All recipe types"]],
        () => (state.filter = active.category),
      );
      select("cuisine", "Culture / cuisine", [["All", "All cultures"]]);
      select(
        "meal",
        "Meal inspiration",
        ["All", "Breakfast", "Lunch", "Dinner", "Snacks", "Dessert"].map(
          (v) => [v, v === "All" ? "Any meal" : v],
        ),
      );
      const note = node(
        "small",
        "Lunch, dinner, and snacks are editorial category groupings, not meal labels supplied by the recipe author.",
      );
      note.className = "facet-note";
      root.append(note);
      document.querySelector("#filter-pills").hidden = true;
      api.load = async () => {
        const source = active.source,
          data = await window.BroadsheetLive.recipeOptions({ source });
        if (source !== active.source) return;
        api.genres = data.categories;
        options(
          fields.category,
          [
            ["All", "All recipe types"],
            ...data.categories.map((c) => [
              c,
              c.replace(/^Recipes (?:for |using )/, ""),
            ]),
          ],
          state.filter,
        );
        options(
          fields.cuisine,
          [["All", "All cultures"], ...data.cuisines.map((c) => [c, c])],
          active.cuisine,
        );
        options(
          fields.meal,
          [
            ["All", "Any meal"],
            ...(
              data.meals || [
                "Breakfast",
                "Lunch",
                "Dinner",
                "Snacks",
                "Dessert",
              ]
            ).map((c) => [c, c]),
          ],
          active.meal,
        );
        note.textContent =
          source === "cookbook"
            ? "Culture, course, and recipe-type filters use the cookbook’s native categories. Recipes are contributed by the community."
            : "Lunch, dinner, and snacks are editorial category groupings, not meal labels supplied by the recipe author.";
      };
    } else {
      const title = node(
        "p",
        "Your country determines cinema releases and streaming availability.",
      );
      title.className = "facet-intro";
      root.append(title);
      select("region", "Country", [[active.region, active.region]], () => {
        active.provider = "";
        fields.provider.value = "";
        void api.load().catch((e) => notify(e.message));
      });
      select("provider", "Streaming service", [["", "Any service"]], () => {
        if (active.provider) {
          active.mode = "streaming";
          active.availability = "flatrate";
          fields.availability.value = "flatrate";
        }
      });
      select(
        "availability",
        "How to watch",
        [
          ["all", "Any availability"],
          ["flatrate", "Included with subscription"],
          ["free", "Free"],
          ["ads", "Free with ads"],
          ["rent", "Rent"],
          ["buy", "Buy"],
        ],
        () => {
          if (active.availability !== "all") active.mode = "streaming";
        },
      );
      select(
        "year",
        "Release year",
        [
          ["", "Any year"],
          ...Array.from({ length: new Date().getFullYear() - 1873 }, (_, i) => {
            const y = String(new Date().getFullYear() - i);
            return [y, y];
          }),
        ],
        () => {
          if (active.year && active.mode === "now-playing")
            active.mode = "popular";
        },
      );
      select("order", "Discover order", [
        ["popularity.desc", "Popular"],
        ["vote_average.desc", "Highly rated · 100+ votes"],
        ["primary_release_date.desc", "Newest releases"],
        ["primary_release_date.asc", "Oldest releases"],
      ]);
      for (const [key, label] of [
        ["cast", "Actor"],
        ["company", "Studio"],
        ["keyword", "Interest"],
      ])
        lookup(key, label);
      const note = node(
        "small",
        "Watch availability via JustWatch / TMDB. Subscription, rental, and purchase offers are distinct. Availability may change.",
      );
      note.className = "facet-note";
      root.append(note);
      let optionsRevision = 0;
      api.load = async () => {
        const version = ++optionsRevision,
          region = active.region,
          data = await request(
            "api/movie-options?" + new URLSearchParams({ region }),
          );
        if (version !== optionsRevision) return;
        api.genres = data.genres;
        if (state.filter !== "All" && !data.genres.includes(state.filter)) {
          state.filter = "All";
          changed();
        }
        options(
          fields.region,
          data.regions.map((r) => [r.id, r.name]),
          active.region,
        );
        options(
          fields.provider,
          [
            ["", "Any service"],
            ...data.providers.map((p) => [String(p.id), p.name]),
          ],
          active.provider,
        );
        if (fields.provider.value !== active.provider) {
          active.provider = "";
          notify("That service is not listed for the selected country.");
          changed();
        }
      };
    }
    return api;
  }
  root.BroadsheetDiscoveryControls = { mount };
})(window);
