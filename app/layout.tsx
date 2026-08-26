import type { Metadata } from "next";
import "@/src/styles/tracker.css";

export const metadata: Metadata = {
  title: "Company Task Tracker",
  description: "Internal workspace task tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
