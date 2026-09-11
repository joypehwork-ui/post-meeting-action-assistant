# Post-Meeting Action Assistant

Paste or upload a meeting transcript. Get a checklist of action items with owners, deadlines,
and the quote each one came from. Then ask questions about what you owe and when.

Built for people with many meetings and action items to follow up.

No build step, no bundler, no npm dependencies. Plain ES modules, plus a small Node server
that holds the API key.

---

## Quick start

```sh
git clone https://github.com/joypehwork-ui/post-meeting-action-assistant.git
cd post-meeting-action-assistant
cp .env.example .env        # then put your key in it
node serve.js
```

Open http://localhost:3000.

Needs Node 18 or newer (`node -v`) and an **OpenCode** API key.

`.env`:

```
OPENCODE_API_KEY=sk-...
LLM_MODEL=deepseek-v4.1-flash
```

**Do not double-click `public/index.html`.** The code is split into ES modules, which browsers
refuse to load over `file://`, and the model call goes through the local server. It has to be
served.

---

## What it does

| Feature | Where |
|---|---|
| Paste, upload, or drag in a transcript | top of the page |
| Extract action items with owner, deadline and source quote | **Extract Tasks** |
| Tick off, edit inline, or dismiss an item | the checklist |
| See what is closest to due | **Due soon**, right-hand column |
| Ask "what do I owe Sarah before Friday?" | **Ask the assistant** |
| Switch which model answers | dropdown in the header |
| Wipe everything | **Clear All Data** |

Every extracted task carries a one or two sentence quote from your notes, so you can see why
it exists without going back to the transcript.

Due-date chips escalate: grey for later, outlined for soon, lime for today, black for overdue.

### Files it can read

`.txt` `.md` `.csv` `.log` `.vtt` `.srt`, and anything the browser reports as plain text.

Zoom and Teams export `.vtt`. Timestamps, cue numbers and `<v Name>` tags are stripped before
the model sees them, so it reads dialogue rather than subtitle scaffolding:

```
00:00:01.000 --> 00:00:04.000        becomes      Sarah: I'll get the deck to you by Thursday.
<v Sarah>I'll get the deck to you by Thursday.
```

Upload several files at once and they are joined with a `--- filename ---` header. A commitment
appearing in more than one of them is merged, not duplicated.

**Word and PDF do not work** — `.docx` and `.pdf` are compressed binary and there is no library
here to unpack them. You get a message telling you to export as `.txt`. Input over 200,000
characters is trimmed with a warning.

---

## Choosing a model

The header dropdown switches which model answers. Five are offered, each verified working and
billing at `cost: 0` on this endpoint:

`deepseek-v4.1-flash` · `qwen3.8-flash` · `glm-5.3-flash` · `kimi-k2.6` · `minimax-m2.5`

The list is an **allowlist held by the server**, not a free-text field. A public deployment
must never let a visitor name an arbitrary model and spend the key on it; anything off the list
falls back to the default. To change the options, edit `MODELS` in **both** `serve.js` and
`worker.js`.

`deepseek-v4.1-flash` is a reasoning model — it spends output tokens thinking before it writes
anything. `MAX_TOKENS` is 12000 for that reason. At 4000, a two-file transcript came back empty
on roughly one run in three.

---

## Where the key lives

`serve.js` reads `.env` at startup and exposes one route, `POST /api/llm`, which forwards to
OpenCode Zen. The browser posts to that route. It never sees the key, never stores one, and
there is no key field in the UI.

That is not just tidier — it is the only design that works here. **OpenCode Zen sends no CORS
headers**: its preflight returns 404 and no response carries `Access-Control-Allow-Origin`, so
a browser cannot call it directly at all.

The server refuses to start without a key and will not serve `.env` over HTTP.

---

## Deploying

**GitHub Pages cannot host this app.** Pages serves static files only. The page would load and
look fine, then every extraction would 404 on `/api/llm`.

Use Cloudflare Workers. `worker.js` is the deployed twin of `serve.js` — same proxy, same
allowlist, same token limit, with static files served from the `ASSETS` binding.

```sh
npx wrangler@4 login
npx wrangler@4 secret put OPENCODE_API_KEY     # paste the key when prompted
npx wrangler@4 deploy
```

The key becomes a Worker secret. It is never committed and never uploaded as an asset: only
`./public` is uploaded, and `.env` lives above it, so it cannot be published by accident.

---

## Changing a prompt

The app's behaviour is two strings — `extractPrompt()` in `public/js/extract.js` and
`assistantPrompt()` in `public/js/assistant.js`. **A prompt diff tells you nothing about
whether the change worked**, so there is a harness:

```sh
node checks/prompt-check.mjs --save-baseline         # before editing
node checks/prompt-check.mjs --repeat=3              # after
node checks/prompt-check.mjs --model=glm-5.3-flash   # against another model
```

`--model` matters now that the picker exists: a prompt validated on DeepSeek says nothing
about the other four. If you name a model the server does not accept, the check fails rather
than quietly reporting a pass for the default it substituted.

It imports the app's own modules, so it tests the prompt actually being sent rather than a copy
that drifts. It checks the reply parses, matches the shape, has sane dates, has no duplicates,
and — the one that matters — that every `context` is traceable to the source text. That is the
machine-checkable form of the prompt's own rule, "do not invent tasks".

**Always use `--repeat`.** The model is not deterministic. A fixture here failed, then passed on
the next identical run; measured properly it was failing 3 times in 5.

The full procedure is in `.claude/skills/change-llm-prompt/SKILL.md`, with a revision history of
what each check was added to catch and why.

---

## Layout

```
public/                     everything served to the browser
  index.html                markup only
  css/styles.css            all styling
  js/
    app.js                  entry point — wires the DOM, then boots
    config.js               storage key, file types, size limits
    state.js                app state and localStorage
    llm.js                  the only module that talks to the model, via /api/llm
    extract.js              transcript -> action items
    assistant.js            the follow-up question box
    files.js                upload, drag-drop, .vtt/.srt cleaning
    render.js               all DOM writing
    util.js                 escaping, dates, due-date ranking
    sample.js               the demo transcript
serve.js                    local: static files + POST /api/llm; holds the key
worker.js                   deployed: the same, on Cloudflare
wrangler.toml               Worker config; uploads ./public only
checks/
  prompt-check.mjs          prove a prompt change is an improvement
  fixtures.mjs              fixed inputs, one per failure mode
  baseline.json             last recorded result, for diffing
.claude/skills/change-llm-prompt/SKILL.md
design/                     the board the visual language came from
.env                        your key — gitignored
.env.example                the committed template
```

Dependencies run one way: `config` and `util` depend on nothing, `state` and `render` sit above
those, feature modules above those, and `app.js` wires it together. Nothing imports `app.js`.
`llm.js` is the only module that touches the network, so swapping provider is a one-file change
in the browser and one function in the server.

---

## Design

The visual language comes from `design/Main.dc.html`, a board exported from a visual design
canvas. Only the design was taken from it — palette, type, borders, spacing. The product name
and wording in that board were not used. The React runtime that renders the board live is not
committed.

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
micro-labels tracked at `0.14em`. Fonts load from Google Fonts and fall back to
Helvetica/Arial offline without affecting layout. The board has no dark mode, so neither does
the app.

---

## Privacy

Tasks and chat history live in this browser's `localStorage` and stay on this computer.
**Clear All Data** deletes them; it cannot be undone.

When you click **Extract Tasks** or **Ask**, the text goes to the server and on to OpenCode Zen
over HTTPS.

### Honest limits

- `localStorage` is **not encrypted**. Anyone with access to this computer and browser profile
  can read the saved transcripts and tasks. Do not use this on a shared machine.
- OpenCode Zen's terms are not an enterprise zero-data-retention agreement. For real client
  transcripts, use a provider you have a contract with.
- Deploying the Worker publicly puts your key behind a URL anyone can call. Add access control
  before sharing it beyond a demo.

---

## Not in v1

By design:

- joining or recording meetings (Zoom, Teams, Meet)
- integrations with Salesforce, HubSpot, Asana, Jira or Notion
- writing or sending email for you
- shared workspaces, multiple users, permissions
