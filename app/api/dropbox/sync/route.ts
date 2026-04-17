import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { analyze, computeFilterOptions, getAvailableDates } from "@/lib/analyzer";
import { isAuthenticatedRequest, unauthorizedJson } from "@/lib/auth";
import { parseWorkbook } from "@/lib/excel";
import {
  DropboxEntry,
  downloadDropboxFile,
  listDropboxFolder,
  sendSlackMessage,
} from "@/lib/proxy-client";
import {
  appendReportHistory,
  isBlobConfigured,
  saveCachedAnalysisResult,
  saveReportManifest,
} from "@/lib/storage";
import { PersistedReportPayload } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const PRODUCTION_URL = "https://daily-report-dashboardnre.vercel.app";

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
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return { year, month, day };
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
    const timeA = a.modified ? new Date(a.modified).getTime() : 0;
    const timeB = b.modified ? new Date(b.modified).getTime() : 0;
    if (timeA !== timeB) return timeB - timeA;
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

export async function POST(req: NextRequest) {
  if (!isAuthenticatedRequest(req)) {
    return unauthorizedJson();
  }

  try {
    if (!isBlobConfigured()) {
      return NextResponse.json({ error: "Vercel Blob is not configured." }, { status: 500 });
    }

    const body = (await req.json().catch(() => ({}))) as { date?: string };
    const { year, month, day } = resolveTargetDate(body.date);
    const folderPath = buildFolderPath(year, month, day);
    const humanDate = `${year}-${month}-${day}`;
    const channel = process.env.SLACK_NOTIFY_CHANNEL;

    let listing;
    try {
      listing = await listDropboxFolder(folderPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dropbox list failed";
      if (channel) {
        await sendSlackMessage(
          channel,
          `:warning: Dropbox 동기화 실패 — ${humanDate} 폴더 조회 오류\n\`${folderPath}\`\n${message}`,
        );
      }
      return NextResponse.json({ error: `Dropbox 폴더 조회 실패: ${message}`, folderPath }, { status: 502 });
    }

    const target = pickTargetExcel(listing.entries);
    if (!target) {
      const message = `오늘(${humanDate}) 폴더에 .xlsx 파일이 없습니다.`;
      if (channel) {
        await sendSlackMessage(
          channel,
          `:hourglass_flowing_sand: Dropbox 동기화 대기 — ${humanDate} 아직 업로드 전\n\`${folderPath}\``,
        );
      }
      return NextResponse.json({ error: message, folderPath, entries: listing.entries.length }, { status: 404 });
    }

    let buffer: ArrayBuffer;
    try {
      buffer = await downloadDropboxFile(target.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : "download failed";
      if (channel) {
        await sendSlackMessage(
          channel,
          `:x: Dropbox 다운로드 실패 — ${target.name}\n\`${target.path}\`\n${message}`,
        );
      }
      return NextResponse.json({ error: `Dropbox 다운로드 실패: ${message}`, path: target.path }, { status: 502 });
    }

    const { rows, availableDates: parsedAvailableDates, diagnostics } = await parseWorkbook(buffer);
    const availableDates = parsedAvailableDates.length ? parsedAvailableDates : getAvailableDates(rows);
    if (!availableDates.length) {
      return NextResponse.json({ error: "분석 가능한 날짜가 없습니다." }, { status: 400 });
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
      prevResult ? saveCachedAnalysisResult(sourcePathname, prevResult.date, manifest.uploadedAt, prevResult) : Promise.resolve(),
    ]);

    if (channel) {
      const summary =
        `:white_check_mark: 메리츠 대시보드 자동 동기화 완료 — ${humanDate}\n` +
        `파일: ${target.name}\n` +
        `분석 기준일: ${latestResult.date} (${latestResult.weekday})\n` +
        `시드된 날짜: ${[latestResult.date, prevResult?.date].filter(Boolean).join(", ")}\n` +
        `${PRODUCTION_URL}`;
      await sendSlackMessage(channel, summary);
    }

    return NextResponse.json({
      ok: true,
      folderPath,
      targetPath: target.path,
      fileName: target.name,
      uploadedAt: manifest.uploadedAt,
      latestDate: latestResult.date,
      prevDate: prevResult?.date ?? null,
      availableDates,
      sourcePathname,
      diagnostics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dropbox sync failed";
    const channel = process.env.SLACK_NOTIFY_CHANNEL;
    if (channel) {
      await sendSlackMessage(channel, `:x: Dropbox 동기화 에러 — ${message}`);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
