import { getAvailableDates } from "./analyzer";
import { REPORT_SHEET_NAME } from "./config";
import { RawRow, WorkbookDiagnostics, WorkbookParseResult } from "./types";

const COLUMN_ALIASES: Record<keyof RawRow, string[]> = {
  date: ["DATE"],
  mediaGroup: ["\uB9E4\uCCB4(\uB300\uBD84\uB958)", "\uB9E4\uCCB4 \uB300\uBD84\uB958"],
  media: ["\uB9E4\uCCB4"],
  company: ["\uD68C\uC0AC"],
  campaign: ["\uCEA0\uD398\uC778"],
  adGroup: ["\uADF8\uB8F9"],
  creativeCode: ["\uAD11\uACE0\uB9E4\uCCB43", "\uC18C\uC7AC\uCF54\uB4DC", "\uC18C\uC7AC", "\uAD11\uACE0\uC18C\uC7AC"],
  impressions: ["\uB178\uCD9C", "\uB178\uCD9C\uC218"],
  clicks: ["\uD074\uB9AD", "\uD074\uB9AD\uC218"],
  cost: ["\uBE44\uC6A9", "\uAD11\uACE0\uBE44"],
  db: ["db", "DB"],
  assignedNonDb: ["\uBC30\uB2F9_N", "\uBC30\uB2F9N"],
  assigned: ["\uBC30\uB2F9"],
  landing: ["\uB79C\uB529", "\uB79C\uB529\uBA85"],
  landingCategory: ["\uB79C\uB529\uAD6C\uBD84", "\uB79C\uB529 \uBD84\uB958"],
  mediaType: ["NEW \uB9E4\uCCB4", "\uB9E4\uCCB4\uC720\uD615", "\uB9E4\uCCB4 \uC720\uD615"],
};

const NUMERIC_FIELDS: Array<keyof Pick<RawRow, "impressions" | "clicks" | "cost" | "db" | "assignedNonDb" | "assigned">> = [
  "impressions",
  "clicks",
  "cost",
  "db",
  "assignedNonDb",
  "assigned",
];

const STRING_FIELDS: Array<
  keyof Pick<RawRow, "mediaGroup" | "media" | "company" | "campaign" | "adGroup" | "creativeCode" | "landing" | "landingCategory" | "mediaType">
> = ["mediaGroup", "media", "company", "campaign", "adGroup", "creativeCode", "landing", "landingCategory", "mediaType"];

const EXCLUDED_CREATIVE_PREFIXES = ["bigcraft", "bigc"];
const EXCLUDED_COMPANIES = new Set(["\uBE45\uD06C\uB798\uD504\uD2B8"]);

function getValue(entry: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    if (alias in entry) return entry[alias];
  }
  return undefined;
}

function findHeader(headers: string[], aliases: string[]) {
  return aliases.find((alias) => headers.includes(alias));
}

function buildDiagnostics(headers: string[], sheetName: string): WorkbookDiagnostics {
  const mappedHeaders = {} as Partial<Record<keyof RawRow, string>>;

  for (const field of Object.keys(COLUMN_ALIASES) as Array<keyof RawRow>) {
    const matched = findHeader(headers, COLUMN_ALIASES[field]);
    if (matched) mappedHeaders[field] = matched;
  }

  const knownHeaders = new Set(Object.values(COLUMN_ALIASES).flat());
  const unknownHeaders = headers.filter((header) => !knownHeaders.has(header));
  const missingFields = (Object.keys(COLUMN_ALIASES) as Array<keyof RawRow>).filter((field) => !mappedHeaders[field]);

  return {
    sheetName,
    headers,
    unknownHeaders,
    missingFields,
    mappedHeaders,
  };
}

export function normalizeRows(raw: Record<string, unknown>[], displayRows?: Record<string, unknown>[]): RawRow[] {
  return raw
    .map((entry, index) => {
      const row = {} as RawRow;

      const displayEntry = displayRows?.[index];
      const displayDateValue = displayEntry ? getValue(displayEntry, COLUMN_ALIASES.date) : undefined;
      const dateValue = displayDateValue ?? getValue(entry, COLUMN_ALIASES.date);
      row.date =
        dateValue instanceof Date || typeof dateValue === "string" || typeof dateValue === "number" ? dateValue : "";

      for (const field of NUMERIC_FIELDS) {
        const value = getValue(entry, COLUMN_ALIASES[field]);
        row[field] = value != null && value !== "" ? Number(value) || 0 : 0;
      }

      for (const field of STRING_FIELDS) {
        const value = getValue(entry, COLUMN_ALIASES[field]);
        row[field] = value != null ? String(value).trim() : "";
      }

      return row;
    })
    .filter((row) => {
      if (EXCLUDED_COMPANIES.has(row.company.trim())) return false;
      const creativeCode = row.creativeCode.trim().toLowerCase();
      return !EXCLUDED_CREATIVE_PREFIXES.some((prefix) => creativeCode.startsWith(prefix));
    });
}

async function loadXlsx() {
  return import("xlsx");
}

export async function parseWorkbook(buffer: ArrayBuffer | Buffer): Promise<WorkbookParseResult> {
  const XLSX = await loadXlsx();
  const workbook = XLSX.read(buffer, {
    type: buffer instanceof ArrayBuffer ? "array" : "buffer",
    cellDates: true,
  });

  if (!workbook.SheetNames.includes(REPORT_SHEET_NAME)) {
    throw new Error(`\uD544\uC218 \uC2DC\uD2B8 "${REPORT_SHEET_NAME}"\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`);
  }

  const worksheet = workbook.Sheets[REPORT_SHEET_NAME];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { raw: true });
  const displayRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { raw: false, dateNF: "yyyy-mm-dd" });
  if (!raw.length) {
    throw new Error("\uC5C5\uB85C\uB4DC\uD55C \uC2DC\uD2B8\uC5D0 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }

  const headers = Object.keys(raw[0] ?? {});
  const diagnostics = buildDiagnostics(headers, REPORT_SHEET_NAME);
  const rows = normalizeRows(raw, displayRows);
  const availableDates = getAvailableDates(rows);

  if (!availableDates.length) {
    throw new Error("DATE \uCEEC\uB7FC\uC5D0\uC11C \uC870\uD68C \uAC00\uB2A5\uD55C \uB0A0\uC9DC\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  }

  return { rows, availableDates, diagnostics };
}
