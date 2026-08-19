// ============================================================================
//  PROJECT LOADER
//
//  The project list is NOT in this file any more — it lives as data in
//  content/projects.json so the CMS can edit it. This file only fetches it.
//
//  Each entry:
//    name     : project name (the big title on the case study page)
//    subtitle : short description under the name
//    image    : full-resolution cover in /portfolio
//    thumb    : small version for the film strip (falls back to `image`)
//    slug     : short id used for the URL and to find the case study file,
//               content/<slug>.json — CHANGING A SLUG BREAKS THAT LINK
//    year     : project year        — shown on hover on the home page
//    role     : role / scope        — shown on hover on the home page
//    href     : where clicking the project goes. Empty ("") disables the click.
//
//  Anything that needs the list must wait for window.PROJECTS_READY:
//
//      window.PROJECTS_READY.then(function (projects) { ... });
//
//  window.PROJECTS is populated when that promise resolves, and is an empty
//  array before then.
//
//  NOTE: this uses fetch(), so the site must be served over http://, not opened
//  as a file://. The bundled dev server (node .claude/server.js) is enough.
// ============================================================================
window.PROJECTS = [];

window.PROJECTS_READY = fetch("content/projects.json")
  .then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  })
  .then(function (list) {
    window.PROJECTS = Array.isArray(list) ? list : [];
    return window.PROJECTS;
  })
  .catch(function (err) {
    // Leave PROJECTS empty and let the page render its empty state rather than
    // failing silently — a blank carousel with a console error is easier to
    // diagnose than a half-built one.
    console.error("[ZeroLab] could not load content/projects.json:", err);
    return window.PROJECTS;
  });
