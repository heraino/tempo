"use client"

import { useEffect } from "react"
import Link from "next/link"

// Renders inside the root layout, so the nav stays put and the athlete can
// move on even if retrying doesn't help.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h1 className="text-lg font-bold text-gray-900">Something went wrong</h1>
          <p className="text-sm text-gray-500 mt-1">
            This page couldn&apos;t load. It&apos;s usually temporary — try again.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
            >
              Try again
            </button>
            <Link href="/dashboard" className="text-sm font-medium text-gray-500 hover:text-gray-700">
              Go to dashboard
            </Link>
          </div>
          {error.digest && (
            <p className="mt-5 text-xs text-gray-400">Reference: {error.digest}</p>
          )}
        </section>
      </div>
    </main>
  )
}
