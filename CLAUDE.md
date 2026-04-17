# Claude Handoff

## Project
- Path: `C:\Users\MADUP\Desktop\dashboard`
- Stack: Next.js 14 App Router, Tailwind CSS, Vercel Blob, Anthropic Messages API, `xlsx`
- Deploy: Vercel
- Production URL: `https://daily-report-dashboardnre.vercel.app`
- GitHub repo: `madupmarketing/mkt-11_mertiz-dash-board` (branch `main`)

## Standing Orders (모든 세션 공통)
- **작업 완료 기준**: 코드 변경이 끝나면 아래 두 단계를 사용자 추가 지시 없이 자동 수행한다.
  1. `git add` → 의미 있는 단위의 커밋 → `git push origin main`
     - 커밋 메시지는 한국어 + 최근 커밋 스타일(`fix:`, `feat:`, `perf:`, `chore:`, `docs:` 등) 준수
     - `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` 푸터 유지
  2. `npm run deploy:prod` 로 Vercel 프로덕션 배포
     - 내부적으로 `scripts/deploy-prod.sh` 가 `.env.deploy` (gitignored) 의 `VERCEL_TOKEN` 을 로드
     - 실패 시 한 번 재시도 후에도 실패하면 사용자에게 에러 요약 보고
- **실패 시**: 빌드/테스트/배포 실패는 절대 숨기지 말고 로그를 확인해 원인 보고
- **Destructive git**: `push --force`, `reset --hard`, 브랜치 삭제 등은 명시적 승인 전까지 금지
- **Secret 파일 금지**: `.env`, `.env.local`, `.env.deploy` 는 stage/commit 금지 (이미 gitignore 됨)

## Deploy Workflow Quick Reference
- 커밋 + 푸시 + 배포: 위 Standing Orders 흐름을 그대로 따른다
- 토큰 갱신이 필요할 때: `.env.deploy` 의 `VERCEL_TOKEN=...` 값을 교체 (파일은 gitignored 이므로 커밋되지 않음)
- 수동 배포 커맨드: `npm run deploy:prod` (내부적으로 `bash scripts/deploy-prod.sh`)
- **Git author 제약**: Vercel 팀 (`KIMJAEHUN's projects`, hobby 플랜) 은 git commit author 이메일이 팀 멤버인 것을 요구한다. 이 저장소의 commit 은 반드시 `eksska12@gmail.com` 이름으로 생성되어야 한다. 이미 로컬 repo `git config` 에 고정해 두었으며 변경 금지. 외부 사용자 이메일로 커밋되면 배포가 `Git author ... must have access` 에러로 실패한다.
- 배포 실패 시 실제 원인 확인: `curl -s -H "Authorization: Bearer $VERCEL_TOKEN" "https://api.vercel.com/v13/deployments/<url>"` 에서 `readyStateReason` 필드를 본다.

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
