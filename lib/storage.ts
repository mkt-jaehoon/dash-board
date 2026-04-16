import { get, put } from "@vercel/blob";
import { AnalysisResult, PersistedReportPayload, ReportHistoryItem } from "./types";

const MANIFEST_BLOB_PATH = "reports/latest-manifest.json";
const HISTORY_BLOB_PATH = "reports/history.json";

function getAnalysisCachePath(sourcePathname: string, date: string, reportVersion: string): string {
  const safeSource = sourcePathname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeVersion = reportVersion.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `reports/cache/${safeVersion}/${safeSource}/${date}.json`;
}

function getInsightCachePath(date: string, mediaKey: string, reportVersion: string): string {
  const safeMedia = mediaKey.replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeVersion = reportVersion.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `reports/insights/${safeVersion}/${date}/${safeMedia}.json`;
}

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function isMissingBlobError(error: unknown): boolean {
  return error instanceof Error && /not found|failed to find blob/i.test(error.message);
}

export async function loadReportManifest(): Promise<PersistedReportPayload | null> {
  if (!isBlobConfigured()) return null;

  try {
    const blob = await get(MANIFEST_BLOB_PATH, { access: "private" });
    if (!blob || blob.statusCode !== 200 || !blob.stream) return null;
    const text = await new Response(blob.stream).text();
    const manifest = JSON.parse(text) as PersistedReportPayload;
    if (!manifest?.sourcePathname || !manifest.availableDates?.length) return null;
    return manifest;
  } catch (error) {
    if (isMissingBlobError(error)) return null;
    throw error;
  }
}

export async function saveReportManifest(payload: PersistedReportPayload) {
  if (!isBlobConfigured()) throw new Error("Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN.");

  await put(MANIFEST_BLOB_PATH, JSON.stringify(payload), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
  });
}

export async function clearReportManifest() {
  if (!isBlobConfigured()) return;

  await put(
    MANIFEST_BLOB_PATH,
    JSON.stringify({ uploadedAt: "", availableDates: [], sourcePathname: "" } satisfies PersistedReportPayload),
    { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json; charset=utf-8" },
  );
}

export async function loadReportHistory(): Promise<ReportHistoryItem[]> {
  if (!isBlobConfigured()) return [];

  try {
    const blob = await get(HISTORY_BLOB_PATH, { access: "private" });
    if (!blob || blob.statusCode !== 200 || !blob.stream) return [];
    const text = await new Response(blob.stream).text();
    const history = JSON.parse(text) as ReportHistoryItem[];
    return Array.isArray(history) ? history : [];
  } catch (error) {
    if (isMissingBlobError(error)) return [];
    throw error;
  }
}

export async function appendReportHistory(item: ReportHistoryItem) {
  const history = await loadReportHistory();
  const nextHistory = [item, ...history.filter((entry) => entry.uploadedAt !== item.uploadedAt)].slice(0, 5);

  await put(HISTORY_BLOB_PATH, JSON.stringify(nextHistory), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
  });
}

export async function loadPrivateBlob(pathname: string): Promise<ArrayBuffer> {
  const blob = await get(pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    throw new Error("Uploaded source file was not found in Blob storage.");
  }
  return await new Response(blob.stream).arrayBuffer();
}

export async function loadPrivateJson<T>(pathname: string): Promise<T> {
  const blob = await get(pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    throw new Error("Stored data file was not found in Blob storage.");
  }
  const text = await new Response(blob.stream).text();
  return JSON.parse(text) as T;
}

export async function savePrivateJson(pathname: string, payload: unknown) {
  await put(pathname, JSON.stringify(payload), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
  });
}

export async function loadCachedAnalysisResult(sourcePathname: string, date: string, reportVersion: string): Promise<AnalysisResult | null> {
  try {
    return await loadPrivateJson<AnalysisResult>(getAnalysisCachePath(sourcePathname, date, reportVersion));
  } catch (error) {
    if (error instanceof Error && /Unexpected token/i.test(error.message)) return null;
    if (isMissingBlobError(error)) return null;
    throw error;
  }
}

export async function saveCachedAnalysisResult(sourcePathname: string, date: string, reportVersion: string, result: AnalysisResult) {
  await put(getAnalysisCachePath(sourcePathname, date, reportVersion), JSON.stringify(result), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
  });
}

export async function loadCachedInsight<T>(date: string, mediaKey: string, reportVersion: string): Promise<T | null> {
  try {
    return await loadPrivateJson<T>(getInsightCachePath(date, mediaKey, reportVersion));
  } catch (error) {
    if (isMissingBlobError(error)) return null;
    throw error;
  }
}

export async function saveCachedInsight<T>(date: string, mediaKey: string, reportVersion: string, payload: T) {
  await put(getInsightCachePath(date, mediaKey, reportVersion), JSON.stringify(payload), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
  });
}
