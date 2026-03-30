import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FatigueBar } from "@/components/fatigue-bar"
import { cn } from "@/lib/utils"
import type { GameResponse } from "@/types"

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

function GameStatus({
  status,
  homeScore,
  awayScore,
}: {
  status: string
  homeScore: number | null
  awayScore: number | null
}) {
  if (status === "live") return <LiveIndicator />

  if (status === "final" && awayScore !== null && homeScore !== null) {
    const homeWon = homeScore > awayScore
    return (
      <span className="text-xs tracking-wide text-slate-400">
        Final ·{" "}
        <span className={cn("tabular-nums", !homeWon && "font-semibold text-[#17408B]")}>
          {awayScore}
        </span>
        {" – "}
        <span className={cn("tabular-nums", homeWon && "font-semibold text-[#17408B]")}>
          {homeScore}
        </span>
      </span>
    )
  }

  if (status === "final") {
    return (
      <span className="text-xs uppercase tracking-wider text-slate-400">Final</span>
    )
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
    return (
      <span className="text-xs text-slate-300">No fatigue data yet</span>
    )
  }

  const { differential, advantageTeam } = restAdvantage

  if (advantageTeam === "neutral") {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-0.5 text-xs font-medium text-slate-500">
        Even Rest
      </span>
    )
  }

  const abbr = advantageTeam === "home" ? homeAbbr : awayAbbr
  const diff = Math.abs(differential).toFixed(1)
  const isHomeAdv = advantageTeam === "home"

  const baseColor = isHomeAdv ? "#17408B" : "#C9082A"
  const bgClass = isHomeAdv ? "bg-[#17408B]" : "bg-[#C9082A]"

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-0.5 text-xs font-bold text-white",
        bgClass
      )}
      style={{
        boxShadow: `0 0 14px ${baseColor}40, 0 2px 6px ${baseColor}25`,
      }}
    >
      {abbr} +{diff} RA
    </span>
  )
}

function TeamRow({
  side,
  abbreviation,
  isB2B,
  score,
}: {
  side: "AWAY" | "HOME"
  abbreviation: string
  isB2B: boolean
  score: number | null
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="w-9 text-[10px] font-medium uppercase tracking-wider text-slate-400">
          {side}
        </span>
        <span className="text-sm font-bold text-slate-800">{abbreviation}</span>
        {isB2B && <B2BBadge />}
        <span className="ml-auto tabular-nums text-xs font-semibold text-slate-600">
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
}

export function MatchupCard({ game, index = 0 }: MatchupCardProps) {
  return (
    <div
      className="animate-[fadeInUp_0.4s_ease-out_both]"
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <Card
        className={cn(
          // Glass morphism
          "ring-0 border border-white/50 bg-white/65 backdrop-blur-2xl",
          // Elevated shadow with NBA blue tint
          "shadow-[0_8px_32px_rgba(23,64,139,0.08),_0_2px_8px_rgba(0,0,0,0.04)]",
          // Hover lift
          "transition-all duration-300 ease-in-out",
          "hover:scale-[1.025] hover:bg-white/75",
          "hover:shadow-[0_16px_48px_rgba(23,64,139,0.13),_0_4px_16px_rgba(0,0,0,0.06)]",
          // More rounded for the Apple-glass feel
          "rounded-2xl"
        )}
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
          />
        </CardContent>
      </Card>
    </div>
  )
}
