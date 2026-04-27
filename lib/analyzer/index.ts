import {
  AnalysisResult,
  CreativeStats,
  GroupStats,
  MediaStats,
  OverallStats,
  RawRow,
  SectionType,
} from "../types";
import { MEDIA_CATALOG, getMetaMatcher } from "../media-catalog";
import { formatDateParts, parseYmd, normalizeDate } from "./dates";
import {
  agg,
  buildCreativeMap,
  buildRollingWindows,
  indexByCreativeKey,
  indexByGroup,
  monthlyAvg,
} from "./aggregations";
import { buildComment, gradeCreative } from "./comments";

export const ANALYSIS_VERSION = 4;

const SECTIONS: SectionType[] = ["DA", "SA", "BIGCRAFT", "OTHER"];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

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
    d7: d7Rows.length ? agg(d7Rows) : null,
    monthAvg: monthlyAvg(monthRows),
  };

  const classified = new Set<RawRow>();
  const mediaGroups = Object.fromEntries(SECTIONS.map((section) => [section, [] as MediaStats[]])) as Record<
    SectionType,
    MediaStats[]
  >;

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

    const groups: GroupStats[] = [];
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

// Public API re-exports — callers continue to import from "@/lib/analyzer".
export { normalizeDate, getAvailableDates } from "./dates";
export { cpa, rate, cvr, diffPct, diffPp } from "./kpi";
export { isStalled, gradeCreative, buildComment } from "./comments";
export { filterRowsByMediaKey, uniqueSorted, computeFilterOptions } from "./filters";
export { formatText } from "./format";
