"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Activity, Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "/", label: "Today's Games" },
  { href: "/analysis", label: "Analysis" },
] as const

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(href + "/")
}

export function NavBar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header
      className="sticky top-0 z-50 border-b border-black/[0.06]"
      style={{
        background: "rgba(255, 255, 255, 0.75)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">

        {/* Brand — "NBA" in NBA blue, "Rest Advantage" in charcoal */}
        <Link
          href="/"
          className="flex select-none items-center gap-2.5 transition-opacity hover:opacity-80"
          onClick={() => setOpen(false)}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#17408B]">
            <Activity className="size-3.5 text-white" strokeWidth={2.5} />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            <span className="text-[#17408B]">NBA</span>
            {" "}
            <span className="text-slate-800">Rest Advantage</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Main navigation">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
                isActive(pathname, href)
                  ? "bg-[#17408B]/10 text-[#17408B]"
                  : "text-slate-500 hover:bg-black/[0.04] hover:text-slate-800"
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Mobile hamburger */}
        <button
          className="flex size-8 items-center justify-center rounded-full text-slate-500 transition-all hover:bg-black/[0.05] hover:text-slate-800 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav
          className="flex flex-col gap-1 border-t border-black/[0.06] px-4 py-3 md:hidden"
          style={{
            background: "rgba(255, 255, 255, 0.9)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
          aria-label="Mobile navigation"
        >
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive(pathname, href)
                  ? "bg-[#17408B]/10 text-[#17408B]"
                  : "text-slate-500 hover:bg-black/[0.04] hover:text-slate-800"
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}
