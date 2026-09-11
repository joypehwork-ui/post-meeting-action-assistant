// Every tunable value in one place.
//
// Nothing about the model provider lives in the browser any more — the key,
// the endpoint and the model name are all held by serve.js. See js/llm.js.

export const STORE = "pmaa.v1";

// File types the uploader will read. Anything else is refused with a message.
export const TEXT_EXT = /\.(txt|md|markdown|vtt|srt|csv|log|text)$/i;

// Longer than this and extraction quality drops off, so we trim and warn.
export const MAX_CHARS = 200000;
