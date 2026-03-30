# NBA Rest Advantage Analysis Platform

## Project Overview
A data-driven NBA fatigue analysis and prediction platform that calculates rest advantage scores for NBA matchups. Built as a portfolio project demonstrating full-stack engineering, data pipeline design, and real-time systems.

## Tech Stack — DO NOT deviate from these choices
- **Framework:** Next.js 15 (App Router, Server Components, Server Actions)
- **Language:** TypeScript (strict mode, no `any` types ever)
- **Database:** Supabase (PostgreSQL)
- **ORM:** Drizzle ORM (NOT Prisma)
- **Styling:** Tailwind CSS v4 + shadcn/ui components
- **Charts:** Recharts
- **Real-time:** Supabase Realtime (WebSocket)
- **Testing:** Vitest (unit) + Playwright (E2E)
- **Package Manager:** pnpm
- **Data Pipeline:** Python scripts in /scripts directory (nba_api + pandas)
- **CI/CD:** GitHub Actions + Vercel

## Project Structure
```
src/
├── app/                     # Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx             # Home — today's matchups
│   ├── games/[date]/page.tsx
│   ├── analysis/page.tsx    # Historical backtest
│   ├── tracker/page.tsx     # Prediction accuracy
│   └── api/                 # Route Handlers
│       ├── games/[date]/route.ts
│       ├── analysis/route.ts
│       └── cron/update/route.ts
├── components/              # React components
├── lib/
│   ├── db/
│   │   ├── schema.ts        # Drizzle schema (source of truth)
│   │   ├── index.ts         # DB connection
│   │   └── queries.ts       # Reusable queries
│   ├── fatigue.ts           # Weighted Decay fatigue algorithm
│   ├── haversine.ts         # Haversine great-circle distance calculation
│   ├── backfill-fatigue.ts  # Batch compute fatigue scores for historical games
│   ├── supabase.ts          # Supabase Realtime client
│   └── utils.ts
└── types/index.ts
scripts/                     # Python data pipeline
.github/workflows/           # CI/CD
```

## Database Schema (4 tables)
1. **teams** — 30 NBA teams with lat/lng coordinates and altitude flags
2. **games** — Schedule and results (external_id from nba_api, status: scheduled/live/final)
3. **fatigue_scores** — Pre-computed fatigue scores per team per game, with full breakdown columns
4. **predictions** — Model predictions vs actual outcomes for accuracy tracking

### fatigue_scores columns
- `score` — Final composite fatigue score (0 = fully rested, 15+ = severely fatigued)
- `decay_load_score` — Sum of exponential decay contributions from recent games
- `travel_load_score` — Cumulative travel fatigue (log-scaled)
- `b2b_multiplier` — 1.0 if no back-to-back, 1.4 if back-to-back
- `altitude_multiplier` — 1.0 normally, 1.15 if visiting Denver/Utah
- `density_multiplier` — Schedule density ratio (1.0–1.3)
- `freshness_bonus` — Negative value if 3+ days rest (diminishing returns)
- `games_in_last_7_days` — Raw count for display
- `travel_distance_miles` — Total miles traveled in lookback window
- `is_back_to_back` — Boolean flag for display
- `days_since_last_game` — Null if season opener

## Fatigue Algorithm — Weighted Decay Model
Located in `src/lib/fatigue.ts`. This is NOT a simple point-adding system. It uses continuous, compounding fatigue modeling.

### How it works
**Final score = (decayLoad + travelLoad) × multipliers + freshnessBonus**

### 1. Decay Load (exponential decay)
Each game in the past 7 days contributes: `GAME_BASE_COST × e^(-DECAY_RATE × daysAgo)`
- GAME_BASE_COST = 3.0
- DECAY_RATE = 0.5 (λ — controls how fast fatigue fades)
- Yesterday's game contributes ~1.82 points; a game 6 days ago contributes ~0.15

### 2. Travel Load (logarithmic scaling)
Cumulative travel distance in the lookback window, scaled with natural log:
`TRAVEL_SCALE × ln(1 + totalMiles / TRAVEL_REFERENCE_MILES)`
- TRAVEL_SCALE = 1.8
- TRAVEL_REFERENCE_MILES = 1000
- First 1000 miles ≈ 1.25 points; next 1000 ≈ 0.72 more (diminishing returns)
- Distance calculated using Haversine formula (src/lib/haversine.ts)

### 3. Multipliers (contextual compounding)
Applied multiplicatively to the base load (decayLoad + travelLoad):
- **Back-to-back (B2B_MULTIPLIER = 1.4):** If team played yesterday (daysSinceLastGame === 1)
- **Altitude (ALTITUDE_MULTIPLIER = 1.15):** Only for AWAY teams visiting Denver or Utah (altitudeFlag === true on home team). Home teams are acclimated.
- **Schedule density (max DENSITY_MAX_MULTIPLIER = 1.3):** Kicks in when games/7days ratio exceeds DENSITY_THRESHOLD (0.5). Linear interpolation from 1.0 to 1.3.

### 4. Freshness Bonus (diminishing returns)
If 3+ days since last game: `FRESHNESS_MAX_BONUS × (1 - e^(-days / FRESHNESS_PLATEAU_DAYS))`
- FRESHNESS_MAX_BONUS = -2.0
- FRESHNESS_PLATEAU_DAYS = 3
- 3 days rest ≈ -1.26 bonus; 5 days ≈ -1.62 (diminishing returns)

### Rest Advantage
`restAdvantage = awayTeamFatigue - homeTeamFatigue`
- Positive = home team has the advantage (away team is more tired)
- Negative = away team has the advantage

### Tunable constants
All constants are defined at the top of fatigue.ts. After backtesting, adjust these to improve prediction accuracy. Do NOT hardcode values elsewhere — always reference the constants.

## Coding Standards
- Use named exports, not default exports (except for Next.js pages)
- Use `function` declarations for components, arrow functions for utilities
- All API responses use consistent shape: `{ data, error, meta }`
- Use Zod for all input validation
- Prefer Server Components; only use "use client" when interactivity is needed
- Use date-fns for all date manipulation (not moment, not dayjs)
- Write JSDoc comments for all exported functions
- All database queries go through src/lib/db/queries.ts (not inline in routes)
- Component files: kebab-case (matchup-card.tsx)
- Utility files: camelCase (haversine.ts)
- Types file: PascalCase for types/interfaces
- All decimal fields from Drizzle/Postgres return as STRINGS — always parseFloat() before math

## Git Conventions
- Commit messages: `type(scope): description`
  - Types: feat, fix, refactor, test, docs, chore
  - Example: `feat(api): add games by date endpoint`
- Branch from main for features: `feature/phase-1-schema`
- No force pushes to main

## Environment Variables
- DATABASE_URL — Supabase PostgreSQL connection string
- NEXT_PUBLIC_SUPABASE_URL — Supabase project URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY — Supabase anonymous key
- NEXT_PUBLIC_APP_URL — App URL (http://localhost:3000 in dev)

## Current Phase
Phase 2 — Fatigue Algorithm (complete)
Next up: Phase 3 — API Layer (Next.js Route Handlers)

## Commands
- `pnpm dev` — Start dev server
- `pnpm build` — Production build
- `pnpm drizzle-kit push` — Push schema to database
- `pnpm drizzle-kit generate` — Generate migrations
- `pnpm vitest` — Run unit tests
- `pnpm playwright test` — Run E2E tests
- `npx tsx src/lib/backfill-fatigue.ts` — Backfill fatigue scores for all historical games