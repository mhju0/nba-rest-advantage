"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { addDays, format, parseISO, startOfDay } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"
import { getTeamBranding } from "@/lib/team-history"
import { cn } from "@/lib/utils"
import type { ApiResponse, PicksResponse, UpcomingPickExtended } from "@/types"

// ─── Shared styles ────────────────────────────────────────────────

const glass = {
  background: "rgba(255, 255, 255, 0.6)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow: "0 8px 32px rgba(23, 64, 139, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
} as const

const glassPill =
  "rounded-full border border-white/50 bg-white/55 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-[0_4px_24px_rgba(23,64,139,0.06)] backdrop-blur-xl transition-colors hover:bg-white/70"

// ─── Helpers ──────────────────────────────────────────────────────

function formatAmericanOdds(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

function pickCardTierClasses(tier: UpcomingPickExtended["tier"]): {
  border: string
  badgeWrap: string
  badgeText: string
  barFill: string
} {
  if (tier === "high") {
    return {
      border: "border-l-4 border-l-[#C9082A]",
      badgeWrap: "bg-[#C9082A]/10",
      badgeText: "text-[#C9082A]",
      barFill: "bg-[#C9082A]",
    }
  }
  if (tier === "medium") {
    return {
      border: "border-l-4 border-l-[#17408B]",
      badgeWrap: "bg-[#17408B]/10",
      badgeText: "text-[#17408B]",
      barFill: "bg-[#17408B]",
    }
  }
  return {
    border: "",
    badgeWrap: "bg-slate-100",
    badgeText: "text-slate-500",
    barFill: "bg-slate-400",
  }
}

function tierBarWidth(tier: UpcomingPickExtended["tier"], absDiff: number): string {
  if (tier === "high") return "min(100%, 92%)"
  if (tier === "medium") return "min(100%, 68%)"
  if (tier === "low") return `${Math.min(100, 35 + absDiff * 8)}%`
  return "28%"
}

// ─── Pick logo ───────────────────────────────────────────────────

function PickTeamLogo({
  abbreviation,
  season,
  fallback,
}: {
  abbreviation: string
  season: string
  fallback: { name: string; city: string }
}) {
  const [error, setError] = useState(false)
  const { logoUrl } = getTeamBranding(abbreviation, season, fallback)

  if (error) {
    return (
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-100 font-heading text-[10px] font-bold text-slate-500">
        {abbreviation}
      </div>
    )
  }

  return (
    <Image
      src={logoUrl}
      alt=""
      width={44}
      height={44}
      unoptimized
      className="size-11 shrink-0 object-contain"
      onError={() => setError(true)}
    />
  )
}

// ─── Skeleton ───────────────────────────────────────────────────

function PicksCardSkeleton() {
  return (
    <div
      className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-white/50 p-4"
      style={glass}
    >
      <Skeleton className="h-4 w-28 rounded-lg bg-slate-200/80" />
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="size-11 shrink-0 rounded-full bg-slate-200/80" />
            <Skeleton className="h-4 w-32 rounded-lg bg-slate-200/80" />
          </div>
          <Skeleton className="h-3 w-10 rounded bg-slate-200/80" />
        </div>
        <Skeleton className="mx-auto h-3 w-16 rounded bg-slate-200/80" />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="size-11 shrink-0 rounded-full bg-slate-200/80" />
            <Skeleton className="h-4 w-32 rounded-lg bg-slate-200/80" />
          </div>
          <Skeleton className="h-3 w-10 rounded bg-slate-200/80" />
        </div>
      </div>
      <Skeleton className="h-16 w-full rounded-xl bg-slate-200/80" />
      <Skeleton className="h-3 w-full rounded bg-slate-200/80" />
    </div>
  )
}

function PicksSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <PicksCardSkeleton key={i} />
      ))}
    </div>
  )
}

// ─── Pick card ──────────────────────────────────────────────────

function PickCard({ pick }: { pick: UpcomingPickExtended }) {
  const homeBrand = getTeamBranding(pick.homeTeam.abbreviation, pick.season, {
    name: pick.homeTeam.name,
    city: pick.homeTeam.city,
  })
  const awayBrand = getTeamBranding(pick.awayTeam.abbreviation, pick.season, {
    name: pick.awayTeam.name,
    city: pick.awayTeam.city,
  })

  const absDiff = pick.differential !== null ? Math.abs(pick.differential) : 0
  const tierStyles = pickCardTierClasses(pick.tier)
  const barW = tierBarWidth(pick.tier, absDiff)

  const hasPrediction =
    pick.predictedAdvantageTeam !== null && pick.differential !== null

  const predBranding =
    hasPrediction && pick.predictedAdvantageTeam
      ? pick.predictedAdvantageTeam.abbreviation.toUpperCase() ===
          pick.homeTeam.abbreviation.toUpperCase()
        ? homeBrand
        : pick.predictedAdvantageTeam.abbreviation.toUpperCase() ===
            pick.awayTeam.abbreviation.toUpperCase()
          ? awayBrand
          : getTeamBranding(
              pick.predictedAdvantageTeam.abbreviation,
              pick.season,
              {
                name: pick.predictedAdvantageTeam.name,
                city: "",
              }
            )
      : null

  const predAbbr = predBranding?.abbreviation ?? ""
  const diffStr =
    pick.differential === null
      ? ""
      : `${pick.differential >= 0 ? "+" : ""}${pick.differential.toFixed(1)}`

  return (
    <div
      className={cn(
        "flex flex-col gap-4 overflow-hidden rounded-2xl border border-white/50 p-4 transition-colors",
        tierStyles.border
      )}
      style={glass}
    >
      <p className="font-heading text-xs font-semibold uppercase tracking-wider text-slate-400">
        {format(parseISO(pick.date), "MMM d, yyyy")}
      </p>

      {/* Away row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <PickTeamLogo
            abbreviation={pick.awayTeam.abbreviation}
            season={pick.season}
            fallback={{ name: pick.awayTeam.name, city: pick.awayTeam.city }}
          />
          <div className="min-w-0">
            <p className="font-heading text-sm font-bold text-slate-900">
              {awayBrand.abbreviation}{" "}
              <span className="font-medium text-slate-600">{awayBrand.name}</span>
            </p>
          </div>
        </div>
        {pick.moneyline ? (
          <span className="shrink-0 font-heading text-xs tabular-nums text-slate-400">
            {formatAmericanOdds(pick.moneyline.away)}
          </span>
        ) : null}
      </div>

      <div className="flex justify-center">
        <span className="text-[10px] font-medium uppercase tracking-widest text-slate-300">
          vs
        </span>
      </div>

      {/* Home row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <PickTeamLogo
            abbreviation={pick.homeTeam.abbreviation}
            season={pick.season}
            fallback={{ name: pick.homeTeam.name, city: pick.homeTeam.city }}
          />
          <div className="min-w-0">
            <p className="font-heading text-sm font-bold text-slate-900">
              {homeBrand.abbreviation}{" "}
              <span className="font-medium text-slate-600">{homeBrand.name}</span>
            </p>
          </div>
        </div>
        {pick.moneyline ? (
          <span className="shrink-0 font-heading text-xs tabular-nums text-slate-400">
            {formatAmericanOdds(pick.moneyline.home)}
          </span>
        ) : null}
      </div>

      {/* RA block */}
      <div
        className={cn(
          "rounded-xl border px-3 py-3",
          hasPrediction ? "border-white/50 bg-white/40" : "border-slate-200/80 bg-slate-50/50"
        )}
      >
        {hasPrediction ? (
          <>
            <p className="text-center font-heading text-[11px] font-bold uppercase tracking-wide text-slate-600">
              Rest advantage: {predAbbr}{" "}
              <span className="text-slate-900">{diffStr}</span>
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
              <div
                className={cn("h-full rounded-full transition-all", tierStyles.barFill)}
                style={{ width: barW }}
              />
            </div>
            <p
              className={cn(
                "mt-2 text-center font-heading text-[10px] font-bold uppercase tracking-wider",
                tierStyles.badgeText
              )}
            >
              <span className={cn("rounded-full px-2 py-0.5", tierStyles.badgeWrap)}>
                {pick.tier === "high"
                  ? "High"
                  : pick.tier === "medium"
                    ? "Medium"
                    : pick.tier === "low"
                      ? "Low"
                      : "Signal"}
              </span>
            </p>
          </>
        ) : (
          <p className="text-center text-xs font-medium text-slate-400">
            Awaiting analysis
          </p>
        )}
      </div>

      <div className="flex flex-col items-center gap-1">
        {pick.spread != null && (
          <p className="text-[11px] font-medium tabular-nums text-slate-400">
            Spread: {homeBrand.abbreviation}{" "}
            {pick.spread > 0 ? "+" : ""}
            {pick.spread}
          </p>
        )}
        <p className="text-center text-[11px] text-slate-500">
          Fatigue:{" "}
          <span className="font-heading font-semibold tabular-nums text-slate-700">
            {awayBrand.abbreviation}{" "}
            {pick.awayFatigueScore !== null ? pick.awayFatigueScore.toFixed(1) : "—"}
          </span>
          <span className="mx-1.5 text-slate-300">·</span>
          <span className="font-heading font-semibold tabular-nums text-slate-700">
            {homeBrand.abbreviation}{" "}
            {pick.homeFatigueScore !== null ? pick.homeFatigueScore.toFixed(1) : "—"}
          </span>
        </p>
      </div>
    </div>
  )
}

// ─── Main ───────────────────────────────────────────────────────

export function TrackerContent() {
  const [payload, setPayload] = useState<PicksResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tierFilter, setTierFilter] = useState<
    "all" | "high" | "medium" | "low"
  >("all")
  const [rangeFilter, setRangeFilter] = useState<"today" | "7d" | "14d" | "all">(
    "all"
  )
  const [sortBy, setSortBy] = useState<"date" | "ra">("date")

  useEffect(() => {
    fetch("/api/picks")
      .then(async (res) => {
        const body = (await res.json()) as ApiResponse<PicksResponse>
        if (!res.ok || body.error) {
          throw new Error(body.error ?? `Request failed (${res.status})`)
        }
        return body.data
      })
      .then(setPayload)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load picks")
      })
      .finally(() => setLoading(false))
  }, [])

  const todayStart = startOfDay(new Date())
  const todayYmd = format(todayStart, "yyyy-MM-dd")
  const end7 = format(addDays(todayStart, 7), "yyyy-MM-dd")
  const end14 = format(addDays(todayStart, 14), "yyyy-MM-dd")

  const filteredSorted = useMemo(() => {
    if (!payload?.picks.length) return []
    let list = [...payload.picks]

    if (tierFilter !== "all") {
      list = list.filter((p) => p.tier === tierFilter)
    }

    if (rangeFilter === "today") {
      list = list.filter((p) => p.date === todayYmd)
    } else if (rangeFilter === "7d") {
      list = list.filter((p) => p.date >= todayYmd && p.date <= end7)
    } else if (rangeFilter === "14d") {
      list = list.filter((p) => p.date >= todayYmd && p.date <= end14)
    }

    if (sortBy === "date") {
      list.sort((a, b) => {
        const dc = a.date.localeCompare(b.date)
        if (dc !== 0) return dc
        const ad = Math.abs(a.differential ?? 0)
        const bd = Math.abs(b.differential ?? 0)
        return bd - ad
      })
    } else {
      list.sort((a, b) => {
        const ad = Math.abs(a.differential ?? 0)
        const bd = Math.abs(b.differential ?? 0)
        if (bd !== ad) return bd - ad
        return a.date.localeCompare(b.date)
      })
    }

    return list
  }, [payload, tierFilter, rangeFilter, sortBy, todayYmd, end7, end14])

  const totalPicks = payload?.picks.length ?? 0

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PicksSkeletonGrid />
      </div>
    )
  }

  if (error || !payload) {
    return (
      <div
        className="rounded-3xl border border-[#C9082A]/20 px-6 py-12 text-center"
        style={glass}
      >
        <p className="text-sm font-semibold text-[#C9082A]">Failed to load picks</p>
        <p className="mt-1 text-xs text-[#C9082A]/60">{error ?? "Unknown error"}</p>
      </div>
    )
  }

  const seasonLabel = payload.season

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Rest Advantage Picks
        </h1>
        <p className="text-lg font-medium tracking-tight text-[#17408B]">
          {seasonLabel} Season
        </p>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
          Upcoming games ranked by our fatigue model. Higher rest advantage = stronger
          signal.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/50 px-5 py-4" style={glass}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Total picks
          </p>
          <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-slate-900">
            {payload.summary.total}
          </p>
        </div>
        <div className="rounded-2xl border border-white/50 px-5 py-4" style={glass}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#C9082A]">
            High confidence (RA ≥ 5)
          </p>
          <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-[#C9082A]">
            {payload.summary.highConfidence}
          </p>
        </div>
        <div className="rounded-2xl border border-white/50 px-5 py-4" style={glass}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#17408B]">
            Medium confidence (RA 2–5)
          </p>
          <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-[#17408B]">
            {payload.summary.mediumConfidence}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Confidence
          </span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "All"],
                ["high", "High"],
                ["medium", "Medium"],
                ["low", "Low"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTierFilter(key)}
                className={cn(
                  glassPill,
                  tierFilter === key &&
                    "bg-[#17408B]/12 text-[#17408B] ring-2 ring-[#17408B]/25"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Time range
          </span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", "Today"],
                ["7d", "Next 7 Days"],
                ["14d", "Next 14 Days"],
                ["all", "All"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setRangeFilter(key)}
                className={cn(
                  glassPill,
                  rangeFilter === key &&
                    "bg-[#17408B]/12 text-[#17408B] ring-2 ring-[#17408B]/25"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Sort
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSortBy("date")}
              className={cn(
                glassPill,
                sortBy === "date" &&
                  "bg-[#17408B]/12 text-[#17408B] ring-2 ring-[#17408B]/25"
              )}
            >
              Date ↑
            </button>
            <button
              type="button"
              onClick={() => setSortBy("ra")}
              className={cn(
                glassPill,
                sortBy === "ra" &&
                  "bg-[#17408B]/12 text-[#17408B] ring-2 ring-[#17408B]/25"
              )}
            >
              RA ↓
            </button>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-500">
        Showing{" "}
        <span className="font-heading font-semibold text-slate-800">
          {filteredSorted.length}
        </span>{" "}
        of {totalPicks} picks
      </p>

      {/* Grid */}
      {totalPicks === 0 ? (
        <div
          className="flex flex-col items-center gap-4 rounded-3xl border border-white/50 px-6 py-16 text-center"
          style={glass}
        >
          <Image
            src="https://cdn.nba.com/logos/leagues/logo-nba.svg"
            alt="NBA"
            width={64}
            height={64}
            unoptimized
            className="size-16 object-contain"
          />
          <h2 className="text-lg font-bold tracking-tight text-slate-800">
            No upcoming picks
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-slate-500">
            The schedule hasn&apos;t been loaded yet, or the season has ended. Check back
            when new games are on the calendar.
          </p>
        </div>
      ) : filteredSorted.length === 0 ? (
        <div
          className="rounded-3xl border border-white/50 px-6 py-12 text-center text-sm text-slate-500"
          style={glass}
        >
          No picks match your filters. Try widening the time range or confidence filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredSorted.map((pick) => (
            <PickCard key={pick.gameId} pick={pick} />
          ))}
        </div>
      )}
    </div>
  )
}
