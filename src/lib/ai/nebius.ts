const BASE_URL = (process.env.NEBIUS_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1").replace(/\/$/, "")
const API_KEY = process.env.NEBIUS_API_KEY ?? ""
const DEFAULT_MODEL = process.env.NEBIUS_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct"

export async function nebiusChat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  opts: { model?: string; temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const { model = DEFAULT_MODEL, temperature = 0.2, maxTokens = 2000 } = opts
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Nebius ${res.status}: ${body.slice(0, 300)}`)
  }
  const json = await res.json()
  const content = json.choices?.[0]?.message?.content
  if (typeof content !== "string") throw new Error("Nebius returned no content")
  return content
}
