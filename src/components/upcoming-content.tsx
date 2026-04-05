"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { NBA_TEAM_IDS } from "@/lib/nba-team-ids"
import { Skeleton } from "@/components/ui/skeleton"
import type { ApiResponse, UpcomingGameWithRA } from "@/types"

// ─── Shared styles ─────────────────────────────────────────────────

const glass = {
  background: "rgba(255, 255, 255, 0.6)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow: "0 8px 32px rgba(23, 64, 139, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
} as const

// ─── RA threshold options ──────────────────────────────────────────

const RA_OPTIONS = [
  { label: "All", value: 0 },
  { label: "RA ≥ 2", value: 2 },
  { label: "RA ≥ 3", value: 3 },
  { label: "RA ≥ 5", value: 5 },
  { label: "RA ≥ 7", value: 7 },
]

// ─── Team logo ─────────────────────────────────────────────────────

function TeamLogo({ abbreviation }: { abbreviation: string }) {
  const [error, setError] = useState(false)
  const nbaId = NBA_TEAM_IDS[abbreviation]

  if (!nbaId || error) {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 font-heading text-[10px] font-bold text-slate-500">
        {abbreviation}
      </span>
    )
  }

  return (
    <Image
      src={`https://cdn.nba.com/logos/nba/${nbaId}/global/L/logo.svg`}
      alt={`${abbreviation} logo`}
      width={28}
      height={28}
      unoptimized
      className="size-7 shrink-0 object-contain"
      onError={() => setError(true)}
    />
  )
}

// ─── Main component ────────────────────────────────────────────────

export function UpcomingContent() {
  const [raFilter, setRaFilter] = useState(0)
  const [games, setGames] = useState<UpcomingGameWithRA[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchGames = useCallback(async (minRA: number) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ season: "2025-26" })
      if (minRA > 0) params.set("minRA", String(minRA))
      const res = await fetch(`/api/games/upcoming?${params}`)
      const json = (await res.json()) as ApiResponse<UpcomingGameWithRA[]>
      if (json.error) throw new Error(json.error)
      setGames(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load games")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchGames(raFilter)
  }, [raFilter, fetchGames])

  const pillBase =
    "rounded-full px-3 py-1 text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17408B]/40"

  return (
    <div className="rounded-3xl border border-white/50 p-6" style={glass}>
      {/* ── Filter pills ──────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {RA_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setRaFilter(opt.value)}
            className={cn(
              pillBase,
              raFilter === opt.value
                ? "bg-[#17408B] text-white shadow-sm"
                : "border border-slate-200 bg-white/60 text-slate-500 hover:border-[#17408B]/30 hover:text-[#17408B]"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Game count ────────────────────────────────────────────── */}
      {!loading && !error && (
        <p className="mb-4 text-sm text-slate-400">
          {games.length.toLocaleString()} game{games.length !== 1 ? "s" : ""} found
        </p>
      )}

      {/* ── Table ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-[#C9082A]/20 px-6 py-10 text-center">
          <p className="text-base text-[#C9082A]">{error}</p>
        </div>
      ) : games.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center">
          <p className="text-base text-slate-400">No scheduled games match this filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                style={{ background: "rgba(23,64,139,0.04)" }}
                className="rounded-lg"
              >
                <th className="rounded-l-lg px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-slate-400">
                  Date
                </th>
                <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-slate-400">
                  Matchup
                </th>
                <th className="hidden px-3 py-2.5 text-right font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                  Home Fat.
                </th>
                <th className="hidden px-3 py-2.5 text-right font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                  Away Fat.
                </th>
                <th className="px-3 py-2.5 text-center font-semibold uppercase tracking-wider text-slate-400">
                  RA
                </th>
                <th className="rounded-r-lg px-3 py-2.5 text-center font-semibold uppercase tracking-wider text-slate-400">
                  Edge
                </th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => {
                const absDiff = Math.abs(g.restAdvantageDifferential)
                const advAbbr = g.predictedAdvantageAbbreviation
                const isHomeAdv = advAbbr === g.homeTeam.abbreviation

                return (
                  <tr
                    key={g.gameId}
                    className="border-t border-slate-100/60 transition-colors hover:bg-white/40"
                  >
                    <td className="px-3 py-3 text-slate-500">
                      {format(new Date(g.date + "T00:00:00"), "MMM d")}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <TeamLogo abbreviation={g.awayTeam.abbreviation} />
                        <span className="font-medium text-slate-800">
                          {g.awayTeam.abbreviation}
                        </span>
                        <span className="text-slate-300">@</span>
                        <TeamLogo abbreviation={g.homeTeam.abbreviation} />
                        <span className="font-medium text-slate-800">
                          {g.homeTeam.abbreviation}
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 text-right tabular-nums text-slate-600 sm:table-cell">
                      {g.homeFatigueScore !== null ? g.homeFatigueScore.toFixed(1) : "—"}
                    </td>
                    <td className="hidden px-3 py-3 text-right tabular-nums text-slate-600 sm:table-cell">
                      {g.awayFatigueScore !== null ? g.awayFatigueScore.toFixed(1) : "—"}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums text-slate-700">
                      {absDiff.toFixed(1)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 font-heading text-xs font-bold text-white",
                          isHomeAdv ? "bg-[#17408B]" : "bg-[#C9082A]"
                        )}
                      >
                        {advAbbr} edge
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
