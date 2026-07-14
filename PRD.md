# 7:20 — AI Running Coach
## Product Requirements Document

**Version:** 1.1  
**Status:** Implementation-ready  
**Primary goal:** Build a durable, evidence-driven AI running coach supporting a multi-year progression toward a 7:20/mile half marathon.

## Chosen stack

- Next.js 16
- Auth.js v5 with email magic links
- Neon Postgres
- Vercel
- Nebius AI API
- TypeScript strict mode
- Drizzle ORM recommended
- Zod for validation
- Recharts for charts
- Vercel Blob or S3-compatible object storage for FIT files
- Vercel Cron plus a database-backed jobs table for MVP background processing

## Existing app state

The application already has a deployed barebones harness with:

- working Next.js front end;
- working Auth.js v5 email-link authentication;
- working Neon database;
- working Vercel deployment.

The implementation must extend this app rather than replace it.

## Product promise

> Every workout is preserved, analyzed consistently, compared with relevant historical workouts, and used to update training state without losing context.

The mandatory coaching pattern is:

> **DATA → COACH INTERPRETATION → DECISION**

The LLM is the interpretation layer. It is not the database, FIT parser, canonical metric engine, or training-state engine.

## Product goals

1. Preserve immutable raw workout files.
2. Parse Garmin FIT files and ZIPs containing FIT files.
3. Maintain normalized activity, lap, segment, and record data.
4. Capture athlete context in under 20 seconds.
5. Compute aerobic efficiency, interval execution, running economy, and mechanical drift deterministically.
6. Maintain exact plan state: block, A/B/C/D week, mileage band, long-run index, missed and rescheduled workouts.
7. Select historical comparators before any LLM call.
8. Use Nebius to generate grounded coaching interpretations and decisions.
9. Persist all analyses with provider, model, prompt, context, and analytics version metadata.
10. Allow the athlete to edit the weekly schedule and allow the app to propose or apply permitted schedule adjustments, with all material changes versioned and auditable.
11. Export the training database and journal.
12. Persist pain and fatigue flags across sessions.

## Non-goals for MVP

- Replacing Garmin as the recording device.
- Live GPS or real-time voice coaching.
- Medical diagnosis.
- Replicating Strava.
- Supporting every sport equally.
- Allowing the LLM to calculate canonical pace, interval count, elevation, or decoupling.
- Making unlogged structural plan changes.

## Product principles

### Raw data is immutable
Original FIT files remain unchanged. Derived outputs can be recomputed.

### Never infer when data exists
If FIT contains a metric, or code can calculate it, use that value.

### Separate facts from interpretation
Persist and present:
1. measured data;
2. deterministic derived metrics;
3. athlete-reported context;
4. coaching interpretation;
5. coaching decision.

### Compare like with like
Match workout type, structure, duration, temperature, terrain, treadmill/outdoor, and continuous/run-walk execution.

### Environment matters
Do not interpret raw pace without available temperature and elevation context.

### Plan state is deterministic
The application, not conversation memory, owns current block, week, mileage band, planned workout, and progression state.

### The schedule is editable, not hard-coded
The seed weekly schedule is the initial default, not a permanent product assumption. The athlete must be able to edit recurring weekly structure, move workout types between days, change run frequency, define rest days, and update workout prescriptions. The scheduling engine must generate future planned workouts from the active plan version rather than from hard-coded weekday logic.

### The app may adjust the schedule
The app may make context-aware day-level adjustments such as rescheduling, shortening, substituting, or removing a workout because of pain, fatigue, travel, missed sessions, recovery, or calendar disruption. Material structural changes to the recurring weekly template or rotation require an explicit plan proposal and athlete acceptance by default. All adjustments must be traceable to a rule or coaching decision.

### Plan changes are versioned
Every structural change records effective date, author, reason, evidence, and prior version. Athlete edits create a new plan version. App-proposed structural changes create a proposal that becomes a new plan version when accepted. Day-level schedule adjustments preserve the governing plan version and create an auditable workout adjustment record unless they intentionally change the recurring structure.

### Conservative pain management
The app can manage training load but cannot diagnose injury.

## Seed governing plan

The following plan is seed data for the initial athlete. It must not be implemented as hard-coded scheduling logic. The athlete can edit it in the product, and the coaching system can propose changes based on training evidence. Future users may have different weekly schedules, rotations, run frequencies, strength days, and progression rules.

### Weekly schedule

| Day | Workout |
|---|---|
| Monday | Easy aerobic + elastic |
| Tuesday | Recovery run + Pull strength |
| Wednesday | Quality |
| Thursday | Push strength |
| Friday | Full rest |
| Saturday | Rotation workout |
| Sunday | Long run |

### Week A — Threshold
- Wed: 6 × 3:00 threshold, 2:00 easy recovery.
- Sat: 40–45 min easy + 4–6 × 20 sec strides.
- Sun: long run.

### Week B — Tempo
- Wed: 10–12 min warm-up + 20 min continuous tempo + 10 min cooldown.
- Sat: 45–50 min progression.
- Sun: long run.

### Week C — Progression
- Wed: 45–50 min progression.
- Sat: 40–45 min easy aerobic.
- Sun: long run.

### Week D — Cutback
- Four runs instead of five.
- No formal quality workout.
- Tuesday recovery run removed.
- Strength reduced about 20%.
- Cutback long run.

### Mileage progression

| Block | Build weeks | Cutback |
|---|---:|---:|
| 1 | 20–22 mi | 15–17 mi |
| 2 | 22–24 mi | 17–19 mi |
| 3 | 24–26 mi | 19–21 mi |
| 4 | 26–28 mi | 20–22 mi |

Each block follows A → B → C → D.

### Long-run progression

- 8.5 → 9.0 → 9.0 → 6.5
- 9.0 → 9.5 → 9.5 → 7.0
- 9.5 → 10.0 → 10.0 → 7.5


## Editable Schedule and Plan Management

### Athlete editing requirements

The athlete must be able to edit the active training structure through the UI. Editable elements include:

- workout assigned to each weekday;
- number of running days per week;
- rest days;
- strength and elastic-work days;
- weekly rotation length and labels;
- workout prescriptions and targets;
- mileage bands;
- long-run progression sequences;
- cutback frequency and rules;
- effective date of a change.

The editing experience should support both a simple weekly schedule editor and advanced plan details. A user should be able to drag or select a workout for a different day without editing JSON.

Saving an athlete-authored recurring schedule change creates a new `training_plan_version`. The app must show a concise diff before activation, for example:

```text
Tuesday: Recovery Run + Pull → Pull only
Thursday: Push → Recovery Run + Push
Runs/week: 5 → 5
Effective: 2026-08-03
```

### App adjustment requirements

The application can make two classes of adjustment:

**1. Day-level adjustment**

Examples:
- move Wednesday quality to Thursday after a missed workout;
- remove strides because of a yellow pain flag;
- shorten an 8.5-mile long run to 6.5 miles because of recovery signals;
- replace a quality workout with easy running during travel.

These changes do not necessarily create a new recurring plan version. They create a `planned_workout_adjustment` linked to the original planned workout, with source, reason, evidence, and resulting prescription. The athlete must be able to see that the workout was modified and why.

**2. Structural plan adjustment**

Examples:
- add a fifth weekly run;
- permanently move quality day from Wednesday to Tuesday;
- change the rotation from A/B/C/D to another cycle;
- alter mileage bands or long-run progression;
- change cutback frequency.

These changes create a plan-change proposal. By default the athlete must accept the proposal before it becomes active. Acceptance creates a new `training_plan_version`. The system must preserve the prior plan and effective dates.

### Scheduling engine requirement

Future planned workouts must be generated from the active plan version's structured schedule template and rotation definition. Do not use code such as `if Wednesday then quality`. Weekday behavior must come from plan data.

### Conflict behavior

When an athlete directly edits a schedule while an app proposal is pending:

1. Athlete-authored edits take precedence.
2. Pending proposals are re-evaluated against the new version.
3. Stale proposals are marked superseded rather than silently applied.


## Core user journeys

### Post-run
1. FIT file is uploaded or automatically ingested.
2. Original file is stored.
3. Parser normalizes session, laps, records, and workout steps.
4. Athlete supplies feel, temperature, pain, and notes.
5. Deterministic analytics run.
6. Comparator service selects relevant historical workouts.
7. Nebius receives a structured evidence package.
8. The JSON response is schema validated.
9. Analysis, decision, flags, and journal entry are persisted.
10. Training state changes only through deterministic services.

### What is my workout today?
The app reads athlete timezone, active plan version and editable schedule template, current rotation state, completed/missed/rescheduled workouts, progression state, recent load, and active flags. It returns the exact prescription and explains any modification. No weekday workout assignment may be assumed outside the active plan data.

### Edit my weekly schedule
The athlete opens the plan editor, changes one or more recurring schedule elements, reviews a human-readable diff, chooses an effective date, and saves. The app creates and activates a new plan version and regenerates future planned workouts from the effective date. Historical workouts and prior plan versions remain unchanged.

### App adjusts my schedule
A daily recommendation or coaching decision can produce a day-level workout adjustment automatically when permitted by adjustment policy. Structural changes are surfaced as plan proposals for athlete review and acceptance.

### Workout comparison
The app computes deltas against valid comparable workouts and sends the comparison package to Nebius for interpretation.

### Weekly review
Generate planned versus completed, mileage, target band, week-over-week change, build/cutback compliance, quality and long-run results, efficiency trends, flags, and advance/hold/reduce recommendation.

## FIT ingestion requirements

MVP accepts `.fit` and `.zip` containing one FIT file.

For each input:
- validate file;
- safely extract ZIP;
- compute SHA-256;
- reject exact duplicates;
- detect likely duplicate activities;
- store original file;
- preserve Garmin activity ID;
- record parser version and errors;
- allow reprocessing.

## FIT data extraction

Extract all available session fields, including:
- timestamps;
- sport/subsport;
- timer, elapsed, moving time;
- distance and speed;
- HR;
- elevation gain/loss;
- cadence;
- power;
- stride length;
- ground contact time/balance;
- vertical oscillation/ratio;
- respiration;
- training effect/load;
- stamina;
- performance condition;
- temperature;
- GPS bounds and device/activity IDs.

Retain record-level time series and lap/workout-step records.

## Athlete context

Capture:
- feel;
- optional RPE;
- start/end outside temperature;
- optional humidity;
- pain location, side, walking/running scores, character, gait change;
- sleep, travel, massage, illness, nutrition notes;
- free text.

The LLM may structure free text, but the athlete can correct extracted fields.

## Workout classification

Preserve both:
- `planned_workout_type`
- `observed_workout_type`

Supported types include easy, recovery, long, threshold, tempo, progression, easy+strides, race, run-walk, treadmill, fartlek, walk, strength, elastic, and other.

A planned easy+strides workout with no detected strides must be stored as planned `easy+strides`, observed `easy`.

## Deterministic analytics

### Aerobic efficiency
For eligible continuous runs calculate:
- speed/HR;
- power/HR;
- first-half versus second-half HR, speed, and power;
- Pa:HR;
- speed:HR and power:HR decoupling;
- HR and pace drift;
- efficiency by quartile;
- confidence and eligibility metadata.

### Threshold
Calculate:
- interval count and boundaries;
- work/recovery duration;
- pace, HR, cadence, power, stride, GCT, vertical ratio by rep;
- stabilized metrics;
- HR recovery;
- pace/power variability;
- late-rep mechanical drift;
- pace at or near LTHR.

Support versioned exclusion of the first 30–60 seconds for HR-lag mitigation.

### Tempo, progression, and long run
Implement workout-specific segment, drift, stability, and durability analytics.

### Running economy
Evaluate the interaction of pace/GAP, HR, power, cadence, stride length, GCT, vertical oscillation, and vertical ratio. Do not create an opaque composite score in MVP.

### Environment
Store reported and device temperature, ascent/descent, grade, and route profile. Prefer athlete-reported outside temperature for interpretation when device temperature is body-influenced.

## Historical comparator engine

Selection factors:
- workout type;
- structure;
- duration;
- distance;
- ascent per mile;
- temperature;
- treadmill/outdoor;
- continuous/run-walk;
- phase;
- recency.

Comparator selection and metric deltas are deterministic. Nebius interprets the package.

## Training state engine

Persist:
- active plan version;
- block;
- mileage band;
- A/B/C/D week;
- week dates;
- today's planned workout;
- last completed workout;
- missed and rescheduled workouts;
- long-run and threshold progression indexes;
- HR targets and LTHR;
- VO2max trend;
- pain/fatigue flags;
- next checkpoint.

## Nebius LLM layer

The LLM is responsible for interpretation, explanation, pattern recognition, coaching decisions, and proposed plan changes.

It is not responsible for FIT parsing, canonical calculations, interval counting, current-week determination, or database state.

Required post-workout context:
1. athlete profile;
2. goal;
3. current training state;
4. planned and observed workout;
5. deterministic metrics;
6. analytics and confidence;
7. athlete context;
8. historical comparators;
9. last 7–14 days;
10. active flags;
11. coaching rules;
12. output schema.

Required response sections:
- headline;
- data summary;
- coach interpretation;
- decision;
- grade;
- flags;
- follow-up questions.

Hard rules:
- never invent metrics;
- state unavailable data;
- treat supplied training state as authoritative;
- never silently change plan state;
- account for environment;
- compare like with like;
- do not diagnose injury;
- state uncertainty;
- keep the 7:20 goal central.

## Pain flags

- Green: 0–1/10, stable, no gait change.
- Yellow: about 2–3/10 localized ache/tenderness, no gait change.
- Orange: persistent/worsening or about 4–5/10.
- Red: sharp/radiating pain, weakness, altered gait, or serious systemic symptoms.

These are training-management flags, not diagnoses.

## Dashboard

Show:
- today’s workout;
- current block/week;
- weekly mileage versus target;
- long-run progression position;
- latest workout and decision;
- active flags;
- weekly mileage, aerobic efficiency, threshold, power/HR, cadence, GCT, vertical ratio, long-run, and VO2max trends.

## Conversational coach

Support queries such as:
- What is my workout today?
- Compare my last two tempo runs.
- Am I improving?
- Why is VO2max flat?
- Should I run tomorrow?
- Does hip tenderness recur after threshold sessions?

Use query-specific retrieval. Do not send the entire database to Nebius.

## MVP priorities

### P0
Profile, plan state, FIT/ZIP ingestion, raw retention, parser, activity DB, context, classification, basic metrics, environment, aerobic efficiency, threshold analysis, running dynamics, comparator selection, Nebius post-workout analysis, today’s workout, weekly mileage, pain flags, plan versioning, exports, duplicate detection.

### P1
Automatic ingestion, weekly review, tempo/progression/long-run analytics, conversational coach, trend charts, rescheduling, journal generation, GitHub backup.

### P2
Oura, Apple Health, shoe mileage, race prediction, heat adaptation, fueling, strength/jump tracking, notifications, multi-athlete support, live guidance.

## Success standard

The athlete must be able to ask:

> Do you actually have the stats?

and the product must show the source FIT file, exact metric, calculation version, comparator, coaching interpretation, and decision.
