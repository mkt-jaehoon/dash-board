export interface RawRow {
  date: Date | string | number;
  mediaGroup: string;
  media: string;
  company: string;
  campaign: string;
  adGroup: string;
  creativeCode: string;
  impressions: number;
  clicks: number;
  cost: number;
  db: number;
  assignedNonDb: number;
  assigned: number;
  landing: string;
  landingCategory: string;
  mediaType: string;
}

export interface KpiData {
  cost: number;
  db: number;
  assigned: number;
  assignedNonDb: number;
  impressions: number;
  clicks: number;
}

export interface CreativeStats {
  code: string;
  landing: string;
  landingCategory: string;
  today: KpiData;
  d1: KpiData | null;
  d7: KpiData | null;
  monthAvg: KpiData | null;
  comment: string;
  grade: "good" | "caution" | "bad";
}

export interface DailyKpiPoint {
  date: string;
  startDate?: string;
  endDate?: string;
  kpi: KpiData;
}

export type SectionType = "DA" | "SA" | "BIGCRAFT" | "OTHER";

export interface GroupStats {
  name: string;
  today: KpiData;
  d1: KpiData | null;
  d7: KpiData | null;
  recentDaily: DailyKpiPoint[];
  creativeCount: number;
  grade: "good" | "caution" | "bad";
  comment: string;
}

export interface MediaStats {
  key: string;
  name: string;
  section: SectionType;
  today: KpiData;
  d1: KpiData | null;
  d7: KpiData | null;
  recentDaily: DailyKpiPoint[];
  creatives: CreativeStats[];
  groups: GroupStats[];
}

export interface OverallStats {
  today: KpiData;
  d1: KpiData | null;
  // 기존 캐시(ANALYSIS_VERSION=4)에는 없을 수 있으므로 optional.
  // 새로 analyze() 를 돌리는 결과부터 채워진다.
  d7?: KpiData | null;
  monthAvg: KpiData | null;
}

export interface AnalysisResult {
  analysisVersion: number;
  date: string;
  weekday: string;
  overall: OverallStats;
  mediaGroups: Record<SectionType, MediaStats[]>;
  formattedText: string;
}

export interface InsightContent {
  dbTrend: string[];
  payoutTrend: string[];
  actionItems: string[];
}

export interface PersistedReportPayload {
  uploadedAt: string;
  availableDates: string[];
  sourcePathname: string;
  filterOptions?: {
    campaigns: string[];
    groups: string[];
  };
}

export interface ReportHistoryItem {
  uploadedAt: string;
  availableDates: string[];
  sourcePathname: string;
}

export interface WorkbookDiagnostics {
  sheetName: string;
  headers: string[];
  unknownHeaders: string[];
  missingFields: Array<keyof RawRow>;
  mappedHeaders: Partial<Record<keyof RawRow, string>>;
}

export interface WorkbookParseResult {
  rows: RawRow[];
  availableDates: string[];
  diagnostics: WorkbookDiagnostics;
}
