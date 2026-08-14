import { describe, it, expect, vi, afterEach } from "vitest"

describe("nebiusChat", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("returns the message content on a successful response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "hello" } }] }),
    }) as unknown as typeof fetch

    const { nebiusChat } = await import("./nebius")
    const result = await nebiusChat([{ role: "user", content: "hi" }])
    expect(result).toBe("hello")
  })

  it("throws a descriptive error on a non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "server error",
    }) as unknown as typeof fetch

    const { nebiusChat } = await import("./nebius")
    await expect(nebiusChat([{ role: "user", content: "hi" }])).rejects.toThrow(/Nebius 500/)
  })

  it("throws when the response has no message content", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    }) as unknown as typeof fetch

    const { nebiusChat } = await import("./nebius")
    await expect(nebiusChat([{ role: "user", content: "hi" }])).rejects.toThrow(/no content/)
  })

  it("aborts and throws a clear timeout error instead of hanging indefinitely", async () => {
    // Simulates a hung Nebius response: fetch never resolves on its own, but
    // does respect the abort signal — the real behavior a hanging network
    // call would exhibit once AbortController.abort() fires.
    global.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted")
          err.name = "AbortError"
          reject(err)
        })
      })
    }) as unknown as typeof fetch

    const { nebiusChat } = await import("./nebius")
    await expect(
      nebiusChat([{ role: "user", content: "hi" }], { timeoutMs: 30 })
    ).rejects.toThrow(/timed out after 30ms/)
  })

  it("propagates a non-abort fetch failure unchanged", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network unreachable")) as unknown as typeof fetch

    const { nebiusChat } = await import("./nebius")
    await expect(nebiusChat([{ role: "user", content: "hi" }])).rejects.toThrow(/network unreachable/)
  })
})
