# 메리츠 데일리 성과 대시보드

> **Production:** https://daily-report-dashboardnre.vercel.app

매체별 광고 성과를 업로드된 엑셀에서 즉시 분석하고, AI 인사이트를 함께 제공하는 내부 리포트 대시보드입니다.

## 주요 기능

- **브라우저 엑셀 업로드** — `MASTER_RAW` 시트 기반 데일리 리포트를 업로드 즉시 분석
- **매체별 KPI 대시보드** — DB · CPA · 배당률 · 비용 등 핵심 지표를 전일 / 전주 동요일과 비교
- **AI 인사이트 카드** — Anthropic Claude Messages API 로 매체별 자동 코멘트 생성, 날짜+매체+리포트 버전 단위 캐시
- **다차원 필터** — 날짜 / 매체 / 캠페인 / 광고그룹 / 토스 비용 구간
- **요약 · 상세 · 텍스트 탭** — 용도별 리포트 포맷 (복사/다운로드 지원)
- **그룹 인사이트** — 광고그룹 기준 성과·위험 자동 분류
- **업로드 히스토리 + 롤백** — 이전 업로드 버전으로 즉시 복원

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4 |
| 스토리지 | Vercel Blob (Private) |
| AI | Anthropic Messages API (Claude Haiku 계열) |
| 엑셀 파싱 | SheetJS (`xlsx`) — 브라우저에서 직접 파싱 |
| 인증 | 쿠키 + HMAC-SHA256 비밀번호 |
| 배포 | Vercel (Fluid Compute) |

## 시작하기

### 1) 환경 변수

| 변수 | 설명 | 필수 |
|------|------|------|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 읽기/쓰기 토큰 | O |
| `ANTHROPIC_API_KEY` | Anthropic API 키 | O |
| `DASHBOARD_PASSWORD` | 대시보드 로그인 비밀번호 | O |
| `ANTHROPIC_MODEL` | 사용할 Claude 모델 (기본값 Haiku) | X |

`.env.local.example` 을 복사해 `.env.local` 로 채워 넣습니다.

```bash
cp .env.local.example .env.local
```

### 2) 설치 및 실행

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm test         # TS 컴파일 + 테스트 스위트
```

## 사용 방법

1. 대시보드 접속 후 비밀번호 로그인
2. **엑셀 업로드** 버튼으로 데일리 리포트(`.xlsx`) 업로드 — 브라우저에서 즉시 파싱·분석
3. 날짜 / 매체 / 캠페인 / 광고그룹 필터로 원하는 범위 탐색
4. **요약** 탭에서 매체별 AI 인사이트, **상세** 탭에서 소재 단위 성과, **텍스트** 탭에서 복사·다운로드

## 매체 분류

| 섹션 | 매체 |
|------|------|
| DA | 메타 (DA), 메타 (VA), 메타 (TOTAL), 구글 (DA), 토스 |
| SA | 네이버 SA, 구글 SA, 카카오 SA |
| 기타 | 카카오뱅크, 삼쩜삼, 기타항목 |

## 프로젝트 구조

```
app/
  api/
    report/       # 리포트 manifest / 캐시 (GET/POST/PATCH)
    rows/         # 현재 manifest 의 원본 rows 반환 (날짜 전환 프리로드용)
    insight/      # AI 인사이트 생성 + 캐시
    analyze/      # 분석 API
    blob-upload/  # Vercel Blob 업로드 토큰 발급
    login/        logout/
  login/          # 로그인 페이지
  page.tsx        # 메인 대시보드

components/
  dashboard/Dashboard.tsx         # 메인 컨테이너
  dashboard/MetricCard.tsx        # KPI 카드
  dashboard/useMediaInsights.ts   # AI 인사이트 fetch 훅
  dashboard/CostFilter.tsx        # 토스 비용 구간 필터
  MediaInsightCard.tsx            # 매체 인사이트
  SummaryCard.tsx                 # 매체 요약
  DetailPanel.tsx                 # 상세 리포트
  GroupInsightSection.tsx         # 그룹 인사이트

lib/
  analyzer.ts       # KPI 계산, 전일/전주/월평균 비교, 분석 버전 관리
  media-catalog.ts  # DA / SA / 기타 매체 매칭 규칙
  excel.ts          # MASTER_RAW 시트 파싱
  storage.ts        # Vercel Blob 래퍼 + 분석 결과 캐시
  auth.ts types.ts config.ts

scripts/
  deploy-prod.sh    # Vercel 프로덕션 배포 래퍼 (.env.deploy 로드)
```

## 배포

`main` 브랜치에 push 하면 Vercel 이 자동 배포합니다. CLI 로 수동 배포하려면:

```bash
npm run deploy:prod      # .env.deploy 의 VERCEL_TOKEN 으로 vercel deploy --prod 실행
```

`.env.deploy` (gitignored) 에 `VERCEL_TOKEN=...` 한 줄을 둡니다. Vercel 팀 소속 작성자 이메일로만 배포가 허용되므로, 이 저장소의 `git config user.email` 은 팀 멤버 계정으로 유지되어야 합니다 (`CLAUDE.md` 참고).
