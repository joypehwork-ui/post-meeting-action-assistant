// Application state, its persistence, and the .env reader.
//
// `state` is exported as a live binding: other modules see reassignment from
// resetState() without re-importing.

import { STORE, DEFAULT_MODEL } from "./config.js";
import { dueInfo } from "./util.js";

const blank = () => ({
  apiKey: "",
  model: DEFAULT_MODEL,
  tasks: [],
  chat: [],
  showDone: false,
});

export let state = blank();

/**
 * Key read from .env. Deliberately kept outside `state` so it is never written
 * into localStorage — the file stays the single source of truth for it.
 */
export let envKey = "";
export const setEnvKey = (k) => { envKey = k; };

/** The key actually used for requests. A key typed into Settings wins. */
export const effectiveKey = () => state.apiKey || envKey;

/* ---------------- persistence ---------------- */

export function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state = Object.assign(blank(), parsed);
    if (!state.model) state.model = DEFAULT_MODEL;
    if (!Array.isArray(state.tasks)) state.tasks = [];
    if (!Array.isArray(state.chat)) state.chat = [];
  } catch (e) {
    // Private mode, blocked storage, or corrupt JSON: run from memory.
  }
}

export function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch (e) {
    // Quota or blocked storage. Nothing useful to do; the app still works.
  }
}

export function resetState() {
  state = blank();
  try { localStorage.removeItem(STORE); } catch (e) {}
}

/* ---------------- derived views ---------------- */

export const openTasks = () => state.tasks.filter((t) => t.status === "open");
export const sortByDue = (a, b) => dueInfo(a.due).rank - dueInfo(b.due).rank;

/* ---------------- .env ---------------- */

/**
 * Read ./.env if the page is served over http(s).
 *
 * Opened straight off disk (file://) the browser blocks this fetch. That is
 * expected and not an error — the Settings panel is the fallback.
 */
export async function readEnvFile() {
  try {
    const res = await fetch("./.env", { cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.text();
    if (/^\s*</.test(body)) return null;   // an HTML 404 page, not a .env

    const env = {};
    for (const line of body.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s[0] === "#") continue;
      const eq = s.indexOf("=");
      if (eq < 1) continue;
      env[s.slice(0, eq).trim()] = s.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
    return env;
  } catch (e) {
    return null;
  }
}
