import { cn } from "@/lib/utils"

/** Score treated as 100% fill on the bar — scores above are clamped. */
const SCALE_MAX = 10

/**
 * Color thresholds matching the NBA palette:
 *   0–2  fresh    → teal green
 *   2–4  moderate → hardwood tan (#C4853C)
 *   4+   fatigued → NBA red (#C9082A)
 */
function getBarColor(score: number): string {
  if (score < 2) return "bg-[#10B981]"   // fresh — teal green
  if (score < 4) return "bg-[#C4853C]"   // moderate — hardwood tan
  return "bg-[#C9082A]"                   // fatigued — NBA red
}

interface FatigueBarProps {
  score: number
  className?: string
}

/**
 * Horizontal bar that fills and changes color based on fatigue score.
 * Green (0–2) → tan (2–4) → red (4+). Rounded ends, capped at SCALE_MAX.
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
