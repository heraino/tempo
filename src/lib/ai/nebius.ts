const BASE_URL = (process.env.NEBIUS_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1").replace(/\/$/, "")
const API_KEY = process.env.NEBIUS_API_KEY ?? ""
const DEFAULT_MODEL = process.env.NEBIUS_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct"

// Without a bound, a slow or hung Nebius response leaves fetch waiting
// indefinitely — which on a serverless platform means the function gets
// killed by the platform's own execution limit instead of failing in a way
// the app can catch and show a message for. This default is sized for
// callers that run as a normal blocking request/response (coach-actions.ts,
// review-actions.ts) — it must stay safely under whatever maxDuration their
// page declares. Program generation runs as a decoupled background job
// (see program.service.ts) and passes its own much longer explicit
// timeoutMs, since nothing is holding a browser request open waiting on it.
const DEFAULT_TIMEOUT_MS = 55_000

export async function nebiusChat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  opts: { model?: string; temperature?: number; maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  const { model = DEFAULT_MODEL, temperature = 0.2, maxTokens = 2000, timeoutMs = DEFAULT_TIMEOUT_MS } = opts

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Nebius request timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Nebius ${res.status}: ${body.slice(0, 300)}`)
  }
  const json = await res.json()
  const content = json.choices?.[0]?.message?.content
  if (typeof content !== "string") throw new Error("Nebius returned no content")
  return content
}
