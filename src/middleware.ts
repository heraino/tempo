// Middleware runs on the edge before every matching request.
// Exporting `auth` here means Auth.js checks for a valid session automatically.
export { auth as middleware } from "@/auth"

export const config = {
  // Only protect /dashboard and anything under it.
  // Public routes (/, /sign-in, /api/auth/*) are not listed here and stay open.
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/log/:path*", "/workout/:path*"],
}
