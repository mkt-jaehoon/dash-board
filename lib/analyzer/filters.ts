import { RawRow } from "../types";
import { MEDIA_CATALOG, getMetaMatcher } from "../media-catalog";
import { normalizeDate } from "./dates";

export function filterRowsByMediaKey(rows: RawRow[], mediaKey?: string): RawRow[] {
  if (!mediaKey || mediaKey === "all") return rows;

  if (mediaKey === "meta_total") {
    const metaMatcher = getMetaMatcher();
    return rows.filter(metaMatcher);
  }

  const catalog = MEDIA_CATALOG.find((item) => item.key === mediaKey);
  if (!catalog) return rows;
  return rows.filter((row) => catalog.match(row));
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
