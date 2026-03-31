"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LabelList,
  Legend,
} from "recharts"
import type { TooltipContentProps } from "recharts"
import { format } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type {
  AnalysisResponse,
  ApiResponse,
  GameSearchResponse,
  GameSearchResult,
} from "@/types"

// ─── Shared styles ────────────────────────────────────────────────

const glass = {
  background: "rgba(255, 255, 255, 0.6)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow: "0 8px 32px rgba(23, 64, 139, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
} as const

// ─── Chart datum shapes ───────────────────────────────────────────

type WinRateDatum = {
  label: string
  winPct: number
  games: number
  spreadCoverRate?: number | null
  threshold?: number
}

// ─── Custom tooltips ──────────────────────────────────────────────

function WinRateTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as WinRateDatum
  return (
    <div
      className="rounded-xl border border-white/60 px-3 py-2 text-xs shadow-lg"
      style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)" }}
    >
      <p className="font-semibold text-slate-800">{d.label}</p>
      {payload.map((p) => (
        <p key={p.dataKey as string} className="mt-0.5" style={{ color: p.color }}>
          {p.dataKey === "spreadCoverRate" ? "ATS cover rate" : "Win rate"}:{" "}
          <span className="font-bold">{typeof p.value === "number" ? p.value : "--"}%</span>
        </p>
      ))}
      <p className="text-slate-500">{d.games.toLocaleString()} games</p>
      {d.threshold !== undefined && (
        <p className="mt-1 text-[10px] text-[#17408B]/70">Click to explore these games ↓</p>
      )}
    </div>
  )
}

type SeasonWinRateDatum = {
  label: string
  winPct: number
  games: number
  restedTeamWins: number
}

function SeasonWinRateTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as SeasonWinRateDatum
  return (
    <div
      className="rounded-xl border border-white/60 px-3 py-2 text-xs shadow-lg"
      style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)" }}
    >
      <p className="font-semibold text-slate-800">{d.label}</p>
      <p className="mt-0.5 text-[#17408B]">
        Win rate: <span className="font-bold">{d.winPct}%</span>
      </p>
      <p className="text-slate-500">
        {d.restedTeamWins.toLocaleString()} / {d.games.toLocaleString()} games (more-rested team won)
      </p>
    </div>
  )
}

function SeasonWinRateBySeasonChart({ data }: { data: AnalysisResponse }) {
  const chartData: SeasonWinRateDatum[] = data.seasonWinRates.map((s) => ({
    label: s.season,
    winPct: s.winPct,
    games: s.games,
    restedTeamWins: s.restedTeamWins,
  }))

  return (
    <div className="rounded-3xl border border-white/50 p-6" style={glass}>
      <p className="text-sm font-semibold text-slate-800">Win rate by season</p>
      <p className="mt-0.5 text-xs text-slate-400">
        Each bar is the full regular-season sample (Oct–Apr dates) where |rest advantage| was at least
        0.5 — useful as you add more seasons to see whether the edge is stable year to year.
      </p>

      <div className="mt-6 h-72 min-w-0">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200">
            <p className="text-xs text-slate-400">No season-level data yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id="seasonWinGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#17408B" stopOpacity={1} />
                  <stop offset="100%" stopColor="#17408B" stopOpacity={0.65} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="rgba(0,0,0,0.06)"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-32}
                textAnchor="end"
                height={52}
              />
              <YAxis
                domain={[40, 70]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "rgba(23,64,139,0.06)" }}
                content={(props: TooltipContentProps) => <SeasonWinRateTooltip {...props} />}
              />
              <ReferenceLine
                y={50}
                stroke="#C9082A"
                strokeDasharray="4 4"
                strokeOpacity={0.45}
                label={{
                  value: "Coin Flip",
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "#C9082A",
                  opacity: 0.7,
                }}
              />
              <Bar
                dataKey="winPct"
                fill="url(#seasonWinGrad)"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
              >
                <LabelList
                  dataKey="games"
                  position="top"
                  formatter={(v: string | number | boolean | null | undefined) =>
                    typeof v === "number" ? `n=${v.toLocaleString()}` : ""
                  }
                  style={{ fontSize: "10px", fill: "#94a3b8" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────

function AnalysisSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div className="rounded-3xl border border-white/50 px-6 py-10" style={glass}>
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-16 w-36 rounded-xl bg-slate-200/80" />
          <Skeleton className="h-4 w-52 rounded-lg bg-slate-200/80" />
          <Skeleton className="h-3 w-36 rounded-lg bg-slate-200/80" />
        </div>
      </div>
      {/* Bar chart */}
      <div className="rounded-3xl border border-white/50 p-6" style={glass}>
        <Skeleton className="mb-1 h-4 w-64 rounded-lg bg-slate-200/80" />
        <Skeleton className="mb-6 h-3 w-44 rounded-lg bg-slate-200/80" />
        <Skeleton className="h-64 w-full rounded-xl bg-slate-200/80" />
      </div>
      {/* Breakdown */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-3xl border border-white/50 p-6" style={glass}>
            <Skeleton className="mb-3 h-3 w-40 rounded-lg bg-slate-200/80" />
            <Skeleton className="h-12 w-24 rounded-xl bg-slate-200/80" />
            <Skeleton className="mt-2 h-3 w-44 rounded-lg bg-slate-200/80" />
            <Skeleton className="mt-4 h-1.5 w-full rounded-full bg-slate-200/80" />
          </div>
        ))}
      </div>
      {/* Line chart */}
      <div className="rounded-3xl border border-white/50 p-6" style={glass}>
        <Skeleton className="mb-1 h-4 w-48 rounded-lg bg-slate-200/80" />
        <Skeleton className="mb-6 h-3 w-64 rounded-lg bg-slate-200/80" />
        <Skeleton className="h-64 w-full rounded-xl bg-slate-200/80" />
      </div>
    </div>
  )
}

// ─── Explore Games constants ───────────────────────────────────────

const RA_OPTIONS = [
  { label: "All", value: 0 },
  { label: "RA ≥ 2", value: 2 },
  { label: "RA ≥ 3", value: 3 },
  { label: "RA ≥ 5", value: 5 },
  { label: "RA ≥ 7", value: 7 },
]

const SEASONS = [
  "2025-26", "2024-25", "2023-24", "2022-23", "2021-22", "2020-21",
  "2018-19", "2017-18", "2016-17", "2015-16",
]

const NBA_TEAMS = [
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN",
  "DET", "GSW", "HOU", "IND", "LAC", "LAL", "MEM", "MIA",
  "MIL", "MIN", "NOP", "NYK", "OKC", "ORL", "PHI", "PHX",
  "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
]

const PAGE_SIZE = 20

// ─── Explore Games sub-component ──────────────────────────────────

function ExploreGames({
  exploreRef,
  initialRaFilter,
}: {
  exploreRef: React.RefObject<HTMLDivElement | null>
  initialRaFilter: number
}) {
  const [raFilter, setRaFilter] = useState(initialRaFilter)
  const [teamFilter, setTeamFilter] = useState("")
  const [seasonFilter, setSeasonFilter] = useState("")
  const [resultFilter, setResultFilter] = useState<"all" | "correct" | "incorrect">("all")
  const [page, setPage] = useState(1)
  const [results, setResults] = useState<GameSearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Sync when parent changes the RA filter via bar chart click
  useEffect(() => {
    setRaFilter(initialRaFilter)
    setPage(1)
  }, [initialRaFilter])

  const doFetch = useCallback(
    async (opts: {
      raFilter: number
      teamFilter: string
      seasonFilter: string
      resultFilter: string
      page: number
    }) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (opts.raFilter > 0) params.set("minRA", String(opts.raFilter))
        if (opts.teamFilter) params.set("team", opts.teamFilter)
        if (opts.seasonFilter) params.set("season", opts.seasonFilter)
        if (opts.resultFilter !== "all") params.set("result", opts.resultFilter)
        params.set("page", String(opts.page))
        params.set("limit", String(PAGE_SIZE))

        const res = await fetch(`/api/games/search?${params}`)
        const json = (await res.json()) as ApiResponse<GameSearchResponse>
        if (json.error) throw new Error(json.error)
        setResults(json.data.games)
        setTotal(json.data.total)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load games")
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void doFetch({ raFilter, teamFilter, seasonFilter, resultFilter, page })
  }, [raFilter, teamFilter, seasonFilter, resultFilter, page, doFetch])

  const handleRaChange = useCallback((v: number) => {
    setRaFilter(v)
    setPage(1)
  }, [])

  const handleTeamChange = useCallback((v: string) => {
    setTeamFilter(v)
    setPage(1)
  }, [])

  const handleSeasonChange = useCallback((v: string) => {
    setSeasonFilter(v)
    setPage(1)
  }, [])

  const handleResultChange = useCallback((v: "all" | "correct" | "incorrect") => {
    setResultFilter(v)
    setPage(1)
  }, [])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const start = (page - 1) * PAGE_SIZE + 1
  const end = Math.min(page * PAGE_SIZE, total)

  const selectClass =
    "rounded-lg border border-white/60 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-[#17408B]/30"

  return (
    <div ref={exploreRef} className="rounded-3xl border border-white/50 p-6" style={glass}>
      <p className="text-sm font-semibold text-slate-800">Explore Games</p>
      <p className="mt-0.5 text-xs text-slate-400">
        Filter and browse individual matchups
      </p>

      {/* ── Filters ─────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-2">
        {/* RA filter */}
        <select
          value={raFilter}
          onChange={(e) => handleRaChange(Number(e.target.value))}
          className={selectClass}
          aria-label="Rest advantage filter"
        >
          {RA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Team filter */}
        <select
          value={teamFilter}
          onChange={(e) => handleTeamChange(e.target.value)}
          className={selectClass}
          aria-label="Team filter"
        >
          <option value="">All Teams</option>
          {NBA_TEAMS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {/* Season filter */}
        <select
          value={seasonFilter}
          onChange={(e) => handleSeasonChange(e.target.value)}
          className={selectClass}
          aria-label="Season filter"
        >
          <option value="">All Seasons</option>
          {SEASONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Result filter */}
        <select
          value={resultFilter}
          onChange={(e) => handleResultChange(e.target.value as "all" | "correct" | "incorrect")}
          className={selectClass}
          aria-label="Result filter"
        >
          <option value="all">All Results</option>
          <option value="correct">Rested Team Won</option>
          <option value="incorrect">Rested Team Lost</option>
        </select>

        {/* Active filter indicators */}
        {(raFilter > 0 || teamFilter || seasonFilter || resultFilter !== "all") && (
          <button
            onClick={() => {
              setRaFilter(0)
              setTeamFilter("")
              setSeasonFilter("")
              setResultFilter("all")
              setPage(1)
            }}
            className="rounded-lg border border-slate-200 bg-white/50 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────── */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
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
              <th className="hidden px-3 py-2.5 text-center font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">
                Score
              </th>
              <th className="rounded-r-lg px-3 py-2.5 text-center font-semibold uppercase tracking-wider text-slate-400">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-slate-100/60">
                  <td colSpan={7} className="px-3 py-3">
                    <Skeleton className="h-4 w-full rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-xs text-[#C9082A]">
                  {error}
                </td>
              </tr>
            ) : results.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                  No games match the current filters
                </td>
              </tr>
            ) : (
              results.map((g, i) => {
                const advAbbr =
                  g.advantageTeam === "home"
                    ? g.homeTeamAbbreviation
                    : g.awayTeamAbbreviation
                return (
                  <tr
                    key={i}
                    className="border-t border-slate-100/60 transition-colors hover:bg-white/40"
                  >
                    <td className="px-3 py-3 text-slate-500">
                      {format(new Date(g.date + "T00:00:00"), "MMM d, yyyy")}
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-800">
                      {g.awayTeamAbbreviation}
                      <span className="mx-1 font-normal text-slate-300">@</span>
                      {g.homeTeamAbbreviation}
                    </td>
                    <td className="hidden px-3 py-3 text-right tabular-nums text-slate-600 sm:table-cell">
                      {g.homeFatigueScore.toFixed(1)}
                    </td>
                    <td className="hidden px-3 py-3 text-right tabular-nums text-slate-600 sm:table-cell">
                      {g.awayFatigueScore.toFixed(1)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex items-center rounded-full bg-[#17408B]/10 px-2 py-0.5 font-heading text-[11px] font-bold text-[#17408B]">
                        {advAbbr} +{g.restAdvantageDifferential.toFixed(1)}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 text-center tabular-nums text-slate-700 sm:table-cell">
                      {g.awayScore}–{g.homeScore}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={
                          g.restedTeamWon
                            ? "inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600"
                            : "inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-[#C9082A]"
                        }
                      >
                        {g.restedTeamWon ? "✓ Won" : "✗ Lost"}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ──────────────────────────────────────────── */}
      {total > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {loading ? "Loading…" : `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="flex size-7 items-center justify-center rounded-lg border border-white/60 bg-white/60 text-slate-600 transition-colors hover:bg-white disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="px-2 text-xs text-slate-500">
              {page} / {totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="flex size-7 items-center justify-center rounded-lg border border-white/60 bg-white/60 text-slate-600 transition-colors hover:bg-white disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────

export function AnalysisContent() {
  const [data, setData] = useState<AnalysisResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drillRaFilter, setDrillRaFilter] = useState(0)

  const exploreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/api/analysis")
      .then((res) => res.json() as Promise<ApiResponse<AnalysisResponse>>)
      .then(({ data: d, error: e }) => {
        if (e) throw new Error(e)
        setData(d)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load analysis")
      })
      .finally(() => setLoading(false))
  }, [])

  const handleBarClick = useCallback(
    // Recharts passes the whole datum object as the first arg; cast to our shape
    (datum: unknown) => {
      const d = datum as WinRateDatum
      const threshold = d.threshold ?? 0
      setDrillRaFilter(threshold)
      setTimeout(() => {
        exploreRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 60)
    },
    []
  )

  if (loading) return <AnalysisSkeleton />

  if (error || !data) {
    return (
      <div
        className="rounded-3xl border border-[#C9082A]/20 px-6 py-12 text-center"
        style={glass}
      >
        <p className="text-sm font-semibold text-[#C9082A]">Failed to load analysis</p>
        <p className="mt-1 text-xs text-[#C9082A]/60">{error ?? "Unknown error"}</p>
      </div>
    )
  }

  // ── Shape data for charts ────────────────────────────────────────

  const barData: WinRateDatum[] = data.thresholds.map((t) => ({
    label: `RA ≥ ${t.threshold}`,
    winPct: t.winPct,
    games: t.games,
    spreadCoverRate: t.spreadCoverRate,
    threshold: t.threshold,
  }))

  const ra5 = data.thresholds.find((t) => t.threshold === 5)
  const ra7 = data.thresholds.find((t) => t.threshold === 7)
  const hasSpreadData = data.thresholds.some((t) => t.spreadCoverRate !== null)

  const winRateTooltipRenderer = (props: TooltipContentProps) => (
    <WinRateTooltip {...props} />
  )
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
        Historical backtest: among final regular-season games with fatigue data, did the more-rested
        team win? This does not read stored prediction rows. For graded predictions and the remaining
        schedule, use the{" "}
        <a
          href="/tracker"
          className="font-medium text-[#17408B] underline-offset-2 hover:underline"
        >
          Prediction Tracker
        </a>
        .
      </p>

      {/* ── 1. Hero stat ──────────────────────────────────────────── */}
      <div
        className="rounded-3xl border border-white/50 px-6 py-10 text-center"
        style={glass}
      >
        <p className="text-7xl font-black tracking-tight text-[#17408B]">
          {data.overallWinRate}%
        </p>
        <p className="mt-2 text-base font-semibold text-slate-700">
          More-rested team win rate
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Across {data.totalGames.toLocaleString()} games analyzed
        </p>
      </div>

      {/* ── 2. Bar chart — win rate by threshold ──────────────────── */}
      <div className="rounded-3xl border border-white/50 p-6" style={glass}>
        <p className="text-sm font-semibold text-slate-800">
          Win Rate by Rest Advantage Threshold
        </p>
        <p className="mt-0.5 text-xs text-slate-400">
          Higher rest advantage = stronger signal
          {hasSpreadData && " · Blue = win rate, green = ATS cover rate"}
          {" · "}
          <span className="font-medium text-[#17408B]/80">Click a bar to explore those games ↓</span>
        </p>

        <div className="mt-6 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 24, right: 24, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#17408B" stopOpacity={1} />
                  <stop offset="100%" stopColor="#17408B" stopOpacity={0.6} />
                </linearGradient>
                <linearGradient id="spreadGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity={1} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="rgba(0,0,0,0.06)"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[45, 75]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "rgba(23,64,139,0.06)" }}
                content={winRateTooltipRenderer}
              />
              <ReferenceLine
                y={50}
                stroke="#C9082A"
                strokeDasharray="4 4"
                strokeOpacity={0.45}
                label={{
                  value: "Coin Flip",
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "#C9082A",
                  opacity: 0.7,
                }}
              />
              <Bar
                dataKey="winPct"
                fill="url(#barGrad)"
                radius={[6, 6, 0, 0]}
                maxBarSize={hasSpreadData ? 48 : 72}
                style={{ cursor: "pointer" }}
                onClick={handleBarClick}
              >
                <LabelList
                  dataKey="games"
                  position="top"
                  formatter={(v: string | number | boolean | null | undefined) =>
                    typeof v === "number" ? `n=${v.toLocaleString()}` : ""
                  }
                  style={{ fontSize: "10px", fill: "#94a3b8" }}
                />
              </Bar>
              {hasSpreadData && (
                <Bar
                  dataKey="spreadCoverRate"
                  fill="url(#spreadGrad)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
              )}
              {hasSpreadData && (
                <Legend
                  formatter={(value: string) =>
                    value === "winPct" ? "Win Rate" : "ATS Cover Rate"
                  }
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px", color: "#64748b" }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 3. Home vs Away breakdown ─────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Home team more rested */}
        <div className="rounded-3xl border border-white/50 p-6" style={glass}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#17408B]">
            Home Team More Rested
          </p>
          <p className="mt-3 text-5xl font-black tracking-tight text-slate-900">
            {data.homeAwayBreakdown.homeTeamMoreRested.winPct}%
          </p>
          <p className="mt-1.5 text-sm text-slate-500">
            {data.homeAwayBreakdown.homeTeamMoreRested.restedTeamWins.toLocaleString()} wins /{" "}
            {data.homeAwayBreakdown.homeTeamMoreRested.games.toLocaleString()} games
          </p>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#17408B] transition-all duration-700"
              style={{ width: `${data.homeAwayBreakdown.homeTeamMoreRested.winPct}%` }}
            />
          </div>
        </div>

        {/* Away team more rested */}
        <div className="rounded-3xl border border-white/50 p-6" style={glass}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#C9082A]">
            Away Team More Rested
          </p>
          <p className="mt-3 text-5xl font-black tracking-tight text-slate-900">
            {data.homeAwayBreakdown.awayTeamMoreRested.winPct}%
          </p>
          <p className="mt-1.5 text-sm text-slate-500">
            {data.homeAwayBreakdown.awayTeamMoreRested.restedTeamWins.toLocaleString()} wins /{" "}
            {data.homeAwayBreakdown.awayTeamMoreRested.games.toLocaleString()} games
          </p>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#C9082A] transition-all duration-700"
              style={{ width: `${data.homeAwayBreakdown.awayTeamMoreRested.winPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── 4. Win rate by season ─────────────────────────────────── */}
      <SeasonWinRateBySeasonChart data={data} />

      {/* ── 5. Key insight callout ────────────────────────────────── */}
      {ra5 && (
        <div
          className="rounded-3xl border border-[#17408B]/15 px-6 py-5"
          style={{
            background: "rgba(23, 64, 139, 0.045)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
        >
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#17408B]/70">
            Key Insight
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            Teams with a Rest Advantage of{" "}
            <span className="font-semibold text-slate-900">+5 or more</span> win{" "}
            <span className="font-bold text-[#17408B]">{ra5.winPct}%</span> of games — a
            significant edge over the coin-flip baseline.
            {ra7 && (
              <>
                {" "}
                At RA ≥ 7, that rises to{" "}
                <span className="font-bold text-[#17408B]">{ra7.winPct}%</span> across{" "}
                {ra7.games.toLocaleString()} games, suggesting the fatigue signal compounds at
                the extremes.
              </>
            )}
          </p>
        </div>
      )}

      {/* ── 6. ATS Performance ────────────────────────────────────── */}
      {data.atsOverall && (
        <div className="rounded-3xl border border-white/50 p-6" style={glass}>
          <p className="text-sm font-semibold text-slate-800">ATS Performance</p>
          <p className="mt-0.5 text-xs text-slate-400">
            How often the more-rested team covers the spread
          </p>

          <div className="mt-5 flex items-end gap-3">
            <p className="text-5xl font-black tracking-tight text-[#059669]">
              {data.atsOverall.coverRate}%
            </p>
            <p className="mb-1 text-sm text-slate-500">
              ATS cover rate ·{" "}
              {data.atsOverall.covered}/{data.atsOverall.total} games
            </p>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#059669] transition-all duration-700"
              style={{ width: `${data.atsOverall.coverRate}%` }}
            />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.thresholds
              .filter((t) => t.spreadCoverRate !== null)
              .map((t) => (
                <div
                  key={t.threshold}
                  className="rounded-2xl border border-white/60 px-3 py-3 text-center"
                  style={{ background: "rgba(255,255,255,0.4)" }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    RA ≥ {t.threshold}
                  </p>
                  <p className="mt-1 text-2xl font-black text-[#059669]">
                    {t.spreadCoverRate}%
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {t.games.toLocaleString()} games
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── 7. Explore Games ──────────────────────────────────────── */}
      <ExploreGames exploreRef={exploreRef} initialRaFilter={drillRaFilter} />

    </div>
  )
}
