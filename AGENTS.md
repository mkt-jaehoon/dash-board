# Dashboard Enhancement Plan

## Overview
데일리 성과 대시보드를 실무자가 원본 파일을 다시 열지 않고도 운영 판단까지 가능한 수준으로 고도화하는 작업.

현재 기준으로 6개 Phase는 구현 완료 상태이며, 후속 이슈는 운영 안정화와 필터/캐시 개선 쪽이다.

## Implementation Phases

### Phase 1: Config 분리
- [x] `lib/media-catalog.ts` 분리 완료
- [x] `lib/media-kpi-config.ts` 분리 완료
- [x] `analyzer.ts` import 경로 변경 완료
- [x] 매체 추가 시 catalog/config 중심으로 확장 가능하도록 구조화

### Phase 2: KPI 카드 확장 + 비교 기준 토글
- [x] 매체 선택 시 상단 KPI가 해당 매체 기준으로 전환
- [x] KPI 카드가 매체별 config 기준으로 동적 렌더링
- [x] 비교 기준 토글 UI 추가 (`d1` / `d7`)
- [x] `SummaryCard.tsx` d7 비교 반영
- [x] `MetricCard.tsx` delta 슬롯 반영

### Phase 3: 배당 추이 777 시각화
- [x] `SummaryCard.tsx`에서 777 배당 추이 시각화 반영
- [x] 최근 3개 7일 구간 라벨 표시 반영
- [x] `MediaInsightCard.tsx`와 배당 추이 정보 구조 연동

### Phase 4: 그룹 단위 집계 엔진
- [x] `GroupStats` 타입 추가
- [x] `MediaStats.groups` 추가
- [x] `analyzer.ts`에서 adGroup 기준 그룹 집계 추가
- [x] 그룹별 today / d1 / d7 / grade / comment 계산
- [x] 캐시 shape 검증에 groups 포함
- [x] 기존 캐시와 버전 호환 처리 반영

### Phase 5: 그룹 기반 인사이트 + 코멘트 고도화
- [x] `useMediaInsights.ts`에서 그룹 데이터 전달
- [x] `app/api/insight/route.ts`에서 그룹 컨텍스트 반영
- [x] DB 추이 / 배당 추이 / 그룹 기여 / 미발생 그룹 / 운영 코멘트 구조 반영
- [x] fallback insight도 그룹 기준으로 동작

### Phase 6: Drill-down UI
- [x] `components/GroupInsightSection.tsx` 추가
- [x] 그룹 성과 / 미발생 / 위험 그룹 UI 반영
- [x] 요약 탭에 그룹 인사이트 섹션 추가
- [x] 상세 뷰는 그룹/소재 보조 확인용으로 유지

## Additional Changes After Initial 6 Phases

### Layout / UX
- [x] 상단 KPI 레이아웃 재조정
- [x] 긴 숫자값 대응을 위한 KPI 카드 폭/폰트 조정
- [x] 매체 인사이트 카드 레이아웃 재구성
  - 좌측: `DB 추이`, `배당 추이`, `운영 코멘트`
  - 우측: `권장 액션`
- [x] 하단 무거운 섹션에 `content-visibility: auto` 적용

### Media Catalog / Visibility
- [x] `카카오뱅크`, `삼쩜삼`, `기타항목`을 실제 catalog entry로 등록
- [x] `OTHER` 섹션이 화면에 표시되도록 `app/page.tsx` 수정
- [x] 선택 날짜에 today rows가 없어도 데이터셋에 존재하는 매체는 표시되도록 수정

### Cache / Stability
- [x] `analysisVersion` 도입
- [x] 예전 캐시 자동 무효화 및 재분석 경로 반영
- [x] `GET /api/report`에서 캐시 우선 반환 최적화
- [x] `POST /api/report` 업로드 후 최신일 + 전일 캐시 저장
- [x] `FUNCTION_PAYLOAD_TOO_LARGE` 방지를 위해 업로드 payload는 다시 경량화
- [x] `maxDuration` 상향 (`/api/report`)

## Raw Data Findings

`RAW/데일리 리포트_0409.xlsx` 기준 확인 결과:

- `삼쩜삼`: `2026-04-09` 데이터 존재
- `카카오뱅크`: `2026-04-08`까지 존재, `2026-04-09` 없음
- `기타항목`: `2026-04-08`까지 존재, `2026-04-09` 없음

즉 `2026-04-09` 기준에서 `삼쩜삼`만 today 값이 있고, 나머지 둘은 0값으로 보여주는 것이 맞는 상태다.

## Current Files Of Interest
- `lib/types.ts`
- `lib/analyzer.ts`
- `lib/media-catalog.ts`
- `lib/media-kpi-config.ts`
- `lib/excel.ts`
- `lib/storage.ts`
- `app/page.tsx`
- `app/api/report/route.ts`
- `app/api/insight/route.ts`
- `components/SummaryCard.tsx`
- `components/MediaInsightCard.tsx`
- `components/GroupInsightSection.tsx`
- `components/DetailPanel.tsx`
- `components/dashboard/MetricCard.tsx`
- `components/dashboard/useMediaInsights.ts`

## Current Known Limitation
- 최신 업로드 버전에서 전일보다 더 이전 날짜로 자주 이동할 경우, 해당 날짜 캐시가 없으면 on-demand 분석이 다시 발생할 수 있다.
- 현재는 업로드 시 최신일과 전일까지만 자동 캐시한다.

## Recommended Next Check
현재 배포본에서 아래 두 가지를 확인하면 된다.

1. `RAW/데일리 리포트_0409.xlsx` 업로드 후 `기타` 섹션에
   - `카카오뱅크`
   - `삼쩜삼`
   - `기타항목`
   가 모두 보이는지 확인
2. 탐색 탭에서 `2026-04-09 -> 2026-04-08` 전환 시 timeout 없이 열리는지 확인
