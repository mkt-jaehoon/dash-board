import { NextRequest, NextResponse } from "next/server";
import { ANALYSIS_VERSION, analyze, computeFilterOptions, filterRowsByMediaKey, getAvailableDates } from "@/lib/analyzer";
import { isAuthenticatedRequest, unauthorizedJson } from "@/lib/auth";
import { parseWorkbook } from "@/lib/excel";
import {
  appendReportHistory,
  clearReportManifest,
  isBlobConfigured,
  isMissingBlobError,
  loadCachedAnalysisResult,
  loadPrivateBlob,
  loadPrivateJson,
  loadReportHistory,
  loadReportManifest,
  saveCachedAnalysisResult,
  savePrivateJson,
  saveReportManifest,
} from "@/lib/storage";
import { AnalysisResult, PersistedReportPayload, RawRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function logReportTiming(label: string, startedAt: number, extra?: Record<string, unknown>) {
  const durationMs = Date.now() - startedAt;
  const payload = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[api/report] ${label} ${durationMs}ms${payload}`);
}

function applyRowFilters(rows: RawRow[], campaign?: string, adGroup?: string) {
  return rows.filter((row) => {
    if (campaign && row.campaign !== campaign) return false;
    if (adGroup && row.adGroup !== adGroup) return false;
    return true;
  });
}

function resolveFilterOptions(
  rows: RawRow[],
  date: string,
  selectedCampaign?: string,
  mediaKey?: string,
  fallback?: PersistedReportPayload["filterOptions"],
) {
  const computed = computeFilterOptions(rows, date, mediaKey, selectedCampaign);
  if (computed.campaigns.length || computed.groups.length) {
    return computed;
  }
  if (mediaKey && mediaKey !== "all") {
    return computed;
  }
  return { campaigns: fallback?.campaigns ?? [], groups: fallback?.groups ?? [] };
}

async function loadRowsData(pathname: string): Promise<{ rows: RawRow[]; availableDates?: string[] }> {
  if (/\.(xlsx|xls)$/i.test(pathname)) {
    const buffer = await loadPrivateBlob(pathname);
    return await parseWorkbook(buffer);
  }

  try {
    const rows = await loadPrivateJson<RawRow[]>(pathname);
    return { rows };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unexpected token")) {
      const buffer = await loadPrivateBlob(pathname);
      return await parseWorkbook(buffer);
    }
    throw error;
  }
}

function getNormalizedSourcePath(pathname: string) {
  return /\.(xlsx|xls)$/i.test(pathname) ? pathname.replace(/\.(xlsx|xls)$/i, ".parsed.json") : pathname;
}

function resolveDate(availableDates: string[], requestedDate?: string) {
  if (requestedDate && availableDates.includes(requestedDate)) {
    return requestedDate;
  }
  return availableDates[availableDates.length - 1];
}

function getCacheSourceCandidates(pathname: string) {
  const candidates = new Set([pathname]);
  if (pathname.endsWith(".parsed.json")) {
    candidates.add(pathname.replace(/\.parsed\.json$/i, ".xlsx"));
    candidates.add(pathname.replace(/\.parsed\.json$/i, ".xls"));
  } else if (/\.(xlsx|xls)$/i.test(pathname)) {
    candidates.add(pathname.replace(/\.(xlsx|xls)$/i, ".parsed.json"));
  }
  return Array.from(candidates);
}

function isCurrentAnalysisShape(result: unknown, expectedDate?: string): boolean {
  if (!result || typeof result !== "object") return false;
  const analysisVersion = (result as { analysisVersion?: unknown }).analysisVersion;
  if (analysisVersion !== ANALYSIS_VERSION) return false;
  const resultDate = (result as { date?: unknown }).date;
  if (expectedDate && resultDate !== expectedDate) return false;
  const mediaGroups = (result as { mediaGroups?: Record<string, unknown[]> }).mediaGroups;
  if (!mediaGroups || typeof mediaGroups !== "object") return false;
  const requiredSections = ["DA", "SA", "BIGCRAFT", "OTHER"];
  if (!requiredSections.every((section) => Array.isArray(mediaGroups[section]))) return false;

  const daGroups = mediaGroups.DA;
  if (!Array.isArray(daGroups)) return false;
  const hasMetaDa = daGroups.some((media) => (media as { key?: unknown })?.key === "meta_da");
  const hasMetaVa = daGroups.some((media) => (media as { key?: unknown })?.key === "meta_va");
  const hasMetaTotal = daGroups.some((media) => (media as { key?: unknown })?.key === "meta_total");
  if ((hasMetaDa || hasMetaVa) && !hasMetaTotal) return false;

  return Object.values(mediaGroups).every((group) => {
    if (!Array.isArray(group)) return false;
    return group.every((media) => {
      if (!media || typeof media !== "object") return false;
      const recentDaily = (media as { recentDaily?: unknown }).recentDaily;
      if (!Array.isArray(recentDaily)) return false;
      const groups = (media as { groups?: unknown }).groups;
      if (!Array.isArray(groups)) return false;
      return true;
    });
  });
}

async function loadCachedFromCandidates(sourcePathname: string, date: string, reportVersion: string) {
  const candidates = getCacheSourceCandidates(sourcePathname);
  const results = await Promise.allSettled(
    candidates.map((candidate) => loadCachedAnalysisResult(candidate, date, reportVersion)),
  );
  for (const result of results) {
    if (result.status === "fulfilled" && result.value && isCurrentAnalysisShape(result.value, date)) {
      return result.value;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  if (!isAuthenticatedRequest(req)) {
    return unauthorizedJson();
  }

  try {
    const requestStartedAt = Date.now();
    const blobConfigured = isBlobConfigured();
    const [manifest, history] = await Promise.all([loadReportManifest(), loadReportHistory()]);
    logReportTiming("manifest-loaded", requestStartedAt, { hasManifest: Boolean(manifest) });
    if (!manifest) {
      return NextResponse.json({ payload: null, result: null, history: [], blobConfigured });
    }

    const selectedDate = req.nextUrl.searchParams.get("date") ?? undefined;
    const selectedMediaKey = req.nextUrl.searchParams.get("mediaKey") ?? undefined;
    const selectedCampaign = req.nextUrl.searchParams.get("campaign") ?? undefined;
    const selectedGroup = req.nextUrl.searchParams.get("group") ?? undefined;
    const availableDates = manifest.availableDates;
    const resolvedDate = resolveDate(availableDates, selectedDate);
    const hasDimensionFilters = Boolean(selectedCampaign || selectedGroup);
    const canUseManifestFilters = !selectedMediaKey || selectedMediaKey === "all";

    if (hasDimensionFilters) {
      const rowsStartedAt = Date.now();
      const scopedSourcePath = getNormalizedSourcePath(manifest.sourcePathname);
      const { rows } = await loadRowsData(scopedSourcePath);
      logReportTiming("dimension-rows-loaded", rowsStartedAt, {
        sourcePathname: scopedSourcePath,
        rowCount: rows.length,
        date: resolvedDate,
      });
      const mediaScopedRows = filterRowsByMediaKey(rows, selectedMediaKey);
      const filterOptions = resolveFilterOptions(rows, resolvedDate, selectedCampaign, selectedMediaKey, manifest.filterOptions);
      const safeCampaign = selectedCampaign && filterOptions.campaigns.includes(selectedCampaign) ? selectedCampaign : undefined;
      const safeGroup = selectedGroup && filterOptions.groups.includes(selectedGroup) ? selectedGroup : undefined;
      const filteredRows = applyRowFilters(mediaScopedRows, safeCampaign, safeGroup);
      const result = analyze(filteredRows, resolvedDate);
      logReportTiming("dimension-response-ready", requestStartedAt, {
        date: resolvedDate,
        mediaKey: selectedMediaKey ?? "all",
        campaign: safeCampaign ?? null,
        group: safeGroup ?? null,
      });

      return NextResponse.json({
        payload: {
          uploadedAt: manifest.uploadedAt,
          availableDates,
          filterOptions: resolveFilterOptions(rows, resolvedDate, safeCampaign, selectedMediaKey, manifest.filterOptions),
        },
        history,
        result,
        blobConfigured,
      });
    }

    const cacheStartedAt = Date.now();
    const cached = await loadCachedFromCandidates(manifest.sourcePathname, resolvedDate, manifest.uploadedAt);
    logReportTiming("cache-lookup-finished", cacheStartedAt, {
      sourcePathname: manifest.sourcePathname,
      date: resolvedDate,
      cacheHit: Boolean(cached),
    });
    if (cached) {
      let filterOptions = canUseManifestFilters ? manifest.filterOptions : undefined;
      if (!canUseManifestFilters && selectedMediaKey) {
        try {
          const scopedSourcePath = getNormalizedSourcePath(manifest.sourcePathname);
          const { rows } = await loadRowsData(scopedSourcePath);
          filterOptions = resolveFilterOptions(rows, resolvedDate, undefined, selectedMediaKey, manifest.filterOptions);
        } catch {
          // fall through with undefined filterOptions
        }
      }
      logReportTiming("cache-response-ready", requestStartedAt, { date: resolvedDate });
      return NextResponse.json({
        payload: {
          uploadedAt: manifest.uploadedAt,
          availableDates,
          filterOptions,
        },
        history,
        result: cached,
        blobConfigured,
      });
    }

    logReportTiming("cache-miss-fallback-start", requestStartedAt, { date: resolvedDate });
    try {
      const scopedSourcePath = getNormalizedSourcePath(manifest.sourcePathname);
      const { rows } = await loadRowsData(scopedSourcePath);
      const mediaScopedRows = filterRowsByMediaKey(rows, selectedMediaKey);
      const fallbackResult = analyze(mediaScopedRows, resolvedDate);
      const filterOptions = canUseManifestFilters
        ? manifest.filterOptions
        : resolveFilterOptions(rows, resolvedDate, undefined, selectedMediaKey, manifest.filterOptions);

      if (!selectedMediaKey || selectedMediaKey === "all") {
        saveCachedAnalysisResult(manifest.sourcePathname, resolvedDate, manifest.uploadedAt, fallbackResult).catch(() => {});
      }
      logReportTiming("cache-miss-fallback-done", requestStartedAt, { date: resolvedDate });

      return NextResponse.json({
        payload: {
          uploadedAt: manifest.uploadedAt,
          availableDates,
          filterOptions,
        },
        history,
        result: fallbackResult,
        blobConfigured,
      });
    } catch (fallbackError) {
      const reason = fallbackError instanceof Error ? fallbackError.message : "unknown";
      logReportTiming("cache-miss-fallback-failed", requestStartedAt, {
        date: resolvedDate,
        error: reason,
      });
      return NextResponse.json({
        payload: {
          uploadedAt: manifest.uploadedAt,
          availableDates,
          filterOptions: canUseManifestFilters ? manifest.filterOptions : undefined,
        },
        history,
        result: null,
        blobConfigured,
        error: `선택한 날짜(${resolvedDate})를 서버에서 불러오지 못했습니다. 잠시 후 다시 시도하거나 페이지를 새로고침해 주세요. (${reason})`,
      });
    }
  } catch (error) {
    if (isMissingBlobError(error)) {
      await clearReportManifest();
      return NextResponse.json({
        payload: null,
        result: null,
        history: [],
        blobConfigured: isBlobConfigured(),
      });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load shared report." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthenticatedRequest(req)) {
    return unauthorizedJson();
  }

  try {
    const blobConfigured = isBlobConfigured();
    const body = (await req.json()) as Partial<Pick<PersistedReportPayload, "sourcePathname" | "availableDates" | "filterOptions">> & {
      precomputedResult?: AnalysisResult | null;
      additionalResults?: AnalysisResult[];
    };

    if (!body?.sourcePathname) {
      return NextResponse.json({ error: "Uploaded file path is missing." }, { status: 400 });
    }

    let sourcePathname = body.sourcePathname;
    let availableDates = body.availableDates ?? [];
    let filterOptions = body.filterOptions;
    let precomputedResult = body.precomputedResult ?? null;

    if (!availableDates.length || !filterOptions || !precomputedResult) {
      const { rows, availableDates: parsedAvailableDates } = await loadRowsData(sourcePathname);
      availableDates = parsedAvailableDates ?? getAvailableDates(rows);
      if (!availableDates.length) {
        return NextResponse.json({ error: "No available dates were found." }, { status: 400 });
      }

      const latestDate = resolveDate(availableDates);
      filterOptions = computeFilterOptions(rows, latestDate);
      precomputedResult = analyze(rows, latestDate);
    }

    const manifest: PersistedReportPayload = {
      uploadedAt: new Date().toISOString(),
      availableDates,
      sourcePathname,
      filterOptions,
    };

    await Promise.all([saveReportManifest(manifest), appendReportHistory(manifest)]);

    const cacheJobs: Promise<unknown>[] = [];
    if (precomputedResult?.date) {
      cacheJobs.push(
        saveCachedAnalysisResult(manifest.sourcePathname, precomputedResult.date, manifest.uploadedAt, precomputedResult),
      );
    }
    for (const extra of body.additionalResults ?? []) {
      if (extra?.date) {
        cacheJobs.push(saveCachedAnalysisResult(manifest.sourcePathname, extra.date, manifest.uploadedAt, extra));
      }
    }

    await Promise.all(cacheJobs);

    return NextResponse.json({
      payload: {
        uploadedAt: manifest.uploadedAt,
        availableDates: manifest.availableDates,
        filterOptions: manifest.filterOptions,
      },
      history: await loadReportHistory(),
      result: precomputedResult,
      blobConfigured,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process uploaded report." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  if (!isAuthenticatedRequest(req)) {
    return unauthorizedJson();
  }

  try {
    const body = (await req.json()) as { uploadedAt?: string };
    if (!body.uploadedAt) {
      return NextResponse.json({ error: "Rollback target is missing." }, { status: 400 });
    }

    const history = await loadReportHistory();
    const target = history.find((item) => item.uploadedAt === body.uploadedAt);
    if (!target) {
      return NextResponse.json({ error: "Rollback target was not found." }, { status: 404 });
    }

    const manifest: PersistedReportPayload = {
      uploadedAt: target.uploadedAt,
      availableDates: target.availableDates,
      sourcePathname: target.sourcePathname,
    };

    const parsedJsonPath = getNormalizedSourcePath(manifest.sourcePathname);
    let rows: RawRow[];
    if (parsedJsonPath !== manifest.sourcePathname) {
      try {
        const data = await loadRowsData(parsedJsonPath);
        rows = data.rows;
      } catch {
        const data = await loadRowsData(manifest.sourcePathname);
        rows = data.rows;
      }
    } else {
      const data = await loadRowsData(manifest.sourcePathname);
      rows = data.rows;
    }

    const availableDates = getAvailableDates(rows);
    if (!availableDates.length) {
      return NextResponse.json({ error: "No available dates were found." }, { status: 400 });
    }

    await savePrivateJson(parsedJsonPath, rows);
    manifest.sourcePathname = parsedJsonPath;
    manifest.availableDates = availableDates;
    await saveReportManifest(manifest);
    const latestDate = resolveDate(availableDates);
    const result = analyze(rows, latestDate);
    await saveCachedAnalysisResult(manifest.sourcePathname, latestDate, manifest.uploadedAt, result);

    return NextResponse.json({
      payload: {
        uploadedAt: manifest.uploadedAt,
        availableDates,
        filterOptions: computeFilterOptions(rows, latestDate),
      },
      history,
      result,
      blobConfigured: isBlobConfigured(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to rollback report." },
      { status: 500 },
    );
  }
}
