import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// drizzle-kit only loads .env by default — explicitly load .env.local
config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in .env.local");
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Only introspect our app tables in the public schema — skip Supabase internal
  // schemas (auth, storage, etc.) whose CHECK constraints crash drizzle-kit@0.31.x.
  schemaFilter: ["public"],
  tablesFilter: ["teams", "games", "fatigue_scores", "predictions"],
  extensionsFilters: ["postgis"],
  verbose: true,
  strict: true,
});
