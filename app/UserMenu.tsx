import { auth, signOut } from "@/auth";

// Shows the signed-in user and a sign-out button. Renders nothing only when
// there is genuinely no session.
export async function UserMenu() {
  const session = await auth();

  // Only bail when there's no session at all. If a session exists but some
  // user fields are missing, still render with a sensible fallback label.
  if (!session) return null;

  const user = session.user;
  const displayName = user?.name ?? user?.email ?? "Signed in";

  return (
    <div className="border-t border-slate-200 px-3 py-3 dark:border-slate-800">
      <div className="px-2 py-1.5">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
          {displayName}
        </p>
        {user?.email && user.email !== displayName ? (
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {user.email}
          </p>
        ) : null}
      </div>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin" });
        }}
      >
        <button
          type="submit"
          className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
