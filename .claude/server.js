// Minimal static dev server for the ZeroLab portfolio (no dependencies).
// Started via .claude/launch.json → node .claude/server.js
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
// Honour the port assigned by the launcher; fall back to 8000 when run by hand.
const PORT = Number(process.env.PORT) || 8000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    let filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end("Not found");
      }
      // Source revalidates every time so edits show up immediately. Media does
      // NOT: no-store forced the hero image to be re-downloaded on every
      // navigation, even though the leaving panel had just displayed it, which
      // made the transition seam far worse locally than it is in production.
      var ext = path.extname(filePath).toLowerCase();
      var isMedia = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".woff2"].indexOf(ext) >= 0;
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": isMedia ? "public, max-age=3600" : "no-store",
      });
      res.end(data);
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`ZeroLab portfolio dev server running at http://127.0.0.1:${PORT}/`);
  });
