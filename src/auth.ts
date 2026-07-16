import NextAuth from "next-auth"
import Resend from "next-auth/providers/resend"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/lib/db"
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema"

// Auth.js reads AUTH_RESEND_KEY and AUTH_SECRET from env automatically.
// trustHost lets it use the incoming request host for session cookie domain.
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Resend({
      from: "Tempo <onboarding@resend.dev>",
      // AUTH_URL is set globally in Vercel to the production domain, so the
      // magic-link URL Auth.js constructs may point to production even when
      // signing in from a preview deployment. We fix this by replacing the
      // origin with VERCEL_URL, which Vercel sets per-deployment automatically.
      sendVerificationRequest: async ({ identifier: to, url, provider }) => {
        let finalUrl = url
        if (process.env.VERCEL_URL) {
          const expectedOrigin = `https://${process.env.VERCEL_URL}`
          const parsed = new URL(url)
          if (parsed.origin !== expectedOrigin) {
            finalUrl = expectedOrigin + parsed.pathname + parsed.search
          }
        }

        const { host } = new URL(finalUrl)
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: provider.from,
            to,
            subject: `Sign in to ${host}`,
            html: `<p>Click the link below to sign in to <strong>Tempo</strong>.</p>
<p><a href="${finalUrl}" style="display:inline-block;padding:12px 24px;background:#f97316;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Sign in to Tempo</a></p>
<p style="color:#888;font-size:13px">If you did not request this email you can safely ignore it.</p>`,
            text: `Sign in to Tempo\n\n${finalUrl}\n\nIf you did not request this email you can safely ignore it.`,
          }),
        })

        if (!res.ok) {
          const body = await res.text().catch(() => "")
          throw new Error(`Resend API error ${res.status}: ${body}`)
        }
      },
    }),
  ],
  pages: {
    signIn: "/sign-in",
  },
})
