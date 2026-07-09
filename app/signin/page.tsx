import Image from "next/image";

import { signIn } from "@/auth";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col items-center text-center">
          {/* Dark artwork on transparent background: the light chip is needed
              in dark mode only, until we get a light version of the logo. */}
          <span className="flex h-11 items-center justify-center dark:rounded-xl dark:bg-white/90 dark:p-1.5">
            <Image
              src="/patry-dark-clear-logo.png"
              alt="Patry"
              width={320}
              height={243}
              className="h-8 w-auto"
            />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Sign in to HR System
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
            Use your Microsoft work account to continue.
          </p>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id", { redirectTo: "/" });
          }}
          className="mt-7"
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2.5 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            <svg viewBox="0 0 21 21" aria-hidden="true" className="h-4 w-4">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Sign in with Microsoft
          </button>
        </form>
      </div>
    </main>
  );
}
