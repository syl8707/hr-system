"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  {
    href: "/employees",
    label: "Employees",
    // People icon
    icon: (
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="h-5 w-5"
      >
        <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z" />
      </svg>
    ),
  },
  {
    href: "/analytics",
    label: "Analytics",
    // Bar chart icon
    icon: (
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="h-5 w-5"
      >
        <path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h.5a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16 2h-.5ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h.5a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10 6h-.5ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h.5A1.5 1.5 0 0 0 5 16.5v-5A1.5 1.5 0 0 0 4 10h-.5Z" />
      </svg>
    ),
  },
  {
    href: "/activity",
    label: "Activity",
    // Clock / history icon
    icon: (
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="h-5 w-5"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .199.079.39.22.53l3 3a.75.75 0 1 0 1.06-1.06l-2.78-2.78V5Z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
];

export function Sidebar({ footer }: { footer?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          HR
        </span>
        <span className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
          HR System
        </span>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {nav.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Pushed to the bottom; renders the signed-in user + sign out, or
          nothing when there is no session. */}
      {footer ? <div className="mt-auto">{footer}</div> : null}
    </aside>
  );
}
