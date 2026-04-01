"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { createPortal } from "react-dom"
import { format, parseISO } from "date-fns"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  FatigueDetailColumn,
  GameStatusRow,
  RaBadge,
  TeamRow,
} from "@/components/matchup-card"
import { cn } from "@/lib/utils"
import type { ApiResponse, GameDetailResponse, TeamRecentResultGame } from "@/types"

const HIGHLIGHT_THRESHOLD = 1.0

const detailGlass = {
  background: "rgba(255, 255, 255, 0.42)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
} as const

function RecentResultsList({
  label,
  items,
}: {
  label: string
  items: TeamRecentResultGame[]
}) {
  return (
    <div className="rounded-xl border border-white/50 px-3 py-3">
      <p className="border-b border-slate-200/60 pb-1.5 text-center font-heading text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-center text-[11px] text-slate-400">No games in prior 7 days</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {items.map((g) => (
            <li
              key={g.date + g.opponentAbbreviation}
              className="flex flex-wrap items-center justify-between gap-x-2 text-[11px] text-slate-700"
            >
              <span className="text-slate-500">
                {format(parseISO(g.date), "MMM d")}
                {g.isHome ? " vs " : " @ "}
                <span className="font-semibold text-slate-800">{g.opponentAbbreviation}</span>
              </span>
              <span className="font-heading tabular-nums text-slate-600">
                <span className={g.won ? "text-emerald-600" : "text-[#C9082A]"}>
                  {g.won ? "W" : "L"}
                </span>{" "}
                {g.teamScore}–{g.opponentScore}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ExploreGameDetailModal({
  gameId,
  open,
  onOpenChange,
}: {
  gameId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const titleId = useId()
  const [detail, setDetail] = useState<GameDetailResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || gameId === null) {
      setDetail(null)
      setError(null)
      return
    }

    const ac = new AbortController()
    setLoading(true)
    setError(null)

    void fetch(`/api/game/${gameId}`, { signal: ac.signal })
      .then(async (res) => {
        const json = (await res.json()) as ApiResponse<GameDetailResponse | null>
        if (!res.ok) throw new Error(json.error ?? res.statusText)
        if (!json.data) throw new Error("No data")
        setDetail(json.data)
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return
        setError(err instanceof Error ? err.message : "Failed to load")
        setDetail(null)
      })
      .finally(() => setLoading(false))

    return () => ac.abort()
  }, [open, gameId])

  const onBackdrop = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  if (!open || typeof document === "undefined") return null

  const game = detail?.game
  const absDiff = Math.abs(game?.restAdvantage?.differential ?? 0)
  const showHighlight = !!game?.restAdvantage && absDiff >= HIGHLIGHT_THRESHOLD
  const advantageTeam = game?.restAdvantage?.advantageTeam

  const awayHighlight: "advantage" | "disadvantage" | "neutral" = showHighlight
    ? advantageTeam === "away"
      ? "advantage"
      : "disadvantage"
    : "neutral"

  const homeHighlight: "advantage" | "disadvantage" | "neutral" = showHighlight
    ? advantageTeam === "home"
      ? "advantage"
      : "disadvantage"
    : "neutral"

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onBackdrop}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative z-[101] max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/50 p-4 shadow-2xl",
          "sm:p-5"
        )}
        style={{
          background: "rgba(255, 255, 255, 0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 id={titleId} className="font-heading text-sm font-bold text-slate-800">
            Game details
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-full"
            onClick={() => onOpenChange(false)}
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </Button>
        </div>

        {loading && (
          <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
        )}
        {error && (
          <p className="py-6 text-center text-sm text-[#C9082A]">{error}</p>
        )}
        {!loading && !error && game && detail && (
          <div className="flex flex-col gap-3">
            <GameStatusRow
              status={game.status}
              homeScore={game.homeScore}
              awayScore={game.awayScore}
            />
            <p className="text-center font-heading text-lg font-bold text-slate-900">
              {game.awayTeam.abbreviation}
              <span className="mx-1.5 font-normal text-slate-300">@</span>
              {game.homeTeam.abbreviation}
            </p>
            <p className="text-center text-[11px] text-slate-400">
              {format(parseISO(game.date), "EEEE, MMMM d, yyyy")} · {game.season}
            </p>

            <TeamRow
              side="AWAY"
              abbreviation={game.awayTeam.abbreviation}
              fatigue={game.awayFatigue}
              score={game.awayFatigue?.score ?? null}
              highlight={awayHighlight}
            />
            <div className="flex justify-center py-0.5">
              <RaBadge
                restAdvantage={game.restAdvantage}
                homeAbbr={game.homeTeam.abbreviation}
                awayAbbr={game.awayTeam.abbreviation}
              />
            </div>
            <TeamRow
              side="HOME"
              abbreviation={game.homeTeam.abbreviation}
              fatigue={game.homeFatigue}
              score={game.homeFatigue?.score ?? null}
              highlight={homeHighlight}
            />

            <div
              className="mt-1 rounded-2xl border border-white/45 px-3 py-4 sm:px-4"
              style={detailGlass}
            >
              <p className="mb-3 text-center font-heading text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Fatigue breakdown
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FatigueDetailColumn
                  label={`Away · ${game.awayTeam.abbreviation}`}
                  fatigue={game.awayFatigue}
                />
                <FatigueDetailColumn
                  label={`Home · ${game.homeTeam.abbreviation}`}
                  fatigue={game.homeFatigue}
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-center font-heading text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Recent games (7 days before this game)
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <RecentResultsList
                  label={`Away · ${game.awayTeam.abbreviation}`}
                  items={detail.awayRecentWeek}
                />
                <RecentResultsList
                  label={`Home · ${game.homeTeam.abbreviation}`}
                  items={detail.homeRecentWeek}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
