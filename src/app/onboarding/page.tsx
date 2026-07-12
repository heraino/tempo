"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { savePlan, signOutAction } from "./actions"

const ROTATION_WEEKS = ["A", "B", "C", "D"] as const

export default function OnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await savePlan(formData)

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
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Your plan</h1>
            <p className="mt-2 text-gray-500">
              Upload your training plan and tell Tempo where you are in the cycle.
            </p>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="text-sm text-gray-400 hover:text-gray-600 mt-1">
              Sign out
            </button>
          </form>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
          {/* Plan title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Plan name
            </label>
            <input
              name="title"
              type="text"
              defaultValue="7:20 Half Marathon Project"
              required
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </div>

          {/* Markdown file upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Training plan file <span className="text-gray-400 font-normal">(.md)</span>
            </label>
            <input
              name="planFile"
              type="file"
              accept=".md,.txt"
              required
              className="w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-orange-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-orange-700 hover:file:bg-orange-100"
            />
          </div>

          {/* Cycle anchor date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date your current cycle started{" "}
              <span className="text-gray-400 font-normal">(Monday of Week A)</span>
            </label>
            <input
              name="startDate"
              type="date"
              defaultValue="2026-07-06"
              required
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </div>

          {/* Which rotation week started on that date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Which rotation week started on that date?
            </label>
            <select
              name="startWeek"
              defaultValue="A"
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            >
              {ROTATION_WEEKS.map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {loading ? "Saving…" : "Save plan"}
          </button>
        </form>
      </div>
    </main>
  )
}
