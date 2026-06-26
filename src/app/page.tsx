import Link from "next/link"

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center min-h-screen bg-white px-6">
      <div className="text-center max-w-2xl">
        <h1 className="text-7xl font-bold tracking-tight text-gray-900">
          Tempo
        </h1>

        <p className="mt-6 text-xl leading-relaxed text-gray-500">
          A coach that changes the plan when your week doesn&apos;t go as
          planned.
        </p>

        <div className="mt-10">
          <Link
            href="/sign-in"
            className="rounded-full bg-orange-500 px-9 py-4 text-lg font-semibold text-white
                       shadow-sm hover:bg-orange-600 active:bg-orange-700
                       transition-colors duration-150"
          >
            Get Started
          </Link>
        </div>
      </div>
    </main>
  )
}
