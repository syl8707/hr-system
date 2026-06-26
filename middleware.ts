// Auth.js route protection. Every request except the Auth.js endpoints, the
// sign-in page, the cron endpoints, and static assets requires a session;
// unauthenticated users are redirected to the configured sign-in page
// (/signin). Cron routes (/api/cron/*) are excluded because they carry no
// session — they authenticate themselves with the CRON_SECRET bearer token.
export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    "/((?!api/auth|api/cron|signin|_next/static|_next/image|favicon.ico).*)",
  ],
};
