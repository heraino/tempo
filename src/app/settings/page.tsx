import { auth } from "@/auth"
import { redirect } from "next/navigation"
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

      </div>
    </main>
  )
}
