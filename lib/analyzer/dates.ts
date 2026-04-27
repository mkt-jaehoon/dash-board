import { RawRow } from "../types";

export function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

export function formatDateParts(date: Date, useUtc = false): string {
  const year = useUtc ? date.getUTCFullYear() : date.getFullYear();
  const month = String((useUtc ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, "0");
  const day = String(useUtc ? date.getUTCDate() : date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateInSeoul(date: Date): string {
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

export function parseYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return isValidDate(date) ? date : null;
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
