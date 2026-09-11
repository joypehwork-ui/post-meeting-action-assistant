// The follow-up question box.

import { gemini } from "./gemini.js";
import { state, save, openTasks, sortByDue } from "./state.js";
import { $, todayISO, showErr, clearErr } from "./util.js";
import { renderChat } from "./render.js";

/** Flatten the open items into the fact list the model answers from. */
function factsFor(tasks) {
  return tasks.map((t) =>
    "- " + t.title +
    " | owner: " + t.owner +
    " | due: " + (t.due || "none") + (t.dueText ? " (" + t.dueText + ")" : "") +
    " | context: " + t.context
  ).join("\n");
}

export function assistantPrompt(question, tasks) {
  return [
    "You are a concise assistant answering questions about the user's own open action items.",
    "Today is " + todayISO() + ". \"Me\" means the user.",
    "",
    "OPEN ACTION ITEMS:",
    factsFor(tasks),
    "",
    "QUESTION: " + question,
    "",
    "Answer in at most four short sentences or a short bullet list.",
    "Lead with the single most urgent item. Always state the deadline.",
    "Only use the items above — if nothing matches, say so plainly.",
  ].join("\n");
}

export async function doAsk(question) {
  if (!question) return;
  clearErr("chaterr");

  const open = openTasks().sort(sortByDue);
  if (!open.length) {
    showErr("chaterr", "No open action items to answer from yet.");
    return;
  }

  const button = $("asksend");
  button.disabled = true;

  // Show the question straight away with a placeholder answer.
  state.chat.push({ q: question, a: "…" });
  renderChat();

  try {
    const answer = await gemini(assistantPrompt(question, open), null);
    state.chat[state.chat.length - 1].a = String(answer).trim();
    save();
  } catch (e) {
    state.chat.pop();          // drop the placeholder turn
    showErr("chaterr", e.message);
  } finally {
    button.disabled = false;
    renderChat();
  }
}
