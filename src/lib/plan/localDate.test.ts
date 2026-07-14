import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { resolveLocalDate } from "./localDate"

describe("resolveLocalDate", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("returns UTC date when timezone is UTC", () => {
    vi.setSystemTime(new Date("2026-07-14T15:00:00.000Z"))
    expect(resolveLocalDate("UTC")).toBe("2026-07-14")
  })

  it("America/Los_Angeles Monday evening resolves to Monday even when UTC is already Tuesday", () => {
    // January → PST (UTC-8). 2026-01-13T06:00Z = 2026-01-12 22:00 PST (Monday).
    vi.setSystemTime(new Date("2026-01-13T06:00:00.000Z"))
    expect(resolveLocalDate("America/Los_Angeles")).toBe("2026-01-12")  // Monday local
    // Prove UTC would give Tuesday without the timezone resolver
    expect(new Date().toISOString().split("T")[0]).toBe("2026-01-13")   // Tuesday UTC
  })

  it("year boundary: LA 2025-12-31 at 11pm while UTC is already 2026-01-01", () => {
    // 2026-01-01T07:00Z = 2025-12-31 23:00 PST (UTC-8).
    vi.setSystemTime(new Date("2026-01-01T07:00:00.000Z"))
    expect(resolveLocalDate("America/Los_Angeles")).toBe("2025-12-31")
    expect(new Date().toISOString().split("T")[0]).toBe("2026-01-01")
  })

  it("forward-offset timezone (Asia/Tokyo UTC+9) can be a day ahead of UTC", () => {
    // 2026-07-14T16:00Z = 2026-07-15T01:00 JST (+9).
    vi.setSystemTime(new Date("2026-07-14T16:00:00.000Z"))
    expect(resolveLocalDate("Asia/Tokyo")).toBe("2026-07-15")
    expect(new Date().toISOString().split("T")[0]).toBe("2026-07-14")
  })

  it("empty timezone string falls back to UTC", () => {
    vi.setSystemTime(new Date("2026-07-14T12:00:00.000Z"))
    expect(resolveLocalDate("")).toBe("2026-07-14")
  })

  it("handles daylight saving transition correctly (spring forward, America/New_York)", () => {
    // US DST 2026 spring forward: 2026-03-08 at 02:00 → 03:00.
    // At 2026-03-08T06:30Z, New York is EDT (UTC-4) → 2026-03-08 02:30 local.
    vi.setSystemTime(new Date("2026-03-08T06:30:00.000Z"))
    expect(resolveLocalDate("America/New_York")).toBe("2026-03-08")
  })
})
