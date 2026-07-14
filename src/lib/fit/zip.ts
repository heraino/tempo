import { unzipSync } from "fflate"

const MAX_EXTRACTED_BYTES = 100 * 1024 * 1024 // 100 MB

// Checks that a path component doesn't escape the archive root.
function isSafePath(name: string): boolean {
  if (name.startsWith("/") || name.startsWith("\\")) return false
  const parts = name.split(/[/\\]/)
  let depth = 0
  for (const part of parts) {
    if (part === "..") {
      depth--
      if (depth < 0) return false
    } else if (part !== ".") {
      depth++
    }
  }
  return true
}

/**
 * Extracts a single .fit file from a ZIP buffer.
 *
 * Safety guarantees:
 * - Rejects any archive entry whose path could traverse outside the root.
 * - Rejects archives containing zero .fit files.
 * - Rejects archives containing more than one .fit file (ambiguous payload).
 * - Rejects archives whose extracted .fit content exceeds MAX_EXTRACTED_BYTES.
 * - Validates the archive is parseable as a ZIP before inspection.
 *
 * Throws with a user-facing error message on any violation.
 */
export function extractFitFromZip(buffer: Buffer): Buffer {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(buffer))
  } catch {
    throw new Error("Invalid or corrupt ZIP archive")
  }

  // Safety: check all paths before inspecting content
  for (const name of Object.keys(entries)) {
    if (!isSafePath(name)) {
      throw new Error("ZIP archive contains unsafe file paths")
    }
  }

  const fitEntries = Object.entries(entries).filter(([name]) =>
    name.toLowerCase().endsWith(".fit") && !name.startsWith("__MACOSX")
  )

  if (fitEntries.length === 0) {
    throw new Error("ZIP archive contains no .fit file")
  }
  if (fitEntries.length > 1) {
    throw new Error(
      `ZIP archive contains ${fitEntries.length} .fit files — upload a single .fit file or a ZIP containing exactly one`
    )
  }

  const [, fitBytes] = fitEntries[0]

  if (fitBytes.byteLength > MAX_EXTRACTED_BYTES) {
    throw new Error("Extracted FIT file is too large (max 100 MB)")
  }

  return Buffer.from(fitBytes)
}
