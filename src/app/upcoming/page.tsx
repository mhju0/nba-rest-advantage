import type { Metadata } from "next";
import { Calendar } from "lucide-react";
import { UpcomingContent } from "@/components/upcoming-content";

export const metadata: Metadata = {
  title: "Future Games",
};

export default function UpcomingPage() {
  return (
    <div className="flex flex-col gap-8">
      {/* Page header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-base font-semibold text-[#17408B]">
          <Calendar className="size-4" />
          2025–26 Season
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          Future Games
        </h1>
        <p className="max-w-xl text-lg text-slate-500">
          Upcoming scheduled games filtered by Rest Advantage threshold.
        </p>
      </div>

      <UpcomingContent />
    </div>
  );
}
