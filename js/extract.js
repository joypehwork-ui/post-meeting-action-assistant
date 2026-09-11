// Turning pasted or uploaded text into action items.

import { gemini, TASK_SCHEMA } from "./gemini.js";
import { state, save } from "./state.js";
import { $, uid, todayISO, showErr, clearErr } from "./util.js";
import { render } from "./render.js";
import { resetFiles } from "./files.js";

export function extractPrompt(text) {
  const weekday = new Date().toLocaleDateString(undefined, { weekday: "long" });
  return [
    "You extract action items from meeting transcripts and rough notes.",
    "",
    "Today is " + todayISO() + " (" + weekday + "). Resolve relative deadlines like \"Friday\",",
    "\"next week\" or \"end of month\" against that date.",
    "",
    "For every commitment, task or follow-up in the text, return an object with:",
    "- title: the action, as a short imperative phrase (max 12 words).",
    "- owner: who is responsible. Use the person's name as written. If the note-taker is",
    "  responsible (\"I\", \"me\", \"my\"), use \"Me\".",
    "- due: an absolute date as YYYY-MM-DD. Use \"\" if the text gives no deadline and none",
    "  can reasonably be inferred.",
    "- dueText: the words the deadline came from, e.g. \"by Thursday\". Use \"\" if there was none.",
    "- context: one or two sentences quoted or closely paraphrased from the source text,",
    "  showing why this task exists.",
    "",
    "Rules: only include real commitments — skip discussion, opinions and background.",
    "Do not invent tasks. Do not invent deadlines that are not stated or clearly implied.",
    "If there are no action items, return an empty array.",
    "",
    "TEXT:",
    "\"\"\"",
    text,
    "\"\"\"",
  ].join("\n");
}

/** Normalise one model-produced item into a task we store. */
function toTask(raw) {
  return {
    id: uid(),
    title: (raw.title || "Untitled task").trim(),
    owner: (raw.owner || "Unassigned").trim(),
    due: /^\d{4}-\d{2}-\d{2}$/.test(raw.due || "") ? raw.due : "",
    dueText: (raw.dueText || "").trim(),
    context: (raw.context || "").trim(),
    status: "open",
    created: Date.now(),
  };
}

export async function doExtract() {
  const text = $("input").value.trim();
  clearErr("exerr");

  if (!text) {
    showErr("exerr", "Paste a transcript, or upload some notes first.");
    return;
  }

  const button = $("extract");
  button.disabled = true;
  $("exstatus").innerHTML = '<span class="spin"></span>Extracting…';
  const started = Date.now();

  try {
    const out = await gemini(extractPrompt(text), TASK_SCHEMA);
    const added = (Array.isArray(out.tasks) ? out.tasks : []).map(toTask);

    state.tasks = added.concat(state.tasks);
    save();
    render();

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    $("exstatus").textContent = added.length
      ? added.length + (added.length === 1 ? " item" : " items") + " found in " + secs + "s"
      : "No action items found in that text.";

    if (added.length) {
      $("input").value = "";
      resetFiles();
    }
  } catch (e) {
    $("exstatus").textContent = "";
    showErr("exerr", e.message);
  } finally {
    button.disabled = false;
  }
}
