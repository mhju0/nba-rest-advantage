# NBA Rest Advantage Analysis

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Deploy-000000?logo=vercel&logoColor=white)](https://vercel.com/)

**NBA Rest Advantage Analysis** is a data-driven platform that quantifies how travel and schedule fatigue impact NBA game outcomes. It combines a weighted-decay fatigue model, historical backtesting, and live score updates so you can explore rest advantage (RA) for every matchup.

---

## Key findings

These figures come from the project’s historical backtest (final games with fatigue data, neutral threshold |RA| ≥ 0.5):

- **More-rested teams win 53.5%** of decidable games overall — a measurable edge over a coin flip.
- **At RA ≥ 5**, the more-rested side wins **61.7%** of the time — the signal strengthens as the fatigue gap widens.
- **Rest advantage does not erase home court**: when the **away** team is the more-rested side, they still win only **49.8%** — schedule load helps, but hosting still matters.

---

## Tech stack

| Technology | Role |
|------------|------|
| **Next.js 16** (App Router) | Full-stack UI, API routes, static/dynamic rendering |
| **TypeScript** | End-to-end type safety (strict mode) |
| **Tailwind CSS v4** + **shadcn/ui** | Styling and accessible components |
| **Supabase** | Managed PostgreSQL + **Realtime** subscriptions on `games` |
| **Drizzle ORM** | Schema-first SQL access from Node |
| **Recharts** | Analysis and tracker charts |
| **Zod** | API input validation |
| **date-fns** | Date handling |
| **Python** (`nba_api`, `pandas`, `psycopg2`) | Scheduled ingestion and daily DB updates |
| **Vitest** + **Playwright** | Unit and E2E tests |
| **Vercel** | Production hosting + Cron for live score refresh |
| **GitHub Actions** | Nightly pipeline for scores, fatigue, and predictions |

---

## Architecture

```text
Python pipeline (nba_api) ──► Supabase Postgres ◄── Drizzle / Next.js API
                                      │
                                      ├──► Next.js App (React Server + Client Components)
                                      │
                                      └──► Supabase Realtime ──► Browser (live scores)
```

1. **Ingestion** — Python scripts pull schedule and box scores into Postgres.
2. **Fatigue layer** — TypeScript computes per-team fatigue for each game from travel, density, back-to-backs, and altitude.
3. **API** — Route handlers expose games by date, aggregate analysis, and prediction accuracy.
4. **Frontend** — Dashboard, analysis, and tracker pages consume those APIs; the home view can subscribe to row changes on `games`.

---

## Getting started

### Prerequisites

- **Node.js** 20+
- **pnpm** 9+
- **Python** 3.11+ (for scripts under `scripts/`)
- A **Supabase** project (Postgres + optional Realtime on `games`)

### Installation

```bash
git clone <your-repo-url>
cd nba-rest-advantage
pnpm install
```

Copy `.env.example` to `.env.local` and set variables (see below).

Apply the schema (from project root):

```bash
pnpm drizzle-kit push
```

Seed teams and historical games using the Python tooling in `scripts/` as needed (`seed_teams.py`, `fetch_schedule.py`).

### Environment variables

| Variable | Scope | Description |
|----------|--------|-------------|
| `DATABASE_URL` | **Server only** | Postgres connection string (never `NEXT_PUBLIC_`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | Supabase anon key (browser-safe) |
| `CRON_SECRET` | Server only | Bearer token for `GET /api/cron/update` |

### Run locally

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Tests

```bash
pnpm test:run      # Vitest (unit / API handler tests)
pnpm test:e2e      # Playwright (requires dev server / install browsers)
```

---

## Project structure (abbreviated)

```text
nba-rest-advantage/
├── e2e/                    # Playwright specs
├── scripts/                # Python data pipeline + daily_update.py
├── src/
│   ├── app/                # App Router pages + API routes
│   ├── components/         # UI components
│   ├── hooks/              # Client hooks (e.g. Realtime)
│   ├── lib/
│   │   ├── db/             # Drizzle schema + queries
│   │   ├── fatigue.ts      # Fatigue algorithm
│   │   └── ...
│   └── types/              # Shared TS types
├── vercel.json             # Vercel Cron schedule
├── playwright.config.ts
└── vitest.config.ts
```

---

## API reference

All JSON responses use the shape `{ data, error, meta? }` unless noted.

### `GET /api/games/[date]`

- **Params:** `date` = `YYYY-MM-DD`
- **200:** `{ data: GameResponse[], error: null }`
- **400:** invalid date format — `{ data: [], error: string }`

**Example (`200`):**

```json
{
  "data": [
    {
      "id": 1,
      "externalId": "0022400123",
      "date": "2024-12-25",
      "season": "2024-25",
      "status": "scheduled",
      "homeScore": null,
      "awayScore": null,
      "homeTeam": { "id": 1, "name": "Celtics", "abbreviation": "BOS", "city": "Boston" },
      "awayTeam": { "id": 2, "name": "Lakers", "abbreviation": "LAL", "city": "Los Angeles" },
      "homeFatigue": { "score": 2.1, "isBackToBack": false, "is3In4": false, "travelDistanceMiles": 400, "altitudePenalty": false },
      "awayFatigue": { "score": 5.3, "isBackToBack": true, "is3In4": true, "travelDistanceMiles": 2100, "altitudePenalty": true },
      "restAdvantage": { "differential": 3.2, "advantageTeam": "home" }
    }
  ],
  "error": null
}
```

### `GET /api/analysis`

- **200:** Season-level backtest — `totalGames`, `overallWinRate`, `thresholds[]`, `homeAwayBreakdown`, `monthlyTrends`
- Cached (ISR) — data changes when new final games land.

**Example (trimmed):**

```json
{
  "data": {
    "totalGames": 1200,
    "overallWins": 642,
    "overallWinRate": 53.5,
    "thresholds": [
      { "threshold": 2, "games": 900, "restedTeamWins": 480, "winPct": 53.3, "spreadCoverRate": 51.2 }
    ],
    "homeAwayBreakdown": {
      "homeTeamMoreRested": { "games": 600, "restedTeamWins": 330, "winPct": 55.0 },
      "awayTeamMoreRested": { "games": 600, "restedTeamWins": 299, "winPct": 49.8 }
    },
    "monthlyTrends": [{ "month": "2024-01", "games": 220, "restedTeamWins": 118, "winPct": 53.6 }]
  },
  "error": null
}
```

### `GET /api/analysis/accuracy`

- **200:** Prediction tracker payload — `totalPredictions`, `accuracyPct`, `tiers`, `rolling30Days`, `recentPredictions`

**Example (trimmed):**

```json
{
  "data": {
    "totalPredictions": 150,
    "correctPredictions": 81,
    "accuracyPct": 54.0,
    "tiers": [
      { "label": "low", "range": "0–2", "games": 50, "correct": 26, "accuracyPct": 52.0 }
    ],
    "rolling30Days": [],
    "recentPredictions": []
  },
  "error": null
}
```

### `GET /api/cron/update` (automation)

- **Purpose:** Refresh **today’s** live/scheduled games from the NBA CDN (used by Vercel Cron).
- **Auth:** `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set.
- **200:** `{ data: { gamesUpdated: number }, error: null, meta?: {...} }`

---

## How it works (fatigue model)

Fatigue is **not** a flat checklist of penalties. It uses:

1. **Exponential decay load** — Recent games weigh more; older games fade smoothly.
2. **Log-scaled travel** — Miles add fatigue with diminishing returns.
3. **Multipliers** — Back-to-backs, altitude (visitor at DEN/UTA), and schedule density compound the base load.
4. **Freshness bonus** — Extra days off reduce the score (capped, diminishing returns).

**Rest advantage** for a matchup is `awayFatigue − homeFatigue`. Positive ⇒ home is relatively more rested; negative ⇒ away is.

Constants live in `src/lib/fatigue.ts` so they can be tuned after backtesting.

---

## Deployment

- **Vercel:** Connect the repo, set `DATABASE_URL`, `NEXT_PUBLIC_*` Supabase vars, and `CRON_SECRET`. Production API errors return generic messages; details are logged server-side only.
- **Cron:** `vercel.json` schedules `GET /api/cron/update` during U.S. game windows for near-live score sync.
- **GitHub Actions:** `.github/workflows/daily-update.yml` runs nightly (UTC) to finalize yesterday’s scores and run `scripts/daily_update.py`, which calls `pnpm exec tsx scripts/run-daily.ts` for today’s fatigue and predictions. Set the **`DATABASE_URL`** secret in the repo settings.

---

## Future improvements

- **KBO (or other leagues)** — Reuse the pipeline pattern with league-specific schedules and arenas.
- **ML-enhanced predictions** — Blend fatigue features with pace, injuries, and market lines.
- **Player-level fatigue** — Minutes-load and travel at the roster level instead of team aggregates.
- **Historical betting lines** — Joint backtests of RA vs spread and closing line value.

---

## License

Private / portfolio project unless otherwise noted.
