import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavBar } from "@/components/nav-bar";
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
  title: {
    default: "NBA Rest Advantage",
    template: "%s · NBA Rest Advantage",
  },
  description:
    "Data-driven NBA fatigue analysis. Track rest advantage scores, travel load, and prediction accuracy across the season.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // No `dark` class — always light. No `bg-*` on body — html gradient shows through.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col text-foreground">
        {/* Fixed animated gradient background — rendered via inline styles so it
            is never overridden by CSS layers or OS dark mode media queries. */}
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: -10,
            background: "linear-gradient(135deg, #f5f0ff, #fff0f0, #f0f5ff, #fff5f0)",
            backgroundSize: "400% 400%",
            animation: "gradientShift 20s ease infinite",
          }}
        />

        <NavBar />

        <main className="flex-1">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</div>
        </main>

        <footer className="border-t border-black/[0.06] py-6 backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6">
            <p className="text-xs text-slate-400">Built by Michael</p>
            <a
              href="https://github.com/michaelju"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-slate-700"
            >
              <svg viewBox="0 0 16 16" className="size-3.5 fill-current" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
