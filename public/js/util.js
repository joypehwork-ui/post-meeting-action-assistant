// Small helpers with no dependencies of their own.

export const $ = (id) => document.getElementById(id);

/** Escape a value for safe insertion into innerHTML. */
export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function uid() {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Today as YYYY-MM-DD in the user's own timezone, not UTC. */
export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/**
 * Turn a due date into a label, a CSS class and a sort rank.
 * Rank is "days from today", so ascending sort puts the most urgent first
 * and undated items last.
 */
export function dueInfo(due) {
  if (!due) return { label: "no date", cls: "none", rank: 9e9 };
  const today = new Date(todayISO() + "T00:00:00");
  const d = new Date(due + "T00:00:00");
  if (isNaN(d)) return { label: "no date", cls: "none", rank: 9e9 };

  const days = Math.round((d - today) / 86400000);
  if (days < 0)   return { label: days === -1 ? "overdue 1 day" : "overdue " + (-days) + " days", cls: "overdue", rank: days };
  if (days === 0) return { label: "today", cls: "today", rank: 0 };
  if (days === 1) return { label: "tomorrow", cls: "soon", rank: 1 };
  if (days <= 3)  return { label: "in " + days + " days", cls: "soon", rank: days };
  return { label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), cls: "later", rank: days };
}

export function showErr(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.hidden = false;
}

export function clearErr(id) {
  $(id).hidden = true;
}
