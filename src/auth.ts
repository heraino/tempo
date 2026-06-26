import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Resend from "next-auth/providers/resend"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/lib/db"
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema"

// Auth.js reads these env vars automatically by convention:
//   AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET → Google provider
//   AUTH_RESEND_KEY                    → Resend email provider
//   AUTH_SECRET                        → signing / encryption key
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google,
    Resend({
      // "from" uses Resend's shared testing domain — no domain setup needed.
      // Swap to your own domain (e.g. "Tempo <no-reply@yourdomain.com>") later.
      from: "Tempo <onboarding@resend.dev>",
    }),
  ],
  pages: {
    signIn: "/sign-in",
  },
})
