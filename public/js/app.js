// Entry point: wires the DOM to the feature modules, then boots.

import { state, save, load, resetState } from "./state.js";
import { $, clearErr } from "./util.js";
import { render, renderTasks, renderEdit } from "./render.js";
import { addFiles, forgetFile, resetFiles } from "./files.js";
import { doExtract } from "./extract.js";
import { doAsk } from "./assistant.js";
import { getModels } from "./llm.js";
import { SAMPLE } from "./sample.js";

/* ---------------- model picker ---------------- */

// The list comes from the server, which only accepts models on its allowlist.
// If it cannot be reached the picker stays hidden and the server default is used.
async function initModelPicker() {
  const sel = $("modelsel");
  try {
    const { models, default: fallback } = await getModels();
    if (!Array.isArray(models) || !models.length) { sel.hidden = true; return; }

    const known = models.some((m) => m.id === state.model);
    if (!known) state.model = fallback || models[0].id;

    sel.innerHTML = models
      .map((m) => '<option value="' + m.id + '">' + m.label + "</option>")
      .join("");
    sel.value = state.model;

    sel.onchange = () => {
      state.model = sel.value;
      save();
    };
  } catch (e) {
    sel.hidden = true;   // no picker rather than a broken one
  }
}

/* ---------------- ingestion ---------------- */

$("extract").onclick = doExtract;
$("sample").onclick  = () => { $("input").value = SAMPLE; };

$("upload").onclick   = () => $("filein").click();
$("filein").onchange  = (e) => { addFiles(e.target.files); e.target.value = ""; };

$("files").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-i]");
  if (b) forgetFile(Number(b.dataset.i));
});

(function dragAndDrop() {
  const zone = $("drop");
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf("Files") !== -1;

  zone.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth++; zone.classList.add("over");
  });
  zone.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "copy";
  });
  zone.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (!depth) zone.classList.remove("over");
  });
  zone.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; zone.classList.remove("over");
    addFiles(e.dataTransfer.files);
  });

  // Without these, a file dropped outside the zone navigates the page away.
  window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("drop",     (e) => { if (hasFiles(e)) e.preventDefault(); });
})();

/* ---------------- task list ---------------- */

$("showdone").onclick = () => { state.showDone = !state.showDone; save(); renderTasks(); };

$("tasklist").addEventListener("click", (e) => {
  const control = e.target.closest("[data-act]");
  if (!control) return;
  const li = e.target.closest("li.task");
  if (!li) return;
  const task = state.tasks.find((t) => t.id === li.dataset.id);
  if (!task) return;

  switch (control.dataset.act) {
    case "toggle":
      task.status = control.checked ? "done" : "open";
      save(); render();
      break;
    case "edit":
      renderEdit(li, task);
      break;
    case "dismiss":
      task.status = "dismissed";
      save(); render();
      break;
    case "cancel":
      render();
      break;
    case "save": {
      const field = (name) => {
        const el = li.querySelector('[data-f="' + name + '"]');
        return el ? el.value.trim() : "";
      };
      task.title = field("title") || task.title;
      task.owner = field("owner") || "Unassigned";
      task.due = field("due");
      task.context = field("context");
      save(); render();
      break;
    }
  }
});

/* ---------------- assistant ---------------- */

$("askform").onsubmit = (e) => {
  e.preventDefault();
  const q = $("ask").value.trim();
  if (!q) return;
  $("ask").value = "";
  doAsk(q);
};

$("sugg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-q]");
  if (b) doAsk(b.dataset.q);
});

/* ---------------- clear ---------------- */

$("clearall").onclick = () => {
  const ok = confirm("Delete all tasks and chat history from this browser? This cannot be undone.");
  if (!ok) return;

  resetState();
  resetFiles();
  $("input").value = "";
  $("exstatus").textContent = "";
  clearErr("exerr");
  clearErr("chaterr");
  render();
};

/* ---------------- boot ---------------- */

load();
render();
initModelPicker();
