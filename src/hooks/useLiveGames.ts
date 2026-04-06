"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

/** Partial game update from the Realtime subscription. */
export interface LiveGameUpdate {
  homeScore?: number | null;
  awayScore?: number | null;
  status?: string;
}

/**
 * Subscribes to Supabase Realtime changes on the `games` table for a set of
 * game IDs. Returns a map of game ID → changed fields whenever a row is updated.
 *
 * Cleans up the subscription on unmount or when gameIds change.
 */
export function useLiveGames(gameIds: number[]) {
  const [liveUpdates, setLiveUpdates] = useState<Record<number, LiveGameUpdate>>({});
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<number>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (gameIds.length === 0) return;

    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    // Reset updates when game IDs change
    setLiveUpdates({});
    setRecentlyUpdated(new Set());

    const idSet = new Set(gameIds);

    const channel = supabase
      .channel(`games-live-${gameIds.join(",")}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
        },
        (payload) => {
          const row = payload.new as {
            id: number;
            home_score: number | null;
            away_score: number | null;
            status: string;
          };

          // Only process updates for games we're tracking (O(1) Set lookup)
          if (!idSet.has(row.id)) return;

          setLiveUpdates((prev) => ({
            ...prev,
            [row.id]: {
              homeScore: row.home_score,
              awayScore: row.away_score,
              status: row.status,
            },
          }));

          // Mark game as recently updated for flash animation
          setRecentlyUpdated((prev) => new Set(prev).add(row.id));

          // Clear the flash after 600ms
          setTimeout(() => {
            setRecentlyUpdated((prev) => {
              const next = new Set(prev);
              next.delete(row.id);
              return next;
            });
          }, 600);
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("[Realtime] Failed to connect to games channel");
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [gameIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return { liveUpdates, recentlyUpdated };
}
