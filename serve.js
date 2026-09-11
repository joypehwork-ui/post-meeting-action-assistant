// Minimal static server, so the page can read .env (browsers block that on file://).
//   node serve.js            -> http://localhost:3000
//   node serve.js 8080       -> http://localhost:8080
// No dependencies. Binds to localhost only, so nothing outside this machine can reach it.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.argv[2]) || 3000;
const ROOT = __dirname;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  // "/", "//" and any directory path all mean index.html.
  if (/(^\/*$)|\/$/.test(rel)) rel = "/index.html";

  // Keep the request inside this folder.
  const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ""));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      return;
    }
    const type = TYPES[path.extname(file).toLowerCase()] || "text/plain; charset=utf-8";
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(data);
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log("Post-Meeting Action Assistant running at http://localhost:" + PORT);
  console.log("Serving " + ROOT);
  console.log("Ctrl+C to stop.");
});
