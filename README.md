# NBA Rest Advantage

> Full-stack analytics platform that quantifies how travel distance, schedule density, and rest patterns affect NBA game outcomes — backed by 40 years of data.

**[Live Demo](https://nba-rest-advantage.vercel.app)**

---

## Key Findings

Analysis of **45,000+ regular-season games** from 1985-86 through 2025-26:

| Metric | Value |
|---|---|
| More-rested team win rate | **~53.5%** |
| Win rate at Rest Advantage >= 5 | **~61.7%** |
| Away team with rest edge win rate | **~49.8%** |

Rest advantage creates a measurable edge, but does not override home court advantage.

---

## What This Project Demonstrates

### Data Engineering & Modeling
- **Custom fatigue model** with 7 weighted factors: exponential decay load, log-scaled travel distance (haversine), road trip segment detection, multi-window schedule density, back-to-back/altitude multipliers, freshness bonus, and overtime penalties
- **Automated daily pipeline** — GitHub Actions cron job fetches schedules from the NBA CDN, pulls scores via `nba_api`, detects overtime periods, computes fatigue scores, generates predictions, and fetches live odds
- **Historical backfill** across 40 seasons (~45K games), with COVID bubble season (2019-20) excluded to preserve model integrity
- **Python + TypeScript pipeline** — Python scripts for data ingestion (`nba_api`, `pandas`, `psycopg2`), TypeScript scripts for fatigue computation and prediction generation

### Full-Stack Architecture
- **Next.js 15 App Router** with server component page wrappers and client component content — clean separation of concerns
- **Drizzle ORM** (schema-first) with PostgreSQL on Supabase — aliased multi-table joins, typed queries, Zod-validated API inputs
- **RESTful API design** — 7 endpoints with consistent `{ data, error }` response envelope and safe public error messages (`getPublicApiErrorMessage`)
- **Real-time updates** via Supabase Realtime PostgreSQL subscriptions for live game scores
- **SWR** for client-side data fetching with automatic deduplication, caching, and stale-while-revalidate

### Frontend & Performance
- **TypeScript strict mode** — zero `any` types across the entire codebase
- **Code splitting** — heavy charting library (Recharts, ~200KB) loaded via `next/dynamic` with skeleton fallbacks; page-level dynamic imports for non-critical routes
- **Glassmorphism design system** — translucent cards with `backdrop-filter`, animated gradient background, NBA brand palette, responsive from mobile to desktop
- **Historical team branding** — season-accurate logos and names for relocated/renamed franchises (e.g., SEA -> OKC, NJN -> BKN) via NBA CDN and ESPN CDN
- **Accessible UI** — ARIA labels, keyboard navigation, `role="button"` on interactive elements, `aria-expanded` on collapsibles, `tabular-nums` for score alignment

### Testing & CI/CD
- **Vitest** unit tests — fatigue model, haversine distance calculation, API route validation, team history mapping
- **Playwright** E2E tests — page navigation, data loading, component rendering
- **Automated deployment** — Vercel auto-deploys from `main`; Vercel Cron for live score refresh; GitHub Actions for nightly data pipeline

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router), React 19 |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4, shadcn/ui |
| Data Fetching | SWR, Supabase Realtime |
| Database | Supabase (PostgreSQL) |
| ORM | Drizzle ORM |
| Charts | Recharts |
| Validation | Zod |
| Data Pipeline | Python (nba_api, pandas, psycopg2) |
| CI/CD | Vercel, GitHub Actions |
| Testing | Vitest, Playwright |

---

## Architecture

```
GitHub Actions (21:00 UTC daily)
daily_update.py
  |-- NBA CDN ---------> Fetch schedule (future games)
  |-- nba_api ----------> Update scores (recent games)
  |-- BoxScoreSummary --> Detect overtime periods
  |-- run-daily.ts -----> Compute fatigue + generate predictions
  |-- fetch_odds.ts ----> Fetch moneyline + spreads (the-odds-api.com)
  |
  v
Supabase PostgreSQL
  teams (30) | games (~45K) | fatigue_scores (2/game) | predictions (1/game)
  |
  v
Next.js 15 on Vercel
  API Routes -------> Drizzle ORM queries --> JSON responses
  Server Components -> Client Components ---> SWR data fetching
  Supabase Realtime -> useLiveGames hook ---> Live score updates
```

---

## Fatigue Model

The fatigue score is a composite (0-15+) computed from seven weighted factors:

```
Fatigue Score =
    Exponential Decay Load (30-day lookback, decay rate 0.52)
  + Log-Scaled Travel Distance (7-day window, reference 1000mi)
  + Road Segment Load (consecutive away games + coast-to-coast detection)
  + Schedule Density Stress (6/7/12/15/30-day windows vs NBA pace anchors)
  x Back-to-Back Multiplier (1.38x)
  x Altitude Multiplier (1.15x for DEN/UTA)
  - Freshness Bonus (up to -2.0, plateaus at 3 days rest)
  + Overtime Penalty (+0.5 single OT, +1.0 multi-OT)

Rest Advantage = Away Fatigue - Home Fatigue
  |RA| < 0.5 -> Neutral (no call)
  |RA| >= 0.5 -> Advantage declared for the more-rested team
```

---

## Features

| Page | Description |
|---|---|
| **Today's Games** | Daily matchups with fatigue bars, rest advantage badges, live score updates via Realtime |
| **Analysis** | Historical backtest dashboard — win rate by RA threshold, season trend charts, interactive game explorer with pagination |
| **Future Games** | Upcoming scheduled games filtered by rest advantage threshold, with predicted edge |
| **Game Detail** | Click-to-expand modal with full fatigue breakdown, recent game history, drill-down navigation |

---

## Project Structure

```
src/
  app/                      Next.js App Router pages + API routes
    page.tsx                 Today's Games (home, client component)
    analysis/                Analysis dashboard (server wrapper + dynamic client import)
    upcoming/                Future Games (server wrapper + dynamic client import)
    api/                     7 REST endpoints with Zod validation
  components/                UI components (matchup cards, charts, modals, nav)
  hooks/
    useLiveGames.ts          Supabase Realtime subscription hook
  lib/
    fatigue.ts               Core fatigue model (7-factor weighted composite)
    db/schema.ts             Drizzle ORM schema (4 tables)
    db/queries.ts            All database queries
    haversine.ts             Great-circle distance between arenas
    team-history.ts          Season-accurate team branding (40 years)
    fetcher.ts               SWR fetcher with API envelope unwrapping
  types/                     Shared TypeScript interfaces
scripts/                     Python + TypeScript data pipeline
  daily_update.py            Main orchestrator (GitHub Actions entry point)
  run-daily.ts               Fatigue computation + prediction generation
  backfill_fatigue.ts        Bulk historical fatigue (45K games)
  fetch_schedule.py          Historical data via nba_api
  fetch_nba_schedule_cdn.py  Current season from NBA CDN
```

---

## Local Development

### Prerequisites

- Node.js 20+
- pnpm
- Python 3.10+
- Supabase project (PostgreSQL)

### Setup

```bash
git clone https://github.com/mhju0/nba-rest-advantage.git
cd nba-rest-advantage
pnpm install
```

Create `.env.local`:

```env
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
CRON_SECRET=your-secret
```

### Seed Data

```bash
python scripts/seed_teams.py                   # 30 NBA teams
python scripts/fetch_schedule.py               # Historical games (slow, hours)
pnpm exec tsx scripts/backfill_fatigue.ts      # Compute fatigue scores
pnpm exec tsx scripts/backfill_predictions.ts  # Generate predictions
python scripts/fetch_nba_schedule_cdn.py       # Current season future games
```

### Run

```bash
pnpm dev        # Development server
pnpm build      # Production build
pnpm test:run   # Unit tests (Vitest)
pnpm test:e2e   # E2E tests (Playwright)
```

---

## API Endpoints

All endpoints return `{ data: T, error: string | null }`.

| Route | Description |
|---|---|
| `GET /api/games/[date]` | Games for a specific date (YYYY-MM-DD) |
| `GET /api/games/dates` | Available game dates for a season + month |
| `GET /api/games/search` | Search with filters: team, season, min RA, result |
| `GET /api/game/[id]` | Single game detail with fatigue breakdown + recent history |
| `GET /api/analysis` | Historical backtest stats (win rates, thresholds, season trends) |
| `GET /api/games/upcoming` | Scheduled games with predictions |
| `GET /api/cron/update` | Live score refresh (Vercel cron, protected) |

---

## License

MIT

---

<p align="center">Built by MJ</p>
