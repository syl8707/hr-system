import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "HR System",
  description: "Employee management",
};

// The sidebar reads the session via auth() (which reads cookies), so the
// layout must render per-request and never be statically cached — otherwise a
// null/anonymous render gets reused and the signed-in user never appears.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        <div className="flex min-h-screen">
          <Sidebar footer={<UserMenu />} />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
