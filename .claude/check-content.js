// Checks the content files are wired together correctly.
// Run after editing in the CMS:   node .claude/check-content.js
//
// Structure:
//   content/projects.json   { "order": ["serein", ...] }  — running order only
//   content/<slug>.json     one file per project: identity + case study
//
// The filename IS the slug. project.html reads the slug from the URL hash and
// fetches content/<slug>.json, so a name in `order` with no matching file (or a
// file nothing points at) means a broken or unreachable page.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONTENT = path.join(ROOT, "content");

var problems = [];
var index;

try {
  index = JSON.parse(fs.readFileSync(path.join(CONTENT, "projects.json"), "utf8"));
} catch (e) {
  console.error("\ncontent/projects.json is not valid JSON:\n  " + e.message);
  process.exit(1);
}

var order = (index && index.order) || [];
if (!Array.isArray(order) || !order.length) {
  problems.push('projects.json has no "order" array — the home page will be empty');
}

var files = fs
  .readdirSync(CONTENT)
  .filter(function (f) { return f.endsWith(".json") && f !== "projects.json"; })
  .map(function (f) { return f.replace(/\.json$/, ""); });

// Every slug in the order must have a file, and that file must be usable.
order.forEach(function (slug) {
  if (files.indexOf(slug) === -1) {
    problems.push('order lists "' + slug + '" but content/' + slug + ".json does not exist");
    return;
  }
  var data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(CONTENT, slug + ".json"), "utf8"));
  } catch (e) {
    problems.push("content/" + slug + ".json is not valid JSON: " + e.message);
    return;
  }
  if (!data.name) problems.push(slug + ": no name — the carousel and page title will be blank");
  if (!data.cover) problems.push(slug + ": no cover image — the carousel will show a gap");
  if (!Array.isArray(data.sections) || !data.sections.length) {
    problems.push(slug + ": no sections — the detail page will render just a hero");
  }
  if (!data.hero || !data.hero.image) {
    problems.push(slug + ": no hero.image — the hero will fall back to a flat colour");
  }
});

// Duplicates in the order would render the same project twice.
var seen = {};
order.forEach(function (s) {
  if (seen[s]) problems.push('"' + s + '" appears more than once in the order');
  seen[s] = true;
});

// Files nothing points at are invisible — content written but never shown.
files.forEach(function (f) {
  if (order.indexOf(f) === -1) {
    problems.push("content/" + f + ".json exists but is not in the order — it will never be shown");
  }
});

if (problems.length) {
  console.error("\n" + problems.length + " problem(s):\n");
  problems.forEach(function (p) { console.error("  - " + p); });
  process.exit(1);
}

console.log("OK — " + order.length + " projects, all wired correctly.");
