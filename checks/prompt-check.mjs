// Check a prompt change before you trust it.
//
//   node checks/prompt-check.mjs                      every fixture, once
//   node checks/prompt-check.mjs --repeat=5           each fixture five times
//   node checks/prompt-check.mjs --fixture=dated      just one
//   node checks/prompt-check.mjs --save-baseline      record the current result
//   node checks/prompt-check.mjs --port=3300          non-default server port
//
// Imports the app's own modules, so the thing under test is the prompt the app
// actually sends - not a copy that drifts.
//
// Needs `node serve.js` running: the key lives there, not here.
//
// WHY --repeat EXISTS: the model is not deterministic. The `dated` fixture
// failed on one run and passed on the very next, same prompt, same input. One
// green run is not evidence. Anything about deadlines or counts needs repeats.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASELINE = path.join(ROOT, "checks", "baseline.json");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const SAVE = args.includes("--save-baseline");
const PORT = Number(flag("port", 3000));
const ONLY = flag("fixture", "");
const REPEAT = Math.max(1, Number(flag("repeat", 1)));

// pathToFileURL, not string concatenation: the path contains spaces and
// Windows backslashes, and hand-rolled escaping has broken here before.
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const { extractPrompt } = await load("js/extract.js");
const { assistantPrompt } = await load("js/assistant.js");
const { validateTasks, TASK_FIELDS } = await load("js/llm.js");
const { FIXTURES } = await load("checks/fixtures.mjs");

let failures = 0;
const pass = (m) => console.log("  PASS  " + m);
const fail = (m) => { console.log("  FAIL  " + m); failures++; };
const info = (m) => console.log("        " + m);

/* ---------------- static checks: free, no server ---------------- */

console.log("\nSTATIC");
{
  const p = extractPrompt("placeholder text");
  if (/undefined|\[object Object\]|NaN/.test(p)) fail("extract prompt renders a broken value");
  else pass("extract prompt renders cleanly");

  // The provider will not enforce a schema, so the prompt has to carry it.
  const missing = TASK_FIELDS.filter((f) => !p.includes('"' + f + '"'));
  if (missing.length) fail("prompt does not name: " + missing.join(", "));
  else pass("prompt names all " + TASK_FIELDS.length + " fields validateTasks() requires");

  if (/only the JSON|no commentary/i.test(p)) pass("prompt forbids commentary around the JSON");
  else fail("prompt does not tell the model to return only JSON");

  const a = assistantPrompt("test question", [
    { title: "T", owner: "Me", due: "2026-01-01", dueText: "soon", context: "c" },
  ]);
  if (/undefined|\[object Object\]/.test(a)) fail("assistant prompt renders a broken value");
  else pass("assistant prompt renders cleanly");
}

/* ---------------- helpers ---------------- */

async function askServer(prompt) {
  const res = await fetch("http://127.0.0.1:" + PORT + "/api/llm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: prompt }], json: true }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "HTTP " + res.status);
  return body;
}

function parseObject(text) {
  const t = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  const start = t.indexOf("{"), end = t.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(t.slice(start, end + 1));
}

const words = (s) => String(s).toLowerCase().match(/[a-z][a-z'-]{3,}/g) || [];
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Fraction of a context's content words that also appear in the source. */
function grounding(context, source) {
  const w = words(context);
  if (!w.length) return 0;
  const hay = new Set(words(source));
  return w.filter((x) => hay.has(x)).length / w.length;
}

/** One attempt at one fixture. Returns { problems: [...], tasks }. */
async function attempt(fx) {
  const problems = [];
  const reply = await askServer(extractPrompt(fx.text));

  if (reply.finish_reason === "length") {
    problems.push("finish_reason 'length' - ran out of tokens mid-answer");
  }

  let parsed;
  try {
    parsed = parseObject(reply.text);
  } catch (e) {
    return { problems: problems.concat("reply was not JSON: " + e.message), tasks: [] };
  }

  const { tasks, problems: shape } = validateTasks(parsed);
  shape.slice(0, 3).forEach((p) => problems.push("shape: " + p));

  const { minTasks, maxTasks } = fx.expect;
  if (tasks.length < minTasks || tasks.length > maxTasks) {
    problems.push("task count " + tasks.length + " outside " + minTasks + "-" + maxTasks);
  }

  // The machine-checkable form of "do not invent tasks".
  for (const t of tasks) {
    const g = grounding(t.context, fx.text);
    if (g < 0.6) problems.push("ungrounded context (" + Math.round(g * 100) + "%): " + t.title);
  }

  const seen = new Set();
  for (const t of tasks) {
    const k = norm(t.title);
    if (seen.has(k)) problems.push("duplicate title: " + t.title);
    seen.add(k);
  }

  if (fx.expect.dueBefore) {
    for (const t of tasks) {
      if (t.due && t.due >= fx.expect.dueBefore) {
        problems.push("late deadline " + t.due + ' for "' + t.dueText + '" - ' + t.title);
      }
    }
  }

  return { problems, tasks };
}

/* ---------------- run ---------------- */

const results = {};

for (const [name, fx] of Object.entries(FIXTURES)) {
  if (ONLY && name !== ONLY) continue;
  console.log("\nFIXTURE: " + name + "  (" + fx.note + ")" + (REPEAT > 1 ? "  x" + REPEAT : ""));

  let clean = 0;
  const allProblems = [];
  let last = null;

  for (let run = 1; run <= REPEAT; run++) {
    let r;
    try {
      r = await attempt(fx);
    } catch (e) {
      allProblems.push("request failed: " + e.message);
      if (/ECONNREFUSED|fetch failed/i.test(e.message)) info("Is `node serve.js " + PORT + "` running?");
      continue;
    }
    last = r;
    if (r.problems.length === 0) clean++;
    else allProblems.push(...r.problems.map((p) => (REPEAT > 1 ? "run " + run + ": " : "") + p));
  }

  if (clean === REPEAT) {
    pass(REPEAT > 1 ? "clean on all " + REPEAT + " runs" : "all checks clean");
  } else {
    fail(clean + "/" + REPEAT + " runs clean");
    [...new Set(allProblems)].slice(0, 8).forEach(info);
  }

  if (last) {
    results[name] = last.tasks.map((t) => ({ title: t.title, owner: t.owner, due: t.due, dueText: t.dueText }));
  }
}

/* ---------------- baseline ---------------- */

if (SAVE) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(results, null, 2) + "\n");
  console.log("\nBaseline written to checks/baseline.json");
  console.log("Note: the model varies between runs, so a baseline is indicative, not a contract.");
} else if (fs.existsSync(BASELINE)) {
  console.log("\nDIFF vs baseline");
  const before = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  for (const name of Object.keys(results)) {
    const was = before[name];
    if (!was) { info(name + ": no baseline yet"); continue; }
    const a = new Set(was.map((t) => norm(t.title)));
    const b = new Set(results[name].map((t) => norm(t.title)));
    const added = [...b].filter((x) => !a.has(x));
    const gone = [...a].filter((x) => !b.has(x));
    // Dates move as today moves, so compare counts and titles, not raw text.
    console.log("  " + name + ": " + was.length + " -> " + results[name].length +
      " tasks, +" + added.length + " / -" + gone.length);
    added.slice(0, 3).forEach((t) => info("  + " + t));
    gone.slice(0, 3).forEach((t) => info("  - " + t));
  }
} else {
  console.log("\nNo baseline yet. Run with --save-baseline to record one.");
}

console.log("\n" + (failures ? failures + " CHECK(S) FAILED" : "All checks passed"));
process.exit(failures ? 1 : 0);
