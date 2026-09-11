# Post-Meeting Action Assistant

Paste or upload a meeting transcript. Get a checklist of action items with owners, deadlines,
and the quote each one came from. Ask questions about what you owe and when.

No build step, no dependencies, no bundler. Plain ES modules, and a small Node server that
holds the API key and serves the files.

## What you need first

An **OpenCode** API key, and Node 18 or newer (`node -v`).

Put the key in `.env`:

```
OPENCODE_API_KEY=sk-...
LLM_MODEL=deepseek-v4.1-flash
```

`.env` is gitignored. The key stays on the server — see below.

## How to run it

```sh
node serve.js
```

Then open http://localhost:3000.

**Do not double-click `index.html`.** Two reasons: the code is split into ES modules, which
browsers refuse to load over `file://`, and the model call goes through the local server.

## Where the key lives

`serve.js` reads `.env` at startup and exposes one route, `POST /api/llm`, which forwards to
OpenCode Zen. The browser posts to that route. It never sees the key, never stores one, and
there is nothing to paste into the UI.

That is not just tidier, it is the only design that works here: **OpenCode Zen sends no CORS
headers.** Its preflight returns 404 and its responses carry no `Access-Control-Allow-Origin`,
so a browser cannot call it directly at all.

The server refuses to start without a key, and will not serve `.env` over HTTP even though it
sits in the folder.

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

Upload several files at once and they are joined with a `--- filename ---` header between
them. The model merges a commitment that appears in more than one of them.

**Word and PDF do not work.** `.docx` and `.pdf` are compressed binary formats and this app
has no library to unpack them. You get a message telling you to export as `.txt` or paste the
text.

Anything over 200,000 characters is trimmed, with a warning.

## Changing a prompt

The app's behaviour is two strings: `extractPrompt()` in `js/extract.js` and
`assistantPrompt()` in `js/assistant.js`. **A prompt diff tells you nothing about whether the
change worked**, so there is a harness:

```sh
node checks/prompt-check.mjs --save-baseline    # before editing
node checks/prompt-check.mjs --repeat=3         # after
```

It imports the app's own modules, so it tests the prompt actually being sent. It checks the
reply parses, matches the shape, has sane dates, has no duplicates, and — the one that
matters — that every `context` is traceable to the source text, which is the machine-checkable
form of "do not invent tasks".

**Use `--repeat`.** The model is not deterministic. A fixture here failed, then passed on the
next identical run; measured properly it was failing 3 times in 5.

The full procedure is in `.claude/skills/change-llm-prompt/SKILL.md`, including a revision
history of what each check was added to catch.

## Changing the model

Edit `LLM_MODEL` in `.env` and restart the server. Model names come from
`https://opencode.ai/zen/go/v1/models`.

Note that `deepseek-v4.1-flash` is a reasoning model: it spends output tokens thinking before
it writes anything. `MAX_TOKENS` in `serve.js` is 12000 for that reason. At 4000 a two-file
transcript failed about one run in three with an empty reply.

## Using a different provider

Change the `fetch` in `handleLlm()` in `serve.js`. Because the call is server-side, CORS is
irrelevant and any provider works — which was not true of the earlier browser-side design.

`js/llm.js` in the browser only knows about `/api/llm` and does not need to change.

## Where your data goes

Tasks and chat history are saved in this browser's `localStorage`. They stay on this computer.

When you click **Extract Tasks** or **Ask**, the text goes to your local server and on to
OpenCode Zen over HTTPS.

**Clear All Data** deletes the tasks and chat history from this browser. It cannot be undone.

### Honest limits

- `localStorage` is **not encrypted**. Anyone with access to this computer and this browser
  profile can read the saved transcripts and tasks. Do not use this on a shared machine.
- OpenCode Zen's terms are not an enterprise zero-data-retention agreement. For real client
  transcripts, use a provider you have a contract with.

## File layout

```
index.html          markup only
css/styles.css      all styling — visual language from design/Main.dc.html
js/
  app.js            entry point — wires the DOM, then boots
  config.js         storage key, file types, size limits
  state.js          app state and localStorage
  llm.js            the only module that talks to the model, via /api/llm
  extract.js        transcript -> action items
  assistant.js      the follow-up question box
  files.js          upload, drag-drop, .vtt/.srt cleaning
  render.js         all DOM writing
  util.js           escaping, dates, due-date ranking
  sample.js         the demo transcript
serve.js            static files + POST /api/llm; holds the key
checks/
  prompt-check.mjs  prove a prompt change is an improvement
  fixtures.mjs      fixed inputs, one per failure mode
  baseline.json     last recorded result, for diffing
.claude/skills/change-llm-prompt/SKILL.md
design/             the board the visual language came from
.env                your key — gitignored
.env.example        the committed template
```

Dependencies run one way: `config` and `util` depend on nothing, `state` and `render` sit on
top of those, feature modules above those, and `app.js` wires it together. Nothing imports
`app.js`.

## Design

The visual language comes from `design/Main.dc.html`, a board exported from a visual design
canvas. Only the design was taken from it — the palette, type, borders and spacing. The
product name and wording in that board were not used. The React runtime that renders the board
live is not committed; it is in `Main-html.zip` alongside this folder.

| | |
|---|---|
| Ink | `#0B0B0C` |
| Accent | `#C8F31D` |
| Background | `#F2F1EA` |
| Muted | `#6E6E73` |
| Rule / "later" chip | `#E4E2D8` |
| Display type | Archivo Black |
| Interface type | Archivo 400–700 |

House style: 2px black borders, square corners, flat fills, no shadows, and 11px uppercase
micro-labels tracked at `0.14em`.

Due-date chips escalate through four states, using only brand colours:

```
later     grey fill
soon      white, black border
today     lime fill
overdue   black fill, lime text
```

Fonts load from Google Fonts. Offline they fall back to Helvetica/Arial and the layout is
unaffected. The design board has no dark mode, so neither does the app.

## What this does not do

By design, v1 leaves out:

- joining or recording meetings (Zoom, Teams, Meet)
- integrations with Salesforce, HubSpot, Asana, Jira or Notion
- writing or sending email for you
- shared workspaces, multiple users, permissions
