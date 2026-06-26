import type { NextConfig } from "next"

// Provide a placeholder DATABASE_URL during `next build` when the real URL
// isn't available yet (CI, fresh clone before .env.local is set up).
// Neon stores the URL but doesn't open a connection until a query runs,
// so this is safe — it only prevents a throw at module-load time.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://user:password@localhost:5432/tempo"
}

const nextConfig: NextConfig = {}

export default nextConfig
