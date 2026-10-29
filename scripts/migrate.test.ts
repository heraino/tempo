import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import drizzleConfig from "../drizzle.config"
import { MIGRATIONS_CONFIG, shouldRunMigrations } from "./migrate.mjs"

describe("shouldRunMigrations", () => {
  it("runs on production deploys", () => {
    expect(shouldRunMigrations({ VERCEL_ENV: "production" })).toBe(true)
  })

  it("never runs on preview builds, which share production's DATABASE_URL", () => {
    expect(shouldRunMigrations({ VERCEL_ENV: "preview" })).toBe(false)
  })

  it("does not run locally or in development", () => {
    expect(shouldRunMigrations({ VERCEL_ENV: "development" })).toBe(false)
    expect(shouldRunMigrations({})).toBe(false)
  })
})

describe("MIGRATIONS_CONFIG", () => {
  // If these drift apart, the deploy step and `npm run db:migrate` track
  // migrations in different tables, and one of them replays everything.
  it("uses the same migrations table and schema as drizzle.config.ts", () => {
    expect(MIGRATIONS_CONFIG.migrationsTable).toBe(drizzleConfig.migrations.table)
    expect(MIGRATIONS_CONFIG.migrationsSchema).toBe(drizzleConfig.migrations.schema)
  })

  it("reads the same migrations folder as drizzle.config.ts", () => {
    expect(MIGRATIONS_CONFIG.migrationsFolder).toBe(path.resolve(drizzleConfig.out))
    expect(fs.existsSync(path.join(MIGRATIONS_CONFIG.migrationsFolder, "meta/_journal.json"))).toBe(true)
  })
})
