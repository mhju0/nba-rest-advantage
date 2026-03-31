import { cn } from "@/lib/utils"

/** Score treated as 100% fill on the bar — scores above are clamped. */
const SCALE_MAX = 10

/**
 * Five-tier color scale based on fatigue score value.
 * Applies identically to home and away teams — the same score
 * always renders the same color regardless of context.
 *
 *   0–1.5  fresh       → green   (#10B981)
 *   1.5–3  good shape  → emerald (#34D399)
 *   3–4.5  moderate    → amber   (#F59E0B)
 *   4.5–6  tired       → orange  (#F97316)
 *   6+     fatigued    → red     (#EF4444)
 */
function getBarColor(score: number): string {
  if (score < 1.5) return "bg-[#10B981]"
  if (score < 3.0) return "bg-[#34D399]"
  if (score < 4.5) return "bg-[#F59E0B]"
  if (score < 6.0) return "bg-[#F97316]"
  return "bg-[#EF4444]"
}

interface FatigueBarProps {
  score: number
  className?: string
}

/**
 * Horizontal fill bar that colors itself based on the absolute fatigue
 * score value. Green (fresh) → emerald → amber → orange → red (fatigued).
 * Same color scale for both teams — no home/away bias in the visual.
 */
export function FatigueBar({ score, className }: FatigueBarProps) {
  const fillPct = Math.min((score / SCALE_MAX) * 100, 100)

  return (
    <div
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70",
        className
      )}
      role="progressbar"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={SCALE_MAX}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          getBarColor(score)
        )}
        style={{ width: `${fillPct}%` }}
      />
    </div>
  )
}
