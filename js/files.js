// Reading uploaded / dropped notes, and tidying transcript formats.

import { TEXT_EXT, MAX_CHARS } from "./config.js";
import { $, esc, showErr, clearErr } from "./util.js";

export let loadedFiles = [];
export function resetFiles() {
  loadedFiles = [];
  renderFiles();
}

/**
 * Strip WebVTT / SRT scaffolding so the model reads dialogue rather than
 * subtitle machinery. Plain text passes through with line endings normalised.
 */
export function cleanTranscript(name, raw) {
  let t = String(raw).replace(/\r\n?/g, "\n");

  if (/\.(vtt|srt)$/i.test(name)) {
    const out = [];
    let prev = "";
    for (const line of t.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      if (/^WEBVTT/i.test(s)) continue;                 // file header
      if (/^(NOTE|STYLE|REGION)\b/i.test(s)) continue;  // VTT blocks we don't want
      if (s.indexOf("-->") !== -1) continue;            // cue timing
      if (/^\d+$/.test(s)) continue;                    // cue number

      const cleaned = s
        .replace(/<v\s+([^>]*)>/gi, "$1: ")   // <v Sarah> -> "Sarah: "
        .replace(/<\/?[^>]+>/g, "")           // any other cue tags
        .trim();

      if (!cleaned || cleaned === prev) continue;       // VTT repeats lines often
      prev = cleaned;
      out.push(cleaned);
    }
    t = out.join("\n");
  }

  return t.trim();
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read " + file.name + "."));
    r.readAsText(file);
  });
}

/** Append the readable files in `fileList` to the textarea. */
export async function addFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  clearErr("exerr");

  const ok = [], rejected = [];
  for (const f of files) {
    const looksText = TEXT_EXT.test(f.name) || (f.type && f.type.indexOf("text/") === 0);
    (looksText ? ok : rejected).push(f);
  }

  if (rejected.length) {
    showErr("exerr", "Cannot read " + rejected.map((f) => f.name).join(", ") +
      ". This app reads plain text only — export as .txt, or copy the text and paste it into the box.");
  }
  if (!ok.length) return;

  const parts = [];
  for (const f of ok) {
    try {
      const text = cleanTranscript(f.name, await readAsText(f));
      if (!text) { showErr("exerr", f.name + " is empty."); continue; }
      parts.push(ok.length > 1 ? "--- " + f.name + " ---\n" + text : text);
      loadedFiles.push({ name: f.name, chars: text.length });
    } catch (e) {
      showErr("exerr", e.message);
    }
  }
  if (!parts.length) return;

  const box = $("input");
  const existing = box.value.trim();
  box.value = (existing ? existing + "\n\n" : "") + parts.join("\n\n");

  if (box.value.length > MAX_CHARS) {
    box.value = box.value.slice(0, MAX_CHARS);
    showErr("exerr", "That is a lot of text — trimmed to " + MAX_CHARS.toLocaleString() +
      " characters. Extract in smaller chunks for better results.");
  }

  renderFiles();
  $("exstatus").textContent = "";
}

export function renderFiles() {
  const box = $("files");
  box.hidden = loadedFiles.length === 0;
  box.innerHTML = loadedFiles.map((f, i) =>
    '<span class="fchip"><b>' + esc(f.name) + '</b>' + f.chars.toLocaleString() + ' chars' +
    '<button data-i="' + i + '" title="Forget this file" aria-label="Forget this file">&times;</button></span>'
  ).join("");
}

export function forgetFile(index) {
  loadedFiles.splice(index, 1);
  renderFiles();
}
