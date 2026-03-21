import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TipSats — Agentic Lightning Tipping for Rumble",
  description:
    "An autonomous agent tips Rumble creators with Lightning sats via Tether Spark wallet. Self-custodial, fast, powered by Boltz Exchange.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans`}
      >
        <nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-lg">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <span className="text-accent">⚡</span>
              <span>TipSats</span>
            </Link>
            <div className="flex items-center gap-6 text-sm">
              <Link href="/" className="text-muted hover:text-foreground transition-colors">
                Home
              </Link>
              <Link
                href="/control"
                className="rounded-lg bg-accent px-4 py-1.5 font-medium text-black transition-colors hover:bg-accent-dim"
              >
                Launch Agent
              </Link>
            </div>
          </div>
        </nav>
        <main className="pt-14">{children}</main>
      </body>
    </html>
  );
}
