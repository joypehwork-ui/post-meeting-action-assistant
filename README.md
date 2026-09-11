# Post-Meeting Action Assistant

Paste a meeting transcript. Get a checklist of action items with owners, deadlines, and the
quote each one came from. Ask questions about what you owe and when.

One file. No build step. No server. Runs offline except for the calls to Google's Gemini API.

## What you need first

A free Google AI Studio API key.

1. Go to https://aistudio.google.com/apikey
2. Click **Create API key**.
3. Copy the key. It starts with `AIza`.

This is **not** the same as a Google Places or Google Maps key. A Places key will not work here —
it returns HTTP 403.

## How to run it

Open `index.html` in a browser. That is the whole thing.

Not published to GitHub Pages yet.

## First run

1. The Settings panel opens by itself because no key is saved yet.
2. Paste your API key into **Google AI Studio API key**.
3. Close Settings. The key is saved in this browser.

## How to use it

1. Paste a transcript or rough notes into the big box.
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

Replace the `gemini()` function in `index.html`. OpenAI also allows direct browser calls.
Both `api.openai.com` and `generativelanguage.googleapis.com` return the CORS headers a browser
needs. Most other providers do not — OpenCode Zen, for example, returns no
`Access-Control-Allow-Origin` at all, so it cannot be called from a page like this.

## What this does not do

By design, v1 leaves out:

- joining or recording meetings (Zoom, Teams, Meet)
- integrations with Salesforce, HubSpot, Asana, Jira or Notion
- writing or sending email for you
- shared workspaces, multiple users, permissions
