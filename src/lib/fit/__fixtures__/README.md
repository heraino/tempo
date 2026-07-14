# FIT Parser Regression Fixtures

Place the two real Garmin FIT files here:

- `2026-07-09-threshold.fit` — July 9 threshold session (6 × 3:00 threshold + 2:00 easy recovery)
- `2026-07-11-easy.fit` — July 11 easy aerobic session

These files are git-tracked as binary regression fixtures. They must never be altered.
The tests in `parser.regression.test.ts` assert known Garmin values against the output
of `parseFitBuffer()` and document any FIT/Garmin display rounding differences.

## Rounding conventions documented in the test file

| Metric | FIT raw unit | Parser output | Garmin app display | Expected delta |
|--------|-------------|---------------|--------------------|----------------|
| Distance | metres (float) | metres | km (1 dp) | ≤ 0.05 km |
| Timer time | seconds (float) | seconds | HH:MM:SS (truncated) | 0 s (exact) |
| Avg HR | bpm (int) | bpm (int) | bpm | 0 (exact) |
| Max HR | bpm (int) | bpm (int) | bpm | 0 (exact) |
| Cadence | spm (int, single-leg) | spm | spm | 0 (exact) |
| Ascent | metres (int) | metres | metres | 0 (exact) |
| Stride length | mm → m conversion | metres (float) | metres (2 dp) | ≤ 0.005 m |
| Vertical oscillation | mm (float) | mm | cm (1 dp) | ≤ 0.5 mm |
| Stance time | ms (float) | ms | ms (0 dp) | ≤ 0.5 ms |
| Vertical ratio | % (float) | % | % (1 dp) | ≤ 0.05 % |
