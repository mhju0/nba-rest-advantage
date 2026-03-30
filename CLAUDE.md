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
│   ├── fatigue.ts           # Rest advantage algorithm
│   ├── haversine.ts         # Distance calculation
│   ├── supabase.ts          # Supabase Realtime client
│   └── utils.ts
└── types/index.ts
scripts/                     # Python data pipeline
.github/workflows/           # CI/CD
```

## Database Schema (4 tables)
1. **teams** — 30 NBA teams with lat/lng coordinates and altitude flags
2. **games** — Schedule and results (external_id from nba_api, status: scheduled/live/final)
3. **fatigue_scores** — Pre-computed fatigue scores per team per game
4. **predictions** — Model predictions vs actual outcomes for accuracy tracking

## Fatigue Algorithm Rules
- Back-to-back game: +3 points
- 3rd game in 4 nights: +2 points
- Travel > 1,000 miles from previous game: +1 point
- Playing at altitude (Denver/Utah): +1.5 points
- 4th game in 6 nights: +1.5 points
- Extra rest (3+ days off): -1 point (freshness bonus)
- Rest Advantage = away team fatigue - home team fatigue

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
Phase 0 — Environment Setup (in progress)

## Commands
- `pnpm dev` — Start dev server
- `pnpm build` — Production build
- `pnpm drizzle-kit push` — Push schema to database
- `pnpm drizzle-kit generate` — Generate migrations
- `pnpm vitest` — Run unit tests
- `pnpm playwright test` — Run E2E tests
