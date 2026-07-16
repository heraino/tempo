import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { TimezoneSync } from "@/components/TimezoneSync";

// Loads the Geist font from Google Fonts at build time (not at runtime in the browser).
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

// Metadata that appears in the browser tab and in search engine previews.
export const metadata: Metadata = {
  title: "Tempo — Your AI Running Coach",
  description:
    "A coach that changes the plan when your week doesn't go as planned.",
};

// RootLayout wraps every page in the app. Think of it as the outer HTML shell.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[var(--font-geist),system-ui,sans-serif]">
        <TimezoneSync />
        <div className="pb-20">{children}</div>
        <NavBar />
      </body>
    </html>
  );
}
