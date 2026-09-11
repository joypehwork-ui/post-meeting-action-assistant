// Local server for the Post-Meeting Action Assistant.
//
//   node serve.js            -> http://localhost:3000
//   node serve.js 8080       -> http://localhost:8080
//
// Two jobs:
//   1. serve the static files (ES modules will not load over file://)
//   2. hold the OpenCode key and proxy POST /api/llm
//
// The key stays here. It is never sent to the browser, never logged, and never
// echoed in a response. OpenCode Zen also sends no CORS headers, so the browser
// could not call it directly even if we wanted it to.
//
// No dependencies. Binds to localhost only.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.argv[2]) || 3000;
const ROOT = __dirname;                       // .env, config
const PUBLIC = path.join(__dirname, "public");   // everything served to the browser

const LLM_URL = "https://opencode.ai/zen/go/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-v4.1-flash";

// Models the UI may pick from. An allowlist, not a free-text field: the browser
// must never be able to name an arbitrary model and spend the key on it.
// All five verified working and billing at cost 0 on this endpoint.
// Keep in step with the same list in worker.js.
const MODELS = [
  { id: "deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
  { id: "qwen3.8-flash",       label: "Qwen 3.8 Flash" },
  { id: "glm-5.3-flash",       label: "GLM 5.3 Flash" },
  { id: "kimi-k2.6",           label: "Kimi K2.6" },
  { id: "minimax-m2.5",        label: "MiniMax M2.5" },
];
// deepseek-v4.1-flash is a reasoning model: it spends completion tokens on
// reasoning_content before writing any answer. Too low and `content` comes back
// empty with finish_reason "length".
//
// 4000 was not enough: a two-file transcript overflowed it on roughly one run
// in three, which surfaced to the user as "the model ran out of output tokens".
const MAX_TOKENS = 12000;
const UPSTREAM_TIMEOUT_MS = 60000;

/* ---------------- .env ---------------- */

function readEnv() {
  const file = path.join(ROOT, ".env");
  const env = {};
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return env;
  }
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const eq = s.indexOf("=");
    if (eq < 1) continue;
    // Values may be quoted and/or padded: LLM_MODEL= "deepseek-v4.1-flash"
    env[s.slice(0, eq).trim()] = s.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const ENV = readEnv();
const API_KEY = ENV.OPENCODE_API_KEY || "";
const MODEL = ENV.LLM_MODEL || DEFAULT_MODEL;

if (!API_KEY) {
  console.error("No OPENCODE_API_KEY in .env — the app cannot call the model.");
  console.error("Add this line to .env, then start again:");
  console.error("");
  console.error("  OPENCODE_API_KEY=sk-...");
  console.error("");
  process.exit(1);
}

/* ---------------- static files ---------------- */

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function serveStatic(rel, res) {
  // "/", "//" and any directory path all mean index.html.
  if (/(^\/*$)|\/$/.test(rel)) rel = "/index.html";

  const file = path.join(PUBLIC, path.normalize(rel).replace(/^[/\\]+/, ""));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  // The key lives in .env. Never hand it out, even though it is gitignored.
  if (path.basename(file).toLowerCase() === ".env") {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file).toLowerCase()] || "text/plain; charset=utf-8",
      "cache-control": "no-store",
    }).end(data);
  });
}

/* ---------------- /api/llm ---------------- */

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" })
     .end(JSON.stringify(body));
}

function readBody(req, limitBytes = 2_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Ask the model. Body: { messages: [{role, content}], json: boolean }
 * Replies: { text } or { error }.
 */
async function handleLlm(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    json(res, 400, { error: "Body must be JSON. " + e.message });
    return;
  }

  const messages = body && body.messages;
  if (!Array.isArray(messages) || !messages.length) {
    json(res, 400, { error: "messages must be a non-empty array." });
    return;
  }

  // Honour the UI's choice only if it is on the allowlist.
  const wanted = typeof body.model === "string" ? body.model : "";
  const model = MODELS.some((m) => m.id === wanted) ? wanted : MODEL;

  const payload = {
    model,
    messages,
    max_tokens: MAX_TOKENS,
    temperature: 0.2,
  };
  // Zen supports json_object. It rejects json_schema ("unavailable now"),
  // so the shape is enforced by validateTasks() on our side instead.
  if (body.json) payload.response_format = { type: "json_object" };

  let upstream, text;
  try {
    upstream = await fetch(LLM_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + API_KEY,
        "x-opencode-session": crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    text = await upstream.text();
  } catch (e) {
    console.error("upstream request failed:", e.message);
    json(res, 502, { error: "Could not reach the model: " + e.message });
    return;
  }

  if (!upstream.ok) {
    let msg = text.slice(0, 400);
    try { msg = JSON.parse(text).error.message; } catch {}
    console.error("upstream " + upstream.status + ": " + msg);
    json(res, upstream.status, { error: "Model returned " + upstream.status + ": " + msg });
    return;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    json(res, 502, { error: "Model returned a response that was not JSON." });
    return;
  }

  const choice = data.choices && data.choices[0];
  const content = choice && choice.message && choice.message.content;

  // A reasoning model that runs out of room returns empty content with
  // finish_reason "length". Say so plainly rather than showing a blank reply.
  if (!content) {
    const reason = (choice && choice.finish_reason) || "unknown";
    json(res, 502, {
      error: reason === "length"
        ? "The model ran out of output tokens before it answered. Try a shorter transcript."
        : "The model returned an empty reply (finish_reason: " + reason + ").",
    });
    return;
  }

  json(res, 200, { text: content, model, finish_reason: choice.finish_reason || null });
}

/* ---------------- server ---------------- */

http.createServer((req, res) => {
  const url = req.url.split("?")[0];

  if (url === "/api/models") {
    json(res, 200, { models: MODELS, default: MODEL });
    return;
  }

  if (url === "/api/llm") {
    if (req.method !== "POST") {
      json(res, 405, { error: "Use POST." });
      return;
    }
    handleLlm(req, res).catch((e) => {
      console.error("handler error:", e.message);
      json(res, 500, { error: "Server error." });
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    json(res, 405, { error: "Use GET." });
    return;
  }

  serveStatic(decodeURIComponent(url), res);
}).listen(PORT, "127.0.0.1", () => {
  console.log("Post-Meeting Action Assistant  ->  http://localhost:" + PORT);
  console.log("Model: " + MODEL + "  (key loaded from .env, stays on the server)");
  console.log("Ctrl+C to stop.");
});
