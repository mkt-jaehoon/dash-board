import { KpiData } from "../types";
import { KPI_CONFIG } from "../config";
import { cpa, diffPct, diffPp, fmt, num, rate } from "./kpi";

// "정체": 비용은 집행됐지만 DB 가 오늘과 전일 연속으로 0 인 상태.
// 그룹/소재 어떤 단위에도 같은 정의를 쓰므로 `today` + `d1` 만 받는다.
export function isStalled(stats: { today: KpiData; d1: KpiData | null }): boolean {
  return (
    stats.today.cost > 0 &&
    stats.today.db === 0 &&
    stats.d1 != null &&
    stats.d1.cost > 0 &&
    stats.d1.db === 0
  );
}

export function gradeCreative(kpi: KpiData): "good" | "caution" | "bad" {
  const costPerDb = cpa(kpi.cost, kpi.db);
  const assignRate = rate(kpi.assigned, kpi.db);

  if (kpi.db === 0) return "bad";
  if (kpi.cost === 0 && kpi.db > 0) return "caution";
  if (costPerDb !== null && costPerDb > KPI_CONFIG.cpa.warn) return "bad";
  if (assignRate !== null && assignRate < KPI_CONFIG.rate.warn) return "bad";
  if (costPerDb !== null && costPerDb > KPI_CONFIG.cpa.excellent) return "caution";
  if (assignRate !== null && assignRate < KPI_CONFIG.rate.excellent) return "caution";
  return "good";
}

export function buildComment(
  today: KpiData,
  d1: KpiData | null,
  monthAvgData: KpiData | null,
): string {
  const todayCpa = cpa(today.cost, today.db);
  const todayRate = rate(today.assigned, today.db);

  if (today.cost === 0 && today.db > 0) {
    return "비용 없이 DB가 발생해 전환 경로와 집계 기준 확인이 필요합니다.";
  }
  if (today.db === 0) {
    return "DB가 없어 노출, 클릭, 랜딩 흐름부터 우선 점검이 필요합니다.";
  }

  const d1Cpa = d1 ? cpa(d1.cost, d1.db) : null;
  const d1Rate = d1 ? rate(d1.assigned, d1.db) : null;
  const cpaDiff = diffPct(todayCpa, d1Cpa);
  const dbDiff = diffPct(today.db, d1?.db ?? null);
  const rateDiff = diffPp(todayRate, d1Rate);
  const exposureDiff = diffPct(today.impressions, d1?.impressions ?? null);

  if (exposureDiff !== null && exposureDiff < -40 && today.db > 0) {
    return `노출이 전일 대비 ${fmt(exposureDiff, "pct")} 감소해 예산 소진과 집행 상태 점검이 필요합니다.`;
  }
  if (dbDiff !== null && dbDiff >= 30 && todayCpa !== null && todayCpa <= KPI_CONFIG.cpa.excellent) {
    return `DB가 전일 대비 ${fmt(dbDiff, "pct")} 증가했고 CPA ${num(todayCpa)}원으로 효율이 양호합니다.`;
  }
  if (cpaDiff !== null && cpaDiff > 30 && dbDiff !== null && dbDiff < 0) {
    return `CPA가 전일 대비 ${fmt(cpaDiff, "pct")} 악화됐고 DB도 ${fmt(dbDiff, "pct")} 감소했습니다.`;
  }
  if (rateDiff !== null && rateDiff < -10 && todayCpa !== null && todayCpa <= KPI_CONFIG.cpa.excellent) {
    return `배당률이 전일 대비 ${fmt(rateDiff, "pp")} 하락해 랜딩 이후 흐름 점검이 필요합니다.`;
  }
  if (today.db < 3) {
    return `DB ${today.db}건으로 표본이 작아 추가 추이를 보고 판단하는 편이 안전합니다.`;
  }
  if (
    todayCpa !== null &&
    todayCpa <= KPI_CONFIG.cpa.excellent &&
    todayRate !== null &&
    todayRate >= KPI_CONFIG.rate.excellent
  ) {
    return `CPA ${num(todayCpa)}원, 배당률 ${todayRate.toFixed(1)}%로 KPI를 충족하고 있습니다.`;
  }

  const parts: string[] = [];
  if (todayCpa !== null) parts.push(`CPA ${num(todayCpa)}원`);
  if (todayRate !== null) parts.push(`배당률 ${todayRate.toFixed(1)}%`);
  if (monthAvgData) {
    const monthAvgCpa = cpa(monthAvgData.cost, monthAvgData.db);
    const monthAvgRate = rate(monthAvgData.assigned, monthAvgData.db);
    if (monthAvgCpa !== null) parts.push(`월평균 CPA ${num(monthAvgCpa)}원`);
    if (monthAvgRate !== null) parts.push(`월평균 배당률 ${monthAvgRate.toFixed(1)}%`);
  }
  return parts.length
    ? `${parts.join(", ")} 기준으로 추가 추이 모니터링이 필요합니다.`
    : "추가 확인이 필요합니다.";
}
