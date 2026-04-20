import {
  AnalysisResult,
  CreativeStats,
  KpiData,
  MediaStats,
  OverallStats,
  RawRow,
  SectionType,
} from "./types";
import { KPI_CONFIG } from "./config";
import { MEDIA_CATALOG, getMetaMatcher } from "./media-catalog";

export const ANALYSIS_VERSION = 4;

const SECTIONS: SectionType[] = ["DA", "SA", "BIGCRAFT", "OTHER"];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function filterRowsByMediaKey(rows: RawRow[], mediaKey?: string) {
  if (!mediaKey || mediaKey === "all") return rows;

  if (mediaKey === "meta_total") {
    const metaMatcher = getMetaMatcher();
    return rows.filter(metaMatcher);
  }

  const catalog = MEDIA_CATALOG.find((item) => item.key === mediaKey);
  if (!catalog) return rows;
  return rows.filter((row) => catalog.match(row));
}

export function cpa(cost: number, db: number): number | null {
  return db > 0 ? cost / db : null;
}

export function rate(assigned: number, db: number): number | null {
  return db > 0 ? (assigned / db) * 100 : null;
}

export function cvr(db: number, clicks: number): number | null {
  return clicks > 0 ? (db / clicks) * 100 : null;
}

export function diffPct(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b === 0) return null;
  return ((a - b) / b) * 100;
}

export function diffPp(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return a - b;
}

function num(value: number): string {
  return Math.round(value).toLocaleString("ko-KR");
}

function formatDateParts(date: Date, useUtc = false): string {
  const year = useUtc ? date.getUTCFullYear() : date.getFullYear();
  const month = String((useUtc ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, "0");
  const day = String(useUtc ? date.getUTCDate() : date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateInSeoul(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return formatDateParts(date);
  }

  return `${year}-${month}-${day}`;
}

function isValidDate(date: Date) {
  return !Number.isNaN(date.getTime());
}

function parseYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return isValidDate(date) ? date : null;
}

function fmt(value: number | null, type: "pct" | "pp"): string {
  if (value == null) return "-";
  const sign = value > 0 ? "+" : "";
  return type === "pct" ? `${sign}${value.toFixed(0)}%` : `${sign}${value.toFixed(1)}p`;
}

function agg(rows: RawRow[]): KpiData {
  if (!rows.length) {
    return { cost: 0, db: 0, assigned: 0, assignedNonDb: 0, impressions: 0, clicks: 0 };
  }

  return {
    cost: rows.reduce((sum, row) => sum + row.cost, 0),
    db: rows.reduce((sum, row) => sum + row.db, 0),
    assigned: rows.reduce((sum, row) => sum + row.assigned, 0),
    assignedNonDb: rows.reduce((sum, row) => sum + row.assignedNonDb, 0),
    impressions: rows.reduce((sum, row) => sum + row.impressions, 0),
    clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
  };
}

function monthlyAvg(rows: RawRow[]): KpiData | null {
  if (!rows.length) return null;

  const byDate = new Map<string, RawRow[]>();
  for (const row of rows) {
    const key = normalizeDate(row.date);
    if (!key) continue;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(row);
  }

  const days = byDate.size;
  if (!days) return null;

  const total = agg(rows);
  return {
    cost: total.cost / days,
    db: total.db / days,
    assigned: total.assigned / days,
    assignedNonDb: total.assignedNonDb / days,
    impressions: total.impressions / days,
    clicks: total.clicks / days,
  };
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

export function buildComment(today: KpiData, d1: KpiData | null, monthAvgData: KpiData | null): string {
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
  return parts.length ? `${parts.join(", ")} 기준으로 추가 추이 모니터링이 필요합니다.` : "추가 확인이 필요합니다.";
}

export function normalizeDate(value: Date | string | number): string {
  if (value instanceof Date) {
    return isValidDate(value) ? formatDateInSeoul(value) : "";
  }
  if (typeof value === "number") {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return isValidDate(date) ? formatDateParts(date, true) : "";
  }

  const raw = String(value).trim();
  if (!raw) return "";

  const shortYearMatch = /^(\d{2})[./-](\d{1,2})[./-](\d{1,2})$/.exec(raw);
  if (shortYearMatch) {
    const [, shortYear, month, day] = shortYearMatch;
    const year = Number(shortYear);
    const fullYear = year >= 70 ? 1900 + year : 2000 + year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const plainDateMatch = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/.exec(raw);
  if (plainDateMatch) {
    const [, year, month, day] = plainDateMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const normalizedMatch = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/.exec(raw);
  if (normalizedMatch) {
    const parsed = new Date(raw);
    if (isValidDate(parsed)) {
      return formatDateInSeoul(parsed);
    }

    const [, year, month, day] = normalizedMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  return isValidDate(parsed) ? formatDateInSeoul(parsed) : "";
}

export function getAvailableDates(rows: RawRow[]): string[] {
  return Array.from(new Set(rows.map((row) => normalizeDate(row.date)).filter(Boolean))).sort();
}

export function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value && value !== "-" && value !== "#N/A"),
    ),
  ).sort((a, b) => a.localeCompare(b, "ko-KR"));
}

export function computeFilterOptions(
  rows: RawRow[],
  date: string,
  mediaKey?: string,
  selectedCampaign?: string,
): { campaigns: string[]; groups: string[] } {
  const scopedRows = filterRowsByMediaKey(rows, mediaKey);
  const rowsOnDate = scopedRows.filter((row) => normalizeDate(row.date) === date);
  const sourceRows = rowsOnDate.length ? rowsOnDate : scopedRows;
  return {
    campaigns: uniqueSorted(sourceRows.map((row) => row.campaign)),
    groups: uniqueSorted(
      sourceRows
        .filter((row) => !selectedCampaign || row.campaign === selectedCampaign)
        .map((row) => row.adGroup),
    ),
  };
}

function buildCreativeMap(rows: RawRow[]) {
  const creativeMap = new Map<string, RawRow[]>();
  for (const row of rows) {
    const key = `${row.creativeCode}||${row.landing}`;
    if (!creativeMap.has(key)) creativeMap.set(key, []);
    creativeMap.get(key)!.push(row);
  }
  return creativeMap;
}

function buildRollingWindows(dates: string[], targetIndex: number, windowSize: number, windowCount: number) {
  return Array.from({ length: windowCount }, (_, index) => {
    const start = targetIndex - windowSize * windowCount + 1 + index * windowSize;
    const end = start + windowSize - 1;
    if (start < 0 || end > targetIndex) return null;
    const windowDates = dates.slice(start, end + 1);
    if (windowDates.length !== windowSize) return null;
    return {
      date: windowDates[windowDates.length - 1],
      startDate: windowDates[0],
      endDate: windowDates[windowDates.length - 1],
      dates: windowDates,
    };
  }).filter((window): window is { date: string; startDate: string; endDate: string; dates: string[] } => Boolean(window));
}

export function analyze(rows: RawRow[], selectedDate?: string): AnalysisResult {
  const normalized = rows
    .map((row) => ({ ...row, _dateStr: normalizeDate(row.date) }))
    .filter((row) => row._dateStr);

  const dates = Array.from(new Set(normalized.map((row) => row._dateStr))).sort();
  if (!dates.length) {
    throw new Error("분석 가능한 날짜가 없습니다.");
  }

  const targetDate = selectedDate && dates.includes(selectedDate) ? selectedDate : dates[dates.length - 1];
  const targetIndex = dates.indexOf(targetDate);
  const d1Date = targetIndex > 0 ? dates[targetIndex - 1] : null;
  const targetDateValue = parseYmd(targetDate);
  if (!targetDateValue) {
    throw new Error(`유효하지 않은 날짜입니다: ${targetDate}`);
  }

  const d7Date = formatDateParts(new Date(targetDateValue.getTime() - 7 * 86400000), true);
  const monthPrefix = targetDate.slice(0, 7);
  const recentWindows = buildRollingWindows(dates, targetIndex, 7, 3);

  const rowsByDate = new Map<string, typeof normalized>();
  for (const row of normalized) {
    if (!rowsByDate.has(row._dateStr)) rowsByDate.set(row._dateStr, []);
    rowsByDate.get(row._dateStr)!.push(row);
  }

  const todayRows = rowsByDate.get(targetDate) ?? [];
  const d1Rows = d1Date ? (rowsByDate.get(d1Date) ?? []) : [];
  const d7Rows = rowsByDate.get(d7Date) ?? [];
  const monthRows: typeof normalized = [];
  for (const [dateKey, dateRows] of rowsByDate) {
    if (dateKey.startsWith(monthPrefix) && dateKey < targetDate) {
      monthRows.push(...dateRows);
    }
  }

  const overall: OverallStats = {
    today: agg(todayRows),
    d1: d1Rows.length ? agg(d1Rows) : null,
    monthAvg: monthlyAvg(monthRows),
  };

  const classified = new Set<RawRow>();
  const mediaGroups = Object.fromEntries(SECTIONS.map((section) => [section, [] as MediaStats[]])) as Record<
    SectionType,
    MediaStats[]
  >;

  function indexByCreativeKey(rows: RawRow[]) {
    const map = new Map<string, RawRow[]>();
    for (const row of rows) {
      const k = `${row.creativeCode}||${row.landing}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(row);
    }
    return map;
  }

  function indexByGroup(rows: RawRow[]) {
    const map = new Map<string, RawRow[]>();
    for (const row of rows) {
      const g = row.adGroup || "(미분류)";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(row);
    }
    return map;
  }

  const buildMediaStats = (
    key: string,
    name: string,
    section: SectionType,
    matcher: (row: RawRow) => boolean,
    mediaTodayRows: RawRow[],
  ): MediaStats => {
    const mediaD1Rows = d1Rows.filter(matcher);
    const mediaD7Rows = d7Rows.filter(matcher);
    const mediaMonthRows = monthRows.filter(matcher);

    const d1ByCreative = indexByCreativeKey(mediaD1Rows);
    const d7ByCreative = indexByCreativeKey(mediaD7Rows);
    const monthByCreative = indexByCreativeKey(mediaMonthRows);

    const creativeTodayMap = buildCreativeMap(mediaTodayRows);
    const creatives: CreativeStats[] = [];

    for (const [creativeKey, todayCreativeRows] of creativeTodayMap.entries()) {
      const [code, landing] = creativeKey.split("||");
      const sample = todayCreativeRows[0];
      const d1CreativeRows = d1ByCreative.get(creativeKey) ?? [];
      const d7CreativeRows = d7ByCreative.get(creativeKey) ?? [];
      const monthCreativeRows = monthByCreative.get(creativeKey) ?? [];
      const todayKpi = agg(todayCreativeRows);
      const d1Kpi = d1CreativeRows.length ? agg(d1CreativeRows) : null;
      const d7Kpi = d7CreativeRows.length ? agg(d7CreativeRows) : null;
      const monthAvgValue = monthlyAvg(monthCreativeRows);

      creatives.push({
        code,
        landing,
        landingCategory: sample?.landingCategory ?? "-",
        today: todayKpi,
        d1: d1Kpi,
        d7: d7Kpi,
        monthAvg: monthAvgValue,
        comment: buildComment(todayKpi, d1Kpi, monthAvgValue),
        grade: gradeCreative(todayKpi),
      });
    }

    creatives.sort((a, b) => b.today.db - a.today.db);

    const recentDaily = recentWindows.map((window) => {
      const windowDateSet = new Set(window.dates);
      const windowRows: RawRow[] = [];
      for (const d of window.dates) {
        const dateRows = rowsByDate.get(d);
        if (dateRows) {
          for (const row of dateRows) {
            if (matcher(row)) windowRows.push(row);
          }
        }
      }
      return {
        date: window.date,
        startDate: window.startDate,
        endDate: window.endDate,
        kpi: agg(windowRows),
      };
    });

    const groupTodayMap = indexByGroup(mediaTodayRows);
    const d1ByGroup = indexByGroup(mediaD1Rows);
    const d7ByGroup = indexByGroup(mediaD7Rows);

    const groups: import("./types").GroupStats[] = [];
    for (const [groupName, groupTodayRows] of groupTodayMap.entries()) {
      const groupD1Rows = d1ByGroup.get(groupName) ?? [];
      const groupD7Rows = d7ByGroup.get(groupName) ?? [];
      const todayKpi = agg(groupTodayRows);
      const d1Kpi = groupD1Rows.length ? agg(groupD1Rows) : null;
      const d7Kpi = groupD7Rows.length ? agg(groupD7Rows) : null;
      const groupRecentDaily = recentWindows.map((window) => {
        const windowRows: RawRow[] = [];
        for (const d of window.dates) {
          const dateRows = rowsByDate.get(d);
          if (dateRows) {
            for (const row of dateRows) {
              if (matcher(row) && (row.adGroup || "(미분류)") === groupName) windowRows.push(row);
            }
          }
        }
        return {
          date: window.date,
          startDate: window.startDate,
          endDate: window.endDate,
          kpi: agg(windowRows),
        };
      });
      const creativeCount = new Set(groupTodayRows.map((r) => `${r.creativeCode}||${r.landing}`)).size;

      groups.push({
        name: groupName,
        today: todayKpi,
        d1: d1Kpi,
        d7: d7Kpi,
        recentDaily: groupRecentDaily,
        creativeCount,
        grade: gradeCreative(todayKpi),
        comment: buildComment(todayKpi, d1Kpi, null),
      });
    }
    groups.sort((a, b) => b.today.db - a.today.db);

    return {
      key,
      name,
      section,
      today: agg(mediaTodayRows),
      d1: mediaD1Rows.length ? agg(mediaD1Rows) : null,
      d7: mediaD7Rows.length ? agg(mediaD7Rows) : null,
      recentDaily,
      creatives,
      groups,
    };
  };

  for (const catalog of [...MEDIA_CATALOG].sort((a, b) => a.order - b.order)) {
    const mediaTodayRows = todayRows.filter((row) => catalog.match(row) && !classified.has(row));
    const hasAnyRows = normalized.some((row) => catalog.match(row));
    if (!mediaTodayRows.length && !hasAnyRows) continue;

    mediaTodayRows.forEach((row) => classified.add(row));
    mediaGroups[catalog.section].push(
      buildMediaStats(catalog.key, catalog.name, catalog.section, catalog.match, mediaTodayRows),
    );
  }

  const metaMatcher = getMetaMatcher();
  const metaTotalRows = todayRows.filter((row) => metaMatcher(row));
  if (metaTotalRows.length) {
    const metaTotalStats = buildMediaStats("meta_total", "메타 (TOTAL)", "DA", metaMatcher, metaTotalRows);
    const metaVaIndex = mediaGroups.DA.findIndex((media) => media.key === "meta_va");
    if (metaVaIndex >= 0) {
      mediaGroups.DA.splice(metaVaIndex + 1, 0, metaTotalStats);
    } else {
      mediaGroups.DA.push(metaTotalStats);
    }
  }

  const weekday = WEEKDAYS[targetDateValue.getUTCDay()];
  const result: AnalysisResult = {
    analysisVersion: ANALYSIS_VERSION,
    date: targetDate,
    weekday,
    overall,
    mediaGroups,
    formattedText: "",
  };

  return result;
}

export { formatText };

function formatKpi(kpi: KpiData | null): string {
  if (!kpi) return "데이터 없음";
  const costPerDb = cpa(kpi.cost, kpi.db);
  const assignRate = rate(kpi.assigned, kpi.db);
  return [
    `DB ${Math.round(kpi.db)}건`,
    `CPA ${costPerDb != null ? `${num(costPerDb)}원` : "-"}`,
    `배당률 ${assignRate != null ? `${assignRate.toFixed(1)}%` : "-"}`,
    `비용 ${num(kpi.cost)}원`,
  ].join(" | ");
}

function gradeText(grade: "good" | "caution" | "bad"): string {
  return grade === "good" ? "양호" : grade === "caution" ? "주의" : "위험";
}

function overallStatus(overall: OverallStats): string {
  const todayCpa = cpa(overall.today.cost, overall.today.db);
  const todayRate = rate(overall.today.assigned, overall.today.db);

  if (
    overall.today.db >= KPI_CONFIG.db.target &&
    todayCpa !== null &&
    todayCpa <= KPI_CONFIG.cpa.excellent &&
    todayRate !== null &&
    todayRate >= KPI_CONFIG.rate.excellent
  ) {
    return "목표 달성";
  }

  if (
    overall.today.db < KPI_CONFIG.db.warn ||
    (todayCpa !== null && todayCpa > KPI_CONFIG.cpa.warn) ||
    (todayRate !== null && todayRate < KPI_CONFIG.rate.warn)
  ) {
    return "목표 미달";
  }

  return "주의 필요";
}

function formatText(result: AnalysisResult): string {
  const { date, weekday, overall, mediaGroups } = result;
  const todayCpa = cpa(overall.today.cost, overall.today.db);
  const todayRate = rate(overall.today.assigned, overall.today.db);
  const monthAvgCpa = overall.monthAvg ? cpa(overall.monthAvg.cost, overall.monthAvg.db) : null;
  const monthAvgRate = overall.monthAvg ? rate(overall.monthAvg.assigned, overall.monthAvg.db) : null;

  const lines: string[] = [];
  lines.push("==========================================");
  lines.push(`데일리 성과 리포트 | ${date} (${weekday})`);
  lines.push("==========================================");
  lines.push("");
  lines.push("[전체 요약]");
  lines.push(`- 총 DB: ${num(overall.today.db)}건 | 목표 ${KPI_CONFIG.db.target}건 대비 ${Math.round((overall.today.db / KPI_CONFIG.db.target) * 100)}%`);
  lines.push(`- DB CPA: ${todayCpa != null ? `${num(todayCpa)}원` : "-"}`);
  lines.push(`- 배당률: ${todayRate != null ? `${todayRate.toFixed(1)}%` : "-"}`);
  lines.push(`- 총 비용: ${num(overall.today.cost)}원`);
  lines.push(`- 상태: ${overallStatus(overall)}`);
  if (monthAvgCpa != null || monthAvgRate != null) {
    lines.push(
      `- 월평균 ${[
        monthAvgCpa != null ? `CPA ${num(monthAvgCpa)}원` : null,
        monthAvgRate != null ? `배당률 ${monthAvgRate.toFixed(1)}%` : null,
      ]
        .filter(Boolean)
        .join(" | ")}`,
    );
  }
  lines.push("");

  const sections: Array<[string, MediaStats[]]> = [
    ["DA 매체 성과", mediaGroups.DA],
    ["SA 매체 성과", mediaGroups.SA],
  ];

  for (const [sectionName, medias] of sections) {
    if (!medias.length) continue;

    lines.push("------------------------------------------");
    lines.push(`[${sectionName}]`);
    lines.push("------------------------------------------");
    lines.push("");

    for (const media of medias) {
      const mediaCpa = cpa(media.today.cost, media.today.db);
      const mediaRate = rate(media.today.assigned, media.today.db);
      const d1Cpa = media.d1 ? cpa(media.d1.cost, media.d1.db) : null;
      const d1Rate = media.d1 ? rate(media.d1.assigned, media.d1.db) : null;

      lines.push(`■ ${media.name}`);
      lines.push(
        `[오늘 요약] DB: ${num(media.today.db)}건 | CPA: ${mediaCpa != null ? `${num(mediaCpa)}원` : "-"} | 배당률: ${
          mediaRate != null ? `${mediaRate.toFixed(1)}%` : "-"
        } | 비용: ${num(media.today.cost)}원`,
      );
      if (media.d1) {
        lines.push(
          `전일 대비 DB ${fmt(diffPct(media.today.db, media.d1.db), "pct")} | CPA ${fmt(diffPct(mediaCpa, d1Cpa), "pct")} | 배당률 ${fmt(diffPp(mediaRate, d1Rate), "pp")}`,
        );
      }
      lines.push("");

      if (!media.creatives.length) continue;

      lines.push("소재별 상세");
      for (const creative of media.creatives) {
        const creativeCvr = cvr(creative.today.db, creative.today.clicks);
        lines.push(`- [${creative.code}] 랜딩: ${creative.landing} (${creative.landingCategory})`);
        lines.push(`  오늘: ${formatKpi(creative.today)}${creativeCvr != null ? ` | CVR ${creativeCvr.toFixed(2)}%` : ""}`);
        lines.push(`  전일(D-1): ${formatKpi(creative.d1)}`);
        lines.push(`  전주 동일요일(D-7): ${formatKpi(creative.d7)}`);
        lines.push(`  월평균: ${formatKpi(creative.monthAvg)}`);
        lines.push(`  상태: ${gradeText(creative.grade)} | ${creative.comment}`);
        lines.push("");
      }
    }
  }

  lines.push("==========================================");
  return lines.join("\n");
}
