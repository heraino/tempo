// The landing page — the first thing visitors see at the root URL (/).
// Everything here is static for Milestone 1; no data fetching or auth needed yet.
export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center min-h-screen bg-white px-6">
      <div className="text-center max-w-2xl">
        {/* Product name */}
        <h1 className="text-7xl font-bold tracking-tight text-gray-900">
          Tempo
        </h1>

        {/* One-sentence description */}
        <p className="mt-6 text-xl leading-relaxed text-gray-500">
          A coach that changes the plan when your week doesn&apos;t go as
          planned.
        </p>

        {/* Placeholder CTA — wired up with auth + onboarding in Milestone 2 */}
        <div className="mt-10">
          <button
            type="button"
            className="rounded-full bg-orange-500 px-9 py-4 text-lg font-semibold text-white
                       shadow-sm hover:bg-orange-600 active:bg-orange-700
                       transition-colors duration-150 cursor-pointer"
          >
            Get Started
          </button>
        </div>
      </div>
    </main>
  );
}
