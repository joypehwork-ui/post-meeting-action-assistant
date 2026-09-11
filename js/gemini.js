// The only place that talks to the network.

import { API } from "./config.js";
import { state, effectiveKey } from "./state.js";

/**
 * Call Gemini.
 *
 * Pass a schema to get parsed JSON back; pass null to get plain text.
 * Throws an Error carrying the API's own message, which the UI shows verbatim —
 * a bad key or a retired model name should say so, not fail silently.
 */
export async function gemini(prompt, schema) {
  const key = effectiveKey();
  if (!key) {
    throw new Error("No API key set. Put one in .env, or open Settings and paste your Google AI Studio key.");
  }

  const generationConfig = { temperature: 0.2 };
  if (schema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = schema;
  }

  const res = await fetch(API + "/" + encodeURIComponent(state.model) + ":generateContent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    }),
  });

  const text = await res.text();

  if (!res.ok) {
    let msg = text.slice(0, 400);
    try { msg = JSON.parse(text).error.message; } catch (e) {}
    throw new Error("Gemini " + res.status + ": " + msg);
  }

  let out;
  try {
    out = JSON.parse(text).candidates[0].content.parts[0].text;
  } catch (e) {
    throw new Error("Unexpected response shape from Gemini.");
  }

  return schema ? JSON.parse(out) : out;
}

/** Shape we require back from the extraction call. */
export const TASK_SCHEMA = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title:   { type: "string" },
          owner:   { type: "string" },
          due:     { type: "string" },
          dueText: { type: "string" },
          context: { type: "string" },
        },
        required: ["title", "owner", "due", "dueText", "context"],
      },
    },
  },
  required: ["tasks"],
};
