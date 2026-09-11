// Cloudflare Worker: the deployed twin of serve.js.
//
// Static files come from the [assets] binding (./public). Everything else is
// the same /api/llm proxy, so the browser code is identical in both places.
//
// The key is a Worker secret, never an asset:
//   npx wrangler secret put OPENCODE_API_KEY
//
// Only ./public is uploaded, so .env cannot be published by accident.

const LLM_URL = "https://opencode.ai/zen/go/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-v4.1-flash";

// Models the UI may pick from. An allowlist, not a free-text field: a public
// Worker must never let a visitor name an arbitrary model and spend the key.
// Keep in step with the same list in serve.js.
const MODELS = [
  { id: "deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
  { id: "qwen3.8-flash",       label: "Qwen 3.8 Flash" },
  { id: "glm-5.3-flash",       label: "GLM 5.3 Flash" },
  { id: "kimi-k2.6",           label: "Kimi K2.6" },
  { id: "minimax-m2.5",        label: "MiniMax M2.5" },
];

// deepseek-v4.1-flash spends output tokens on reasoning before it answers.
// At 4000 a two-file transcript came back empty on roughly one run in three.
const MAX_TOKENS = 12000;
const UPSTREAM_TIMEOUT_MS = 60000;

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/models") {
      return json({ models: MODELS, default: env.LLM_MODEL || DEFAULT_MODEL });
    }

    if (pathname === "/api/llm") {
      if (request.method !== "POST") return json({ error: "Use POST." }, 405);
      try {
        return await handleLlm(request, env);
      } catch (e) {
        console.error("handler error:", e.message);
        return json({ error: "Server error." }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function handleLlm(request, env) {
  const apiKey = env.OPENCODE_API_KEY;
  if (!apiKey) {
    return json({ error: "The server has no API key configured." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Body must be JSON." }, 400);
  }

  const messages = body && body.messages;
  if (!Array.isArray(messages) || !messages.length) {
    return json({ error: "messages must be a non-empty array." }, 400);
  }

  const wanted = typeof body.model === "string" ? body.model : "";
  const model = MODELS.some((m) => m.id === wanted) ? wanted : (env.LLM_MODEL || DEFAULT_MODEL);

  const payload = {
    model,
    messages,
    max_tokens: MAX_TOKENS,
    temperature: 0.2,
  };
  // Zen supports json_object and rejects json_schema, so the shape is checked
  // by validateTasks() in the browser instead.
  if (body.json) payload.response_format = { type: "json_object" };

  let upstream, text;
  try {
    upstream = await fetch(LLM_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + apiKey,
        "x-opencode-session": crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    text = await upstream.text();
  } catch (e) {
    console.error("upstream request failed:", e.message);
    return json({ error: "Could not reach the model: " + e.message }, 502);
  }

  if (!upstream.ok) {
    let msg = text.slice(0, 400);
    try { msg = JSON.parse(text).error.message; } catch {}
    console.error("upstream " + upstream.status);
    return json({ error: "Model returned " + upstream.status + ": " + msg }, upstream.status);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return json({ error: "Model returned a response that was not JSON." }, 502);
  }

  const choice = data.choices && data.choices[0];
  const content = choice && choice.message && choice.message.content;

  if (!content) {
    const reason = (choice && choice.finish_reason) || "unknown";
    return json({
      error: reason === "length"
        ? "The model ran out of output tokens before it answered. Try a shorter transcript."
        : "The model returned an empty reply (finish_reason: " + reason + ").",
    }, 502);
  }

  return json({ text: content, model, finish_reason: choice.finish_reason || null });
}
