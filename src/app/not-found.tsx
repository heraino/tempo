import Link from "next/link"

export default function NotFound() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h1 className="text-lg font-bold text-gray-900">Page not found</h1>
          <p className="text-sm text-gray-500 mt-1">
            That link doesn&apos;t go anywhere — it may be from an older version of the app.
          </p>
          <Link
            href="/dashboard"
            className="mt-5 inline-block rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
          >
            Go to dashboard
          </Link>
        </section>
      </div>
    </main>
  )
}
