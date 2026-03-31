"use client"

import { useState } from "react"
import Image from "next/image"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FatigueBar } from "@/components/fatigue-bar"
import { NBA_TEAM_IDS } from "@/lib/nba-team-ids"
import { cn } from "@/lib/utils"
import type { GameResponse } from "@/types"

// ─── Constants ───────────────────────────────────────────────────

/** Minimum |differential| to show advantage/disadvantage highlight. */
const HIGHLIGHT_THRESHOLD = 1.0

// ─── Team logo ───────────────────────────────────────────────────

function TeamLogo({ abbreviation }: { abbreviation: string }) {
  const [error, setError] = useState(false)
  const nbaId = NBA_TEAM_IDS[abbreviation]

  if (!nbaId || error) {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
        {abbreviation}
      </div>
    )
  }

  return (
    <Image
      src={`https://cdn.nba.com/logos/nba/${nbaId}/global/L/logo.svg`}
      alt={`${abbreviation} logo`}
      width={40}
      height={40}
      // unoptimized: SVGs don't benefit from Next.js image optimization
      unoptimized
      className="size-10 shrink-0"
      onError={() => setError(true)}
    />
  )
}

// ─── Sub-components ──────────────────────────────────────────────

function LiveIndicator() {
  return (
    <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#C9082A]">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C9082A] opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-[#C9082A]" />
      </span>
      Live
    </span>
  )
}

function LiveScore({
  homeScore,
  awayScore,
}: {
  homeScore: number | null
  awayScore: number | null
}) {
  if (awayScore === null || homeScore === null) return null
  return (
    <span className="ml-1.5 tabular-nums text-xs font-semibold text-slate-700">
      {awayScore} – {homeScore}
    </span>
  )
}

function GameStatus({
  status,
  homeScore,
  awayScore,
}: {
  status: string
  homeScore: number | null
  awayScore: number | null
}) {
  if (status === "live") {
    return (
      <span className="flex items-center">
        <LiveIndicator />
        <LiveScore homeScore={homeScore} awayScore={awayScore} />
      </span>
    )
  }

  if (status === "final" && awayScore !== null && homeScore !== null) {
    const homeWon = homeScore > awayScore
    return (
      <span className="text-xs tracking-wide text-slate-400">
        Final ·{" "}
        <span className={cn("tabular-nums", !homeWon && "font-bold text-[#17408B]")}>
          {awayScore}
        </span>
        {" – "}
        <span className={cn("tabular-nums", homeWon && "font-bold text-[#17408B]")}>
          {homeScore}
        </span>
      </span>
    )
  }

  if (status === "final") {
    return <span className="text-xs uppercase tracking-wider text-slate-400">Final</span>
  }

  return (
    <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
      Upcoming
    </span>
  )
}

/** Small pill in NBA red — used when a team played yesterday. */
function B2BBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-[#C9082A] px-1.5 py-px text-[10px] font-bold uppercase leading-3 tracking-wide text-white">
      B2B
    </span>
  )
}

/**
 * Glowing pill badge showing the rest-advantage differential.
 * NBA blue for home advantage, NBA red for away advantage.
 * Neutral gray for even matchups.
 */
function RaBadge({
  restAdvantage,
  homeAbbr,
  awayAbbr,
}: {
  restAdvantage: GameResponse["restAdvantage"]
  homeAbbr: string
  awayAbbr: string
}) {
  if (!restAdvantage) {
    return <span className="text-xs text-slate-300">No fatigue data yet</span>
  }

  const { differential, advantageTeam } = restAdvantage

  if (advantageTeam === "neutral") {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-0.5 text-xs font-medium text-slate-400">
        Even Rest
      </span>
    )
  }

  const abbr = advantageTeam === "home" ? homeAbbr : awayAbbr
  const diff = Math.abs(differential).toFixed(1)
  const isHomeAdv = advantageTeam === "home"
  const baseColor = isHomeAdv ? "#17408B" : "#C9082A"

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-0.5 text-xs font-bold text-white",
        isHomeAdv ? "bg-[#17408B]" : "bg-[#C9082A]"
      )}
      style={{ boxShadow: `0 0 14px ${baseColor}40, 0 2px 6px ${baseColor}25` }}
    >
      {abbr} +{diff} RA
    </span>
  )
}

/**
 * A single team row: logo | abbreviation | B2B? | ... | fatigue score
 * with a fatigue bar below and an optional advantage/disadvantage highlight.
 */
function TeamRow({
  side,
  abbreviation,
  isB2B,
  score,
  highlight,
}: {
  side: "AWAY" | "HOME"
  abbreviation: string
  isB2B: boolean
  score: number | null
  highlight: "advantage" | "disadvantage" | "neutral"
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg px-2 py-1.5 -mx-2 transition-colors",
        highlight === "advantage" &&
          "border-l-[3px] border-emerald-400/70 bg-emerald-50/50 pl-2.5",
        highlight === "disadvantage" &&
          "border-l-[3px] border-red-300/60 bg-red-50/30 pl-2.5"
      )}
    >
      <div className="flex items-center gap-2">
        <TeamLogo abbreviation={abbreviation} />
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            {side}
          </span>
          <span className="text-sm font-bold text-slate-800">{abbreviation}</span>
          {isB2B && <B2BBadge />}
        </div>
        <span className="ml-auto shrink-0 tabular-nums text-xs font-semibold text-slate-600">
          {score !== null ? score.toFixed(1) : "—"}
        </span>
      </div>

      {score !== null ? (
        <FatigueBar score={score} />
      ) : (
        <div className="h-1.5 w-full rounded-full border border-dashed border-slate-200" />
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────

interface MatchupCardProps {
  game: GameResponse
  /** Used for staggered fadeInUp animation delay. */
  index?: number
  /** When true, the card briefly flashes to indicate a live score change. */
  isScoreFlashing?: boolean
}

export function MatchupCard({ game, index = 0, isScoreFlashing = false }: MatchupCardProps) {
  // Determine row highlights: only show if |differential| >= threshold
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
    <div
      className="animate-[fadeInUp_0.4s_ease-out_forwards]"
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <Card
        className={cn(
          "ring-0 rounded-2xl border border-white/50",
          "transition-all duration-300 ease-in-out hover:scale-[1.025]",
          isScoreFlashing && "animate-[scoreFlash_0.5s_ease-out]"
        )}
        style={{
          background: "rgba(255, 255, 255, 0.6)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "0 8px 32px rgba(23, 64, 139, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
        }}
      >
        <CardHeader>
          <CardTitle className="text-lg font-bold text-slate-900">
            {game.awayTeam.abbreviation}
            <span className="mx-1.5 font-normal text-slate-300">@</span>
            {game.homeTeam.abbreviation}
          </CardTitle>
          <CardAction>
            <GameStatus
              status={game.status}
              homeScore={game.homeScore}
              awayScore={game.awayScore}
            />
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          <TeamRow
            side="AWAY"
            abbreviation={game.awayTeam.abbreviation}
            isB2B={game.awayFatigue?.isBackToBack ?? false}
            score={game.awayFatigue?.score ?? null}
            highlight={awayHighlight}
          />

          <div className="flex items-center justify-center py-0.5">
            <RaBadge
              restAdvantage={game.restAdvantage}
              homeAbbr={game.homeTeam.abbreviation}
              awayAbbr={game.awayTeam.abbreviation}
            />
          </div>

          <TeamRow
            side="HOME"
            abbreviation={game.homeTeam.abbreviation}
            isB2B={game.homeFatigue?.isBackToBack ?? false}
            score={game.homeFatigue?.score ?? null}
            highlight={homeHighlight}
          />
        </CardContent>
      </Card>
    </div>
  )
}
