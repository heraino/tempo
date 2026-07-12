import { signIn } from "@/auth"

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Welcome to Tempo</h1>
          <p className="mt-2 text-gray-500">
            Enter your email and we&apos;ll send you a sign-in link.
          </p>
        </div>

        <form
          action={async (formData: FormData) => {
            "use server"
            await signIn("resend", {
              email: formData.get("email") as string,
              redirectTo: "/dashboard",
            })
          }}
          className="flex flex-col gap-3"
        >
          <input
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 active:bg-orange-700 transition-colors"
          >
            Send sign-in link
          </button>
        </form>
      </div>
    </main>
  )
}
