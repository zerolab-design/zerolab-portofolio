// ============================================================================
//  PROJECT LOADER
//
//  There is ONE file per project: content/<slug>.json. It holds both the
//  project's identity (name, subtitle, year, role, cover) and its case study
//  (hero, contact, sections). Editing a project in the CMS means editing one
//  file — the home page and its detail page can never disagree.
//
//  content/projects.json is just the running order:
//      { "order": ["serein", "findmentor", ...] }
//  A static site cannot list a directory, so this is how the home page knows
//  which projects exist and in what sequence.
//
//  This file fetches the order, then fetches each project file, and assembles
//  window.PROJECTS in the shape app.js has always expected:
//      { name, subtitle, image, thumb, slug, year, role, href }
//  so nothing downstream needed changing.
//
//  Anything that needs the list must wait for window.PROJECTS_READY:
//
//      window.PROJECTS_READY.then(function (projects) { ... });
//
//  NOTE: uses fetch(), so the site must be served over http://, not file://.
// ============================================================================
window.PROJECTS = [];

// ---------------------------------------------------------------------------
//  MOBILE ART DIRECTION
//
//  Cover and hero may each carry a phone alternative — `coverMobile` and
//  `hero.imageMobile` in the CMS. They are SEPARATE UPLOADS, not generated
//  sizes: this site is served as static files with no build step, so nothing
//  can produce derivatives. The point is a different CROP, not a smaller file —
//  a 1440-wide hero loses its subject on a 390px screen.
//
//  600px is the site's phone breakpoint everywhere else (style.css, and
//  nav.js's mirrored min-width: 601px), so the image swaps on exactly the same
//  line the layout does.
//
//  Resolved ONCE, at load. Everything downstream — carousel, film strip,
//  scattered grid, the leaving panel, the hero URL stashed for project.html —
//  reads `image`/`hero` and needs no changes. Deliberately NOT re-resolved on
//  resize: crossing the breakpoint mid-session (a rotation) would re-point
//  every visible <img> at a file the browser has never fetched, flashing the
//  whole carousel through a reload to win a better crop on one gesture.
// ---------------------------------------------------------------------------
var ZL_NARROW = (function () {
  try {
    return !!(window.matchMedia && window.matchMedia("(max-width: 600px)").matches);
  } catch (e) {
    // No matchMedia — assume desktop, which is the crop that always exists.
    return false;
  }
})();

/**
 * The phone variant when there is one and we are on a phone, else the desktop
 * image. Empty string rather than undefined so callers can `||` past it.
 * Exposed because project.html reads hero.imageMobile straight out of the case
 * study file, not from the project list this file builds.
 */
window.pickImage = function (mobile, desktop) {
  return (ZL_NARROW && mobile) || desktop || "";
};

// `cache: "no-cache"` revalidates with the server on every load instead of
// trusting a cached copy. Without it the browser can keep serving yesterday's
// JSON after a CMS edit has already deployed — the content looks stale even
// though the site is up to date. It still gets a fast 304 when nothing changed.
window.PROJECTS_READY = fetch("content/projects.json", { cache: "no-cache" })
  .then(function (res) {
    if (!res.ok) throw new Error("projects.json: HTTP " + res.status);
    return res.json();
  })
  .then(function (index) {
    var order = (index && index.order) || [];
    // Fetch every project file at once rather than in sequence.
    return Promise.all(
      order.map(function (slug) {
        return fetch("content/" + encodeURIComponent(slug) + ".json", { cache: "no-cache" })
          .then(function (res) {
            return res.ok ? res.json() : null;
          })
          .then(function (data) {
            if (!data) {
              console.warn("[ZeroLab] missing content/" + slug + ".json — skipped");
              return null;
            }
            // Resolved before the map so the cover is picked once and every
            // fallback below lands on the SAME variant — a hero falling back to
            // a desktop cover on a phone would undo the whole point.
            var cover = window.pickImage(data.coverMobile, data.cover);
            var heroImage = data.hero
              ? window.pickImage(data.hero.imageMobile, data.hero.image)
              : "";
            return {
              name: data.name || slug,
              subtitle: data.subtitle || "",
              image: cover,
              // No phone variant of its own: the thumb is already small, and it
              // inherits the phone cover through this fallback when unset.
              thumb: data.thumb || cover,
              slug: slug,
              year: data.year || "",
              role: data.role || "",
              // The case page's hero, carried through so the leaving panel can
              // show the page you are going to instead of a blank rectangle.
              // Free — this JSON is already being fetched.
              hero: heroImage || cover,
              // The rest of the hero, so the leaving panel can show the whole
              // block rather than only the title — otherwise the title arrives
              // during the page's travel and everything else arrives after it.
              heroMeta: (data.hero && data.hero.meta) || [],
              heroIntro: (data.hero && data.hero.intro) || "",
              // Derived, never authored — so it can never drift from the slug.
              href: "project.html#" + slug,
            };
          })
          .catch(function () {
            console.warn("[ZeroLab] could not load content/" + slug + ".json");
            return null;
          });
      })
    );
  })
  .then(function (list) {
    window.PROJECTS = list.filter(Boolean);
    return window.PROJECTS;
  })
  .catch(function (err) {
    // Leave PROJECTS empty and let the page render its empty state — a blank
    // carousel with a console error is easier to diagnose than a half-built one.
    console.error("[ZeroLab] could not load projects:", err);
    return window.PROJECTS;
  });
