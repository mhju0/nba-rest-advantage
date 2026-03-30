"use client"

import { useEffect, useState } from "react"
import { addDays, format, subDays } from "date-fns"
import { Activity, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MatchupCard } from "@/components/matchup-card"
import type { ApiResponse, GameResponse } from "@/types"

// ─── Helpers ─────────────────────────────────────────────────────

/** Builds the YYYY-MM-DD date param from the client's local date. */
function toDateParam(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

// ─── Skeleton ────────────────────────────────────────────────────

function MatchupCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-white/50 bg-white/60 p-4 shadow-[0_8px_32px_rgba(23,64,139,0.06)] backdrop-blur-2xl">
      <div className="flex items-start justify-between">
        <Skeleton className="h-5 w-24 bg-slate-200/80" />
        <Skeleton className="h-3.5 w-14 bg-slate-200/80" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-8 bg-slate-200/80" />
            <Skeleton className="h-4 w-10 bg-slate-200/80" />
            <Skeleton className="ml-auto h-3 w-6 bg-slate-200/80" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full bg-slate-200/80" />
        </div>
        <Skeleton className="h-5 w-28 self-center rounded-full bg-slate-200/80" />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-8 bg-slate-200/80" />
            <Skeleton className="h-4 w-10 bg-slate-200/80" />
            <Skeleton className="ml-auto h-3 w-6 bg-slate-200/80" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full bg-slate-200/80" />
        </div>
      </div>
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <MatchupCardSkeleton key={i} />
      ))}
    </div>
  )
}

// ─── Empty / error states ─────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/50 bg-white/60 px-6 py-20 text-center shadow-[0_8px_32px_rgba(23,64,139,0.06)] backdrop-blur-2xl">
      <span className="text-5xl" role="img" aria-label="basketball">
        🏀
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-slate-700">No games scheduled</p>
        <p className="text-xs text-slate-400">No NBA games on {label}</p>
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-[#C9082A]/20 bg-[#C9082A]/5 px-6 py-12 text-center backdrop-blur-2xl">
      <p className="text-sm font-semibold text-[#C9082A]">Failed to load games</p>
      <p className="text-xs text-[#C9082A]/60">{message}</p>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [games, setGames] = useState<GameResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dateParam = toDateParam(selectedDate)
    setLoading(true)
    setError(null)

    fetch(`/api/games/${dateParam}`)
      .then((res) => res.json() as Promise<ApiResponse<GameResponse[]>>)
      .then(({ data, error: apiError }) => {
        if (apiError) throw new Error(apiError)
        setGames(data)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Something went wrong")
      })
      .finally(() => setLoading(false))
  }, [selectedDate])

  const formattedDate = format(selectedDate, "EEEE, MMMM d, yyyy")
  const shortLabel = format(selectedDate, "MMMM d, yyyy")

  return (
    <div className="flex flex-col gap-8">
      {/* Page header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#17408B]">
          <Activity className="size-4" />
          Today&apos;s Matchups
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Rest Advantage Dashboard
        </h1>
        <p className="max-w-xl text-slate-500">
          Fatigue scores for every NBA game. Higher differential means one team
          is carrying significantly more travel and schedule load.
        </p>
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setSelectedDate((d) => subDays(d, 1))}
          aria-label="Previous day"
        >
          <ChevronLeft />
        </Button>

        {/* suppressHydrationWarning: server UTC date may differ from client local date */}
        <span
          className="min-w-56 text-center text-sm font-medium text-slate-700"
          suppressHydrationWarning
        >
          {formattedDate}
        </span>

        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
          aria-label="Next day"
        >
          <ChevronRight />
        </Button>
      </div>

      {/* Content area */}
      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <SkeletonGrid />
      ) : games.length === 0 ? (
        <EmptyState label={shortLabel} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {games.map((game, i) => (
            <MatchupCard key={game.id} game={game} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
