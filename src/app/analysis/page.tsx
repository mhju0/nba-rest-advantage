import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { AnalysisContent } from "@/components/analysis-content";

export const metadata: Metadata = {
  title: "Analysis",
};

export default function AnalysisPage() {
  return (
    <div className="flex flex-col gap-8">
      {/* Page header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#17408B]">
          <BarChart3 className="size-4" />
          Historical Backtest
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Rest Advantage Analysis
        </h1>
        <p className="max-w-xl text-slate-500">
          How often does the more-rested team win? Explore win rates across
          confidence tiers, schedule contexts, and the full season.
        </p>
      </div>

      <AnalysisContent />
    </div>
  );
}
