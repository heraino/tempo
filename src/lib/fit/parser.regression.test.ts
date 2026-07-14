/**
 * Parser regression tests against real Garmin FIT files.
 *
 * Fixture files live in ./__fixtures__/ and are git-tracked binary files.
 * See ./__fixtures__/README.md for rounding conventions.
 *
 * Tests are skipped automatically when a fixture file is absent so the CI
 * suite stays green until both files are committed. Once committed, the tests
 * become permanent regression guards — no tolerance relaxation without a
 * comment explaining why.
 */

import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { parseFitBuffer, PARSER_VERSION } from "./parser"

const FIXTURE_DIR = join(import.meta.dirname, "__fixtures__")

function loadFixture(name: string): Buffer | null {
  const p = join(FIXTURE_DIR, name)
  return existsSync(p) ? readFileSync(p) : null
}

// ─── July 9 — threshold session ───────────────────────────────────────────────
//
// Garmin Connect display values (source of truth):
//   Distance:           TODO km   (fill after running parse)
//   Timer time:         TODO      (HH:MM:SS)
//   Avg HR:             TODO bpm
//   Max HR:             TODO bpm
//   Avg cadence:        TODO spm
//   Total ascent:       TODO m
//   Stride length:      TODO m
//   Vertical osc:       TODO cm
//   Stance time:        TODO ms
//   Vertical ratio:     TODO %
//   Training load:      TODO
//   Aerobic TE:         TODO
//   Anaerobic TE:       TODO
//
// Replace each TODO with the real value from Garmin Connect, then remove
// this comment block. Keep the tolerance comments.

describe("parser regression — July 9 threshold (6×3:00 @ threshold)", () => {
  const buf = loadFixture("2026-07-09-threshold.fit")

  it.skipIf(!buf)("fixture file exists", () => {
    expect(buf).not.toBeNull()
  })

  it.skipIf(!buf)("parser version is stamped", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.parserVersion).toBe(PARSER_VERSION)
  })

  it.skipIf(!buf)("sport is running", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.sport?.toLowerCase()).toMatch(/running|run/)
  })

  it.skipIf(!buf)("start time is 2026-07-09", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.startTime.toISOString().startsWith("2026-07-09")).toBe(true)
  })

  it.skipIf(!buf)("distance within 50 m of Garmin display", async () => {
    // Garmin shows km rounded to 1 dp; ±50 m = ±0.05 km covers that rounding
    const result = await parseFitBuffer(buf!)
    const GARMIN_DISTANCE_M = 0 // TODO: replace with actual Garmin value × 1000
    expect(result.totalDistanceM).not.toBeNull()
    expect(Math.abs(result.totalDistanceM! - GARMIN_DISTANCE_M)).toBeLessThanOrEqual(50)
  })

  it.skipIf(!buf)("timer time matches Garmin display exactly", async () => {
    // FIT stores seconds as float; Garmin displays HH:MM:SS (truncates sub-seconds)
    const result = await parseFitBuffer(buf!)
    const GARMIN_TIMER_SECS = 0 // TODO: replace (e.g. 45*60 + 23 for 45:23)
    expect(result.totalTimerSecs).not.toBeNull()
    expect(Math.abs(result.totalTimerSecs! - GARMIN_TIMER_SECS)).toBeLessThanOrEqual(1)
  })

  it.skipIf(!buf)("avg HR matches Garmin exactly", async () => {
    const result = await parseFitBuffer(buf!)
    const GARMIN_AVG_HR = 0 // TODO: replace
    expect(result.avgHr).toBe(GARMIN_AVG_HR)
  })

  it.skipIf(!buf)("max HR matches Garmin exactly", async () => {
    const result = await parseFitBuffer(buf!)
    const GARMIN_MAX_HR = 0 // TODO: replace
    expect(result.maxHr).toBe(GARMIN_MAX_HR)
  })

  it.skipIf(!buf)("avg cadence matches Garmin exactly", async () => {
    // FIT cadence is steps-per-minute (single-leg); Garmin Connect displays spm
    const result = await parseFitBuffer(buf!)
    const GARMIN_AVG_CADENCE = 0 // TODO: replace
    expect(result.avgCadence).toBe(GARMIN_AVG_CADENCE)
  })

  it.skipIf(!buf)("total ascent matches Garmin exactly", async () => {
    const result = await parseFitBuffer(buf!)
    const GARMIN_ASCENT_M = 0 // TODO: replace
    expect(result.totalAscentM).toBe(GARMIN_ASCENT_M)
  })

  it.skipIf(!buf)("stride length within 5 mm of Garmin display", async () => {
    // Parser converts FIT mm → m; Garmin shows 2 dp, so ±0.005 m tolerance
    const result = await parseFitBuffer(buf!)
    const GARMIN_STRIDE_LENGTH_M = 0 // TODO: replace (e.g. 1.23)
    if (result.avgStrideLengthM != null) {
      expect(Math.abs(result.avgStrideLengthM - GARMIN_STRIDE_LENGTH_M)).toBeLessThanOrEqual(0.005)
    }
  })

  it.skipIf(!buf)("vertical oscillation within 0.5 mm of Garmin display", async () => {
    // Garmin Connect shows cm (1 dp) = ±5 mm display; we hold parser to 0.5 mm
    const result = await parseFitBuffer(buf!)
    const GARMIN_VERT_OSC_MM = 0 // TODO: replace (e.g. 87.5)
    if (result.avgVerticalOscillationMm != null) {
      expect(Math.abs(result.avgVerticalOscillationMm - GARMIN_VERT_OSC_MM)).toBeLessThanOrEqual(0.5)
    }
  })

  it.skipIf(!buf)("stance time within 0.5 ms of Garmin display", async () => {
    const result = await parseFitBuffer(buf!)
    const GARMIN_STANCE_TIME_MS = 0 // TODO: replace (e.g. 234.0)
    if (result.avgStanceTimeMs != null) {
      expect(Math.abs(result.avgStanceTimeMs - GARMIN_STANCE_TIME_MS)).toBeLessThanOrEqual(0.5)
    }
  })

  it.skipIf(!buf)("vertical ratio within 0.05% of Garmin display", async () => {
    const result = await parseFitBuffer(buf!)
    const GARMIN_VERTICAL_RATIO_PCT = 0 // TODO: replace (e.g. 7.3)
    if (result.avgVerticalRatio != null) {
      expect(Math.abs(result.avgVerticalRatio - GARMIN_VERTICAL_RATIO_PCT)).toBeLessThanOrEqual(0.05)
    }
  })

  it.skipIf(!buf)("sha256 is stable across re-parses (no mutation)", async () => {
    const r1 = await parseFitBuffer(buf!)
    const r2 = await parseFitBuffer(buf!)
    expect(r1.sha256).toBe(r2.sha256)
  })

  it.skipIf(!buf)("laps array is non-empty (structured session)", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.laps.length).toBeGreaterThan(0)
  })

  it.skipIf(!buf)("records array contains heart_rate data", async () => {
    const result = await parseFitBuffer(buf!)
    const hasHr = (result.records as Array<{ heart_rate?: number }>).some(
      (r) => typeof r.heart_rate === "number"
    )
    expect(hasHr).toBe(true)
  })
})

// ─── July 11 — easy aerobic session ──────────────────────────────────────────
//
// Garmin Connect display values (source of truth):
//   Distance:           TODO km
//   Timer time:         TODO      (HH:MM:SS)
//   Avg HR:             TODO bpm
//   Max HR:             TODO bpm
//   Avg cadence:        TODO spm
//   Total ascent:       TODO m
//   Stride length:      TODO m
//   Vertical osc:       TODO cm
//   Stance time:        TODO ms
//   Vertical ratio:     TODO %
//
// Replace each TODO, then remove this comment block.

describe("parser regression — July 11 easy aerobic", () => {
  const buf = loadFixture("2026-07-11-easy.fit")

  it.skipIf(!buf)("fixture file exists", () => {
    expect(buf).not.toBeNull()
  })

  it.skipIf(!buf)("parser version is stamped", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.parserVersion).toBe(PARSER_VERSION)
  })

  it.skipIf(!buf)("sport is running", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.sport?.toLowerCase()).toMatch(/running|run/)
  })

  it.skipIf(!buf)("start time is 2026-07-11", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.startTime.toISOString().startsWith("2026-07-11")).toBe(true)
  })

  it.skipIf(!buf)("distance within 50 m of Garmin display", async () => {
    const result = await parseFitBuffer(buf!)
    const GARMIN_DISTANCE_M = 0 // TODO: replace
    expect(result.totalDistanceM).not.toBeNull()
    expect(Math.abs(result.totalDistanceM! - GARMIN_DISTANCE_M)).toBeLessThanOrEqual(50)
  })

  it.skipIf(!buf)("timer time matches Garmin display exactly", async () => {
    const result = await parseFitBuffer(buf!)
    const GARMIN_TIMER_SECS = 0 // TODO: replace
    expect(result.totalTimerSecs).not.toBeNull()
    expect(Math.abs(result.totalTimerSecs! - GARMIN_TIMER_SECS)).toBeLessThanOrEqual(1)
  })

  it.skipIf(!buf)("avg HR matches Garmin exactly", async () => {
    const result = await parseFitBuffer(buf!)
    const GARMIN_AVG_HR = 0 // TODO: replace
    expect(result.avgHr).toBe(GARMIN_AVG_HR)
  })

  it.skipIf(!buf)("max HR matches Garmin exactly", async () => {
    const result = await parseFitBuffer(buf!)
    const GARMIN_MAX_HR = 0 // TODO: replace
    expect(result.maxHr).toBe(GARMIN_MAX_HR)
  })

  it.skipIf(!buf)("avg cadence matches Garmin exactly", async () => {
    const result = await parseFitBuffer(buf!)
    const GARMIN_AVG_CADENCE = 0 // TODO: replace
    expect(result.avgCadence).toBe(GARMIN_AVG_CADENCE)
  })

  it.skipIf(!buf)("total ascent matches Garmin exactly", async () => {
    const result = await parseFitBuffer(buf!)
    const GARMIN_ASCENT_M = 0 // TODO: replace
    expect(result.totalAscentM).toBe(GARMIN_ASCENT_M)
  })

  it.skipIf(!buf)("stride length within 5 mm of Garmin display", async () => {
    const result = await parseFitBuffer(buf!)
    const GARMIN_STRIDE_LENGTH_M = 0 // TODO: replace
    if (result.avgStrideLengthM != null) {
      expect(Math.abs(result.avgStrideLengthM - GARMIN_STRIDE_LENGTH_M)).toBeLessThanOrEqual(0.005)
    }
  })

  it.skipIf(!buf)("vertical oscillation within 0.5 mm of Garmin display", async () => {
    const result = await parseFitBuffer(buf!)
    const GARMIN_VERT_OSC_MM = 0 // TODO: replace
    if (result.avgVerticalOscillationMm != null) {
      expect(Math.abs(result.avgVerticalOscillationMm - GARMIN_VERT_OSC_MM)).toBeLessThanOrEqual(0.5)
    }
  })

  it.skipIf(!buf)("stance time within 0.5 ms of Garmin display", async () => {
    const result = await parseFitBuffer(buf!)
    const GARMIN_STANCE_TIME_MS = 0 // TODO: replace
    if (result.avgStanceTimeMs != null) {
      expect(Math.abs(result.avgStanceTimeMs - GARMIN_STANCE_TIME_MS)).toBeLessThanOrEqual(0.5)
    }
  })

  it.skipIf(!buf)("vertical ratio within 0.05% of Garmin display", async () => {
    const result = await parseFitBuffer(buf!)
    const GARMIN_VERTICAL_RATIO_PCT = 0 // TODO: replace
    if (result.avgVerticalRatio != null) {
      expect(Math.abs(result.avgVerticalRatio - GARMIN_VERTICAL_RATIO_PCT)).toBeLessThanOrEqual(0.05)
    }
  })

  it.skipIf(!buf)("sha256 is stable across re-parses", async () => {
    const r1 = await parseFitBuffer(buf!)
    const r2 = await parseFitBuffer(buf!)
    expect(r1.sha256).toBe(r2.sha256)
  })

  it.skipIf(!buf)("easy run has lower avg HR than threshold run", async () => {
    const thresholdBuf = loadFixture("2026-07-09-threshold.fit")
    if (!thresholdBuf) return
    const easy = await parseFitBuffer(buf!)
    const threshold = await parseFitBuffer(thresholdBuf)
    // Easy aerobic should have materially lower average HR than a threshold session
    expect(easy.avgHr).not.toBeNull()
    expect(threshold.avgHr).not.toBeNull()
    expect(easy.avgHr!).toBeLessThan(threshold.avgHr!)
  })

  it.skipIf(!buf)("sha256 differs from July 9 threshold file", async () => {
    const thresholdBuf = loadFixture("2026-07-09-threshold.fit")
    if (!thresholdBuf) return
    const easy = await parseFitBuffer(buf!)
    const threshold = await parseFitBuffer(thresholdBuf)
    expect(easy.sha256).not.toBe(threshold.sha256)
  })
})
