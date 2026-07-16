import NextAuth from "next-auth"
import Resend from "next-auth/providers/resend"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/lib/db"
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema"

// Auth.js reads AUTH_RESEND_KEY and AUTH_SECRET from env automatically.
// trustHost lets Auth.js use the request's host for magic-link callback URLs
// so preview deployments send links back to the preview domain, not production.
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
      // Resend's shared testing domain — no custom domain needed to get started.
      from: "Tempo <onboarding@resend.dev>",
    }),
  ],
  pages: {
    signIn: "/sign-in",
  },
})
