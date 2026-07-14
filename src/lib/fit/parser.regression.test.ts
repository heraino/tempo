/**
 * Parser regression tests against real Garmin FIT files.
 *
 * Fixture files in ./__fixtures__/ are git-tracked binary files.
 * See ./__fixtures__/README.md for full rounding-tolerance table.
 *
 * Rounding notes (FIT → Garmin Connect display):
 *   Distance:   parser returns raw metres; Garmin rounds to 1 dp km (±50 m)
 *   Timer time: FIT stores float seconds; Garmin displays HH:MM:SS (floor-to-second)
 *   Avg/Max HR: integer in FIT, exact match expected
 *   Cadence:    FIT stores single-leg steps/min; Garmin Connect doubles for display
 *               (e.g. FIT 73 → Garmin shows 146 spm). Parser returns raw FIT value.
 *   Elevation:  FIT integer metres, exact match expected
 *   Vert osc:   FIT float mm; Garmin shows cm (1 dp). Tolerance ≤ 0.5 mm
 *   Stance:     FIT float ms; Garmin shows ms (0 dp). Tolerance ≤ 0.5 ms
 *   Vert ratio: FIT float %; Garmin shows % (1 dp). Tolerance ≤ 0.05 %
 *   Stride len: FIT avg_step_length in mm ÷ 1000 → m. Garmin shows m (2 dp). ≤ 0.005 m
 *
 * Start-time note: the FIT start_time is UTC. Local athlete timezone is PDT (UTC-7),
 * so both UTC dates are one day ahead of the colloquial workout date.
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

// ─── July 9 threshold (6 × 3:00 @ threshold + 2:00 easy recovery) ────────────
//
// Garmin Connect values cross-referenced below.
// UTC start: 2026-07-10T03:00:02Z = July 9 20:00 PDT (athlete local date)
//
// Garmin Connect display:
//   Distance:    6.8 km  (parser: 6757.91 m — rounds up at .76 → .8)
//   Duration:    48:07   (parser: 2887.86 s; Garmin floors to 2887 s = 48:07)
//   Avg HR:      147 bpm (exact)
//   Max HR:      175 bpm (exact)
//   Cadence:     146 spm (Garmin doubles; parser raw = 73)
//   Ascent:      10 m    (exact)
//   Vert osc:    9.2 cm  (= 92 mm; parser: 92.2 mm)
//   Stance time: 270 ms  (parser: 269.8 ms)
//   Vert ratio:  9.7 %   (parser: 9.71 %)
//   Stride len:  0.94 m  (parser: 0.9371 m → Garmin rounds to 2 dp)

describe("parser regression — July 9 threshold (6×3:00)", () => {
  const buf = loadFixture("2026-07-09-threshold.fit")

  it("fixture file exists and is not empty", () => {
    expect(buf).not.toBeNull()
    expect(buf!.length).toBeGreaterThan(0)
  })

  it("sha256 is stable across re-parses", async () => {
    const r1 = await parseFitBuffer(buf!)
    const r2 = await parseFitBuffer(buf!)
    // Ensures parseFitBuffer does not mutate the buffer
    expect(r1.sha256).toBe(r2.sha256)
    expect(r1.sha256).toBe(
      "9458710e9544d20f0dbaf59b71ef1f1dab98474eede78624b42c36413a5d1dc6"
    )
  })

  it("parser version is stamped", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.parserVersion).toBe(PARSER_VERSION)
  })

  it("sport is running", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.sport?.toLowerCase()).toBe("running")
  })

  it("UTC start time is 2026-07-10 (= July 9 PDT, athlete local date)", async () => {
    // FIT start_time is UTC. July 9 20:00 PDT = July 10 03:00 UTC.
    const result = await parseFitBuffer(buf!)
    expect(result.startTime.toISOString()).toBe("2026-07-10T03:00:02.000Z")
  })

  it("distance within 50 m of Garmin display (Garmin shows 6.8 km)", async () => {
    // 6.76 km rounds to 6.8 km at 1 dp → 6800 m. Parser: 6757.91 m → delta 42 m < 50 m.
    const result = await parseFitBuffer(buf!)
    expect(result.totalDistanceM).toBeCloseTo(6757.91, 1)
    expect(Math.abs(result.totalDistanceM! - 6800)).toBeLessThanOrEqual(50)
  })

  it("timer time within 1 s of Garmin display (Garmin shows 48:07 = 2887 s)", async () => {
    // FIT: 2887.859 s. Garmin floors to nearest second: 2887 s.
    const result = await parseFitBuffer(buf!)
    expect(result.totalTimerSecs).toBeCloseTo(2887.859, 0)
    expect(Math.abs(result.totalTimerSecs! - 2887)).toBeLessThanOrEqual(1)
  })

  it("avg HR matches Garmin exactly: 147 bpm", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.avgHr).toBe(147)
  })

  it("max HR matches Garmin exactly: 175 bpm", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.maxHr).toBe(175)
  })

  it("avg cadence raw FIT value is 73 (Garmin displays 146 spm doubled)", async () => {
    // FIT avg_cadence stores single-leg steps/min. Garmin Connect doubles for display.
    // We store and assert the raw FIT value.
    const result = await parseFitBuffer(buf!)
    expect(result.avgCadence).toBe(73)
  })

  it("total ascent matches Garmin exactly: 10 m", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.totalAscentM).toBe(10)
  })

  it("vertical oscillation within 0.5 mm of Garmin display (Garmin shows 9.2 cm = 92 mm)", async () => {
    // FIT: 92.2 mm. Garmin shows 9.2 cm → 92 mm. Delta: 0.2 mm < 0.5 mm.
    const result = await parseFitBuffer(buf!)
    expect(result.avgVerticalOscillationMm).not.toBeNull()
    expect(Math.abs(result.avgVerticalOscillationMm! - 92.2)).toBeLessThanOrEqual(0.5)
  })

  it("stance time within 0.5 ms of Garmin display (Garmin shows 270 ms)", async () => {
    // FIT: 269.8 ms. Garmin rounds to 270 ms. Delta: 0.2 ms < 0.5 ms.
    const result = await parseFitBuffer(buf!)
    expect(result.avgStanceTimeMs).not.toBeNull()
    expect(Math.abs(result.avgStanceTimeMs! - 269.8)).toBeLessThanOrEqual(0.5)
  })

  it("vertical ratio within 0.05% of Garmin display (Garmin shows 9.7%)", async () => {
    // FIT: 9.71%. Garmin shows 9.7% (1 dp). Delta: 0.01% < 0.05%.
    const result = await parseFitBuffer(buf!)
    expect(result.avgVerticalRatio).not.toBeNull()
    expect(Math.abs(result.avgVerticalRatio! - 9.71)).toBeLessThanOrEqual(0.05)
  })

  it("stride length within 5 mm of Garmin display (Garmin shows 0.94 m)", async () => {
    // FIT avg_step_length: 937.1 mm ÷ 1000 = 0.9371 m. Garmin shows 0.94 m (2 dp rounds up).
    // Delta: |0.9371 - 0.94| = 0.0029 m < 0.005 m.
    const result = await parseFitBuffer(buf!)
    expect(result.avgStrideLengthM).not.toBeNull()
    expect(Math.abs(result.avgStrideLengthM! - 0.9371)).toBeLessThanOrEqual(0.005)
  })

  it("aerobic training effect is 3.6", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.aerobicTrainingEffect).toBeCloseTo(3.6, 1)
  })

  it("anaerobic training effect is 0.9 (non-zero — confirms threshold intensity)", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.anaerobicTrainingEffect).toBeCloseTo(0.9, 1)
  })

  it("structured session has 14 laps", async () => {
    // 14 laps = warmup + 6 threshold + 6 recovery + cooldown
    const result = await parseFitBuffer(buf!)
    expect(result.laps).toHaveLength(14)
  })

  it("records contain heart rate data throughout", async () => {
    const result = await parseFitBuffer(buf!)
    const withHr = (result.records as Array<{ heart_rate?: number }>).filter(
      (r) => typeof r.heart_rate === "number"
    )
    // Threshold session should have HR data for the vast majority of records
    expect(withHr.length).toBeGreaterThan(result.records.length * 0.9)
  })
})

// ─── July 11 easy aerobic ─────────────────────────────────────────────────────
//
// UTC start: 2026-07-12T05:39:36Z = July 11 22:39 PDT (athlete local date)
//
// Garmin Connect display:
//   Distance:    6.3 km  (parser: 6284.47 m → 6.3 km at 1 dp)
//   Duration:    45:01   (parser: 2701.741 s; Garmin floors = 2701 s = 45:01)
//   Avg HR:      143 bpm (exact)
//   Max HR:      154 bpm (exact)
//   Cadence:     164 spm (Garmin doubles; parser raw = 82)
//   Ascent:      61 m    (exact)
//   Vert osc:    9.7 cm  (= 97 mm; parser: 97.4 mm)
//   Stance time: 248 ms  (parser: 248.4 ms)
//   Vert ratio:  11.3 %  (parser: 11.32 %)
//   Stride len:  0.85 m  (parser: 0.8505 m)

describe("parser regression — July 11 easy aerobic", () => {
  const buf = loadFixture("2026-07-11-easy.fit")

  it("fixture file exists and is not empty", () => {
    expect(buf).not.toBeNull()
    expect(buf!.length).toBeGreaterThan(0)
  })

  it("sha256 is stable across re-parses", async () => {
    const r1 = await parseFitBuffer(buf!)
    const r2 = await parseFitBuffer(buf!)
    expect(r1.sha256).toBe(r2.sha256)
    expect(r1.sha256).toBe(
      "1de47455208fe8afd3d7cd29fcfc1dc8852721456f6308a14961ec798230e223"
    )
  })

  it("parser version is stamped", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.parserVersion).toBe(PARSER_VERSION)
  })

  it("sport is running", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.sport?.toLowerCase()).toBe("running")
  })

  it("UTC start time is 2026-07-12 (= July 11 PDT, athlete local date)", async () => {
    // FIT start_time is UTC. July 11 22:39 PDT = July 12 05:39 UTC.
    const result = await parseFitBuffer(buf!)
    expect(result.startTime.toISOString()).toBe("2026-07-12T05:39:36.000Z")
  })

  it("distance within 50 m of Garmin display (Garmin shows 6.3 km)", async () => {
    // 6284.47 m = 6.284 km → rounds to 6.3 km at 1 dp. Delta from 6300: 15.5 m < 50 m.
    const result = await parseFitBuffer(buf!)
    expect(result.totalDistanceM).toBeCloseTo(6284.47, 1)
    expect(Math.abs(result.totalDistanceM! - 6300)).toBeLessThanOrEqual(50)
  })

  it("timer time within 1 s of Garmin display (Garmin shows 45:01 = 2701 s)", async () => {
    // FIT: 2701.741 s. Garmin floors to 2701 s = 45:01.
    const result = await parseFitBuffer(buf!)
    expect(result.totalTimerSecs).toBeCloseTo(2701.741, 0)
    expect(Math.abs(result.totalTimerSecs! - 2701)).toBeLessThanOrEqual(1)
  })

  it("avg HR matches Garmin exactly: 143 bpm", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.avgHr).toBe(143)
  })

  it("max HR matches Garmin exactly: 154 bpm", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.maxHr).toBe(154)
  })

  it("avg cadence raw FIT value is 82 (Garmin displays 164 spm doubled)", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.avgCadence).toBe(82)
  })

  it("total ascent matches Garmin exactly: 61 m", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.totalAscentM).toBe(61)
  })

  it("vertical oscillation within 0.5 mm of Garmin display (Garmin shows 9.7 cm = 97 mm)", async () => {
    // FIT: 97.4 mm. Garmin shows 9.7 cm → 97 mm. Delta: 0.4 mm < 0.5 mm.
    const result = await parseFitBuffer(buf!)
    expect(result.avgVerticalOscillationMm).not.toBeNull()
    expect(Math.abs(result.avgVerticalOscillationMm! - 97.4)).toBeLessThanOrEqual(0.5)
  })

  it("stance time within 0.5 ms of Garmin display (Garmin shows 248 ms)", async () => {
    // FIT: 248.4 ms. Garmin shows 248 ms (floor). Delta: 0.4 ms < 0.5 ms.
    const result = await parseFitBuffer(buf!)
    expect(result.avgStanceTimeMs).not.toBeNull()
    expect(Math.abs(result.avgStanceTimeMs! - 248.4)).toBeLessThanOrEqual(0.5)
  })

  it("vertical ratio within 0.05% of Garmin display (Garmin shows 11.3%)", async () => {
    // FIT: 11.32%. Garmin shows 11.3% (1 dp). Delta: 0.02% < 0.05%.
    const result = await parseFitBuffer(buf!)
    expect(result.avgVerticalRatio).not.toBeNull()
    expect(Math.abs(result.avgVerticalRatio! - 11.32)).toBeLessThanOrEqual(0.05)
  })

  it("stride length within 5 mm of Garmin display (Garmin shows 0.85 m)", async () => {
    // FIT avg_step_length: 850.5 mm ÷ 1000 = 0.8505 m. Garmin shows 0.85 m.
    // Delta: |0.8505 - 0.85| = 0.0005 m < 0.005 m.
    const result = await parseFitBuffer(buf!)
    expect(result.avgStrideLengthM).not.toBeNull()
    expect(Math.abs(result.avgStrideLengthM! - 0.8505)).toBeLessThanOrEqual(0.005)
  })

  it("aerobic training effect is 3.0", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.aerobicTrainingEffect).toBeCloseTo(3.0, 1)
  })

  it("anaerobic training effect is 0 (confirms aerobic-only intensity)", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.anaerobicTrainingEffect).toBe(0)
  })

  it("easy run has 4 laps (continuous, not interval-structured)", async () => {
    const result = await parseFitBuffer(buf!)
    expect(result.laps).toHaveLength(4)
  })

  it("records contain heart rate data throughout", async () => {
    const result = await parseFitBuffer(buf!)
    const withHr = (result.records as Array<{ heart_rate?: number }>).filter(
      (r) => typeof r.heart_rate === "number"
    )
    expect(withHr.length).toBeGreaterThan(result.records.length * 0.9)
  })
})

// ─── Cross-file assertions ─────────────────────────────────────────────────────

describe("parser regression — cross-file consistency", () => {
  const thresholdBuf = loadFixture("2026-07-09-threshold.fit")
  const easyBuf = loadFixture("2026-07-11-easy.fit")

  it("sha256 values are distinct (different files produce different hashes)", async () => {
    const t = await parseFitBuffer(thresholdBuf!)
    const e = await parseFitBuffer(easyBuf!)
    expect(t.sha256).not.toBe(e.sha256)
  })

  it("easy run has lower avg HR than threshold session (143 < 147)", async () => {
    const t = await parseFitBuffer(thresholdBuf!)
    const e = await parseFitBuffer(easyBuf!)
    expect(e.avgHr!).toBeLessThan(t.avgHr!)
  })

  it("easy run has lower max HR than threshold session (154 < 175)", async () => {
    const t = await parseFitBuffer(thresholdBuf!)
    const e = await parseFitBuffer(easyBuf!)
    expect(e.maxHr!).toBeLessThan(t.maxHr!)
  })

  it("threshold anaerobic TE is higher than easy (0.9 > 0)", async () => {
    const t = await parseFitBuffer(thresholdBuf!)
    const e = await parseFitBuffer(easyBuf!)
    expect(t.anaerobicTrainingEffect!).toBeGreaterThan(e.anaerobicTrainingEffect!)
  })

  it("threshold session has more laps than easy (14 > 4 — interval structure vs continuous)", async () => {
    const t = await parseFitBuffer(thresholdBuf!)
    const e = await parseFitBuffer(easyBuf!)
    expect(t.laps.length).toBeGreaterThan(e.laps.length)
  })
})
