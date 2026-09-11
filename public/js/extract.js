// Turning pasted or uploaded text into action items.

import { ask, validateTasks } from "./llm.js";
import { state, save } from "./state.js";
import { $, uid, todayISO, showErr, clearErr } from "./util.js";
import { render } from "./render.js";
import { resetFiles } from "./files.js";

/**
 * Build the extraction prompt.
 *
 * The shape is spelled out in full because the provider will not enforce a
 * schema for us — see the note on validateTasks() in llm.js. Any field added
 * here must be added there in the same edit.
 */
export function extractPrompt(text) {
  const weekday = new Date().toLocaleDateString(undefined, { weekday: "long" });
  return [
    "You extract action items from meeting transcripts and rough notes.",
    "",
    "Today is " + todayISO() + " (" + weekday + ").",
    "",
    "Before anything else, work out the date of the meeting. Look for a date in the text",
    "itself: a header, a dateline, a filename, or a date someone says out loud. Resolve",
    "every relative deadline — \"tomorrow\", \"Thursday\", \"next week\", \"end of month\" —",
    "against the MEETING date. Fall back to today only when the text carries no date at all.",
    "",
    "For example, in notes dated 2026-09-01, \"tomorrow\" is 2026-09-02 and \"Thursday\" is",
    "2026-09-03. It does not matter how long ago the meeting was.",
    "",
    "Return a JSON object with exactly this shape and no other keys:",
    "",
    '{ "tasks": [ { "title": "", "owner": "", "due": "", "dueText": "", "context": "" } ] }',
    "",
    "Every field is a string and every field must be present on every task:",
    "- title: the action, as a short imperative phrase (max 12 words).",
    "- owner: who is responsible. Use the person's name as written. If the note-taker is",
    "  responsible (\"I\", \"me\", \"my\"), use \"Me\".",
    "- due: an absolute date as YYYY-MM-DD. Use \"\" if the text gives no deadline and none",
    "  can reasonably be inferred. Never guess a date to fill the field.",
    "- dueText: the words the deadline came from, e.g. \"by Thursday\". Use \"\" if there was none.",
    "- context: one or two sentences quoted or closely paraphrased from the source text,",
    "  showing why this task exists. It must come from the text, not from your own words.",
    "",
    "Rules: only include real commitments — skip discussion, opinions and background.",
    "Do not invent tasks. Do not invent deadlines that are not stated or clearly implied.",
    "If there are no action items, return { \"tasks\": [] }.",
    "Return only the JSON object. No commentary, no code fence.",
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
    const parsed = await ask([{ role: "user", content: extractPrompt(text) }], true);
    const { tasks, problems } = validateTasks(parsed);

    // Nothing upstream guarantees the shape, so a malformed reply is a real
    // possibility. Keep what is usable and say what was wrong.
    if (problems.length && !tasks.length) {
      throw new Error("The model's reply did not match the expected shape: " + problems[0]);
    }

    const added = tasks.map(toTask);
    state.tasks = added.concat(state.tasks);
    save();
    render();

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    let status = added.length
      ? added.length + (added.length === 1 ? " item" : " items") + " found in " + secs + "s"
      : "No action items found in that text.";
    if (problems.length) status += " · " + problems.length + " field problem(s) ignored";
    $("exstatus").textContent = status;

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
