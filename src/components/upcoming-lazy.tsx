"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

export const UpcomingContentLazy = dynamic(
  () => import("@/components/upcoming-content").then((m) => m.UpcomingContent),
  {
    loading: () => (
      <div
        className="rounded-3xl border border-white/50 p-6"
        style={{
          background: "rgba(255, 255, 255, 0.6)",
          backdropFilter: "blur(16px)",
        }}
      >
        <Skeleton className="mb-4 h-4 w-48 rounded-lg bg-slate-200/80" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl bg-slate-200/80" />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
)
