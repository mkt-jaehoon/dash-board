import { KpiData } from "./types";

/**
 * KPI 항목 정의
 * - key: 고유 식별자
 * - label: 화면 표시 이름
 * - unit: 단위 (원, 건, %)
 * - getValue: KpiData에서 값 추출
 * - deltaType: 증감 표시 방식 (pct=%, pp=p)
 */
export interface KpiMetricDef {
  key: string;
  label: string;
  unit: string;
  getValue: (kpi: KpiData) => number | null;
  deltaType: "pct" | "pp";
}

function safeDiv(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

export const ALL_KPI_METRICS: Record<string, KpiMetricDef> = {
  cost: {
    key: "cost",
    label: "광고비",
    unit: "원",
    getValue: (kpi) => kpi.cost,
    deltaType: "pct",
  },
  db: {
    key: "db",
    label: "DB",
    unit: "건",
    getValue: (kpi) => kpi.db,
    deltaType: "pct",
  },
  dbCpa: {
    key: "dbCpa",
    label: "DB CPA",
    unit: "원",
    getValue: (kpi) => safeDiv(kpi.cost, kpi.db),
    deltaType: "pct",
  },
  assigned: {
    key: "assigned",
    label: "배당",
    unit: "건",
    getValue: (kpi) => kpi.assigned,
    deltaType: "pct",
  },
  assignedRate: {
    key: "assignedRate",
    label: "배당률",
    unit: "%",
    getValue: (kpi) => (kpi.db > 0 ? (kpi.assigned / kpi.db) * 100 : null),
    deltaType: "pp",
  },
  assignedCpa: {
    key: "assignedCpa",
    label: "배당 CPA",
    unit: "원",
    getValue: (kpi) => safeDiv(kpi.cost, kpi.assigned),
    deltaType: "pct",
  },
};

/**
 * 매체별 KPI 노출 항목 설정
 * - 키: 매체 key (MEDIA_CATALOG의 key와 동일)
 * - 값: 노출할 KPI metric key 배열 (순서대로 표시)
 *
 * 등록되지 않은 매체는 DEFAULT_KPI_KEYS 사용
 */
const MEDIA_KPI_MAP: Record<string, string[]> = {
  toss: ["cost", "db", "dbCpa", "assigned", "assignedRate", "assignedCpa"],
  meta_total: ["cost", "db", "dbCpa", "assigned", "assignedRate", "assignedCpa"],
};

const DEFAULT_KPI_KEYS = ["cost", "db", "dbCpa"];

export function getMediaKpiMetrics(mediaKey: string): KpiMetricDef[] {
  const keys = MEDIA_KPI_MAP[mediaKey] ?? DEFAULT_KPI_KEYS;
  return keys.map((k) => ALL_KPI_METRICS[k]).filter(Boolean);
}

export function getOverallKpiMetrics(): KpiMetricDef[] {
  return ["cost", "db", "dbCpa", "assigned", "assignedRate", "assignedCpa"]
    .map((k) => ALL_KPI_METRICS[k])
    .filter(Boolean);
}
