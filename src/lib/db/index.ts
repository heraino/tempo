import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

// The connection is created once per process. Neon's HTTP driver is stateless
// (each query is its own HTTP request), so a module-level instance is fine.
const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
