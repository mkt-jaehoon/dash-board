import { put } from "@vercel/blob";
import { analyze, computeFilterOptions, getAvailableDates } from "./analyzer";
import { parseWorkbook } from "./excel";
import {
  DropboxEntry,
  downloadDropboxFile,
  listDropboxFolder,
  sendSlackMessage,
} from "./proxy-client";
import {
  appendReportHistory,
  isBlobConfigured,
  saveCachedAnalysisResult,
  saveReportManifest,
} from "./storage";
import { PersistedReportPayload, WorkbookDiagnostics } from "./types";

export interface IngestOptions {
  date?: string;
  force?: boolean;
  notifySlack?: boolean;
  trigger: "manual" | "cron";
}

export interface IngestSuccess {
  ok: true;
  skipped: false;
  folderPath: string;
  targetPath: string;
  fileName: string;
  uploadedAt: string;
  latestDate: string;
  prevDate: string | null;
  availableDates: string[];
  sourcePathname: string;
  diagnostics: WorkbookDiagnostics;
  weekday: string;
}

export interface IngestSkipped {
  ok: true;
  skipped: true;
  reason: string;
  folderPath?: string;
}

export interface IngestFailure {
  ok: false;
  skipped: false;
  error: string;
  folderPath?: string;
  status: number;
}

export type IngestResult = IngestSuccess | IngestSkipped | IngestFailure;

const PRODUCTION_URL = "https://daily-report-dashboardnre.vercel.app";
const KST_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function getReportRoot() {
  const root = process.env.DROPBOX_REPORT_ROOT;
  if (!root) throw new Error("DROPBOX_REPORT_ROOT is not configured.");
  return root.replace(/\/$/, "");
}

function kstDateParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return { year, month, day };
}

function kstWeekdayIndex(year: string, month: string, day: string) {
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day));
  // KST is UTC+9; since we already picked the date string in KST, the Date at noon UTC on that calendar day gives the same weekday.
  const weekday = new Date(utc).getUTCDay();
  return weekday;
}

function isWeekend(weekday: number) {
  return weekday === 0 || weekday === 6;
}

function resolveTargetDate(raw?: string) {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-");
    return { year, month, day };
  }
  if (raw && /^\d{6}$/.test(raw)) {
    const year = `20${raw.slice(0, 2)}`;
    const month = raw.slice(2, 4);
    const day = raw.slice(4, 6);
    return { year, month, day };
  }
  return kstDateParts();
}

function buildFolderPath(year: string, month: string, day: string) {
  const root = getReportRoot();
  const yy = year.slice(2);
  const monthFolder = `${yy}\uB144 ${month}\uC6D4`;
  const dayFolder = `${yy}${month}${day}`;
  return `${root}/${monthFolder}/${dayFolder}`;
}

function pickTargetExcel(entries: DropboxEntry[]): DropboxEntry | null {
  const xlsxFiles = entries.filter((entry) => entry.type === "file" && /\.xlsx$/i.test(entry.name));
  if (!xlsxFiles.length) return null;
  xlsxFiles.sort((a, b) => {
    const ta = a.modified ? new Date(a.modified).getTime() : 0;
    const tb = b.modified ? new Date(b.modified).getTime() : 0;
    if (ta !== tb) return tb - ta;
    return (b.size ?? 0) - (a.size ?? 0);
  });
  return xlsxFiles[0];
}

function sanitizeForBlob(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "report";
}

async function storeRowsAsBlob(rows: unknown, sourceName: string) {
  const safe = sanitizeForBlob(sourceName.replace(/\.(xlsx|xls)$/i, ""));
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const pathname = `uploads/dropbox-${stamp}-${safe}.parsed.json`;
  await put(pathname, JSON.stringify(rows), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
  });
  return pathname;
}

async function notify(text: string, notifySlack: boolean) {
  if (!notifySlack) return;
  const channel = process.env.SLACK_NOTIFY_CHANNEL;
  if (!channel) return;
  await sendSlackMessage(channel, text);
}

export async function runDropboxIngest(options: IngestOptions): Promise<IngestResult> {
  if (!isBlobConfigured()) {
    return { ok: false, skipped: false, status: 500, error: "Vercel Blob is not configured." };
  }

  const { year, month, day } = resolveTargetDate(options.date);
  const humanDate = `${year}-${month}-${day}`;
  const weekdayIdx = kstWeekdayIndex(year, month, day);
  const weekdayLabel = KST_WEEKDAYS[weekdayIdx];

  if (!options.force && isWeekend(weekdayIdx)) {
    return {
      ok: true,
      skipped: true,
      reason: `weekend (${humanDate} ${weekdayLabel})`,
    };
  }

  const folderPath = buildFolderPath(year, month, day);
  const notifySlack = Boolean(options.notifySlack);
  const triggerLabel = options.trigger === "cron" ? "자동 크론" : "수동 실행";

  let listing;
  try {
    listing = await listDropboxFolder(folderPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dropbox list failed";
    await notify(
      `:warning: Dropbox 동기화 실패(${triggerLabel}) — ${humanDate}(${weekdayLabel}) 폴더 조회 오류\n\`${folderPath}\`\n${message}`,
      notifySlack,
    );
    return { ok: false, skipped: false, status: 502, error: `폴더 조회 실패: ${message}`, folderPath };
  }

  const target = pickTargetExcel(listing.entries);
  if (!target) {
    await notify(
      `:hourglass_flowing_sand: Dropbox 대기(${triggerLabel}) — ${humanDate}(${weekdayLabel}) 아직 업로드 전\n\`${folderPath}\``,
      notifySlack,
    );
    return {
      ok: false,
      skipped: false,
      status: 404,
      error: `오늘(${humanDate}) 폴더에 .xlsx 파일이 없습니다.`,
      folderPath,
    };
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await downloadDropboxFile(target.path);
  } catch (error) {
    const message = error instanceof Error ? error.message : "download failed";
    await notify(
      `:x: Dropbox 다운로드 실패(${triggerLabel}) — ${target.name}\n\`${target.path}\`\n${message}`,
      notifySlack,
    );
    return { ok: false, skipped: false, status: 502, error: `다운로드 실패: ${message}`, folderPath };
  }

  const { rows, availableDates: parsedDates, diagnostics } = await parseWorkbook(buffer);
  const availableDates = parsedDates.length ? parsedDates : getAvailableDates(rows);
  if (!availableDates.length) {
    return { ok: false, skipped: false, status: 400, error: "분석 가능한 날짜가 없습니다.", folderPath };
  }

  const latestDate = availableDates[availableDates.length - 1];
  const prevDate = availableDates.length >= 2 ? availableDates[availableDates.length - 2] : null;
  const filterOptions = computeFilterOptions(rows, latestDate);
  const latestResult = analyze(rows, latestDate);
  const prevResult = prevDate ? analyze(rows, prevDate) : null;

  const sourcePathname = await storeRowsAsBlob(rows, target.name);

  const manifest: PersistedReportPayload = {
    uploadedAt: new Date().toISOString(),
    availableDates,
    sourcePathname,
    filterOptions,
  };

  await Promise.all([
    saveReportManifest(manifest),
    appendReportHistory(manifest),
    saveCachedAnalysisResult(sourcePathname, latestDate, manifest.uploadedAt, latestResult),
    prevResult
      ? saveCachedAnalysisResult(sourcePathname, prevResult.date, manifest.uploadedAt, prevResult)
      : Promise.resolve(),
  ]);

  await notify(
    `:white_check_mark: Dropbox 동기화 완료(${triggerLabel}) — ${humanDate}(${weekdayLabel})\n` +
      `파일: ${target.name}\n` +
      `분석 기준일: ${latestResult.date} (${latestResult.weekday})\n` +
      `시드된 날짜: ${[latestResult.date, prevResult?.date].filter(Boolean).join(", ")}\n` +
      `${PRODUCTION_URL}`,
    notifySlack,
  );

  return {
    ok: true,
    skipped: false,
    folderPath,
    targetPath: target.path,
    fileName: target.name,
    uploadedAt: manifest.uploadedAt,
    latestDate: latestResult.date,
    prevDate: prevResult?.date ?? null,
    availableDates,
    sourcePathname,
    diagnostics,
    weekday: latestResult.weekday,
  };
}
