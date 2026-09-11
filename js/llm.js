// The only module that talks to the model.
//
// It posts to our own /api/llm, which holds the key and forwards to OpenCode
// Zen. Nothing about the provider — key, URL, model — is known here or anywhere
// else in the browser.

const ENDPOINT = "/api/llm";

/**
 * Ask the model.
 *
 * Pass wantJson to request JSON mode and get a parsed object back; otherwise
 * you get plain text. Errors carry the server's own message so a bad key or a
 * retired model name says so rather than failing silently.
 */
export async function ask(messages, wantJson = false) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, json: wantJson }),
    });
  } catch (e) {
    throw new Error("Could not reach the local server. Is `node serve.js` still running?");
  }

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error("The server returned a reply that was not JSON.");
  }

  if (!res.ok) throw new Error(body.error || "Request failed (" + res.status + ").");
  if (!body.text) throw new Error("The model returned an empty reply.");

  if (!wantJson) return body.text;

  // Zen rejects json_schema, so json_object is the strongest guarantee
  // available and the model can still wrap the object in prose or a fence.
  return JSON.parse(stripToObject(body.text));
}

/** Pull the outermost JSON object out of a reply that may be fenced or padded. */
function stripToObject(text) {
  const t = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  if (t.startsWith("{")) return t;
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("The model did not return a JSON object.");
  }
  return t.slice(start, end + 1);
}

/**
 * The shape extraction must produce.
 *
 * This used to be a JSON schema sent to the provider. OpenCode Zen rejects
 * json_schema ("This response_format type is unavailable now"), so nothing
 * upstream enforces it and we check it here instead. Keep this in step with
 * the field list in extractPrompt().
 */
export const TASK_FIELDS = ["title", "owner", "due", "dueText", "context"];

/**
 * Validate a parsed extraction reply.
 * Returns { tasks, problems } — problems is empty when the reply was clean.
 */
export function validateTasks(parsed) {
  const problems = [];

  if (!parsed || typeof parsed !== "object") {
    return { tasks: [], problems: ["Reply was not an object."] };
  }
  if (!Array.isArray(parsed.tasks)) {
    return { tasks: [], problems: ['Reply has no "tasks" array.'] };
  }

  const tasks = [];
  parsed.tasks.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") {
      problems.push("Item " + i + " is not an object.");
      return;
    }
    for (const f of TASK_FIELDS) {
      if (typeof raw[f] !== "string") {
        problems.push('Item ' + i + ' is missing "' + f + '".');
      }
    }
    if (typeof raw.title === "string" && !raw.title.trim()) {
      problems.push("Item " + i + " has an empty title.");
    }
    if (typeof raw.due === "string" && raw.due && !/^\d{4}-\d{2}-\d{2}$/.test(raw.due)) {
      problems.push('Item ' + i + ' has a due date that is not YYYY-MM-DD: "' + raw.due + '".');
    }
    tasks.push(raw);
  });

  return { tasks, problems };
}
