"use client"

import { useEffect, useState } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import type { TooltipContentProps } from "recharts"
import { format, parseISO } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { ApiResponse, AccuracyResponse, AccuracyTier, RollingAccuracyPoint } from "@/types"

// ─── Shared styles ────────────────────────────────────────────────

const glass = {
  background: "rgba(255, 255, 255, 0.6)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow: "0 8px 32px rgba(23, 64, 139, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
} as const

// ─── Tier config ──────────────────────────────────────────────────

const TIER_CONFIG: Record<
  AccuracyTier["label"],
  { title: string; range: string; color: string; bgClass: string; textClass: string }
> = {
  low: {
    title: "Low Confidence",
    range: "RA 0–2",
    color: "#64748b",
    bgClass: "bg-slate-500",
    textClass: "text-slate-500",
  },
  medium: {
    title: "Medium Confidence",
    range: "RA 2–5",
    color: "#17408B",
    bgClass: "bg-[#17408B]",
    textClass: "text-[#17408B]",
  },
  high: {
    title: "High Confidence",
    range: "RA 5+",
    color: "#C9082A",
    bgClass: "bg-[#C9082A]",
    textClass: "text-[#C9082A]",
  },
}

// ─── Helpers ──────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return format(parseISO(iso), "MMM d, ''yy")
}

function pct(n: number): string {
  return n === 0 ? "—" : `${n}%`
}

// ─── Custom tooltip ───────────────────────────────────────────────

function AccuracyTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as RollingAccuracyPoint
  return (
    <div
      className="rounded-xl border border-white/60 px-3 py-2 text-xs shadow-lg"
      style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)" }}
    >
      <p className="font-semibold text-slate-800">{fmtDate(d.date)}</p>
      <p className="mt-0.5 text-[#17408B]">
        Accuracy: <span className="font-bold">{d.accuracyPct}%</span>
      </p>
      <p className="text-slate-500">
        {d.cumulativeCorrect} / {d.cumulativeGames} correct
      </p>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────

function TrackerSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div className="rounded-3xl border border-white/50 px-6 py-10" style={glass}>
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-16 w-28 rounded-xl bg-slate-200/80" />
          <Skeleton className="h-4 w-44 rounded-lg bg-slate-200/80" />
          <Skeleton className="h-3 w-60 rounded-lg bg-slate-200/80" />
        </div>
      </div>
      {/* Tiers */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-3xl border border-white/50 p-6" style={glass}>
            <Skeleton className="mb-3 h-3 w-32 rounded-lg bg-slate-200/80" />
            <Skeleton className="h-10 w-20 rounded-xl bg-slate-200/80" />
            <Skeleton className="mt-2 h-3 w-28 rounded-lg bg-slate-200/80" />
          </div>
        ))}
      </div>
      {/* Chart */}
      <div className="rounded-3xl border border-white/50 p-6" style={glass}>
        <Skeleton className="mb-1 h-4 w-56 rounded-lg bg-slate-200/80" />
        <Skeleton className="mb-6 h-3 w-44 rounded-lg bg-slate-200/80" />
        <Skeleton className="h-56 w-full rounded-xl bg-slate-200/80" />
      </div>
      {/* Table */}
      <div className="rounded-3xl border border-white/50 p-6" style={glass}>
        <Skeleton className="mb-4 h-4 w-44 rounded-lg bg-slate-200/80" />
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg bg-slate-200/80" />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────

export function TrackerContent() {
  const [data, setData] = useState<AccuracyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/analysis/accuracy")
      .then((res) => res.json() as Promise<ApiResponse<AccuracyResponse>>)
      .then(({ data: d, error: e }) => {
        if (e) throw new Error(e)
        setData(d)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load accuracy data")
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <TrackerSkeleton />

  if (error || !data) {
    return (
      <div
        className="rounded-3xl border border-[#C9082A]/20 px-6 py-12 text-center"
        style={glass}
      >
        <p className="text-sm font-semibold text-[#C9082A]">Failed to load predictions</p>
        <p className="mt-1 text-xs text-[#C9082A]/60">{error ?? "Unknown error"}</p>
      </div>
    )
  }

  const noData = data.totalPredictions === 0

  return (
    <div className="flex flex-col gap-6">

      {/* ── 1. Hero accuracy stat ─────────────────────────────────── */}
      <div
        className="rounded-3xl border border-white/50 px-6 py-10 text-center"
        style={glass}
      >
        <p
          className={cn(
            "text-7xl font-black tracking-tight",
            noData ? "text-slate-300" : "text-[#17408B]"
          )}
        >
          {noData ? "—" : `${data.accuracyPct}%`}
        </p>
        <p className="mt-2 text-base font-semibold text-slate-700">Prediction Accuracy</p>
        <p className="mt-1 text-sm text-slate-400">
          {noData
            ? "No predictions yet — tracking begins when games are analyzed"
            : `${data.correctPredictions.toLocaleString()} of ${data.totalPredictions.toLocaleString()} predictions correct`}
        </p>
      </div>

      {/* ── 2. Confidence tier breakdown ──────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {data.tiers.map((tier) => {
          const cfg = TIER_CONFIG[tier.label]
          const isEmpty = tier.games === 0
          return (
            <div
              key={tier.label}
              className="rounded-3xl border border-white/50 p-6"
              style={glass}
            >
              <p className={cn("text-xs font-semibold uppercase tracking-wider", cfg.textClass)}>
                {cfg.title}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">{cfg.range}</p>
              <p
                className={cn(
                  "mt-3 text-5xl font-black tracking-tight",
                  isEmpty ? "text-slate-300" : "text-slate-900"
                )}
              >
                {pct(tier.accuracyPct)}
              </p>
              <p className="mt-1.5 text-xs text-slate-400">
                {isEmpty ? "Awaiting data" : `${tier.correct} / ${tier.games} correct`}
              </p>
              {!isEmpty && (
                <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700", cfg.bgClass)}
                    style={{ width: `${tier.accuracyPct}%` }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── 3. Rolling 30-day accuracy chart ──────────────────────── */}
      <div className="rounded-3xl border border-white/50 p-6" style={glass}>
        <p className="text-sm font-semibold text-slate-800">Rolling Accuracy Trend</p>
        <p className="mt-0.5 text-xs text-slate-400">
          Cumulative prediction accuracy over time
        </p>

        <div className="mt-6 h-56">
          {data.rolling30Days.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200">
              <p className="text-xs text-slate-400">
                Accuracy trend will appear as predictions accumulate
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.rolling30Days}
                margin={{ top: 8, right: 24, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => fmtDate(v)}
                  interval="preserveStartEnd"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
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
                  cursor={{ stroke: "rgba(23,64,139,0.15)", strokeWidth: 1 }}
                  content={(props: TooltipContentProps) => (
                    <AccuracyTooltip {...props} />
                  )}
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
                  dataKey="accuracyPct"
                  stroke="#17408B"
                  strokeWidth={2.5}
                  dot={{ fill: "#17408B", r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#17408B", strokeWidth: 2, stroke: "rgba(23,64,139,0.2)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── 4. Recent predictions table ───────────────────────────── */}
      <div className="rounded-3xl border border-white/50 p-6" style={glass}>
        <p className="mb-4 text-sm font-semibold text-slate-800">Recent Predictions</p>

        <div className="overflow-x-auto">
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
                <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-slate-400">
                  Predicted Edge
                </th>
                <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-slate-400">
                  Actual Winner
                </th>
                <th className="rounded-r-lg px-3 py-2.5 text-center font-semibold uppercase tracking-wider text-slate-400">
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {data.recentPredictions.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-10 text-center text-slate-400"
                  >
                    Recent predictions will appear here
                  </td>
                </tr>
              ) : (
                data.recentPredictions.map((p, i) => (
                  <tr
                    key={i}
                    className="border-t border-slate-100/60 transition-colors hover:bg-white/40"
                  >
                    <td className="px-3 py-3 text-slate-500">
                      {format(parseISO(p.date), "MMM d, yyyy")}
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-800">
                      {p.awayTeam.abbreviation}
                      <span className="mx-1 font-normal text-slate-300">@</span>
                      {p.homeTeam.abbreviation}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      <span className="font-semibold text-[#17408B]">
                        {p.predictedAdvantageTeam.abbreviation}
                      </span>{" "}
                      +{Math.abs(p.differential).toFixed(1)}
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-700">
                      {p.actualWinner.abbreviation}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold",
                          p.correct
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-red-50 text-[#C9082A]"
                        )}
                      >
                        {p.correct ? "✓ Correct" : "✗ Wrong"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 5. Methodology explanation ────────────────────────────── */}
      <div
        className="rounded-3xl border border-slate-200/60 px-6 py-5"
        style={{
          background: "rgba(255, 255, 255, 0.4)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
          Methodology
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Predictions are based on rest advantage differential — the difference in computed
          fatigue scores between the two teams. A higher differential indicates greater
          confidence. Games where the more-rested team wins are counted as correct predictions.
        </p>
      </div>

    </div>
  )
}
