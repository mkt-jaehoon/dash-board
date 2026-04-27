import { KpiData, RawRow } from "../types";
import { normalizeDate } from "./dates";

export function agg(rows: RawRow[]): KpiData {
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

export function monthlyAvg(rows: RawRow[]): KpiData | null {
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

export function buildCreativeMap(rows: RawRow[]): Map<string, RawRow[]> {
  const creativeMap = new Map<string, RawRow[]>();
  for (const row of rows) {
    const key = `${row.creativeCode}||${row.landing}`;
    if (!creativeMap.has(key)) creativeMap.set(key, []);
    creativeMap.get(key)!.push(row);
  }
  return creativeMap;
}

export function indexByCreativeKey(rows: RawRow[]): Map<string, RawRow[]> {
  const map = new Map<string, RawRow[]>();
  for (const row of rows) {
    const k = `${row.creativeCode}||${row.landing}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(row);
  }
  return map;
}

export function indexByGroup(rows: RawRow[]): Map<string, RawRow[]> {
  const map = new Map<string, RawRow[]>();
  for (const row of rows) {
    const g = row.adGroup || "(미분류)";
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(row);
  }
  return map;
}

export interface RollingWindow {
  date: string;
  startDate: string;
  endDate: string;
  dates: string[];
}

export function buildRollingWindows(
  dates: string[],
  targetIndex: number,
  windowSize: number,
  windowCount: number,
): RollingWindow[] {
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
  }).filter((window): window is RollingWindow => Boolean(window));
}
