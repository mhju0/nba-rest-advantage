"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

export const AnalysisContentLazy = dynamic(
  () => import("@/components/analysis-content").then((m) => m.AnalysisContent),
  {
    loading: () => (
      <div className="flex flex-col gap-6">
        <div
          className="rounded-3xl border border-white/50 px-6 py-10"
          style={{
            background: "rgba(255, 255, 255, 0.6)",
            backdropFilter: "blur(16px)",
          }}
        >
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-16 w-36 rounded-xl bg-slate-200/80" />
            <Skeleton className="h-4 w-52 rounded-lg bg-slate-200/80" />
            <Skeleton className="h-3 w-36 rounded-lg bg-slate-200/80" />
          </div>
        </div>
        <div
          className="rounded-3xl border border-white/50 p-6"
          style={{
            background: "rgba(255, 255, 255, 0.6)",
            backdropFilter: "blur(16px)",
          }}
        >
          <Skeleton className="mb-1 h-4 w-64 rounded-lg bg-slate-200/80" />
          <Skeleton className="mb-6 h-3 w-44 rounded-lg bg-slate-200/80" />
          <Skeleton className="h-64 w-full rounded-xl bg-slate-200/80" />
        </div>
      </div>
    ),
    ssr: false,
  }
)
