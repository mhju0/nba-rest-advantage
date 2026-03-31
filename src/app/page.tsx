"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { addDays, format, parseISO } from "date-fns"
import { Activity, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MatchupCard } from "@/components/matchup-card"
import { useLiveGames } from "@/hooks/useLiveGames"
import {
  defaultNbaCalendarMonth,
  defaultNbaSeason,
  NBA_REGULAR_MONTHS,
  NBA_SEASONS,
} from "@/lib/nba-season"
import { cn } from "@/lib/utils"
import type { ApiResponse, GameDateCount, GameResponse } from "@/types"

// ─── Helpers ─────────────────────────────────────────────────────

function pickInitialDate(dates: GameDateCount[]): string | null {
  if (dates.length === 0) return null
  const todayKey = format(new Date(), "yyyy-MM-dd")
  if (dates.some((d) => d.date === todayKey)) return todayKey
  return dates[dates.length - 1].date
}

type PendingScope = { season: string; month: number }

const glassPill =
  "rounded-full border border-white/50 bg-white/55 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-[0_4px_24px_rgba(23,64,139,0.06)] backdrop-blur-xl transition-colors hover:bg-white/70"

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
  const [season, setSeason] = useState<string>(() => defaultNbaSeason())
  const [month, setMonth] = useState<number>(() => defaultNbaCalendarMonth())
  const [availableDates, setAvailableDates] = useState<GameDateCount[]>([])
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)

  const [loadingDates, setLoadingDates] = useState(true)
  const [errorDates, setErrorDates] = useState<string | null>(null)

  const [games, setGames] = useState<GameResponse[]>([])
  const [loadingGames, setLoadingGames] = useState(false)
  const [errorGames, setErrorGames] = useState<string | null>(null)

  const pendingSelectionResetRef = useRef<PendingScope | null>(null)
  const isFirstDatesFetchRef = useRef(true)

  const gameIds = useMemo(() => games.map((g) => g.id), [games])
  const { liveUpdates, recentlyUpdated } = useLiveGames(gameIds)

  const mergedGames =
    Object.keys(liveUpdates).length === 0
      ? games
      : games.map((game) => {
          const update = liveUpdates[game.id]
          if (!update) return game
          return {
            ...game,
            homeScore: update.homeScore ?? game.homeScore,
            awayScore: update.awayScore ?? game.awayScore,
            status: update.status ?? game.status,
          }
        })

  // Sync calendar month tab when the selected day moves (e.g. prev/next across a month boundary).
  useEffect(() => {
    if (!selectedDateKey) return
    const m = Number(selectedDateKey.slice(5, 7))
    if (!NBA_REGULAR_MONTHS.some((x) => x.value === m)) return
    setMonth((prev) => (m !== prev ? m : prev))
  }, [selectedDateKey])

  useEffect(() => {
    const controller = new AbortController()
    setLoadingDates(true)
    setErrorDates(null)

    const params = new URLSearchParams({ season, month: String(month) })
    fetch(`/api/games/dates?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json() as Promise<ApiResponse<GameDateCount[]>>)
      .then(({ data, error: apiError }) => {
        if (apiError) throw new Error(apiError)
        return data
      })
      .then((data) => {
        setAvailableDates(data)
        const pending = pendingSelectionResetRef.current
        const matchesPending =
          pending !== null && pending.season === season && pending.month === month
        if (matchesPending) {
          pendingSelectionResetRef.current = null
          setSelectedDateKey(data.length > 0 ? pickInitialDate(data) : null)
          return
        }
        if (isFirstDatesFetchRef.current) {
          isFirstDatesFetchRef.current = false
          setSelectedDateKey(data.length > 0 ? pickInitialDate(data) : null)
          return
        }
        setSelectedDateKey((prev) => {
          if (!prev) return data.length > 0 ? pickInitialDate(data) : null
          const pm = Number(prev.slice(5, 7))
          if (pm === month) return prev
          return prev
        })
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return
        setErrorDates(err instanceof Error ? err.message : "Failed to load dates")
        setAvailableDates([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingDates(false)
      })

    return () => controller.abort()
  }, [season, month])

  useEffect(() => {
    if (!selectedDateKey) {
      setGames([])
      setLoadingGames(false)
      setErrorGames(null)
      return
    }

    const controller = new AbortController()
    setLoadingGames(true)
    setErrorGames(null)

    fetch(`/api/games/${selectedDateKey}`, { signal: controller.signal })
      .then((res) => res.json() as Promise<ApiResponse<GameResponse[]>>)
      .then(({ data, error: apiError }) => {
        if (apiError) throw new Error(apiError)
        setGames(data)
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return
        setErrorGames(err instanceof Error ? err.message : "Something went wrong")
        setGames([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingGames(false)
      })

    return () => controller.abort()
  }, [selectedDateKey])

  function onSeasonChange(next: string) {
    pendingSelectionResetRef.current = { season: next, month }
    setSeason(next)
  }

  function onMonthTabClick(nextMonth: number) {
    pendingSelectionResetRef.current = { season, month: nextMonth }
    setMonth(nextMonth)
  }

  function shiftSelectedDay(delta: number) {
    if (!selectedDateKey) return
    const base = parseISO(`${selectedDateKey}T12:00:00`)
    setSelectedDateKey(format(addDays(base, delta), "yyyy-MM-dd"))
  }

  const formattedSelected =
    selectedDateKey !== null
      ? format(parseISO(`${selectedDateKey}T12:00:00`), "EEEE, MMMM d, yyyy")
      : null
  const shortLabel =
    selectedDateKey !== null
      ? format(parseISO(`${selectedDateKey}T12:00:00`), "MMMM d, yyyy")
      : "this date"

  const showGamesError = errorGames !== null
  const showGamesSkeleton = loadingGames && !showGamesError
  const showGamesEmpty =
    !showGamesError && !showGamesSkeleton && selectedDateKey !== null && mergedGames.length === 0

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#17408B]">
          <Activity className="size-4" />
          Today&apos;s Matchups
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Rest Advantage Dashboard
        </h1>
        <p className="max-w-xl text-slate-500">
          Fatigue scores for every NBA game. Higher differential means one team is carrying
          significantly more travel and schedule load.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="nba-season" className="text-xs font-medium text-slate-500">
            Season
          </label>
          <select
            id="nba-season"
            value={season}
            onChange={(e) => onSeasonChange(e.target.value)}
            className={cn(
              glassPill,
              "max-w-xs cursor-pointer appearance-none bg-[length:1rem] bg-[right_0.65rem_center] bg-no-repeat pr-9",
              "bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2716%27%20height=%2716%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%23475569%27%20stroke-width=%272%27%3E%3Cpath%20d=%27M6%209l6%206%206-6%27/%3E%3C/svg%3E')]"
            )}
          >
            {NBA_SEASONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-500">Month</span>
          <div className="-mx-1 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:thin]">
            <div className="flex min-w-min gap-2 px-1">
              {NBA_REGULAR_MONTHS.map(({ value: m, label }) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onMonthTabClick(m)}
                  aria-pressed={month === m}
                  className={cn(
                    glassPill,
                    "shrink-0",
                    month === m &&
                      "border-[#17408B]/40 bg-[#17408B]/12 text-[#17408B] ring-1 ring-[#17408B]/25"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {errorDates ? (
          <p className="text-sm text-[#C9082A]" role="alert">
            {errorDates}
          </p>
        ) : loadingDates ? (
          <Skeleton className="h-24 w-full max-w-md rounded-2xl bg-slate-200/80" />
        ) : availableDates.length === 0 ? (
          <p className="text-sm text-slate-500">No games in this month.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-500">Days with games</span>
            <div className="flex flex-wrap gap-2">
              {availableDates.map(({ date: d, gameCount }) => {
                const dayNum = format(parseISO(`${d}T12:00:00`), "d")
                const longLabel = format(parseISO(`${d}T12:00:00`), "MMMM d, yyyy")
                const selected = selectedDateKey === d
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDateKey(d)}
                    aria-current={selected ? "date" : undefined}
                    aria-label={`${longLabel}, ${gameCount} games`}
                    className={cn(
                      "flex min-w-[3.25rem] flex-col items-center rounded-xl border px-2.5 py-2 text-center shadow-[0_4px_24px_rgba(23,64,139,0.06)] backdrop-blur-xl transition-colors",
                      "border-white/50 bg-white/55 hover:bg-white/70",
                      selected &&
                        "border-[#17408B]/45 bg-[#17408B]/12 ring-2 ring-[#17408B]/35"
                    )}
                  >
                    <span className="text-base font-semibold tabular-nums text-slate-800">
                      {dayNum}
                    </span>
                    <span className="text-[0.65rem] font-medium tabular-nums text-slate-500">
                      {gameCount} gm{gameCount === 1 ? "" : "s"}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => shiftSelectedDay(-1)}
            disabled={!selectedDateKey}
            aria-label="Previous day"
            className="border-white/50 bg-white/50 backdrop-blur-xl"
          >
            <ChevronLeft />
          </Button>
          <p
            className="min-w-[12rem] text-center text-sm font-medium text-slate-700 sm:text-left"
            data-testid="selected-date-display"
          >
            {formattedSelected ?? "Pick a date"}
          </p>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => shiftSelectedDay(1)}
            disabled={!selectedDateKey}
            aria-label="Next day"
            className="border-white/50 bg-white/50 backdrop-blur-xl"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {showGamesError ? (
        <ErrorState message={errorGames} />
      ) : showGamesSkeleton ? (
        <SkeletonGrid />
      ) : showGamesEmpty ? (
        <EmptyState label={shortLabel} />
      ) : mergedGames.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {mergedGames.map((game, i) => (
            <MatchupCard
              key={game.id}
              game={game}
              index={i}
              isScoreFlashing={recentlyUpdated.has(game.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
