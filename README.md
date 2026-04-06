# 🏀 NBA Rest Advantage

> 휴식과 이동 거리가 NBA 경기 결과에 미치는 영향을 정량화하는 풀스택 분석 플랫폼

**Live Demo → https://nba-rest-advantage.vercel.app** 

---

## 핵심 발견 (Key Findings)

1985-86 시즌부터 현재까지 약 **45,000경기** 이상을 분석한 결과:

| 지표 | 수치 |
|---|---|
| 더 많이 쉰 팀의 승률 | **~53.5%** |
| Rest Advantage ≥ 5일 때 승률 | **~61.7%** |
| 원정팀이 휴식 우위일 때 승률 | **~49.8%** (홈코트 효과 유지) |

**→ 휴식 우위는 실질적인 승률 차이를 만들지만, 홈코트 어드밴티지를 뒤집지는 못한다.**

---

## 프로젝트 소개

NBA Rest Advantage는 단순한 "며칠 쉬었는가"를 넘어, **다중 요인 피로도 모델**을 통해 팀의 컨디션을 수치화합니다.

### 피로도 모델 구성 요소

- **지수 감쇠 부하** — 최근 경기일수록 높은 가중치 (30일 lookback)
- **이동 거리** — 7일간 총 이동 거리 (로그 스케일)
- **원정 연속 부하** — 연속 원정 경기 + 대륙 횡단 탐지
- **일정 밀도** — 6/7/12/15/30일 윈도우별 경기 밀도
- **배수 보정** — 백투백(1.38×), 고도(DEN/UTA 1.15×)
- **휴식 보너스** — 3일 이상 휴식 시 피로도 감소 (최대 -2.0)
- **연장전** — 전 경기 OT 시 추가 피로 (+0.5 ~ +1.0)

### 분석 제외 대상

- **2019-20 시즌** — COVID 버블(올랜도 단일 장소)로 이동 데이터 무의미
- **플레이오프** — 고정 2팀 시리즈로 피로 모델 전제 위반

---

## 기능

| 페이지 | 설명 |
|---|---|
| **Today's Games** | 오늘 경기의 피로도 비교 + 실시간 스코어 |
| **Analysis** | 시즌별 휴식 우위 승률 차트 + RA 임계값 토글 |
| **Picks** | 다가오는 경기 중 RA 기반 예측 |
| **Game Detail** | 경기 클릭 시 최근 5경기 이력 + 상세 피로 분석 |

---

## Tech Stack

```
Frontend    Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Recharts
Backend     Next.js API Routes · Drizzle ORM · Zod
Database    Supabase (PostgreSQL)
Pipeline    Python (nba_api, pandas, psycopg2)
Infra       Vercel · GitHub Actions (daily cron)
Testing     Vitest · Playwright
```

---

## 아키텍처

```
┌─────────────────────────────────────────────────────┐
│  GitHub Actions (21:00 UTC daily)                   │
│  daily_update.py                                    │
│    ├── NBA CDN → 스케줄 fetch                       │
│    ├── nba_api → 스코어 업데이트                      │
│    ├── BoxScoreSummary → 연장전 확인                  │
│    └── run-daily.ts → 피로도 계산 + 예측 생성          │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  Supabase PostgreSQL                                │
│    teams · games · fatigue_scores · predictions     │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  Next.js 15 (Vercel)                                │
│    API Routes → Drizzle ORM queries                 │
│    Server Components → Client Components            │
│    Supabase Realtime → 실시간 스코어 업데이트           │
└─────────────────────────────────────────────────────┘
```

---

## 로컬 실행 방법

### 사전 요구사항

- Node.js 20+
- pnpm
- Python 3.10+
- Supabase 프로젝트 (PostgreSQL)

### 설치

```bash
git clone https://github.com/mhju0/nba-rest-advantage.git
cd nba-rest-advantage
pnpm install
```

### 환경 변수

`.env.local` 파일 생성:

```env
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
CRON_SECRET=your-secret
```

### 데이터 초기 세팅

```bash
# 1. 팀 데이터 시드
python scripts/seed_teams.py

# 2. 과거 경기 데이터 수집 (수 시간 소요)
python scripts/fetch_schedule.py

# 3. 피로도 일괄 계산
pnpm exec tsx scripts/backfill_fatigue.ts

# 4. 예측 일괄 생성
pnpm exec tsx scripts/backfill_predictions.ts

# 5. 현재 시즌 미래 경기 세팅
python scripts/fetch_nba_schedule_cdn.py
```

### 개발 서버

```bash
pnpm dev
```

---

## 프로젝트 구조

```
src/
├── app/                    # Next.js App Router 페이지 + API
│   ├── page.tsx            # Today's Games (홈)
│   ├── analysis/           # 분석 대시보드
│   ├── tracker/            # Picks 페이지
│   └── api/                # REST API 엔드포인트
├── components/             # UI 컴포넌트
├── lib/
│   ├── fatigue.ts          # 피로도 모델 코어 로직
│   ├── db/schema.ts        # Drizzle ORM 스키마
│   ├── haversine.ts        # 구면 거리 계산
│   └── team-history.ts     # 역대 팀 브랜딩 매핑
└── types/                  # TypeScript 인터페이스
scripts/                    # Python + TS 데이터 파이프라인
```

---

## Design

글래스모피즘(Glassmorphism) 기반 UI에 NBA 브랜드 컬러를 적용했습니다.

- 반투명 카드 + `backdrop-filter: blur(16px)`
- 애니메이션 그라데이션 배경
- NBA CDN 팀 로고 + 역대 팀 로고(ESPN CDN) 지원
- 피로도 바 색상 스케일링 (녹색 → 빨간색)

---

## Summary

**NBA Rest Advantage** is a full-stack analytics platform that quantifies how travel distance, schedule density, and rest patterns affect NBA game outcomes across 40 years of data (1985–present).

The core fatigue model considers exponential decay load, log-scaled travel distance, back-to-back multipliers, altitude adjustments, schedule density across multiple windows, and overtime penalties — going far beyond simple "days of rest" metrics.

Built with Next.js 15, TypeScript, Supabase, and Python, with automated daily data pipelines via GitHub Actions.

---

## License

MIT

---

<p align="center">Built by MJ</p>
