# CLAUDE.md — NBA Rest Advantage Project Instructions

> Context document for AI coding assistants working on this repo. Covers architecture, conventions, known issues, and the data pipeline.

---

## Project Overview

**NBA Rest Advantage** is a full-stack analytics platform that quantifies how travel distance and schedule density affect NBA game outcomes. It's a portfolio project targeting software engineering roles at Korean tech companies (Coupang, Toss, LINE, Kakao).

**Live site:** https://nba-rest-advantage.vercel.app

**Key finding:** More-rested teams win ~53.5% of decidable games. At RA ≥ 5, win rate climbs to ~61.7%. Rest advantage does NOT erase home court — away teams with rest advantage still only win ~49.8%.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | Supabase (managed PostgreSQL) |
| ORM | Drizzle ORM (schema-first) |
| Charts | Recharts |
| Validation | Zod |
| Data pipeline | Python (nba_api, pandas, psycopg2) |
| Deployment | Vercel + GitHub Actions |
| Testing | Vitest (unit) + Playwright (E2E) |
| Package manager | pnpm |

---

## Project Structure

```
nba-rest-advantage/
├── .github/workflows/
│   └── daily-update.yml          # Nightly GH Actions pipeline (21:00 UTC)
├── drizzle/                      # SQL migration files
├── e2e/                          # Playwright E2E specs
├── scripts/                      # Python + TypeScript data pipeline scripts
│   ├── daily_update.py           # Main daily orchestrator (called by GH Actions)
│   ├── run-daily.ts              # Computes fatigue + predictions for upcoming games
│   ├── fetch_schedule.py         # Historical game data via nba_api LeagueGameFinder
│   ├── fetch_nba_schedule_cdn.py # Current season schedule from NBA CDN (includes future games)
│   ├── fetch_odds.ts             # Standalone odds fetcher
│   ├── fetch_odds_lib.ts         # Shared odds logic (the-odds-api.com)
│   ├── fetch_spreads.py          # Spread data from CSV (manual)
│   ├── seed_teams.py             # Seeds 30 NBA teams into DB
│   ├── backfill_fatigue.ts       # Bulk fatigue computation for historical games
│   ├── backfill_predictions.ts   # Bulk prediction generation
│   ├── backfill_historical.py    # Historical data backfill
│   └── nba_ot_periods.py         # Overtime period detection via BoxScoreSummary
├── src/
│   ├── app/
│   │   ├── page.tsx              # Today's Games (home page, client component)
│   │   ├── layout.tsx            # Root layout (nav, footer, animated gradient bg)
│   │   ├── globals.css           # Tailwind v4 config + gradient animation
│   │   ├── analysis/page.tsx     # Analysis page (server component wrapper)
│   │   ├── tracker/page.tsx      # Picks page (server component wrapper)
│   │   └── api/
│   │       ├── games/[date]/     # GET /api/games/YYYY-MM-DD
│   │       ├── games/dates/      # GET /api/games/dates?season=&month=
│   │       ├── games/search/     # GET /api/games/search?team=&season=&minRA=
│   │       ├── game/[id]/        # GET /api/game/:id (detail modal)
│   │       ├── analysis/         # GET /api/analysis (backtest stats)
│   │       ├── analysis/accuracy/# GET /api/analysis/accuracy (prediction grading)
│   │       ├── picks/            # GET /api/picks (upcoming games with predictions)
│   │       └── cron/update/      # GET /api/cron/update (Vercel cron, live scores)
│   ├── components/
│   │   ├── matchup-card.tsx      # Game card with fatigue bars, scores, team logos
│   │   ├── analysis-content.tsx  # Full analysis dashboard (charts, tables, ATS)
│   │   ├── tracker-content.tsx   # Picks page (upcoming games with RA predictions)
│   │   ├── explore-game-detail-modal.tsx  # Click-to-expand game detail
│   │   ├── fatigue-bar.tsx       # Visual fatigue score bar
│   │   ├── nav-bar.tsx           # Top nav (Today's Games, Analysis, Picks)
│   │   └── ui/                   # shadcn/ui primitives
│   ├── hooks/
│   │   └── useLiveGames.ts       # Supabase Realtime subscription for live scores
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts         # Drizzle schema (teams, games, fatigue_scores, predictions)
│   │   │   ├── queries.ts        # All DB queries (getGamesByDate, getPicksForSeason, etc.)
│   │   │   └── index.ts          # DB connection singleton
│   │   ├── fatigue.ts            # Fatigue model (weighted decay, travel, density, altitude)
│   │   ├── fatigue-recent-games.ts  # Fetches recent games for fatigue calculation
│   │   ├── haversine.ts          # Distance calculation between arenas
│   │   ├── team-history.ts       # Season-accurate team branding (SEA→OKC, NJN→BKN, etc.)
│   │   ├── nba-team-ids.ts       # Team abbreviation → NBA CDN logo ID mapping
│   │   ├── nba-season.ts         # Season labels, date bounds, month helpers
│   │   ├── odds-team-map.ts      # the-odds-api.com team names → our abbreviations
│   │   ├── supabase.ts           # Supabase client
│   │   ├── api-errors.ts         # Safe public error messages
│   │   ├── load-env-local.ts     # .env.local loader for scripts
│   │   └── utils.ts              # cn() classname helper
│   └── types/
│       └── index.ts              # All shared TypeScript interfaces
├── vercel.json                   # Cron: /api/cron/update at 10:00 UTC daily
├── drizzle.config.ts
├── vitest.config.ts
└── playwright.config.ts
```

---

## Database Schema

Four tables in Supabase PostgreSQL:

### `teams` (30 rows — current NBA teams only)
- `id`, `abbreviation` (unique, 3-char), `name`, `city`, `conference`
- `latitude`, `longitude` (arena coordinates for haversine)
- `altitude_flag` (true for DEN and UTA)

### `games` (~45,000+ rows, 1985-86 → 2025-26, excluding 2019-20 bubble)
- `external_id` (10-digit NBA stats game ID, unique)
- `date` (stored as **UTC calendar date** from CDN; as **ET date** from LeagueGameFinder for historical)
- `season` (label like `"2024-25"`)
- `status`: `"scheduled"` | `"final"` | `"live"`
- `game_type`: `"regular"` | `"playoffs"` | `"finals"`
- `home_score`, `away_score` (nullable for scheduled games)
- `spread` (decimal, home team closing line, negative = home favored)
- `home_moneyline`, `away_moneyline` (integer, American odds)
- `overtime_periods` (0 = regulation)

### `fatigue_scores` (2 rows per game — one per team)
- `score` (composite 0–15+), plus breakdown: `decay_load_score`, `travel_load_score`, `b2b_multiplier`, `altitude_multiplier`, `density_multiplier`, `freshness_bonus`
- Context: `games_in_last_7_days`, `games_in_last_30_days`, `travel_distance_miles`, `is_back_to_back`, `days_since_last_game`, `is_overtime_penalty`, `road_trip_consecutive_away`, `is_three_in_four`, `is_four_in_six`, `has_coast_to_coast_road_swing`

### `predictions` (1 row per game with a rest advantage call)
- `predicted_advantage_team_id`, `rest_advantage_differential`
- `actual_winner_id` (null until game is final)
- `spread_covered` (null until graded)

---

## Fatigue Model (`src/lib/fatigue.ts`)

Not a flat checklist — it's a multi-factor weighted model:

1. **Exponential decay load** — recent games weigh more; 30-day lookback with `DECAY_RATE = 0.52`
2. **Log-scaled travel** — miles traveled in 7-day window, reference 1000mi, scale 1.75
3. **Road segment load** — consecutive away games + coast-to-coast swing detection
4. **Schedule stress** — multi-window density (6/7/12/15/30-day) vs NBA pace anchors
5. **Multipliers** — back-to-back (1.38×), altitude at DEN/UTA (1.15×), combined density
6. **Freshness bonus** — extended rest reduces score (capped at -2.0, plateau at 3 days)
7. **Overtime** — prior-game OT adds +0.5 (single) or +1.0 (multi)

**Rest advantage** = `awayFatigue − homeFatigue`. Positive → home more rested. Games with |RA| < 0.5 are "neutral."

---

## Data Pipeline

### Daily pipeline (GitHub Actions, 21:00 UTC)

`scripts/daily_update.py` orchestrates:
1. **CDN schedule fetch** — GET `cdn.nba.com/static/json/staticData/scheduleLeagueV2.json`, upsert future scheduled games
2. **LeagueGameFinder** — 7-day lookback + 60-day lookahead, updates scores for recently completed games
3. **Overtime refresh** — BoxScoreSummary for finals in the lookback window
4. **`run-daily.ts`** — Computes fatigue scores + predictions for today + next 14 days of scheduled games
5. **Odds fetch** — If `THE_ODDS_API_KEY` is set, fetches American moneyline + spreads from the-odds-api.com

### Historical seeding (manual, one-time)

1. `python scripts/seed_teams.py` — 30 teams
2. `python scripts/fetch_schedule.py` — All games 1985-86 → 2025-26 via nba_api (slow, hours)
3. `pnpm exec tsx scripts/backfill_fatigue.ts` — Compute fatigue for all historical games
4. `pnpm exec tsx scripts/backfill_predictions.ts` — Generate predictions
5. `python scripts/fetch_nba_schedule_cdn.py` — Seed current season future games

### Important: Date storage convention

- **Historical games** (from `fetch_schedule.py` / LeagueGameFinder): dates are from nba_api's `GAME_DATE` field, which is in **ET** (Eastern Time)
- **Current season future games** (from `fetch_nba_schedule_cdn.py`): dates are from `gameDateTimeUTC`, stored as **UTC calendar date**
- **This means a late-night ET game (e.g., 10:30 PM ET) stored via CDN will be the next UTC day**
- The odds script (`fetch_odds_lib.ts`) must match using the same date convention as the stored game

---

## Known Issues / Bugs to Be Aware Of

### Date mismatch between CDN schedule and odds API
The CDN script stores dates as UTC. The odds script was converting `commence_time` to ET. A 7 PM ET game on April 2 = April 3 UTC. This caused 0/9 matches. **Fix: use UTC date in odds matching.**

### CDN script month filter
The standalone CDN script had a hardcoded `(2026, 4)` UTC month filter that was too narrow. Should default to full season (no filter) since upserts are idempotent.

### `games.spread` column is mostly empty
Historical spread data requires a CSV file at `scripts/spreads_data.csv` (manual). The odds API only provides spreads for **upcoming** games. No automated historical spread source exists.

### 2019-20 season is excluded
The COVID bubble season had no real travel, which would corrupt the fatigue model. It's skipped in both `fetch_schedule.py` and `nba-season.ts`.

---

## Design System

**Glassmorphism aesthetic:**
- Card: `background: rgba(255, 255, 255, 0.6)`, `backdrop-filter: blur(16px)`, `border: border-white/50`
- Shadow: `0 8px 32px rgba(23, 64, 139, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)`
- Page background: fixed animated pastel gradient (135deg, shifts over 20s)
- Corners: `rounded-2xl` cards, `rounded-3xl` sections, `rounded-full` pills

**NBA brand colors:**
- Red: `#C9082A` — used for high confidence, errors, live indicators
- Blue: `#17408B` — primary accent, medium confidence, links
- Tan: `#C4853C` — hardwood accent (sparingly used)

**Typography:** Inter (body) + Outfit (headings), `tracking-tight` on headings

**Team logos:**
- Current teams: `https://cdn.nba.com/logos/nba/{nbaId}/global/L/logo.svg`
- Historical teams: `https://a.espncdn.com/i/teamlogos/nba/500/{abbr}.png`
- Logic lives in `src/lib/team-history.ts` → `getTeamBranding(abbreviation, season)`

**`next.config.ts` image domains:** `cdn.nba.com` and `a.espncdn.com` are already whitelisted.

---

## Environment Variables

| Variable | Scope | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | Server | Yes | Supabase Postgres connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | Client+Server | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client+Server | Yes | Supabase anon key |
| `CRON_SECRET` | Server | Yes (prod) | Bearer token for `/api/cron/update` |
| `THE_ODDS_API_KEY` | Server | Optional | Free API key from the-odds-api.com |

Python scripts read `DATABASE_URL` from `scripts/.env` (local) or GH Actions secrets.

---

## API Routes

All return `{ data: T, error: string | null }` shape.

| Route | Method | Description |
|---|---|---|
| `/api/games/[date]` | GET | Games for a specific date (YYYY-MM-DD) |
| `/api/games/dates` | GET | Available game dates for season+month |
| `/api/games/search` | GET | Search games by team, season, min RA |
| `/api/game/[id]` | GET | Single game detail (for modal) |
| `/api/analysis` | GET | Historical backtest (win rates, ATS, thresholds) |
| `/api/analysis/accuracy` | GET | Prediction accuracy (graded picks) |
| `/api/picks` | GET | Upcoming scheduled games with predictions |
| `/api/cron/update` | GET | Live score refresh (Vercel cron) |

---

## Historical Team Branding

The DB `teams` table only has current 30 teams. All historical abbreviations are aliased to current teams in `fetch_schedule.py` (e.g., NJN→BKN, SEA→OKC). The `team-history.ts` module provides season-accurate display:

| Current | Historical Period | Display As |
|---|---|---|
| BKN | 1985–2011 | NJN · New Jersey Nets |
| OKC | 1985–2007 | SEA · Seattle SuperSonics |
| MEM | 1995–2000 | VAN · Vancouver Grizzlies |
| NOP | 2002–2004 | NOH · New Orleans Hornets |
| NOP | 2005–2006 | NOK · New Orleans/OKC Hornets |
| NOP | 2007–2012 | NOH · New Orleans Hornets |
| CHA | 2004–2013 | CHA · Charlotte Bobcats |
| WAS | 1985–1996 | WSB · Washington Bullets |

---

## Testing

```bash
pnpm test:run      # Vitest unit tests
pnpm test:e2e      # Playwright (needs dev server + browsers installed)
```

Existing test files:
- `src/lib/__tests__/fatigue.test.ts` — Haversine + fatigue calculator
- `src/lib/__tests__/team-history.test.ts` — Historical branding lookups
- `src/app/api/__tests__/games.test.ts` — Games API route
- `src/app/api/__tests__/games-dates.test.ts` — Dates API route
- `src/app/api/__tests__/analysis.test.ts` — Analysis API route
- `src/app/api/__tests__/picks.test.ts` — Picks API route
- `e2e/home.spec.ts`, `e2e/analysis.spec.ts`, `e2e/navigation.spec.ts`

---

## Commands Reference

```bash
# Development
pnpm dev                         # Start Next.js dev server
pnpm build                       # Production build
pnpm drizzle-kit push            # Apply schema to Supabase

# Data pipeline
python scripts/seed_teams.py                    # Seed teams (one-time)
python scripts/fetch_schedule.py                # Fetch all historical games (slow)
python scripts/fetch_nba_schedule_cdn.py        # Seed current season from CDN
pnpm exec tsx scripts/run-daily.ts YYYY-MM-DD   # Fatigue + predictions for date range
pnpm exec tsx scripts/backfill_fatigue.ts       # Bulk historical fatigue
pnpm exec tsx scripts/backfill_predictions.ts   # Bulk historical predictions
pnpm exec tsx scripts/fetch_odds.ts             # Fetch moneyline + spreads
python scripts/daily_update.py                  # Full daily pipeline

# Testing
pnpm test:run                    # Unit tests
pnpm test:e2e                    # E2E tests
```

---

## Conventions

- **TypeScript strict mode** — no `any` types
- **pnpm** — never npm or yarn
- **API responses** — always `{ data, error }` shape
- **Error handling** — `getPublicApiErrorMessage()` for user-facing errors; full errors logged server-side
- **Component pattern** — server component page wrappers, client component content (e.g., `tracker/page.tsx` wraps `tracker-content.tsx`)
- **Drizzle aliases** — use `alias(teams, "unique_name")` for multiple team joins in same query
- **Date handling** — `date-fns` (not moment). Dates in DB are strings `YYYY-MM-DD`.
- **Glassmorphism** — every card/section uses the `glass` style object pattern (see any component)
- **No dark mode** — always light theme, no `dark:` classes
- **Footer credit** — "Built by MJ"

---

## Deployment

- **Vercel:** Auto-deploys from `main` branch. Set env vars in Vercel dashboard.
- **Vercel Cron:** `vercel.json` → `/api/cron/update` at 10:00 UTC daily (live score refresh during game hours)
- **GitHub Actions:** `.github/workflows/daily-update.yml` → 21:00 UTC nightly (full pipeline: schedule + scores + fatigue + predictions + odds)
- **Secrets needed in GH:** `DATABASE_URL`, optionally `THE_ODDS_API_KEY`
