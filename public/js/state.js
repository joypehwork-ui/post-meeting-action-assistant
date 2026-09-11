// Application state and its persistence.
//
// `state` is exported as a live binding: other modules see reassignment from
// resetState() without re-importing.
//
// There is no API key here. The key lives in .env and never leaves serve.js.

import { STORE } from "./config.js";
import { dueInfo } from "./util.js";

const blank = () => ({
  model: "",        // "" = whatever the server defaults to
  tasks: [],
  chat: [],
  showDone: false,
});

export let state = blank();

/* ---------------- persistence ---------------- */

export function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return;
    state = Object.assign(blank(), JSON.parse(raw));
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
