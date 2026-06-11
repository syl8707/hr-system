import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HR System",
  description: "Employee management",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
