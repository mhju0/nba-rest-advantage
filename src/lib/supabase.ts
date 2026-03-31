/**
 * Supabase browser client for Realtime subscriptions.
 *
 * NOTE: You must enable Realtime on the `games` table in the Supabase dashboard:
 *   Database → Replication → Enable for `games` table
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
