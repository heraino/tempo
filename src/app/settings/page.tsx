import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getUserPreferences } from "@/lib/services/userPreferences.service"
import { savePreferences } from "./actions"
import { TimezoneField } from "@/components/TimezoneDetectButton"

async function save(formData: FormData): Promise<void> {
  "use server"
  await savePreferences(formData)
}

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")

  const prefs = await getUserPreferences(session.user.id)

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-6">

        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

        <form action={save}>
          {/* Units */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Units</h2>
            <p className="text-xs text-gray-400 mb-4">Controls how distances, pace, and temperature are displayed</p>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="unitsSystem"
                  value="imperial"
                  defaultChecked={prefs.unitsSystem !== "metric"}
                  className="accent-orange-500 w-4 h-4"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">Imperial</p>
                  <p className="text-xs text-gray-400">Miles, feet, °F</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="unitsSystem"
                  value="metric"
                  defaultChecked={prefs.unitsSystem === "metric"}
                  className="accent-orange-500 w-4 h-4"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">Metric</p>
                  <p className="text-xs text-gray-400">Kilometers, meters, °C</p>
                </div>
              </label>
            </div>
          </section>

          {/* Timezone */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Timezone</h2>
            <p className="text-xs text-gray-400 mb-3">
              Auto-detected from your device. Override if the wrong day is shown.
            </p>
            <TimezoneField savedValue={prefs.timezone} />
            {prefs.timezone && (
              <p className="text-xs text-gray-400 mt-1.5">Saved: {prefs.timezone}</p>
            )}
          </section>

          <button
            type="submit"
            className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 active:bg-orange-700 transition-colors"
          >
            Save settings
          </button>
        </form>

        {/* Data import */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Import workout history</h2>
          <p className="text-xs text-gray-400 mb-4">
            Upload a Garmin Connect data export to import your full workout history in bulk.
          </p>
          <Link
            href="/settings/import"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-orange-300 hover:text-orange-600 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Import from Garmin Connect
          </Link>
        </section>

      </div>
    </main>
  )
}
