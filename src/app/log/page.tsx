"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { uploadWorkout } from "./actions"

export default function LogPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await uploadWorkout(formData)

    setLoading(false)
    if (result?.error) {
      setError(result.error)
    } else {
      router.push("/dashboard")
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-white px-6 py-12">
      <div className="w-full max-w-lg">
        <h1 className="text-3xl font-bold text-gray-900">Log a workout</h1>
        <p className="mt-2 text-gray-500">
          Upload the .fit file from your Garmin and Tempo will store all the data.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Garmin FIT file <span className="text-gray-400 font-normal">(.fit)</span>
            </label>
            <input
              name="fitFile"
              type="file"
              accept=".fit"
              required
              className="w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-orange-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-orange-700 hover:file:bg-orange-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              How did it feel? <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              name="perceivedEffort"
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            >
              <option value="">— skip —</option>
              <option value="1">1 — Very easy</option>
              <option value="2">2 — Easy</option>
              <option value="3">3 — Moderate</option>
              <option value="4">4 — Hard</option>
              <option value="5">5 — Very hard</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              name="notes"
              rows={3}
              placeholder="How did the run feel? Any issues?"
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {loading ? "Parsing and saving…" : "Upload workout"}
          </button>
        </form>
      </div>
    </main>
  )
}
