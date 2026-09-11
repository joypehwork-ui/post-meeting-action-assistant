// Fixed inputs for prompt-check.mjs.
//
// Each one exists to catch a specific way the extraction prompt can go wrong.
// Keep them small: every run costs tokens and time.

import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const { SAMPLE } = await import(pathToFileURL(path.join(root, "public", "js", "sample.js")).href);

/** The same meeting, written up by a second person in their own words. */
const SECOND_ACCOUNT = [
  "My notes - Acme weekly",
  "",
  "Pricing deck: Sarah owns it, enterprise tier missing, she said Thursday.",
  "Security questionnaire goes to their IT before Friday - that's mine.",
  "Need 30 min with Raj tomorrow about the cutover window.",
  "Legal still sitting on the redlined MSA. I said I'd chase by end of week.",
  "Raj does the rollback plan after the window is set.",
].join("\n");

export const FIXTURES = {
  // Baseline: one meeting, one account of it.
  sample: {
    text: SAMPLE,
    expect: { minTasks: 4, maxTasks: 8 },
    note: "single transcript",
  },

  // Two files describing the SAME meeting, joined the way files.js joins them.
  // A prompt that does not know about file separators produces roughly double
  // the tasks, one per account of each commitment.
  multifile: {
    text: "--- transcript.txt ---\n" + SAMPLE +
          "\n\n--- my-notes.md ---\n" + SECOND_ACCOUNT,
    expect: { minTasks: 4, maxTasks: 8 },
    note: "same meeting in two files - must not double up",
  },

  // A meeting that happened in the past. "by Thursday" means the Thursday
  // after the MEETING, not after today.
  dated: {
    text: "Weekly sync - Acme account\nDate: 2026-09-01 (Tuesday)\n\n" +
          SAMPLE.split("\n").slice(2).join("\n"),
    expect: { minTasks: 4, maxTasks: 8, dueBefore: "2026-09-11" },
    note: "meeting dated 2026-09-01 - deadlines must resolve against that",
  },
};
