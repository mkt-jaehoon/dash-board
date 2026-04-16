# Claude Handoff

## Project
- Path: `C:\Users\MADUP\Desktop\dashboard`
- Stack: Next.js 14 App Router, Tailwind CSS, Vercel Blob, Anthropic Messages API, `xlsx`
- Deploy: Vercel
- Production URL: `https://daily-report-dashboardnre.vercel.app`

## Current Product State
- Cookie-based password login
- Browser-side Excel parsing after upload
- Shared latest report stored in Vercel Blob
- Upload history with rollback
- Date / media / campaign / group filtering
- Summary / Detail / Text report tabs
- Per-media AI insight cards
- Group-based insight aggregation
- Insight cache by `date + mediaKey + reportVersion`

## Upload / Report Flow
- Browser parses Excel locally with `parseWorkbook()`
- Parsed rows are uploaded as `.parsed.json`
- `POST /api/report` stores manifest/history and latest precomputed result
- `GET /api/report` loads cached analysis when available
- Upload payload was intentionally kept small again after a failed attempt to send multiple precomputed dates in one request

## Current Analysis Rules
- Visible dashboard sections: `DA`, `SA`, `OTHER`
- `BIGCRAFT` stays in analysis data shape but is not part of the main screen section list
- `메타 (DA)` and `메타 (VA)` remain separate
- `메타 (TOTAL)` is inserted as combined DA
- `카카오뱅크`, `삼쩜삼`, `기타항목` are now real catalog entries in `lib/media-catalog.ts`
- Media that exist in the dataset can still be shown even when the selected date has zero `today` rows

## Important Media Findings
- `삼쩜삼` was visible because `2026-04-09` rows actually exist in `RAW/데일리 리포트_0409.xlsx`
- `카카오뱅크` and `기타항목` do exist in the raw file, but only through `2026-04-08`
- The dashboard was previously hiding them because:
  1. they were commented out in `lib/media-catalog.ts`
  2. the page only rendered `DA` / `SA`
  3. media without `today` rows were skipped
- All three issues were fixed

## Caching / Compatibility
- `AnalysisResult` now includes `analysisVersion`
- `ANALYSIS_VERSION = 2` in `lib/analyzer.ts`
- `app/api/report/route.ts` rejects old cached analysis shapes when version mismatches
- This forces re-analysis of old cached reports after schema/media-catalog changes

## Date Switching / Timeout Notes
- Raw file `RAW/데일리 리포트_0409.xlsx` is large enough that local parse + analyze for `2026-04-08` measured around:
  - parse: ~14.5s
  - analyze: ~14.0s
  - total: ~28.5s
- That explains why on-demand date changes could hit `FUNCTION_INVOCATION_TIMEOUT`
- Mitigations already applied:
  - `app/api/report/route.ts` uses `maxDuration = 60`
  - cached full-report responses for `all` media are returned before loading rows when possible
  - `POST /api/report` now seeds cache for:
    - latest uploaded date
    - previous date
- Practical implication:
  - after the latest deployment, one fresh upload is needed so the current report version has both latest-date and previous-date cache seeded
  - after that, switching from latest date to previous date should avoid expensive on-demand re-analysis

## Current Frontend State
- Top KPI cards were made smaller and denser
- KPI grid gives more width to long-value cards such as cost
- Media insight layout is now:
  - left: `DB 추이`, `배당 추이`, `운영 코멘트`
  - right: `권장 액션`
- `content-visibility: auto` is applied to lower sections for safer first-load rendering improvement without changing data flow

## Known Risk / Current Limitation
- If a user switches to a date that was not pre-seeded into cache for the current uploaded report version, Vercel may still need on-demand re-analysis
- The current mitigation only seeds:
  - latest date
  - immediately previous date
- If broader date hopping becomes common, a background cache warm-up strategy or a deliberate multi-date caching job should be designed without reintroducing request payload bloat

## Main Files Recently Changed
- `app/page.tsx`
- `app/globals.css`
- `app/api/report/route.ts`
- `components/dashboard/MetricCard.tsx`
- `components/MediaInsightCard.tsx`
- `components/SummaryCard.tsx`
- `components/GroupInsightSection.tsx`
- `components/DetailPanel.tsx`
- `components/dashboard/useMediaInsights.ts`
- `lib/media-catalog.ts`
- `lib/analyzer.ts`
- `lib/types.ts`

## Required Env Vars
- `BLOB_READ_WRITE_TOKEN`
- `ANTHROPIC_API_KEY`
- `DASHBOARD_PASSWORD`
- `ANTHROPIC_MODEL` optional

## Verification Status
- `npm run build` passes
- `npm test` passes
- Production deployment updated after:
  - media catalog fixes
  - `OTHER` section rendering fix
  - zero-row media visibility change
  - timeout mitigation for previous-date switching
  - upload payload size rollback

## Recommended Next Step
- Confirm one fresh upload on production with `RAW/데일리 리포트_0409.xlsx`
- Then verify:
  1. `카카오뱅크`, `삼쩜삼`, `기타항목` all appear under `기타`
  2. switching `2026-04-09 -> 2026-04-08` no longer times out
