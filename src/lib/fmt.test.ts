import { describe, it, expect } from "vitest"
import { fmtPace, fmtDistance, fmtDuration, fmtTemp, fmtNum } from "./fmt"

describe("fmtPace", () => {
  it("returns — for null", () => {
    expect(fmtPace(null)).toBe("—")
  })

  it("returns — for undefined", () => {
    expect(fmtPace(undefined)).toBe("—")
  })

  it("returns — for zero speed", () => {
    expect(fmtPace(0)).toBe("—")
  })

  it("formats a typical easy run pace correctly", () => {
    // 3.35 m/s ≈ 8:02 /mi
    const result = fmtPace(3.35)
    expect(result).toMatch(/^\d+:\d{2} \/mi$/)
  })

  it("formats a fast race pace", () => {
    // 5.0 m/s ≈ 5:22 /mi
    const result = fmtPace(5.0)
    expect(result).toMatch(/^\d+:\d{2} \/mi$/)
  })
})

describe("fmtDistance", () => {
  it("returns — for null", () => {
    expect(fmtDistance(null)).toBe("—")
  })

  it("returns — for undefined", () => {
    expect(fmtDistance(undefined)).toBe("—")
  })

  it("formats zero correctly", () => {
    expect(fmtDistance(0)).toBe("0.00 mi")
  })

  it("formats a 5K in miles", () => {
    // 5000m ≈ 3.11 mi
    expect(fmtDistance(5000)).toBe("3.11 mi")
  })

  it("formats a marathon distance", () => {
    // 42195m ≈ 26.22 mi
    expect(fmtDistance(42195)).toBe("26.22 mi")
  })
})

describe("fmtDuration", () => {
  it("returns — for null", () => {
    expect(fmtDuration(null)).toBe("—")
  })

  it("returns — for undefined", () => {
    expect(fmtDuration(undefined)).toBe("—")
  })

  it("formats sub-hour duration as mm:ss", () => {
    expect(fmtDuration(300)).toBe("5:00")
    expect(fmtDuration(3599)).toBe("59:59")
  })

  it("formats zero as 0:00", () => {
    expect(fmtDuration(0)).toBe("0:00")
  })

  it("formats hour+ durations as h:mm:ss", () => {
    expect(fmtDuration(3600)).toBe("1:00:00")
    expect(fmtDuration(7261)).toBe("2:01:01")
  })
})

describe("fmtTemp", () => {
  it("returns — for null", () => {
    expect(fmtTemp(null)).toBe("—")
  })

  it("returns — for undefined", () => {
    expect(fmtTemp(undefined)).toBe("—")
  })

  it("rounds and appends °C", () => {
    expect(fmtTemp(20.7)).toBe("21°C")
    expect(fmtTemp(-5.2)).toBe("-5°C")
    expect(fmtTemp(0)).toBe("0°C")
  })
})

describe("fmtNum", () => {
  it("returns — for null", () => {
    expect(fmtNum(null)).toBe("—")
  })

  it("returns — for undefined", () => {
    expect(fmtNum(undefined)).toBe("—")
  })

  it("formats with default 1 decimal place", () => {
    expect(fmtNum(42)).toBe("42.0")
  })

  it("formats with custom decimal places", () => {
    expect(fmtNum(3.14159, 2)).toBe("3.14")
    expect(fmtNum(100, 0)).toBe("100")
  })

  it("appends unit when provided", () => {
    expect(fmtNum(75, 1, "bpm")).toBe("75.0 bpm")
  })
})
