// Shown while the dashboard's queries run, instead of a blank screen. Shapes
// echo the real layout (header, today's workout, the next week) so content
// lands without a jump.
export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8" aria-busy="true" aria-label="Loading dashboard">
      <div className="max-w-2xl mx-auto space-y-6 animate-pulse motion-reduce:animate-none">
        <div className="space-y-2">
          <div className="h-7 w-24 rounded bg-gray-200" />
          <div className="h-4 w-48 rounded bg-gray-200" />
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
          <div className="h-3 w-32 rounded bg-gray-200" />
          <div className="h-5 w-40 rounded bg-gray-200" />
          <div className="h-4 w-full rounded bg-gray-100" />
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="h-5 w-28 rounded bg-gray-200" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 w-full rounded bg-gray-100" />
          ))}
        </div>
      </div>
    </main>
  )
}
