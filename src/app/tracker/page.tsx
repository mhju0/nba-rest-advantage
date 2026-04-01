import type { Metadata } from "next";
import { TrackerContent } from "@/components/tracker-content";

export const metadata: Metadata = {
  title: "Rest Advantage Picks — NBA Rest Advantage",
  description:
    "Upcoming NBA games ranked by rest advantage differential for informed betting.",
};

export default function TrackerPage() {
  return (
    <div className="flex flex-col gap-8">
      <TrackerContent />
    </div>
  );
}
