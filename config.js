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

window.PROJECTS_READY = fetch("content/projects.json")
  .then(function (res) {
    if (!res.ok) throw new Error("projects.json: HTTP " + res.status);
    return res.json();
  })
  .then(function (index) {
    var order = (index && index.order) || [];
    // Fetch every project file at once rather than in sequence.
    return Promise.all(
      order.map(function (slug) {
        return fetch("content/" + encodeURIComponent(slug) + ".json")
          .then(function (res) {
            return res.ok ? res.json() : null;
          })
          .then(function (data) {
            if (!data) {
              console.warn("[ZeroLab] missing content/" + slug + ".json — skipped");
              return null;
            }
            return {
              name: data.name || slug,
              subtitle: data.subtitle || "",
              image: data.cover || "",
              thumb: data.thumb || data.cover || "",
              slug: slug,
              year: data.year || "",
              role: data.role || "",
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
