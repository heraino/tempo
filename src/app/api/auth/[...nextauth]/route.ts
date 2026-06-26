// This single file handles all Auth.js HTTP endpoints:
//   GET/POST /api/auth/signin
//   GET/POST /api/auth/signout
//   GET/POST /api/auth/callback/google
//   GET/POST /api/auth/callback/resend
//   ...etc.
import { handlers } from "@/auth"
export const { GET, POST } = handlers
