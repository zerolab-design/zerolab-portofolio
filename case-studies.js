// ============================================================================
//  CASE STUDY LOADER
//
//  Content is NOT in this file. Each project's case study lives as its own JSON
//  file in /content, named after the `slug` in config.js:
//
//      content/krool.json   content/finova.json   content/serein.json   ...
//
//  Those JSON files are the CMS's editing surface — one entry per project. This
//  file only fetches them, so nothing here needs touching when content changes.
//
//  ---------------------------------------------------------------------------
//  SHAPE OF A CONTENT FILE
//  ---------------------------------------------------------------------------
//  {
//    "hero": {
//      "meta":  [ { "label": "Service", "values": ["Interface design", ...] } ],
//      "intro": "One line under the title",
//      "image": "portfolio/krool/hero.png"
//    },
//    "contact": { "background": "portfolio/krool/hero.png" },
//    "sections": [ ... ]
//  }
//
//  The project's NAME, subtitle, year, role, cover and slug come from config.js,
//  not from here. `contact.background` falls back to the hero image, then to the
//  project cover.
//
//  Each section is the same block with these knobs:
//
//    label    small chip labelling the section ("About Project", "Features / 01")
//    align    "left"    heading + body stacked in the content column
//             "justify" full-width justified statement, usually no body
//    head     "row"     (default) chip in its own column, beside the heading
//             "stack"   chip directly above the heading, on the same left edge
//    theme    "light" | "dark"
//    body     array of paragraphs; omit for statement sections
//    media    0..n images — the COUNT drives the layout:
//               1 image  -> full width
//               2 images -> pair
//               3 images -> collage
//    mediaLayout
//             "even"    (default) images cropped to a shared height / letterbox
//             "stagger" uneven, natural aspect, nothing cropped:
//                         2 images -> wide one low, narrow one high (wide FIRST)
//                         3 images -> two on top at unequal widths with the
//                                     right one dropped, third centred beneath
//             "cascade" 3 images in ONE row at descending widths (56/30/11),
//                       the last one dropped. Order widest -> narrowest.
//
//  The "Read More Our Case Studies" CTA and the "Drop Us A Message" form are
//  template markup in project.html — their LAYOUT is identical on every page.
//  Related projects are derived from config.js order.
//
//  Krool copy and type values transcribed from Figma:
//  file vJ9AJqXYurCDzLZRDisQKc, frame "Krool Detail Page" (5330:2076).
//
//  NOTE: this uses fetch(), so the site must be served over http://, not opened
//  as a file://. The bundled dev server (node .claude/server.js) is enough.
// ============================================================================
window.CaseStudies = {
  /**
   * Fetch one project's case study.
   * Resolves to the parsed object, or null when the project has no content
   * file yet — project.html falls back to a short page built from config.js.
   */
  load: function (slug) {
    if (!slug) return Promise.resolve(null);
    return fetch("content/" + encodeURIComponent(slug) + ".json")
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .catch(function () {
        // Missing file, offline, or malformed JSON — render the fallback page
        // rather than failing outright.
        return null;
      });
  },
};
