import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "./Sidebar";

export const metadata: Metadata = {
  title: "HR System",
  description: "Employee management",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
