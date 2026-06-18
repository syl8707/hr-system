// Auth.js route protection. Every request except the Auth.js endpoints, the
// sign-in page, and static assets requires a session; unauthenticated users
// are redirected to the configured sign-in page (/signin).
export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/((?!api/auth|signin|_next/static|_next/image|favicon.ico).*)"],
};
