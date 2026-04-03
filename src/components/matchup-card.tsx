"use client"

import { useCallback, useState, type KeyboardEvent } from "react"
import Image from "next/image"
import { ChevronDown } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FatigueBar } from "@/components/fatigue-bar"
import { TRAVEL_LOOKBACK_DAYS } from "@/lib/fatigue"
import { NBA_TEAM_IDS } from "@/lib/nba-team-ids"
import { getTeamBranding } from "@/lib/team-history"
import { cn } from "@/lib/utils"
import type { FatigueInfo, GameResponse } from "@/types"

// ─── Constants ───────────────────────────────────────────────────

/** Minimum |differential| to show advantage/disadvantage highlight. */
const HIGHLIGHT_THRESHOLD = 1.0

function formatOdds(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

const detailGlass = {
  background: "rgba(255, 255, 255, 0.42)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
} as const

// ─── Team logo ───────────────────────────────────────────────────

function TeamLogo({
  abbreviation,
  season,
  fallback,
}: {
  abbreviation: string
  season?: string
  fallback?: { name: string; city: string }
}) {
  const [error, setError] = useState(false)

  const logoUrl =
    season !== undefined
      ? getTeamBranding(abbreviation, season, fallback).logoUrl
      : (() => {
          const nbaId = NBA_TEAM_IDS[abbreviation]
          return nbaId
            ? `https://cdn.nba.com/logos/nba/${nbaId}/global/L/logo.svg`
            : null
        })()

  if (!logoUrl || error) {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 font-heading text-[10px] font-bold text-slate-500">
        {abbreviation}
      </div>
    )
  }

  return (
    <Image
      src={logoUrl}
      alt={`${abbreviation} logo`}
      width={40}
      height={40}
      unoptimized
      className="size-10 shrink-0 object-contain"
      onError={() => setError(true)}
    />
  )
}

// ─── Score display ───────────────────────────────────────────────

function LiveIndicator() {
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#C9082A]">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C9082A] opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-[#C9082A]" />
      </span>
      Live
    </span>
  )
}

function LiveScoreHero({
  homeScore,
  awayScore,
}: {
  homeScore: number | null
  awayScore: number | null
}) {
  if (awayScore === null || homeScore === null) return null
  const awayLeading = awayScore > homeScore
  const homeLeading = homeScore > awayScore
  return (
    <div className="mb-2 flex items-baseline justify-center gap-3 font-heading tabular-nums">
      <span
        className={cn(
          awayLeading ? "text-2xl font-bold text-[#17408B]" : "text-lg font-semibold text-slate-500"
        )}
      >
        {awayScore}
      </span>
      <span className="text-base font-medium text-slate-300">–</span>
      <span
        className={cn(
          homeLeading ? "text-2xl font-bold text-[#17408B]" : "text-lg font-semibold text-slate-500"
        )}
      >
        {homeScore}
      </span>
    </div>
  )
}

function FinalScoreHero({
  homeScore,
  awayScore,
}: {
  homeScore: number
  awayScore: number
}) {
  const awayWon = awayScore > homeScore
  const homeWon = homeScore > awayScore
  const tie = awayScore === homeScore
  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <span className="text-center text-[10px] font-medium uppercase tracking-wider text-slate-400">
        Final
      </span>
      <div className="flex items-baseline justify-center gap-4 font-heading tabular-nums">
        <span
          className={cn(
            tie ? "text-3xl font-bold text-slate-800" : awayWon ? "text-4xl font-bold text-[#17408B]" : "text-2xl font-semibold text-slate-400"
          )}
        >
          {awayScore}
        </span>
        <span className="text-xl font-medium text-slate-300">–</span>
        <span
          className={cn(
            tie ? "text-3xl font-bold text-slate-800" : homeWon ? "text-4xl font-bold text-[#17408B]" : "text-2xl font-semibold text-slate-400"
          )}
        >
          {homeScore}
        </span>
      </div>
    </div>
  )
}

export function GameStatusRow({
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
      <div className="flex flex-col items-center gap-1">
        <LiveIndicator />
        <LiveScoreHero homeScore={homeScore} awayScore={awayScore} />
      </div>
    )
  }

  if (status === "final" && awayScore !== null && homeScore !== null) {
    return <FinalScoreHero homeScore={homeScore} awayScore={awayScore} />
  }

  if (status === "final") {
    return (
      <span className="text-center text-xs font-medium uppercase tracking-wider text-slate-400">
        Final
      </span>
    )
  }

  return (
    <span className="text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
      Upcoming
    </span>
  )
}

function B2BBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-[#C9082A] px-1.5 py-px font-heading text-[10px] font-bold uppercase leading-3 tracking-wide text-white">
      B2B
    </span>
  )
}

function ScheduleStressBadge({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-amber-500/95 px-1.5 py-px font-heading text-[10px] font-bold uppercase leading-3 tracking-wide text-white shadow-sm",
        className
      )}
    >
      {label}
    </span>
  )
}

function RoadTripBadge({ nights }: { nights: number }) {
  if (nights < 2) return null
  return (
    <ScheduleStressBadge
      label={`Road ×${nights}`}
      className="bg-[#17408B]/90"
    />
  )
}

export function RaBadge({
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
        "inline-flex items-center rounded-full px-3 py-0.5 font-heading text-xs font-bold text-white",
        isHomeAdv ? "bg-[#17408B]" : "bg-[#C9082A]"
      )}
      style={{ boxShadow: `0 0 14px ${baseColor}40, 0 2px 6px ${baseColor}25` }}
    >
      {abbr} +{diff} RA
    </span>
  )
}

function PenaltyMark({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "font-heading text-sm font-semibold tabular-nums",
        active ? "text-red-600" : "text-emerald-600"
      )}
      aria-label={active ? "Yes" : "No"}
    >
      {active ? "✓" : "✗"}
    </span>
  )
}

export function FatigueDetailColumn({
  label,
  fatigue,
}: {
  label: string
  fatigue: FatigueInfo | null
}) {
  if (!fatigue) {
    return (
      <div className="rounded-xl border border-white/40 px-3 py-3 text-center text-xs text-slate-400">
        No fatigue data
      </div>
    )
  }

  const travelHigh = fatigue.travelDistanceMiles >= 1000

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-white/50 px-3 py-3">
      <p className="border-b border-slate-200/60 pb-1.5 text-center font-heading text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </p>

      <div className="flex justify-between gap-2 text-xs">
        <span className="text-slate-500">Games (30d / 7d)</span>
        <span className="font-heading font-semibold tabular-nums text-slate-800">
          {fatigue.gamesInLast30Days} / {fatigue.gamesInLast7Days}
        </span>
      </div>

      <div className="flex justify-between gap-2 text-xs">
        <span className="text-slate-500">Back-to-back</span>
        <PenaltyMark active={fatigue.isBackToBack} />
      </div>

      <div className="flex justify-between gap-2 text-xs">
        <span className="text-slate-500">3 in 4 nights</span>
        <PenaltyMark active={fatigue.is3In4} />
      </div>

      <div className="flex justify-between gap-2 text-xs">
        <span className="text-slate-500">4 in 6 nights</span>
        <PenaltyMark active={fatigue.is4In6} />
      </div>

      <div className="flex justify-between gap-2 text-xs">
        <span className="text-slate-500">Road trip (streak)</span>
        <span
          className={cn(
            "font-heading font-semibold tabular-nums",
            fatigue.roadTripConsecutiveAway >= 3 ? "text-[#17408B]" : "text-slate-800"
          )}
        >
          {fatigue.roadTripConsecutiveAway === 0 ? "—" : `×${fatigue.roadTripConsecutiveAway}`}
        </span>
      </div>

      <div className="flex justify-between gap-2 text-xs">
        <span className="text-slate-500">Coast swing</span>
        <PenaltyMark active={fatigue.hasCoastToCoastRoadSwing} />
      </div>

      <div className="flex justify-between gap-2 text-xs">
        <span
          className="text-slate-500"
          title={`Cumulative great-circle miles over the prior ${TRAVEL_LOOKBACK_DAYS} days (scheduled legs)`}
        >
          Travel (mi, {TRAVEL_LOOKBACK_DAYS}d)
        </span>
        <span
          className={cn(
            "font-heading font-semibold tabular-nums",
            travelHigh ? "text-red-600" : "text-slate-800"
          )}
        >
          {Math.round(fatigue.travelDistanceMiles).toLocaleString()} mi
        </span>
      </div>

      <div className="flex justify-between gap-2 text-xs">
        <span className="text-slate-500">Altitude</span>
        <div className="text-right">
          <PenaltyMark active={fatigue.altitudePenalty} />
          {fatigue.altitudeArenaLabel ? (
            <p className="mt-0.5 max-w-[9rem] text-[10px] leading-tight text-slate-400">
              {fatigue.altitudeArenaLabel}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex justify-between gap-2 text-xs">
        <span className="text-slate-500">Prior game OT</span>
        <PenaltyMark active={fatigue.isOvertimePenalty} />
      </div>

      <div className="flex justify-between gap-2 text-xs">
        <span className="text-slate-500">Days since last game</span>
        <span className="font-heading font-semibold tabular-nums text-slate-800">
          {fatigue.daysRest === null ? "—" : `${fatigue.daysRest}d`}
        </span>
      </div>
    </div>
  )
}

export function TeamRow({
  side,
  abbreviation,
  displayAbbreviation,
  season,
  teamFallback,
  fatigue,
  score,
  highlight,
  moneyline,
}: {
  side: "AWAY" | "HOME"
  abbreviation: string
  displayAbbreviation: string
  season: string
  teamFallback: { name: string; city: string }
  fatigue: FatigueInfo | null
  score: number | null
  highlight: "advantage" | "disadvantage" | "neutral"
  moneyline?: number | null
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
        <TeamLogo
          abbreviation={abbreviation}
          season={season}
          fallback={teamFallback}
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            {side}
          </span>
          <span className="font-heading text-sm font-bold text-slate-800">
            {displayAbbreviation}
          </span>
          {moneyline != null && (
            <span className="text-xs font-medium tabular-nums text-slate-400">
              {formatOdds(moneyline)}
            </span>
          )}
          {fatigue?.isBackToBack && <B2BBadge />}
          {fatigue?.is3In4 && <ScheduleStressBadge label="3in4" />}
          {fatigue?.is4In6 && <ScheduleStressBadge label="4in6" />}
          {fatigue && (
            <RoadTripBadge nights={fatigue.roadTripConsecutiveAway} />
          )}
          {fatigue?.hasCoastToCoastRoadSwing && (
            <ScheduleStressBadge label="Coast" className="bg-violet-600/95" />
          )}
        </div>
        <span className="ml-auto shrink-0 font-heading text-base font-semibold tabular-nums text-slate-700">
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
  index?: number
  isScoreFlashing?: boolean
}

export function MatchupCard({ game, index = 0, isScoreFlashing = false }: MatchupCardProps) {
  const [expanded, setExpanded] = useState(false)

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

  const toggle = useCallback(() => {
    setExpanded((e) => !e)
  }, [])

  const onKeyDown = useCallback(
    (ev: KeyboardEvent<HTMLDivElement>) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault()
        toggle()
      }
    },
    [toggle]
  )

  return (
    <div
      className="animate-[fadeInUp_0.4s_ease-out_forwards] overflow-hidden rounded-2xl"
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <Card
        className={cn(
          "ring-0 rounded-2xl border border-white/50",
          "transition-all duration-300 ease-in-out hover:scale-[1.02]",
          isScoreFlashing && "animate-[scoreFlash_0.5s_ease-out]"
        )}
        style={{
          background: "rgba(255, 255, 255, 0.6)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "0 8px 32px rgba(23, 64, 139, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
        }}
      >
        <CardHeader className="gap-0 pb-2">
          <div
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse game details" : "Expand game details"}
            onClick={toggle}
            onKeyDown={onKeyDown}
            className="cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#17408B]/35"
          >
            <GameStatusRow
              status={game.status}
              homeScore={game.homeScore}
              awayScore={game.awayScore}
            />

            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg font-bold leading-tight text-slate-900">
                  <span className="font-heading font-bold">{awayBrand.abbreviation}</span>
                  <span className="mx-1.5 font-normal text-slate-300">@</span>
                  <span className="font-heading font-bold">{homeBrand.abbreviation}</span>
                </CardTitle>
              </div>
              <ChevronDown
                className={cn(
                  "size-5 shrink-0 text-slate-400 transition-transform duration-300 ease-out",
                  expanded && "rotate-180"
                )}
                aria-hidden
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-3 pt-0">
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
            moneyline={game.awayMoneyline}
          />

          <div className="flex items-center justify-center gap-2 py-0.5">
            <RaBadge
              restAdvantage={game.restAdvantage}
              homeAbbr={homeBrand.abbreviation}
              awayAbbr={awayBrand.abbreviation}
            />
            {game.spread != null && (
              <span className="inline-flex items-center rounded-full border border-[#17408B]/20 bg-[#17408B]/[0.06] px-2.5 py-0.5 text-xs font-medium tabular-nums text-[#17408B]/70">
                {homeBrand.abbreviation} {game.spread > 0 ? "+" : ""}{game.spread}
              </span>
            )}
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
            moneyline={game.homeMoneyline}
          />
        </CardContent>
      </Card>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div
            className="mt-2 rounded-2xl border border-white/45 px-3 py-4 sm:px-4"
            style={detailGlass}
          >
            <p className="mb-3 text-center font-heading text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Fatigue breakdown
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FatigueDetailColumn label={`Away · ${awayBrand.abbreviation}`} fatigue={game.awayFatigue} />
              <FatigueDetailColumn label={`Home · ${homeBrand.abbreviation}`} fatigue={game.homeFatigue} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
