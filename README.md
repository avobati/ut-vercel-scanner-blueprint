# Signal Grid — MEXC UT Bot Scanner

Production multi-timeframe MEXC scanner for the canonical UT Bot trailing-stop strategy (K=2, ATR=10).

## Goal
- Reuse the same UT logic in a new deployable architecture.
- Run scans in 50 groups on a 24-hour cadence.
- Deploy UI/API on Vercel.
- Keep monthly cost near zero with free-tier defaults.

## Architecture
- `apps/web`: Next.js app for dashboard + read-only API routes (deploy to Vercel).
- `apps/worker`: Node worker that scans one group at a time (run via GitHub Actions schedule).
- `apps/worker/src/ut_logic.py`: embedded UT algorithm (ported from your existing app logic).
- `packages/core`: adapter that calls Python bridge and returns `BUY|SELL|NEUTRAL`.
- `packages/db`: DB schema + queries (Postgres, Neon/Supabase free tier).
- `config`: ticker universe, group mapping, strategy, provider map.

## Quick Start
1. `pnpm install`
2. Copy `.env.example` to `.env` and set values.
3. Add tickers in `config/tickers.csv` (TradingView format supported).
4. Map symbols to Yahoo providers in `config/provider_map.json`.
5. Build groups: `pnpm gen:groups`
6. Apply DB schema using `packages/db/schema.sql`.
7. Local worker test: `pnpm worker -- --group 1`
8. Run web app: `pnpm web`

## Deploy
1. Push this repo to GitHub.
2. Import `apps/web` in Vercel as a project.
3. Add `DATABASE_URL` in Vercel.
4. Enable GitHub Actions workflow for scheduled scans.
5. Add GitHub secrets:
   - `DATABASE_URL`
   - `SCAN_TIMEFRAME` (`daily`, `weekly`, or `monthly`)

## Notes
- Current scaffold is set for daily scans to minimize cost.
- If your symbol is `BINANCE:BTCUSDT`, bridge normalizes it and can map it via `config/provider_map.json`.
