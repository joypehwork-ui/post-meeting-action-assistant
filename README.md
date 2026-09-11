# Post-Meeting Action Assistant

Paste or upload a meeting transcript. Get a checklist of action items with owners, deadlines,
and the quote each one came from. Ask questions about what you owe and when.

No build step, no dependencies, no bundler. Plain ES modules served straight to the
browser. It calls Google's Gemini API and nothing else.

## What you need first

A free Google AI Studio API key.

1. Go to https://aistudio.google.com/apikey
2. Click **Create API key**.
3. Copy the key. It starts with `AIza`.

This is **not** the same as a Google Places or Google Maps key. A Places key will not work here —
it returns HTTP 403.

## How to run it

```sh
node serve.js
```

Then open http://localhost:3000.

**Do not double-click `index.html`.** The code is split into ES modules, and browsers
refuse to load modules over `file://` — you get a blank page and a CORS error in the
console. It has to be served. `serve.js` is a 45-line static server with no
dependencies, bound to localhost only.

Needs Node 18 or newer. Check with `node -v`.

Not published to GitHub Pages yet.

## File layout

```
index.html          markup only
css/styles.css      all styling — visual language from design/Main.dc.html
js/
  app.js            entry point — wires the DOM, then boots
  config.js         constants: endpoint, model, size limits
  state.js          app state, localStorage, .env reader
  gemini.js         the only module that touches the network
  extract.js        transcript -> action items
  assistant.js      the follow-up question box
  files.js          upload, drag-drop, .vtt/.srt cleaning
  render.js         all DOM writing
  util.js           escaping, dates, due-date ranking
  sample.js         the demo transcript
serve.js            local static server (only so .env can be read)
.env                your API key — gitignored
.env.example        the committed template
```

The dependency direction is one-way: `config` and `util` depend on nothing,
`state` and `render` sit on top of those, feature modules sit on top of those,
and `app.js` wires everything together. No module imports `app.js`.

## Your API key: two options

### Option 1 — the Settings panel

1. Click **Settings** in the top bar.
2. Paste your key into **Google AI Studio API key**.
3. It is saved in this browser's `localStorage`. **Clear All Data** removes it.

### Option 2 — the `.env` file

Open `.env` and fill in the key:

```
GEMINI_API_KEY=AIza...your key here...
GEMINI_MODEL=gemini-2.5-flash
```

Reload the page. The top bar will say **Key from .env**.

The key from `.env` is never copied into `localStorage`, so the file stays the one
place the key lives. A key typed into Settings overrides the `.env` one.

`.env` is listed in `.gitignore`. **Do not commit it, and do not deploy it to GitHub
Pages** — every file on a public site is readable by anyone who visits, including `.env`.
`.env.example` is the safe copy to commit.

## How to use it

1. Get your notes into the big box. Three ways:
   - paste them
   - click **Upload notes…** and pick one or more files
   - drag files straight onto the box
2. Click **Extract Tasks**. Takes a few seconds.
3. Read the checklist. Each item shows:
   - the action
   - who owns it (`Me` means you)
   - when it is due
   - the sentence from your notes that the task came from
4. Tick items you have done. Click **Edit** to fix anything wrong. Click **Dismiss** to remove
   an item that is not a real task.
5. **Due soon** on the right lists every open item, most urgent first.
6. Type a question into **Ask the assistant**, for example:
   - What is my top priority before end of day?
   - What do I owe Sarah before Friday?
   - What is due in the next three days?

There is a **Use sample transcript** button if you want to try it without pasting anything.

## Which files it can read

`.txt` `.md` `.csv` `.log` `.vtt` `.srt`, and anything else the browser reports as plain text.

Zoom and Teams both export `.vtt`. The app strips the timestamps, cue numbers and
`<v Name>` tags out of those before sending them, so the model reads dialogue rather
than subtitle scaffolding:

```
00:00:01.000 --> 00:00:04.000        becomes      Sarah: I'll get the deck to you by Thursday.
<v Sarah>I'll get the deck to you by Thursday.
```

Upload several files at once and they are joined with a `--- filename ---` header
between them.

**Word and PDF do not work.** `.docx` and `.pdf` are compressed binary formats and this
app has no library to unpack them. You get a message telling you to export as `.txt` or
paste the text. Adding `.docx` support is possible but is not in v1.

Anything over 200,000 characters is trimmed, with a warning. Extract long transcripts in
chunks — the results are better anyway.

## Where your data goes

Tasks, chat history and your API key are saved in this browser's `localStorage`. They stay on
this computer. They are not sent anywhere except as described below.

When you click **Extract Tasks** or **Ask**, the text is sent to Google's Gemini API over HTTPS,
straight from your browser to Google. It does not pass through any server belonging to this app,
because this app has no server.

**Clear All Data** deletes the tasks, the chat history and the saved API key from this browser.
It cannot be undone.

### Honest limits

- `localStorage` is **not encrypted**. Anyone with access to this computer and this browser
  profile can read the saved transcripts, tasks and API key. Do not use this on a shared machine.
- Google's data-retention terms for the free AI Studio tier are not the same as an enterprise
  zero-data-retention agreement. For real client transcripts, use a paid Google Cloud Vertex AI
  key or another provider under contract.

## Changing the model

The Settings panel has a **Model** field. It defaults to `gemini-2.5-flash`. If that model name
stops working you will see a `Gemini 404` message — put a current model name in that field.
Model names are listed at https://ai.google.dev/gemini-api/docs/models

## Using OpenAI instead

Replace the `gemini()` function in `js/gemini.js` — it is the only module that touches the
network, so nothing else has to change. OpenAI also allows direct browser calls.
Both `api.openai.com` and `generativelanguage.googleapis.com` return the CORS headers a browser
needs. Most other providers do not — OpenCode Zen, for example, returns no
`Access-Control-Allow-Origin` at all, so it cannot be called from a page like this.

## What this does not do

By design, v1 leaves out:

- joining or recording meetings (Zoom, Teams, Meet)
- integrations with Salesforce, HubSpot, Asana, Jira or Notion
- writing or sending email for you
- shared workspaces, multiple users, permissions

## Design

The visual language comes from `design/Main.dc.html`, a board exported from a visual
design canvas. Only the design was taken from it — the palette, type, borders and
spacing. The product name and wording in that board were not used. It is a reference mockup, not code — the values were reimplemented
in `css/styles.css` rather than copied.

| | |
|---|---|
| Ink | `#0B0B0C` |
| Accent | `#C8F31D` |
| Background | `#F2F1EA` |
| Muted | `#6E6E73` |
| Rule / "later" chip | `#E4E2D8` |
| Display type | Archivo Black |
| Interface type | Archivo 400–700 |

House style: 2px black borders, square corners, flat fills, no shadows, and
11px uppercase micro-labels tracked at `0.14em`.

Due-date chips escalate through four states, using only brand colours:

```
later     grey fill
soon      white, black border
today     lime fill
overdue   black fill, lime text
```

Fonts load from Google Fonts. Offline they fall back to Helvetica/Arial and the
layout is unaffected.

The design board has no dark mode, so neither does the app — it commits to the
one light look on purpose.
