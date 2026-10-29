import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Migrations run on every production deploy (scripts/migrate.mjs) against a
// database whose migrations table may not reflect what was applied by hand.
// Drizzle decides what to run purely by comparing each journal entry's `when`
// to the newest row in that table, so two properties have to hold for every
// migration, including ones added later:
//   - every .sql file is in the journal, or drizzle never runs it;
//   - every statement replays as a no-op, so re-running an already-applied
//     migration can never fail a deploy.

const DIR = fileURLToPath(new URL("../../../drizzle/migrations", import.meta.url))

interface JournalEntry {
  idx: number
  when: number
  tag: string
  breakpoints: boolean
}

const journal: { entries: JournalEntry[] } = JSON.parse(
  fs.readFileSync(path.join(DIR, "meta/_journal.json"), "utf8"),
)
const sqlTags = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.slice(0, -".sql".length))
  .sort()

/** Drizzle sends each chunk between breakpoints as one query. */
function chunks(tag: string): string[] {
  return fs
    .readFileSync(path.join(DIR, `${tag}.sql`), "utf8")
    .split("--> statement-breakpoint")
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
}

/** Why a single statement would fail on replay, or null if it is a no-op. */
function replayProblem(stmt: string): string | null {
  const s = stmt.replace(/\s+/g, " ")

  if (/^DO \$\$/i.test(s)) {
    if (!/END \$\$;$/i.test(s)) return "DO block does not end the chunk"
    if (!/EXCEPTION WHEN duplicate_object/i.test(s)) {
      return "DO block has no duplicate_object handler"
    }
    return null
  }

  const semicolons = (s.match(/;/g) ?? []).length
  if (semicolons !== 1 || !s.endsWith(";")) {
    return `chunk holds ${semicolons} statements; add --> statement-breakpoint between them`
  }
  if (/^CREATE TABLE /i.test(s)) {
    return /^CREATE TABLE IF NOT EXISTS /i.test(s) ? null : "CREATE TABLE without IF NOT EXISTS"
  }
  if (/^CREATE (UNIQUE )?INDEX /i.test(s)) {
    return /INDEX IF NOT EXISTS /i.test(s) ? null : "CREATE INDEX without IF NOT EXISTS"
  }
  if (/^ALTER TABLE /i.test(s)) {
    if (/ ADD CONSTRAINT /i.test(s)) {
      return "ADD CONSTRAINT outside a DO $$ ... EXCEPTION WHEN duplicate_object block"
    }
    if (/ ADD COLUMN /i.test(s)) {
      return / ADD COLUMN IF NOT EXISTS /i.test(s) ? null : "ADD COLUMN without IF NOT EXISTS"
    }
  }
  // DROP, UPDATE, INSERT, ALTER COLUMN, etc. are not provably idempotent. If a
  // migration genuinely needs one, guard it and extend this check deliberately.
  return "statement kind is not known to be idempotent"
}

describe("migration journal", () => {
  it("has exactly one entry per .sql file", () => {
    expect(journal.entries.map((e) => e.tag).sort()).toEqual(sqlTags)
  })

  it("is in file order with sequential idx and strictly increasing timestamps", () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i)
      expect(entry.tag).toBe(sqlTags[i])
      expect(entry.breakpoints).toBe(true)
      if (i > 0) expect(entry.when).toBeGreaterThan(journal.entries[i - 1].when)
    })
  })

  it("has no entry dated in the future", () => {
    // A future `when` would make the next generated migration look older than
    // it, and drizzle would skip that migration on every deploy.
    for (const entry of journal.entries) {
      expect(entry.when).toBeLessThanOrEqual(Date.now())
    }
  })
})

describe.each(sqlTags)("migration %s", (tag) => {
  it("replays as a no-op: every chunk is one idempotent statement", () => {
    const problems = chunks(tag)
      .map((stmt, i) => {
        if (stmt === "") return `chunk ${i} is empty`
        const problem = replayProblem(stmt)
        return problem && `chunk ${i}: ${problem} — ${stmt.slice(0, 80)}`
      })
      .filter(Boolean)
    expect(problems).toEqual([])
  })
})
