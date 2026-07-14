// Storage abstraction for immutable raw file uploads.
// Backed by Vercel Blob in production. Falls back to a local reference in dev
// when BLOB_READ_WRITE_TOKEN is not set so the ingestion pipeline works end-to-end
// without Blob credentials.

export interface UploadResult {
  url: string
  uploaded: boolean
}

/**
 * Uploads a raw file buffer and returns its permanent URL.
 *
 * The path is deterministic — same user + sha256 + filename always produces
 * the same pathname, so re-uploading an identical file is idempotent at the
 * storage level. Deduplication at the DB level (UNIQUE user_id, sha256) is
 * the primary guard; this is belt-and-suspenders.
 */
export async function uploadRawFile(
  buffer: Buffer,
  originalName: string,
  userId: string,
  sha256: string
): Promise<UploadResult> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // Dev/test mode: no Blob credentials — return a local reference.
    // The blob_url column will contain this sentinel; the raw bytes are NOT
    // durably stored. BLOB_READ_WRITE_TOKEN must be set in production.
    const url = `local://fit-files/${userId}/${sha256}/${encodeURIComponent(originalName)}`
    return { url, uploaded: false }
  }

  const { put } = await import("@vercel/blob")
  const pathname = `fit-files/${userId}/${sha256}/${originalName}`
  const blob = await put(pathname, buffer, {
    access: "public",
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })

  return { url: blob.url, uploaded: true }
}
