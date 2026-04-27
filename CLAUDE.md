# Claude Handoff

## Project
- Path: `/Users/madup/server/mkt-11_mertiz-dash-board` (mac04 로컬 서버)
- Stack: Next.js 16 App Router, Tailwind CSS, Vercel Blob (스토리지만 유지), Anthropic Messages API, `xlsx`
- **Deploy**: 로컬 Mac (mac04) launchd + Cloudflare Tunnel
  - 서비스 라벨: `com.madup.meritz-dash` (`~/Library/LaunchAgents/com.madup.meritz-dash.plist`)
  - 로컬 바인드: `127.0.0.1:8770`, NODE_ENV=production
  - 외부 노출: `https://meritz-dash.madup-dct.site` (mac04 cloudflared tunnel `4f21fdf0-…`)
  - 로그: `.logs/next.out.log`, `.logs/next.err.log`
- **이전 Vercel (2026-04-27 까지)**: `https://daily-report-dashboardnre.vercel.app` 프로젝트(`prj_gW1ABmf3OifrhKlSQFb2YxugDnq1`) 는 1주일 폴백용으로 dormant 보존. 자동 배포 경로는 끊어둔 상태. 안정 확인 후 정리.
- GitHub repo: `madupmarketing/mkt-11_mertiz-dash-board` (branch `main`)

## 현재 블로커
- **Dropbox 프록시 차단 (2026-04-17 발견)**: `api-auth.madup-dct.site` 가 `/광고사업부/4. 광고주/메리츠파트너스` 이하 모든 경로에서 502 (Cloudflare HTML) 반환. 같은 레벨의 다른 광고주(삼성화재SA 등)는 정상이라 메리츠 공유 폴더에 한정된 namespace/권한 이슈. 2025-02 DCT-4313 / Confluence `fAC_yg` 에서 다룬 "Dropbox API 네임스페이스 변경" 과 동일 패턴. 데컨팀 팀장에게 이관됨 (DM 기준). 프록시 쪽에서 메리츠 공유 폴더 namespace_id 매핑이 정상화되면 `/api/cron/ingest` 를 다시 사용 가능. 현재는 cron 자체를 사용하지 않음(2026-04-27). 우리 앱 코드는 수정 불필요.

## Standing Orders (모든 세션 공통)
- **작업 완료 기준**: 코드 변경이 끝나면 아래 두 단계를 사용자 추가 지시 없이 자동 수행한다.
  1. `git add` → 의미 있는 단위의 커밋 → `git push origin main`
     - 커밋 메시지는 한국어 + 최근 커밋 스타일(`fix:`, `feat:`, `perf:`, `chore:`, `docs:` 등) 준수
     - `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` 푸터 유지
  2. `npm run deploy:prod` 로 로컬 Mac 재배포 (Vercel 아님)
     - 내부 `scripts/deploy-prod.sh` 가 `npm run build` → `launchctl kickstart -k gui/<uid>/com.madup.meritz-dash` → `127.0.0.1:8770/login` 헬스체크
     - 실패 시 `.logs/next.err.log` 끝 30줄을 같이 보고
- **실패 시**: 빌드/배포 실패는 절대 숨기지 말고 로그를 확인해 원인 보고
- **Destructive git**: `push --force`, `reset --hard`, 브랜치 삭제 등은 명시적 승인 전까지 금지
- **Secret 파일 금지**: `.env`, `.env.local`, `.env.production.local`, `.env.deploy` 는 stage/commit 금지 (이미 gitignore 됨)

## Deploy Workflow Quick Reference
- 커밋 + 푸시 + 배포: 위 Standing Orders 흐름을 그대로 따른다 (`npm run deploy:prod` 가 로컬 빌드 + launchd 재기동)
- 환경변수 갱신: `.env.production.local` 직접 편집 후 `launchctl kickstart -k gui/$(id -u)/com.madup.meritz-dash`
- 서비스 상태 확인: `launchctl list | grep meritz-dash`, `lsof -nP -iTCP:8770 -sTCP:LISTEN`
- 외부 도달 확인: `curl -sI https://meritz-dash.madup-dct.site` → `HTTP/2 307` (→ /login) 가 정상
- Cloudflare 터널 손볼 때: `~/.cloudflared/config.yml` 내 `meritz-dash.madup-dct.site → http://localhost:8770` 라인. 수정 후 `sudo launchctl kickstart -k system/com.cloudflare.cloudflared` (다른 호스트 1~3초 끊김)
- **Vercel 폴백 (1주일 한정)**: `.env.deploy` 의 `VERCEL_TOKEN` 으로 `npx vercel deploy --prod --yes --token "$VERCEL_TOKEN"` 가 여전히 가능. 이 저장소의 commit author 이메일은 `eksska12@gmail.com` 이어야 Vercel 팀이 받아준다 (이미 로컬 git config 고정).

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

## Date Switching / Timeout Notes (mostly historical after 2026-04-27 이관)
- Vercel 시절에는 `RAW/데일리 리포트_0409.xlsx` 의 parse(~14.5s) + analyze(~14.0s) 합계가 함수 타임아웃과 자주 충돌했음.
- 2026-04-27 mac04 로컬 이관 후에는 `maxDuration` 제약이 사실상 사라짐 (launchd Node 프로세스 = 무한). 캐시 미스 날짜를 그때그때 재분석해도 OK.
- 그래도 캐시 시드 로직(`POST /api/report` 가 latest + previous date 시드) 은 그대로 두는 편이 첫 진입 응답성에 유리.

## Current Frontend State
- Top KPI cards were made smaller and denser
- KPI grid gives more width to long-value cards such as cost
- Media insight layout is now:
  - left: `DB 추이`, `배당 추이`, `운영 코멘트`
  - right: `권장 액션`
- `content-visibility: auto` is applied to lower sections for safer first-load rendering improvement without changing data flow

## Known Risk / Current Limitation
- 캐시 미스 날짜 진입 시 1회성 재분석 비용은 여전히 있음 (다만 로컬이라 타임아웃 위험은 사라짐).
- mac04 가 꺼지거나 네트워크가 끊기면 `meritz-dash.madup-dct.site` 가 그대로 다운. (내부용이라 SLA 없음, 1주일 폴백 Vercel 프로젝트로 임시 복구 가능)
- 같은 cloudflared 터널을 공유하는 다른 호스트 (`mac04` SSH, `meritz-ga`, `meritz-img`, `youngk-proposal`) 가 있어, 터널 재기동 시 동시에 1~3초 끊김.

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

## Required Env Vars (`.env.production.local`, gitignored)
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob 읽기/쓰기 토큰 (스토리지는 계속 Blob 사용)
- `ANTHROPIC_API_KEY`
- `DASHBOARD_PASSWORD` — 현재 `madup`
- `MADUP_PROXY_BASE_URL`, `MADUP_PROXY_API_KEY` — 사내 API 프록시 (Slack/Dropbox/Sheets)
- `DROPBOX_REPORT_ROOT` — Dropbox 리포트 루트 경로
- `SLACK_NOTIFY_CHANNEL`
- `CRON_SECRET` — `/api/cron/ingest` 인증용 (현재 cron 미사용이지만 수동 트리거시 필요)
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
