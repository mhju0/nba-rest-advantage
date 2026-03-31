"use client"

import { useEffect, useMemo, useState } from "react"
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
  LineChart,
  Line,
  Legend,
} from "recharts"
import type { TooltipContentProps } from "recharts"
import { format, parse } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"
import type { AnalysisResponse, ApiResponse, SeasonTypeStats } from "@/types"

// ─── Shared styles ────────────────────────────────────────────────

const glass = {
  background: "rgba(255, 255, 255, 0.6)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow: "0 8px 32px rgba(23, 64, 139, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
} as const

// ─── Helpers ──────────────────────────────────────────────────────

function fmtMonth(ym: string): string {
  return format(parse(ym, "yyyy-MM", new Date()), "MMM ''yy")
}

// ─── Chart datum shapes ───────────────────────────────────────────

type WinRateDatum = { label: string; winPct: number; games: number; spreadCoverRate?: number | null }

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
    </div>
  )
}

function MonthlyTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as WinRateDatum
  const isSmall = d.games < 10
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
        {d.games.toLocaleString()} games{isSmall ? " (small sample)" : ""}
      </p>
    </div>
  )
}

// ─── Custom dot for monthly chart (small-sample months get hollow dots) ──

function MonthlyDot(props: Record<string, unknown>) {
  const { cx, cy, payload } = props as { cx: number; cy: number; payload: WinRateDatum }
  if ((payload.games ?? 10) < 10) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="white"
        stroke="#17408B"
        strokeWidth={1.5}
        strokeDasharray="2 2"
      />
    )
  }
  return <circle cx={cx} cy={cy} r={3} fill="#17408B" strokeWidth={0} />
}

// ─── Skeleton ─────────────────────────────────────────────────────

function AnalysisSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Tab bar */}
      <div className="flex justify-center">
        <Skeleton className="h-9 w-72 rounded-full bg-slate-200/80" />
      </div>
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

// ─── Tab pill ─────────────────────────────────────────────────────

type SeasonFilter = "all" | "regular" | "playoffs"

const TAB_LABELS: Record<SeasonFilter, string> = {
  all: "All Games",
  regular: "Regular Season",
  playoffs: "Playoffs",
}

function SeasonTabs({
  value,
  onChange,
}: {
  value: SeasonFilter
  onChange: (v: SeasonFilter) => void
}) {
  return (
    <div className="flex justify-center">
      <div
        className="flex gap-1 rounded-full border border-white/60 p-1"
        style={{
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: "0 2px 12px rgba(23,64,139,0.07)",
        }}
      >
        {(["all", "regular", "playoffs"] as SeasonFilter[]).map((tab) => (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={[
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-150",
              value === tab
                ? "bg-[#17408B] text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            ].join(" ")}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────

export function AnalysisContent() {
  const [data, setData] = useState<AnalysisResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>("all")

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

  // Derive the "view" data based on selected season filter
  const viewData = useMemo((): SeasonTypeStats | null => {
    if (!data) return null
    if (seasonFilter === "all") {
      return {
        totalGames: data.totalGames,
        overallWins: data.overallWins,
        overallWinRate: data.overallWinRate,
        thresholds: data.thresholds,
        homeAwayBreakdown: data.homeAwayBreakdown,
        monthlyTrends: data.monthlyTrends,
        atsOverall: data.atsOverall,
      }
    }
    return data.seasonTypeBreakdown[seasonFilter]
  }, [data, seasonFilter])

  if (loading) return <AnalysisSkeleton />

  if (error || !data || !viewData) {
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

  const barData: WinRateDatum[] = viewData.thresholds.map((t) => ({
    label: `RA ≥ ${t.threshold}`,
    winPct: t.winPct,
    games: t.games,
    spreadCoverRate: t.spreadCoverRate,
  }))

  const lineData: WinRateDatum[] = viewData.monthlyTrends.map((t) => ({
    label: fmtMonth(t.month),
    winPct: t.winPct,
    games: t.games,
  }))

  const ra5 = viewData.thresholds.find((t) => t.threshold === 5)
  const ra7 = viewData.thresholds.find((t) => t.threshold === 7)
  const hasSpreadData = viewData.thresholds.some((t) => t.spreadCoverRate !== null)

  const winRateTooltipRenderer = (props: TooltipContentProps) => (
    <WinRateTooltip {...props} />
  )
  const monthlyTooltipRenderer = (props: TooltipContentProps) => (
    <MonthlyTooltip {...props} />
  )

  return (
    <div className="flex flex-col gap-6">

      {/* ── Season type tab toggle ────────────────────────────────── */}
      <SeasonTabs value={seasonFilter} onChange={setSeasonFilter} />

      {/* ── 1. Hero stat ──────────────────────────────────────────── */}
      <div
        className="rounded-3xl border border-white/50 px-6 py-10 text-center"
        style={glass}
      >
        <p className="text-7xl font-black tracking-tight text-[#17408B]">
          {viewData.overallWinRate}%
        </p>
        <p className="mt-2 text-base font-semibold text-slate-700">
          More-rested team win rate
          {seasonFilter !== "all" && (
            <span className="ml-1.5 text-sm font-normal text-slate-400">
              ({TAB_LABELS[seasonFilter]})
            </span>
          )}
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Across {viewData.totalGames.toLocaleString()} games analyzed
        </p>
      </div>

      {/* ── 2. Bar chart — win rate by threshold ──────────────────── */}
      <div className="rounded-3xl border border-white/50 p-6" style={glass}>
        <p className="text-sm font-semibold text-slate-800">
          Win Rate by Rest Advantage Threshold
        </p>
        <p className="mt-0.5 text-xs text-slate-400">
          Higher rest advantage differential = stronger predictive signal
          {hasSpreadData && " · Blue = win rate, green = ATS cover rate"}
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
                cursor={{ fill: "rgba(23,64,139,0.04)" }}
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
              <Bar dataKey="winPct" fill="url(#barGrad)" radius={[6, 6, 0, 0]} maxBarSize={hasSpreadData ? 48 : 72}>
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
                <Bar dataKey="spreadCoverRate" fill="url(#spreadGrad)" radius={[6, 6, 0, 0]} maxBarSize={48} />
              )}
              {hasSpreadData && (
                <Legend
                  formatter={(value) =>
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
            {viewData.homeAwayBreakdown.homeTeamMoreRested.winPct}%
          </p>
          <p className="mt-1.5 text-sm text-slate-500">
            {viewData.homeAwayBreakdown.homeTeamMoreRested.restedTeamWins.toLocaleString()} wins /{" "}
            {viewData.homeAwayBreakdown.homeTeamMoreRested.games.toLocaleString()} games
          </p>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#17408B] transition-all duration-700"
              style={{ width: `${viewData.homeAwayBreakdown.homeTeamMoreRested.winPct}%` }}
            />
          </div>
        </div>

        {/* Away team more rested */}
        <div className="rounded-3xl border border-white/50 p-6" style={glass}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#C9082A]">
            Away Team More Rested
          </p>
          <p className="mt-3 text-5xl font-black tracking-tight text-slate-900">
            {viewData.homeAwayBreakdown.awayTeamMoreRested.winPct}%
          </p>
          <p className="mt-1.5 text-sm text-slate-500">
            {viewData.homeAwayBreakdown.awayTeamMoreRested.restedTeamWins.toLocaleString()} wins /{" "}
            {viewData.homeAwayBreakdown.awayTeamMoreRested.games.toLocaleString()} games
          </p>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#C9082A] transition-all duration-700"
              style={{ width: `${viewData.homeAwayBreakdown.awayTeamMoreRested.winPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── 4. Monthly trends line chart ──────────────────────────── */}
      <div className="rounded-3xl border border-white/50 p-6" style={glass}>
        <p className="text-sm font-semibold text-slate-800">Monthly Win Rate Trend</p>
        <p className="mt-0.5 text-xs text-slate-400">
          Win rate of the more-rested team, month by month
          {seasonFilter === "all" && " across all seasons"}
          {seasonFilter === "regular" && " · Regular season only"}
          {seasonFilter === "playoffs" && " · Postseason only"}
          {" · "}
          <span className="italic">Hollow dots = &lt;10 games (small sample)</span>
        </p>

        <div className="mt-6 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="label"
                interval={2}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[20, 90]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                cursor={{ stroke: "rgba(23,64,139,0.15)", strokeWidth: 1 }}
                content={monthlyTooltipRenderer}
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
              <Line
                type="monotone"
                dataKey="winPct"
                stroke="#17408B"
                strokeWidth={2.5}
                dot={MonthlyDot}
                activeDot={{ r: 5, fill: "#17408B", strokeWidth: 2, stroke: "rgba(23,64,139,0.2)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

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
            Key Insight{seasonFilter !== "all" ? ` · ${TAB_LABELS[seasonFilter]}` : ""}
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
                {ra7.games} games, suggesting the fatigue signal compounds at the extremes.
              </>
            )}
            {seasonFilter === "playoffs" && (
              <>{" "}Rest advantage is especially impactful in the postseason, where every edge matters.</>
            )}
          </p>
        </div>
      )}

      {/* ── 6. Season type breakdown (All Games view only) ────────── */}
      {seasonFilter === "all" && (
        <div className="rounded-3xl border border-white/50 p-6" style={glass}>
          <p className="text-sm font-semibold text-slate-800">Regular Season vs. Playoffs</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Rest advantage win rate broken down by season segment
          </p>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(["regular", "playoffs"] as const).map((type) => {
              const stats = data.seasonTypeBreakdown[type]
              const label = type === "regular" ? "Regular Season" : "Playoffs & Finals"
              const color = type === "regular" ? "#17408B" : "#C9082A"
              return (
                <div key={type} className="flex flex-col gap-1">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>
                    {label}
                  </p>
                  <p className="text-4xl font-black tracking-tight text-slate-900">
                    {stats.overallWinRate}%
                  </p>
                  <p className="text-xs text-slate-500">
                    {stats.overallWins.toLocaleString()} wins / {stats.totalGames.toLocaleString()} games
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${stats.overallWinRate}%`, background: color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 7. ATS Performance (shown when spread data exists) ───── */}
      {viewData.atsOverall && (
        <div className="rounded-3xl border border-white/50 p-6" style={glass}>
          <p className="text-sm font-semibold text-slate-800">ATS Performance</p>
          <p className="mt-0.5 text-xs text-slate-400">
            How often the more-rested team covers the spread
          </p>

          {/* Overall ATS record */}
          <div className="mt-5 flex items-end gap-3">
            <p className="text-5xl font-black tracking-tight text-[#059669]">
              {viewData.atsOverall.coverRate}%
            </p>
            <p className="mb-1 text-sm text-slate-500">
              ATS cover rate ·{" "}
              {viewData.atsOverall.covered}/{viewData.atsOverall.total} games
            </p>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#059669] transition-all duration-700"
              style={{ width: `${viewData.atsOverall.coverRate}%` }}
            />
          </div>

          {/* Per-threshold ATS */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {viewData.thresholds
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

    </div>
  )
}
