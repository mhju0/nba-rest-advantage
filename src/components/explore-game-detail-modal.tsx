"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { createPortal } from "react-dom"
import { format, parseISO } from "date-fns"
import { ChevronLeft, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  FatigueDetailColumn,
  GameStatusRow,
  RaBadge,
  TeamRow,
} from "@/components/matchup-card"
import { getTeamBranding } from "@/lib/team-history"
import { cn } from "@/lib/utils"
import type {
  ApiResponse,
  GameDetailResponse,
  GameResponse,
  TeamRecentResultGame,
} from "@/types"

const HIGHLIGHT_THRESHOLD = 1.0

const detailGlass = {
  background: "rgba(255, 255, 255, 0.42)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
} as const

function RecentResultsList({
  label,
  items,
  onGameClick,
}: {
  label: string
  items: TeamRecentResultGame[]
  onGameClick: (gameId: number) => void
}) {
  return (
    <div className="rounded-xl border border-white/50 px-3 py-3">
      <p className="border-b border-slate-200/60 pb-1.5 text-center font-heading text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-center text-[11px] text-slate-400">No recent games</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {items.map((g) => (
            <li
              key={g.gameId}
              role="button"
              tabIndex={0}
              onClick={() => onGameClick(g.gameId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onGameClick(g.gameId)
                }
              }}
              className="flex cursor-pointer flex-wrap items-center justify-between gap-x-2 rounded-lg px-1.5 py-1 text-[11px] text-slate-700 transition-colors hover:bg-[#17408B]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17408B]/30"
              aria-label={`View game details: ${format(parseISO(g.date), "MMM d")} vs ${g.opponentAbbreviation}`}
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

function ExploreGameDetailBody({
  game,
  detail,
  onGameClick,
}: {
  game: GameResponse
  detail: GameDetailResponse
  onGameClick: (gameId: number) => void
}) {
  const homeBrand = getTeamBranding(game.homeTeam.abbreviation, game.season, {
    name: game.homeTeam.name,
    city: game.homeTeam.city,
  })
  const awayBrand = getTeamBranding(game.awayTeam.abbreviation, game.season, {
    name: game.awayTeam.name,
    city: game.awayTeam.city,
  })

  const absDiff = Math.abs(game.restAdvantage?.differential ?? 0)
  const showHighlight = !!game.restAdvantage && absDiff >= HIGHLIGHT_THRESHOLD
  const advantageTeam = game.restAdvantage?.advantageTeam

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

  return (
    <div className="flex flex-col gap-3">
      <GameStatusRow
        status={game.status}
        homeScore={game.homeScore}
        awayScore={game.awayScore}
      />
      <p className="text-center font-heading text-lg font-bold text-slate-900">
        {awayBrand.abbreviation}
        <span className="mx-1.5 font-normal text-slate-300">@</span>
        {homeBrand.abbreviation}
      </p>
      <p className="text-center text-[11px] text-slate-400">
        {format(parseISO(game.date), "EEEE, MMMM d, yyyy")} · {game.season}
      </p>

      <TeamRow
        side="AWAY"
        abbreviation={game.awayTeam.abbreviation}
        displayAbbreviation={awayBrand.abbreviation}
        season={game.season}
        teamFallback={{
          name: game.awayTeam.name,
          city: game.awayTeam.city,
        }}
        fatigue={game.awayFatigue}
        score={game.awayFatigue?.score ?? null}
        highlight={awayHighlight}
      />
      <div className="flex justify-center py-0.5">
        <RaBadge
          restAdvantage={game.restAdvantage}
          homeAbbr={homeBrand.abbreviation}
          awayAbbr={awayBrand.abbreviation}
        />
      </div>
      <TeamRow
        side="HOME"
        abbreviation={game.homeTeam.abbreviation}
        displayAbbreviation={homeBrand.abbreviation}
        season={game.season}
        teamFallback={{
          name: game.homeTeam.name,
          city: game.homeTeam.city,
        }}
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
            label={`Away · ${awayBrand.abbreviation}`}
            fatigue={game.awayFatigue}
          />
          <FatigueDetailColumn
            label={`Home · ${homeBrand.abbreviation}`}
            fatigue={game.homeFatigue}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-center font-heading text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Recent Games
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RecentResultsList
            label={`Away · ${awayBrand.abbreviation}`}
            items={detail.awayRecentWeek}
            onGameClick={onGameClick}
          />
          <RecentResultsList
            label={`Home · ${homeBrand.abbreviation}`}
            items={detail.homeRecentWeek}
            onGameClick={onGameClick}
          />
        </div>
      </div>
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

  // Navigation stack: history of game IDs to go back to
  const [navHistory, setNavHistory] = useState<number[]>([])
  // Currently displayed game ID (may differ from the `gameId` prop when drilling down)
  const [activeGameId, setActiveGameId] = useState<number | null>(gameId)

  // Reset state whenever the modal opens or the root gameId changes
  useEffect(() => {
    if (!open) {
      setNavHistory([])
      setActiveGameId(gameId)
      setDetail(null)
      setError(null)
      return
    }
    // Modal just opened with a (potentially new) gameId
    setNavHistory([])
    setActiveGameId(gameId)
  }, [open, gameId])

  // Fetch game detail whenever activeGameId changes (and modal is open)
  useEffect(() => {
    if (!open || activeGameId === null) {
      setDetail(null)
      setError(null)
      return
    }

    const ac = new AbortController()
    setLoading(true)
    setError(null)

    void fetch(`/api/game/${activeGameId}`, { signal: ac.signal })
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
  }, [open, activeGameId])

  const navigateTo = useCallback(
    (id: number) => {
      if (activeGameId !== null) {
        setNavHistory((prev) => [...prev, activeGameId])
      }
      setActiveGameId(id)
    },
    [activeGameId]
  )

  const goBack = useCallback(() => {
    if (navHistory.length === 0) return
    setActiveGameId(navHistory[navHistory.length - 1])
    setNavHistory((prev) => prev.slice(0, -1))
  }, [navHistory])

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
  const canGoBack = navHistory.length > 0

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
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {canGoBack && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 rounded-full px-2 text-xs text-slate-500 hover:text-slate-800"
                onClick={goBack}
                aria-label="Back to previous game"
              >
                <ChevronLeft className="size-3" />
                Back
              </Button>
            )}
            <h2 id={titleId} className="font-heading text-sm font-bold text-slate-800">
              {canGoBack ? "" : "Game details"}
            </h2>
          </div>
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
          <ExploreGameDetailBody
            game={game}
            detail={detail}
            onGameClick={navigateTo}
          />
        )}
      </div>
    </div>,
    document.body
  )
}
