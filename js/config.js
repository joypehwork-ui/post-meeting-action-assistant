// Every tunable value in one place.

export const STORE = "pmaa.v1";

export const API = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_MODEL = "gemini-2.5-flash";

// File types the uploader will read. Anything else is refused with a message.
export const TEXT_EXT = /\.(txt|md|markdown|vtt|srt|csv|log|text)$/i;

// Longer than this and extraction quality drops off, so we trim and warn.
export const MAX_CHARS = 200000;
