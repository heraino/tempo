import type { NextConfig } from "next"

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://user:password@localhost:5432/tempo"
}

const nextConfig: NextConfig = {
  // fit-file-parser is CommonJS — tell Next.js to load it at runtime
  // rather than trying to bundle it as ESM.
  serverExternalPackages: ["fit-file-parser"],
}

export default nextConfig
