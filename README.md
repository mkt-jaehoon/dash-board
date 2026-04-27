# 메리츠 데일리 성과 대시보드

> **Production:** https://daily-report-dashboardnre.vercel.app

메리츠파트너스 데일리 광고 리포트 엑셀을 업로드하거나 Dropbox에서 자동 수집해, 매체별 KPI와 AI 운영 코멘트를 확인하는 내부 대시보드입니다.

## 주요 기능

- **엑셀 업로드 분석**: `MASTER_RAW` 시트 기반 데일리 리포트(`.xlsx`)를 브라우저에서 파싱하고 즉시 분석합니다.
- **Dropbox 자동 수집**: Vercel Cron이 내부 API Proxy를 통해 최신 리포트를 가져와 Blob에 저장합니다.
- **매체별 KPI 대시보드**: DB, CPA, 배당률, 비용 등 핵심 지표를 전일 또는 전주 동요일과 비교합니다.
- **AI 인사이트 카드**: Anthropic Claude Messages API로 매체별 운영 코멘트와 권장 액션을 생성합니다.
- **다차원 필터**: 날짜, 매체, 캠페인, 광고그룹, 토스 비용 구간으로 데이터를 좁혀 볼 수 있습니다.
- **그룹 인사이트**: 광고그룹 기준 성과, 미발생, 위험 그룹을 자동 분류합니다.
- **업로드 히스토리와 롤백**: 이전 업로드 버전으로 즉시 복원할 수 있습니다.
- **요약 / 상세 / 텍스트 탭**: 보고, 검토, 복사, 다운로드 목적에 맞춰 리포트를 확인합니다.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| 프레임워크 | Next.js 16 App Router, Turbopack |
| UI | React 19, Tailwind CSS v4 |
| 스토리지 | Vercel Blob Private |
| AI | Anthropic Messages API |
| 엑셀 파싱 | SheetJS (`xlsx`) |
| 인증 | 쿠키 + HMAC-SHA256 비밀번호 |
| 자동 수집 | Vercel Cron + Madup 내부 API Proxy |
| 배포 | Vercel Fluid Compute |

## 시작하기

### 1. 환경 변수

`.env.local.example`을 복사해 `.env.local`을 만들고 값을 채웁니다.

```bash
cp .env.local.example .env.local
```

| 변수 | 설명 | 필수 |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 읽기/쓰기 토큰 | O |
| `ANTHROPIC_API_KEY` | Anthropic API 키 | O |
| `DASHBOARD_PASSWORD` | 대시보드 로그인 비밀번호 | O |
| `MADUP_PROXY_BASE_URL` | Slack / Dropbox / Google Sheets용 내부 API Proxy URL | O |
| `MADUP_PROXY_API_KEY` | 내부 API Proxy 인증 키 | O |
| `DROPBOX_REPORT_ROOT` | Dropbox 리포트 루트 경로 | O |
| `SLACK_NOTIFY_CHANNEL` | 자동 수집 결과 알림 Slack 채널 ID | O |
| `CRON_SECRET` | `/api/cron/ingest` Bearer 인증 시크릿 | O |
| `ANTHROPIC_MODEL` | 사용할 Claude 모델. 미설정 시 기본 모델 사용 | X |

### 2. 설치 및 실행

```bash
npm install
npm run dev
npm run build
npm test
```

개발 서버는 기본적으로 `http://localhost:3000`에서 실행됩니다.

## 사용 방법

1. 대시보드에 접속해 `DASHBOARD_PASSWORD`로 로그인합니다.
2. `엑셀 업로드` 버튼으로 데일리 리포트 `.xlsx` 파일을 업로드합니다.
3. 날짜, 매체, 캠페인, 광고그룹, 비용 구간 필터로 분석 범위를 조정합니다.
4. `요약` 탭에서 매체별 KPI와 AI 인사이트를 확인합니다.
5. `상세` 탭에서 그룹 및 소재 단위 데이터를 검토합니다.
6. `텍스트` 탭에서 공유용 리포트를 복사하거나 다운로드합니다.

## 자동 수집

`vercel.json`의 Cron 설정은 `/api/cron/ingest`를 호출합니다. 이 엔드포인트는 `Authorization: Bearer ${CRON_SECRET}` 헤더가 필요합니다.

자동 수집 흐름:

1. Dropbox 리포트 루트에서 최신 엑셀 파일을 찾습니다.
2. 내부 API Proxy를 통해 파일을 내려받습니다.
3. Vercel Blob에 원본 파일과 분석 결과를 저장합니다.
4. 수집 성공 또는 실패 결과를 Slack 채널에 알립니다.

관련 파일:

- `app/api/cron/ingest/route.ts`
- `app/api/dropbox/sync/route.ts`
- `lib/dropbox-ingest.ts`
- `lib/proxy-client.ts`

## 매체 분류

| 섹션 | 매체 |
| --- | --- |
| DA | 메타 (DA), 메타 (VA), 메타 (TOTAL), 구글 (DA), 토스 |
| SA | 네이버 SA, 구글 SA, 카카오 SA |
| 기타 | 카카오뱅크, 삼쩜삼, 기타항목 |

## 프로젝트 구조

```text
app/
  api/
    analyze/       # 분석 API
    blob-upload/   # Vercel Blob 업로드 토큰 발급
    cron/ingest/   # Vercel Cron 기반 Dropbox 자동 수집
    dropbox/sync/  # Dropbox 수동 동기화
    insight/       # AI 인사이트 생성 + 캐시
    parse-excel/   # 엑셀 파싱 API
    report/        # 리포트 manifest / 캐시 / 롤백
    rows/          # 현재 manifest의 원본 rows 반환
    login/ logout/
  login/           # 로그인 페이지
  page.tsx         # 메인 대시보드

components/
  dashboard/Dashboard.tsx
  dashboard/MetricCard.tsx
  dashboard/UploadHistory.tsx
  dashboard/useMediaInsights.ts
  GroupInsightSection.tsx
  MediaInsightCard.tsx
  SummaryCard.tsx
  DetailPanel.tsx

lib/
  analyzer.ts
  auth.ts
  config.ts
  dropbox-ingest.ts
  excel.ts
  media-catalog.ts
  media-kpi-config.ts
  proxy-client.ts
  storage.ts
  types.ts

tests/
  run.ts
```

## 개발자 검토 포인트

페이지 개발자가 검토할 때는 아래 항목을 우선 확인하면 됩니다.

- `RAW/데일리 리포트_0409.xlsx` 업로드 후 기타 섹션에 `카카오뱅크`, `삼쩜삼`, `기타항목`이 모두 노출되는지
- `2026-04-09`에서 `2026-04-08`로 날짜 전환 시 timeout 없이 데이터가 열리는지
- 업로드 직후 최신일과 전일 캐시가 생성되고, 이전 업로드 버전 롤백이 정상 동작하는지
- AI 인사이트가 날짜 + 매체 + 리포트 버전 단위로 캐시되어 같은 조건에서 재생성되지 않는지
- Dropbox 자동 수집 실패 시 Slack 알림과 에러 메시지가 운영자가 이해할 수 있는 수준인지

## 테스트

```bash
npm test
```

테스트는 TypeScript 컴파일(`tsconfig.tests.json`) 후 `tests/run.ts`의 분석 로직 검증을 실행합니다.

## 배포

`main` 브랜치에 push하면 Vercel이 자동 배포합니다. CLI로 수동 배포하려면 `.env.deploy`에 `VERCEL_TOKEN=...`을 설정한 뒤 실행합니다.

```bash
npm run deploy:prod
```

`.env.deploy`는 git에 포함하지 않습니다. Vercel 팀 소속 작성자 이메일로만 배포가 허용되므로, 이 저장소의 `git config user.email`은 팀 멤버 계정으로 유지해야 합니다.
