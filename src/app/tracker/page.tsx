import type { Metadata } from "next";
import { Target } from "lucide-react";

export const metadata: Metadata = {
  title: "Prediction Tracker",
};

export default function TrackerPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#17408B]">
          <Target className="size-4" />
          Accuracy Tracking
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Prediction Tracker
        </h1>
        <p className="max-w-xl text-slate-500">
          A running scorecard of every rest-advantage prediction versus the
          actual outcome. Accuracy broken down by confidence tier.
        </p>
      </div>

      <div className="flex items-center justify-center rounded-3xl border border-white/50 bg-white/60 px-6 py-20 text-center shadow-[0_8px_32px_rgba(23,64,139,0.06)] backdrop-blur-2xl">
        <p className="text-sm text-slate-400">Prediction history coming soon.</p>
      </div>
    </div>
  );
}
