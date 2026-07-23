"use client"

import { useState, useRef } from "react"
import { upload } from "@vercel/blob/client"
import Link from "next/link"

type Phase = "idle" | "uploading" | "processing" | "done" | "error"

interface Result {
  totalFiles: number
  processedFiles: number
  skippedFiles: number
  failedFiles: number
  errors: string[]
}

export default function GarminImportPage() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [uploadPct, setUploadPct] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return

    setPhase("uploading")
    setUploadPct(0)
    setErrorMsg(null)
    setResult(null)

    let blobUrl: string
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
        onUploadProgress: ({ loaded, total }) => {
          setUploadPct(Math.round((loaded / total) * 100))
        },
      })
      blobUrl = blob.url
    } catch (err) {
      setPhase("error")
      setErrorMsg(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
      return
    }

    setPhase("processing")

    try {
      const res = await fetch("/api/import/garmin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blobUrl }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPhase("error")
        setErrorMsg(data.error ?? "Import failed")
        return
      }
      setResult({
        totalFiles: data.totalFiles,
        processedFiles: data.processedFiles,
        skippedFiles: data.skippedFiles,
        failedFiles: data.failedFiles,
        errors: data.errors ?? [],
      })
      setPhase("done")
    } catch (err) {
      setPhase("error")
      setErrorMsg(`Processing failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-6">

        <div>
          <Link href="/settings" className="text-sm text-orange-500 hover:underline">← Settings</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">Import Garmin history</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload your Garmin Connect data export to import your full workout history.
          </p>
        </div>

        {/* Instructions */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">How to export from Garmin Connect</h2>
          <ol className="space-y-1.5 text-sm text-gray-600 list-decimal list-inside">
            <li>Go to <span className="font-medium">Garmin Connect</span> → Account → Data Management</li>
            <li>Click <span className="font-medium">Export Your Data</span></li>
            <li>Request a data export (Garmin emails you a download link within a few hours)</li>
            <li>Download the zip file and upload it here</li>
          </ol>
          <p className="text-xs text-gray-400 pt-1">
            Duplicate workouts are automatically skipped. Only running activities are classified; other sport types are imported as-is.
          </p>
        </section>

        {/* Upload form */}
        {(phase === "idle" || phase === "uploading" || phase === "error") && (
          <form onSubmit={handleSubmit}>
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">Select export file</h2>

              {/* Drop zone */}
              <label
                htmlFor="garmin-zip"
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl px-6 py-10 cursor-pointer transition-colors ${
                  fileName ? "border-orange-300 bg-orange-50" : "border-gray-200 hover:border-orange-300 hover:bg-orange-50"
                }`}
              >
                <svg className="w-8 h-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                {fileName ? (
                  <span className="text-sm font-medium text-orange-600">{fileName}</span>
                ) : (
                  <>
                    <span className="text-sm font-medium text-gray-700">Choose Garmin export zip</span>
                    <span className="text-xs text-gray-400">or drag and drop here</span>
                  </>
                )}
                <input
                  id="garmin-zip"
                  ref={fileRef}
                  type="file"
                  accept=".zip"
                  className="sr-only"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                />
              </label>

              {/* Upload progress */}
              {phase === "uploading" && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Uploading…</span>
                    <span>{uploadPct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-2 bg-orange-500 rounded-full transition-all duration-300"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                </div>
              )}

              {errorMsg && (
                <p className="text-sm text-red-500">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={!fileName || phase === "uploading"}
                className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 active:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {phase === "uploading" ? "Uploading…" : "Import workouts"}
              </button>
            </section>
          </form>
        )}

        {/* Processing state */}
        {phase === "processing" && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 flex flex-col items-center gap-4 text-center">
            <svg className="animate-spin w-8 h-8 text-orange-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" strokeOpacity="0.15"/>
              <path d="M21 12a9 9 0 0 0-9-9"/>
            </svg>
            <div>
              <p className="text-sm font-semibold text-gray-800">Processing workouts…</p>
              <p className="text-xs text-gray-400 mt-1">
                Parsing FIT files and importing to your history. This may take 1–5 minutes for large exports.
              </p>
            </div>
          </section>
        )}

        {/* Done state */}
        {phase === "done" && result && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Import complete</p>
                <p className="text-xs text-gray-400">{result.totalFiles} activities found in your export</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-green-50 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-green-700">{result.processedFiles}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 mt-0.5">Imported</p>
              </div>
              <div className="rounded-xl bg-gray-50 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-gray-500">{result.skippedFiles}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mt-0.5">Skipped</p>
              </div>
              <div className={`rounded-xl px-4 py-3 text-center ${result.failedFiles > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                <p className={`text-2xl font-bold ${result.failedFiles > 0 ? "text-red-600" : "text-gray-400"}`}>{result.failedFiles}</p>
                <p className={`text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${result.failedFiles > 0 ? "text-red-500" : "text-gray-400"}`}>Failed</p>
              </div>
            </div>

            {result.skippedFiles > 0 && (
              <p className="text-xs text-gray-400">Skipped = workouts already in your history.</p>
            )}

            {result.errors.length > 0 && (
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer font-medium text-red-500">
                  {result.failedFiles} file{result.failedFiles !== 1 ? "s" : ""} failed to import
                </summary>
                <ul className="mt-2 space-y-1 pl-2 border-l-2 border-red-100">
                  {result.errors.map((e, i) => (
                    <li key={i} className="text-gray-400">{e}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex gap-3 pt-2">
              <Link
                href="/history"
                className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white text-center hover:bg-orange-600 transition-colors"
              >
                View workout history →
              </Link>
              <button
                onClick={() => { setPhase("idle"); setResult(null); setFileName(null) }}
                className="px-4 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Import another
              </button>
            </div>
          </section>
        )}

      </div>
    </main>
  )
}
