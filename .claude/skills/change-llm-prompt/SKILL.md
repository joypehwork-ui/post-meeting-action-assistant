---
name: change-llm-prompt
description: Change the extraction or assistant prompt in this app and prove the change is an improvement, rather than assuming it from the diff. Use whenever editing extractPrompt() in public/js/extract.js, assistantPrompt() in public/js/assistant.js, validateTasks() in public/js/llm.js, or the model settings in serve.js.
---

# Change an LLM prompt

The app's behaviour lives in two strings. Reading a prompt diff tells you nothing about
whether the change worked — a sensible-looking edit can start inventing deadlines. Every
prompt change goes through `checks/prompt-check.mjs`.

**The model is not deterministic.** Do not conclude anything from a single run. See
Revision history below: a fixture failed, then passed on the very next identical run.

## Steps

1. Run `git status --short`. Stop if there are uncommitted changes the user has not explained.

2. Check `.env` has `OPENCODE_API_KEY`. Stop if it does not. Do not report a pass without a
   key — the static checks alone prove almost nothing.

3. Start the server if it is not running: `node serve.js`. The key lives there. The harness
   calls `/api/llm`, so it exercises the same path the browser does.

4. **Record a baseline before editing anything:**

   ```sh
   node checks/prompt-check.mjs --save-baseline
   ```

   Read the output. If it already fails, fix that first — you cannot attribute a later
   failure to your change otherwise.

5. Make one change. One at a time. If you add or remove a task field, update `TASK_FIELDS`
   and `validateTasks()` in `public/js/llm.js` in the same edit, and the shape line in
   `extractPrompt()`. The static checks will catch a mismatch, but only if all three agree.

6. Re-run against the fixture your change targets, **with repeats**:

   ```sh
   node checks/prompt-check.mjs --fixture=dated --repeat=5
   ```

   A single clean run is not evidence. Five is the working minimum for anything touching
   dates, counts, or grounding.

7. Run the whole suite with repeats before you finish:

   ```sh
   node checks/prompt-check.mjs --repeat=3
   ```

   A prompt fix that helps one fixture can break another. The undated fixtures must still
   fall back to today.

8. Read the baseline diff and say out loud what changed and whether each change was
   intended. Titles reword themselves between runs; that is normal. Counts changing is not.

9. If a check fails on *some* runs, the bug is intermittent, which is worse than a
   consistent one — it passes in testing and fails in front of a user. Report the rate
   (`2/5 runs clean`), never "it works now".

10. Never report a prompt change as working on the strength of the diff. Quote the run.

## Fixtures

`checks/fixtures.mjs`. Each exists to catch one failure mode:

| Fixture | Catches |
|---|---|
| `sample` | baseline behaviour on one clean transcript |
| `multifile` | duplicate tasks when one meeting arrives as two files; also the longest input, so it catches token exhaustion |
| `dated` | relative deadlines resolved against today instead of the meeting date |

Add a fixture whenever you find a new way the prompt goes wrong. A fixture is cheaper than
remembering.

## Environment

Learned the hard way in this repo. Ignoring these costs a run each time.

- Write throwaway Node into a `.mjs` file and run it. **Never** `node -e` inside a bash
  heredoc — the shell eats regex backslashes and you get a syntax error that looks like a
  code bug.
- Use `pathToFileURL` for dynamic imports. This folder's path contains spaces; hand-rolled
  `file://` strings break on it.
- Never use `/tmp`. On Windows it resolves to `C:\tmp` and fails. Use `os.tmpdir()`.
- Never invoke `python`. It is not installed, and `python - <<EOF` hangs the shell until
  timeout.
- Strip quotes and whitespace when reading `.env`. A quoted `LLM_MODEL` once produced a
  misleading `401`.

## Revision history

Kept because each entry is a check that would not exist if someone had not been burned.

**v1 — first run.**
Static checks plus one pass per fixture. Immediately useful: it disproved an assumed bug
and found a real one. The `multifile` hypothesis — that one meeting split across two files
would double the task count — was **wrong**: the model merges the accounts unprompted, 5
tasks not 10. The `dated` fixture found a genuine bug: a meeting dated 2026-09-01 produced
`2026-09-12` for "tomorrow", ten days late.

**v2 — added `--repeat`.**
The baseline run, immediately after that failure, **passed** on the same prompt and the
same input. One run proves nothing. Measured with `--repeat=5`: **2/5 clean**, a 60%
failure rate that a single run had hidden. Added `--repeat=N`, made the summary report
`clean/total`, and added step 9. Also changed `--port` to default to 3000 to match the
README.

Fix for the bug it found: `extractPrompt()` now tells the model to find the meeting date in
the text first and resolve relative deadlines against it, with a worked example, falling
back to today only when the text carries no date. Result **5/5 clean**.

**v3 — the suite caught what the single fixture could not.**
Running everything at `--repeat=3` failed `multifile` 2/3 with *"ran out of output
tokens"*. Not a prompt bug at all: `MAX_TOKENS` in `serve.js` was 4000, and a two-file
transcript plus this model's `reasoning_content` overflowed it. Raised to 12000; **4/4
clean**. Two lessons, both now in the steps: always run the full suite before finishing
(step 7), and keep the longest input in the suite deliberately, because it is the one that
finds limits.
