// All DOM writing lives here. Nothing in this module fetches or mutates state.

import { state, openTasks, sortByDue } from "./state.js";
import { $, esc, dueInfo } from "./util.js";

export function render() {
  renderTasks();
  renderSoon();
  renderChat();
}

export function renderTasks() {
  const open = state.tasks.filter((t) => t.status === "open").sort(sortByDue);
  const done = state.tasks.filter((t) => t.status === "done").sort(sortByDue);
  const shown = state.showDone ? open.concat(done) : open;

  $("taskempty").hidden = state.tasks.some((t) => t.status !== "dismissed");
  $("taskcount").textContent = open.length ? "· " + open.length + " open" : "";

  const toggle = $("showdone");
  toggle.hidden = done.length === 0;
  toggle.textContent = state.showDone
    ? "Hide " + done.length + " completed"
    : "Show " + done.length + " completed";

  $("tasklist").innerHTML = shown.map(taskRow).join("");
}

function taskRow(t) {
  const di = dueInfo(t.due);
  const dueLabel = t.due ? di.label : (t.dueText || "no date");
  return '<li class="task ' + (t.status === "done" ? "done" : "") + '" data-id="' + t.id + '">' +
    '<input class="cbx" type="checkbox" data-act="toggle" ' + (t.status === "done" ? "checked" : "") + ' aria-label="Mark complete">' +
    '<div class="tbody">' +
      '<div class="row" style="align-items:flex-start">' +
        '<div class="title grow">' + esc(t.title) + '</div>' +
        '<div class="acts">' +
          '<button class="sm link" data-act="edit">Edit</button>' +
          '<button class="sm link" data-act="dismiss">Dismiss</button>' +
        '</div>' +
      '</div>' +
      '<div class="meta">' +
        '<span class="chip owner">' + esc(t.owner) + '</span>' +
        '<span class="chip ' + di.cls + '">' + esc(dueLabel) + '</span>' +
        (t.due && t.dueText ? '<span class="chip">' + esc(t.dueText) + '</span>' : "") +
      '</div>' +
      (t.context ? '<blockquote class="ctx">' + esc(t.context) + '</blockquote>' : "") +
    '</div>' +
  '</li>';
}

/** Swap one row into its edit form. */
export function renderEdit(li, t) {
  const body = li.querySelector(".tbody");
  body.innerHTML =
    '<div class="editform">' +
      '<div><label>Task</label><input data-f="title" value="' + esc(t.title) + '"></div>' +
      '<div class="editrow">' +
        '<div><label>Owner</label><input data-f="owner" value="' + esc(t.owner) + '"></div>' +
        '<div><label>Due date</label><input data-f="due" type="date" value="' + esc(t.due) + '"></div>' +
      '</div>' +
      '<div><label>Context</label><textarea data-f="context" rows="2">' + esc(t.context) + '</textarea></div>' +
      '<div class="row">' +
        '<button class="primary sm" data-act="save">Save</button>' +
        '<button class="sm" data-act="cancel">Cancel</button>' +
      '</div>' +
    '</div>';
  const first = body.querySelector('[data-f="title"]');
  if (first) first.focus();
}

export function renderSoon() {
  const open = openTasks().sort(sortByDue);
  $("soonempty").hidden = open.length > 0;
  $("soonlist").innerHTML = open.map((t) => {
    const di = dueInfo(t.due);
    return '<li><span class="rank"></span>' +
      '<span class="st">' + esc(t.title) + '<br><span class="muted">' + esc(t.owner) + '</span></span>' +
      '<span class="sd chip ' + di.cls + '">' + esc(di.label) + '</span></li>';
  }).join("");
}

export function renderChat() {
  const thread = $("thread");
  const turns = state.chat.map((c) =>
    '<div class="turn"><div class="q">' + esc(c.q) + '</div><div class="a">' + esc(c.a) + '</div></div>'
  ).join("");

  thread.innerHTML =
    '<div class="empty"' + (state.chat.length ? " hidden" : "") + '>Ask anything about your open items.</div>' + turns;
  thread.scrollTop = thread.scrollHeight;
}
