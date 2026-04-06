import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const UpcomingContent = dynamic(
  () => import("@/components/upcoming-content").then((m) => m.UpcomingContent),
  {
    loading: () => (
      <div
        className="rounded-3xl border border-white/50 p-6"
        style={{
          background: "rgba(255, 255, 255, 0.6)",
          backdropFilter: "blur(16px)",
        }}
      >
        <Skeleton className="mb-4 h-4 w-48 rounded-lg bg-slate-200/80" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl bg-slate-200/80" />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
);

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
