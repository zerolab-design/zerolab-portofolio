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
//  ART DIRECTION PER DEVICE
//
//  Cover and hero may carry alternatives — `coverMobile`, `hero.imageMobile`
//  and `hero.imageTablet` in the CMS. They are SEPARATE UPLOADS, not generated
//  sizes: this site is served as static files with no build step, so nothing
//  can produce derivatives. The point is a different CROP, not a smaller file.
//
//  The two images have different problems, so they switch on different rules.
//
//  COVER — width alone. Its box aspect is hard-coded (252/172.08 for the strip
//  and every scattered slot, 770/497 for the stage) and NEVER varies by device;
//  only its pixel size does, via --uh. So a phone cover is not a different
//  shape, it is the same 3:2 frame composed tighter, because at 440px wide the
//  strip draws it 77px across and fine detail is simply gone. Nothing to gain
//  from a tablet cover: same shape, and the desktop file already exceeds what a
//  tablet draws.
//
//  HERO — width AND orientation. Its box is 100vw x 110vh, so its shape follows
//  the viewport: 0.42 on a phone held upright, 0.65 on a portrait tablet, 1.55
//  on any landscape screen. Orientation matters more than width here — a phone
//  turned sideways has a WIDE box and wants the desktop crop, not the phone one
//  (a 0.42 image in a 1.62 box loses three quarters of its height). So every
//  landscape viewport takes the desktop hero regardless of size.
//
//  782px is the tablet breakpoint the layout uses. It leaves 768x1024 iPad
//  portrait inside the phone band, which is a known cost of matching the layout
//  line exactly rather than moving the image switch to 768.
//
//  Resolved ONCE, at load. Everything downstream — carousel, film strip,
//  scattered grid, the leaving panel, the hero URL stashed for project.html —
//  reads `image`/`hero` and needs no changes. Deliberately NOT re-resolved on
//  resize: crossing a breakpoint mid-session (a rotation) would re-point every
//  visible <img> at a file the browser has never fetched, flashing the whole
//  carousel through a reload to win a better crop on one gesture.
// ---------------------------------------------------------------------------
function zlMatch(q) {
  try {
    return !!(window.matchMedia && window.matchMedia(q).matches);
  } catch (e) {
    // No matchMedia — every test reads false, which lands on the desktop
    // image: the one crop that is always present.
    return false;
  }
}

var ZL_SMALL = zlMatch("(max-width: 781px)");
var ZL_PHONE_HERO = zlMatch("(max-width: 781px) and (orientation: portrait)");
var ZL_TABLET_HERO = zlMatch("(min-width: 782px) and (orientation: portrait)");

/**
 * Cover. The phone crop on a small screen, else the desktop one. Empty string
 * rather than undefined so callers can `||` past it.
 */
window.pickImage = function (mobile, desktop) {
  return (ZL_SMALL && mobile) || desktop || "";
};

/**
 * Hero. Falls back toward the NEAREST SHAPE rather than straight to desktop: a
 * portrait tablet with no tablet crop takes the phone one if it exists, because
 * 0.42 in a 0.65 box loses 35% of its height while 1.55 there loses 58% of its
 * width. Both are compromises; this is the smaller one.
 *
 * Exposed because project.html reads the hero straight out of the case study
 * file, not from the project list this file builds.
 */
window.pickHero = function (mobile, tablet, desktop) {
  if (ZL_PHONE_HERO && mobile) return mobile;
  if (ZL_TABLET_HERO) return tablet || mobile || desktop || "";
  return desktop || "";
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
              ? window.pickHero(data.hero.imageMobile, data.hero.imageTablet, data.hero.image)
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
