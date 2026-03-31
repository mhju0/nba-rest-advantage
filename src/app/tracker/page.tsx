import type { Metadata } from "next";
import { Target } from "lucide-react";
import { TrackerContent } from "@/components/tracker-content";

export const metadata: Metadata = {
  title: "Prediction Tracker",
};

export default function TrackerPage() {
  return (
    <div className="flex flex-col gap-8">
      {/* Page header */}
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

      <TrackerContent />
    </div>
  );
}
