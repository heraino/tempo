import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"

// This is a protected page. `auth()` reads the session from the cookie.
// If there's no session, we redirect to sign-in before rendering anything.
export default async function DashboardPage() {
  const session = await auth()

  if (!session?.user) redirect("/sign-in")

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
      <div className="text-center max-w-lg">
        <h1 className="text-3xl font-bold text-gray-900">
          Hi, {session.user.name ?? session.user.email}!
        </h1>
        <p className="mt-4 text-gray-500">
          Your personalized training dashboard is coming in Milestone 3.
        </p>

        <form
          action={async () => {
            "use server"
            await signOut({ redirectTo: "/" })
          }}
          className="mt-8"
        >
          <button
            type="submit"
            className="rounded-full border border-gray-200 px-6 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  )
}
