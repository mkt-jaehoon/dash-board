"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { upload as uploadToBlob } from "@vercel/blob/client";
import { analyze, computeFilterOptions, cpa, diffPct, diffPp, filterRowsByMediaKey, formatText, getAvailableDates, rate } from "@/lib/analyzer";
import { KPI_CONFIG } from "@/lib/config";
import { getMediaKpiMetrics, getOverallKpiMetrics } from "@/lib/media-kpi-config";
import { AnalysisResult, KpiData, MediaStats, RawRow, ReportHistoryItem, SectionType, WorkbookDiagnostics } from "@/lib/types";
import { DetailPanel } from "@/components/DetailPanel";
import { GroupInsightSection } from "@/components/GroupInsightSection";
import { MediaInsightCard } from "@/components/MediaInsightCard";
import { SummaryCard } from "@/components/SummaryCard";
import { getAssigned, getCost, getSectionLabel, getSectionTone, num } from "@/components/media-utils";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { UploadEmptyState } from "@/components/dashboard/UploadEmptyState";
import { UploadHistory } from "@/components/dashboard/UploadHistory";
import { WorkbookDiagnosticsBanner } from "@/components/dashboard/WorkbookDiagnosticsBanner";
import { buildFallbackInsight, useMediaInsights } from "@/components/dashboard/useMediaInsights";
import { CostFilterPanel, CostFilterValue, applyCostFilter } from "@/components/dashboard/CostFilter";
import { parseApiResponse, formatTimestamp } from "@/lib/utils";

type SharedReportResponse = {
  payload: {
    uploadedAt: string;
    availableDates: string[];
    filterOptions?: { campaigns: string[]; groups: string[] };
  } | null;
  result: AnalysisResult | null;
  history?: ReportHistoryItem[];
  blobConfigured: boolean;
  error?: string;
};

type TabKey = "summary" | "detail" | "text";
type CompareBase = "d1" | "d7";

const SECTIONS: SectionType[] = ["DA", "SA", "OTHER"];

function TextReportSection({ result, copied, setCopied }: { result: AnalysisResult; copied: boolean; setCopied: (v: boolean) => void }) {
  const text = useMemo(() => result.formattedText || formatText(result), [result]);
  return (
    <section className="defer-render-section overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/70">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Text Report</div>
          <div className="mt-1 text-lg font-semibold text-white">복사하거나 공유할 수 있는 텍스트 리포트</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="rounded-full bg-white/8 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/14"
          >
            {copied ? "복사 완료" : "복사"}
          </button>
          <button
            onClick={() => {
              const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
              const anchor = document.createElement("a");
              anchor.href = URL.createObjectURL(blob);
              anchor.download = `daily-report-${result.date.replace(/-/g, "")}.txt`;
              anchor.click();
              URL.revokeObjectURL(anchor.href);
            }}
            className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-slate-200"
          >
            다운로드
          </button>
        </div>
      </div>
      <div className="max-h-[70vh] overflow-auto px-5 py-5">
        <pre className="rounded-2xl border border-white/6 bg-black/20 p-5 font-mono text-xs leading-7 text-slate-300">
          {text}
        </pre>
      </div>
    </section>
  );
}

export function Dashboard() {
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobConfigured, setBlobConfigured] = useState(true);
  const [uploadedAt, setUploadedAt] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedMediaKey, setSelectedMediaKey] = useState("all");
  const [campaignOptions, setCampaignOptions] = useState<string[]>([]);
  const [groupOptions, setGroupOptions] = useState<string[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [workbookDiagnostics, setWorkbookDiagnostics] = useState<WorkbookDiagnostics | null>(null);
  const [tab, setTab] = useState<TabKey>("summary");
  const [compareBase, setCompareBase] = useState<CompareBase>("d1");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<RawRow[] | null>(null);
  const rowsVersionRef = useRef<string | null>(null);
  const [allMediaOptions, setAllMediaOptions] = useState<Array<{ key: string; name: string }>>([]);
  const [tossCostFilter, setTossCostFilter] = useState<CostFilterValue>({ operator: "", value: 0, valueTo: 0 });

  const fetchSharedReport = useCallback(async (params?: { date?: string; mediaKey?: string; campaign?: string; group?: string }) => {
    const query = new URLSearchParams();
    if (params?.date) query.set("date", params.date);
    if (params?.mediaKey && params.mediaKey !== "all") query.set("mediaKey", params.mediaKey);
    if (params?.campaign) query.set("campaign", params.campaign);
    if (params?.group) query.set("group", params.group);

    const response = await fetch(`/api/report${query.toString() ? `?${query.toString()}` : ""}`, { cache: "no-store" });
    const data = await parseApiResponse<SharedReportResponse>(response);
    if (!response.ok) throw new Error(data.error ?? "공유 리포트를 불러오지 못했습니다.");

    const nextUploadedAt = data.payload?.uploadedAt ?? null;
    if (rowsVersionRef.current !== nextUploadedAt) {
      rowsRef.current = null;
      rowsVersionRef.current = null;
    }

    setBlobConfigured(data.blobConfigured);
    setAvailableDates(data.payload?.availableDates ?? []);
    setCampaignOptions(data.payload?.filterOptions?.campaigns ?? []);
    setGroupOptions(data.payload?.filterOptions?.groups ?? []);
    setHistory(data.history ?? []);
    setUploadedAt(nextUploadedAt);
    setResult(data.result);
    setSelectedDate(params?.date ?? data.result?.date ?? data.payload?.availableDates.at(-1) ?? "");
    if (data.error && !data.result) {
      setError(data.error);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setBooting(true);
        setLoadingStage("공유 리포트를 불러오는 중입니다.");
        await fetchSharedReport();
      } catch (err) {
        setError(err instanceof Error ? err.message : "초기 데이터를 불러오지 못했습니다.");
      } finally {
        setLoadingStage(null);
        setBooting(false);
      }
    })();
  }, [fetchSharedReport]);

  // Preload raw rows into memory after mount so date switching can happen
  // entirely client-side, avoiding the server-side cache-miss fallback that
  // can fail/timeout for non-seeded dates.
  useEffect(() => {
    if (!uploadedAt || (rowsRef.current && rowsVersionRef.current === uploadedAt)) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/rows", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const data = await parseApiResponse<{ rows: RawRow[]; uploadedAt?: string | null }>(response);
        if (controller.signal.aborted) return;
        if (Array.isArray(data.rows) && data.rows.length && data.uploadedAt === uploadedAt) {
          rowsRef.current = data.rows;
          rowsVersionRef.current = uploadedAt;
        }
      } catch {
        // Silently fall back to the server path if preload fails.
      }
    })();
    return () => controller.abort();
  }, [uploadedAt]);

  const mediaList = useMemo(() => {
    if (!result) return [] as MediaStats[];
    return SECTIONS.flatMap((section) => result.mediaGroups[section] ?? []);
  }, [result]);

  const selectedMedia = useMemo(
    () => mediaList.find((media) => media.key === selectedMediaKey) ?? null,
    [mediaList, selectedMediaKey],
  );

  const visibleMediaList = useMemo(() => {
    const base = selectedMedia ? [selectedMedia] : mediaList;
    if (!tossCostFilter.operator) return base;
    return base.map((media) => {
      if (media.key !== "toss") return media;
      const filtered = media.creatives.filter((c) => applyCostFilter(c.today.cost, tossCostFilter));
      return { ...media, creatives: filtered };
    });
  }, [selectedMedia, mediaList, tossCostFilter]);
  const { insightByMediaKey, insightSourceByKey, insightErrorByKey, loadingKeys, ensureInsight } = useMediaInsights({
    resultDate: result?.date,
    weekday: result?.weekday,
    reportVersion: uploadedAt ?? undefined,
    mediaList,
  });

  useEffect(() => {
    if (selectedMedia) {
      ensureInsight(selectedMedia.key);
      return;
    }
    mediaList.slice(0, 3).forEach((media) => ensureInsight(media.key));
  }, [ensureInsight, mediaList, selectedMedia]);

  useEffect(() => {
    if (!result) {
      setAllMediaOptions([]);
      return;
    }
    // Only update the full media list when no dimension filters narrow the result
    if (!selectedCampaign && !selectedGroup) {
      const list = SECTIONS.flatMap((section) => result.mediaGroups[section] ?? []).map((m) => ({ key: m.key, name: m.name }));
      if (list.length) setAllMediaOptions(list);
    }
  }, [result, selectedCampaign, selectedGroup]);

  useEffect(() => {
    if (selectedCampaign && !campaignOptions.includes(selectedCampaign)) {
      setSelectedCampaign("");
    }
  }, [campaignOptions, selectedCampaign]);

  useEffect(() => {
    if (selectedGroup && !groupOptions.includes(selectedGroup)) {
      setSelectedGroup("");
    }
  }, [groupOptions, selectedGroup]);

  const overall = result?.overall.today;
  const overallMonthAvg = result?.overall.monthAvg;
  const overallCpa = overall ? cpa(getCost(overall), overall.db) : null;
  const overallRate = overall ? rate(getAssigned(overall), overall.db) : null;

  const kpiSource: { today: KpiData; d1: KpiData | null; d7: KpiData | null } | null = useMemo(() => {
    if (!result || !overall) return null;
    if (selectedMedia) {
      return { today: selectedMedia.today, d1: selectedMedia.d1, d7: selectedMedia.d7 };
    }
    return { today: overall, d1: result.overall.d1, d7: null };
  }, [result, overall, selectedMedia]);

  const kpiMetrics = useMemo(() => {
    if (selectedMedia) return getMediaKpiMetrics(selectedMedia.key);
    return getOverallKpiMetrics();
  }, [selectedMedia]);

  const upload = useCallback(async (file: File) => {
    setLoading(true);
    setLoadingStage("엑셀 파일을 분석하는 중입니다.");
    setError(null);
    try {
      rowsRef.current = null;
      rowsVersionRef.current = null;
      setWorkbookDiagnostics(null);
      setAvailableDates([]);
      setCampaignOptions([]);
      setGroupOptions([]);
      setUploadedAt(null);
      setSelectedMediaKey("all");
      setSelectedCampaign("");
      setSelectedGroup("");
      setTab("summary");
      setResult(null);
      setSelectedDate("");

      // 1. Parse Excel in the browser (avoids server payload/timeout limits)
      const buffer = await file.arrayBuffer();
      const { parseWorkbook } = await import("@/lib/excel");
      const { rows, availableDates: parsedDates, diagnostics } = await parseWorkbook(buffer);
      rowsRef.current = rows;
      setWorkbookDiagnostics(diagnostics);

      const latestDate = parsedDates[parsedDates.length - 1];
      const filterOpts = computeFilterOptions(rows, latestDate);

      setLoadingStage("데이터를 분석하는 중입니다.");
      await new Promise((resolve) => window.setTimeout(resolve, 0));

      const precomputed = analyze(rows, latestDate);

      // Also precompute previous date so date switching works after page refresh
      const prevDate = parsedDates.length >= 2 ? parsedDates[parsedDates.length - 2] : null;
      const prevDateResult = prevDate ? analyze(rows, prevDate) : null;

      // 2. Upload parsed JSON to Blob (faster for future server-side access)
      setLoadingStage("공유 데이터를 업로드하는 중입니다.");
      const safeName = file.name.replace(/[^\w.\-]+/g, "-").replace(/\.(xlsx|xls)$/i, "");
      const uploadStamp = new Date().toISOString().replace(/[^0-9]/g, "");
      const jsonBlob = new Blob([JSON.stringify(rows)], { type: "application/json" });
      const parsedFile = new File([jsonBlob], `${safeName}.parsed.json`, { type: "application/json" });
      const blob = await uploadToBlob(`uploads/manual-${uploadStamp}-${safeName}.parsed.json`, parsedFile, {
        access: "private",
        handleUploadUrl: "/api/blob-upload",
        multipart: true,
      });

      // 3. Send precomputed results — server only saves manifest + cache
      setLoadingStage("공유 리포트를 저장하는 중입니다.");
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePathname: blob.pathname,
          availableDates: parsedDates,
          filterOptions: filterOpts,
          precomputedResult: precomputed,
          additionalResults: prevDateResult ? [prevDateResult] : [],
        }),
      });
      const data = await parseApiResponse<SharedReportResponse>(response);
      if (!response.ok) throw new Error(data.error ?? "업로드 처리 중 오류가 발생했습니다.");

      setBlobConfigured(data.blobConfigured);
      setAvailableDates(data.payload?.availableDates ?? []);
      setCampaignOptions(data.payload?.filterOptions?.campaigns ?? []);
      setGroupOptions(data.payload?.filterOptions?.groups ?? []);
      setHistory(data.history ?? []);
      rowsVersionRef.current = data.payload?.uploadedAt ?? null;
      setUploadedAt(data.payload?.uploadedAt ?? null);
      if (data.result) {
        setResult(data.result);
        setSelectedDate(data.result.date);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 처리 중 오류가 발생했습니다.");
    } finally {
      setLoadingStage(null);
      setLoading(false);
    }
  }, []);

  const onDateChange = useCallback(
    async (date: string) => {
      setSelectedDate(date);
      setLoading(true);
      setError(null);
      try {
        const rows = rowsRef.current;
        if (rows) {
          setLoadingStage("데이터를 분석하는 중입니다.");
          await new Promise((r) => setTimeout(r, 0));
          const mediaKey = selectedMediaKey === "all" ? undefined : selectedMediaKey;
          let targetRows = filterRowsByMediaKey(rows, mediaKey);
          if (selectedCampaign) targetRows = targetRows.filter((r) => r.campaign === selectedCampaign);
          if (selectedGroup) targetRows = targetRows.filter((r) => r.adGroup === selectedGroup);
          const newResult = analyze(targetRows, date);
          const filterOpts = computeFilterOptions(rows, date, mediaKey, selectedCampaign);
          setResult(newResult);
          setCampaignOptions(filterOpts.campaigns);
          setGroupOptions(filterOpts.groups);
        } else {
          setLoadingStage("선택한 날짜 데이터를 불러오는 중입니다.");
          await fetchSharedReport({
            date,
            mediaKey: selectedMediaKey,
            campaign: selectedCampaign || undefined,
            group: selectedGroup || undefined,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "선택한 날짜 데이터를 불러오지 못했습니다.");
      } finally {
        setLoadingStage(null);
        setLoading(false);
      }
    },
    [fetchSharedReport, selectedCampaign, selectedGroup, selectedMediaKey],
  );

  const onDimensionChange = useCallback(
    async (next: { campaign?: string; group?: string }) => {
      const campaign = next.campaign ?? selectedCampaign;
      const group = next.group ?? selectedGroup;
      setLoading(true);
      setError(null);
      try {
        const rows = rowsRef.current;
        if (rows) {
          setLoadingStage("데이터를 분석하는 중입니다.");
          await new Promise((r) => setTimeout(r, 0));
          const date = selectedDate || undefined;
          const mediaKey = selectedMediaKey === "all" ? undefined : selectedMediaKey;
          let targetRows = filterRowsByMediaKey(rows, mediaKey);
          if (campaign) targetRows = targetRows.filter((r) => r.campaign === campaign);
          if (group) targetRows = targetRows.filter((r) => r.adGroup === group);
          const newResult = analyze(targetRows, date);
          const filterOpts = computeFilterOptions(rows, newResult.date, mediaKey, campaign);
          setResult(newResult);
          setCampaignOptions(filterOpts.campaigns);
          setGroupOptions(filterOpts.groups);
        } else {
          setLoadingStage("탐색 필터 결과를 불러오는 중입니다.");
          await fetchSharedReport({
            date: selectedDate || undefined,
            mediaKey: selectedMediaKey,
            campaign: campaign || undefined,
            group: group || undefined,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "필터 결과를 불러오지 못했습니다.");
      } finally {
        setLoadingStage(null);
        setLoading(false);
      }
    },
    [fetchSharedReport, selectedCampaign, selectedDate, selectedGroup, selectedMediaKey],
  );

  const onMediaChange = useCallback(
    async (mediaKey: string) => {
      setSelectedMediaKey(mediaKey);
      setSelectedCampaign("");
      setSelectedGroup("");

      const rows = rowsRef.current;
      if (rows && result) {
        setLoading(true);
        setError(null);
        try {
          setLoadingStage("데이터를 분석하는 중입니다.");
          await new Promise((r) => setTimeout(r, 0));
          // result 는 항상 전체 매체 범위로 유지해야 mediaList/allMediaOptions
          // 드롭다운과 매체별 카드 렌더링이 정상 복구된다. 매체별 표시는
          // selectedMedia / visibleMediaList 메모가 담당.
          const mk = mediaKey === "all" ? undefined : mediaKey;
          const newResult = analyze(rows, result.date);
          const filterOpts = computeFilterOptions(rows, newResult.date, mk);
          setResult(newResult);
          setCampaignOptions(filterOpts.campaigns);
          setGroupOptions(filterOpts.groups);
        } catch (err) {
          setError(err instanceof Error ? err.message : "선택한 매체 정보를 분석하지 못했습니다.");
        } finally {
          setLoadingStage(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);
      try {
        setLoadingStage("선택한 매체 기준으로 데이터를 불러오는 중입니다.");
        await fetchSharedReport({
          date: selectedDate || undefined,
          mediaKey: mediaKey === "all" ? undefined : mediaKey,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "선택한 매체 정보를 불러오지 못했습니다.");
      } finally {
        setLoadingStage(null);
        setLoading(false);
      }
    },
    [fetchSharedReport, result, selectedDate],
  );

  const onLogout = useCallback(async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }, []);

  const onDropboxSync = useCallback(async () => {
    setLoading(true);
    setLoadingStage("Dropbox 에서 오늘 리포트를 가져오는 중입니다.");
    setError(null);
    try {
      const response = await fetch("/api/dropbox/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await parseApiResponse<{
        ok?: boolean;
        skipped?: boolean;
        reason?: string;
        uploadedAt?: string;
        latestDate?: string;
        error?: string;
      }>(response);
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Dropbox 동기화에 실패했습니다.");
      }
      if (data.skipped) {
        setError(
          data.reason
            ? `동기화 대상이 아닙니다 (${data.reason}). 기존 데이터를 유지합니다.`
            : "동기화 대상이 아닙니다. 기존 데이터를 유지합니다.",
        );
        return;
      }
      rowsRef.current = null;
      rowsVersionRef.current = null;
      await fetchSharedReport({ date: data.latestDate });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dropbox 동기화에 실패했습니다.");
    } finally {
      setLoadingStage(null);
      setLoading(false);
    }
  }, [fetchSharedReport]);

  const onRollback = useCallback(async (uploadedAtValue: string) => {
    rowsRef.current = null;
    rowsVersionRef.current = null;
    setLoading(true);
    setLoadingStage("이전 업로드로 롤백하는 중입니다.");
    setError(null);
    try {
      const response = await fetch("/api/report", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadedAt: uploadedAtValue }),
      });
      const data = await parseApiResponse<SharedReportResponse>(response);
      if (!response.ok) throw new Error(data.error ?? "롤백에 실패했습니다.");

      setBlobConfigured(data.blobConfigured);
      setAvailableDates(data.payload?.availableDates ?? []);
      setCampaignOptions(data.payload?.filterOptions?.campaigns ?? []);
      setGroupOptions(data.payload?.filterOptions?.groups ?? []);
      setHistory(data.history ?? []);
      setUploadedAt(data.payload?.uploadedAt ?? null);
      setResult(data.result);
      setSelectedDate(data.result?.date ?? data.payload?.availableDates.at(-1) ?? "");
      setSelectedMediaKey("all");
      setSelectedCampaign("");
      setSelectedGroup("");
      setWorkbookDiagnostics(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "롤백에 실패했습니다.");
    } finally {
      setLoadingStage(null);
      setLoading(false);
    }
  }, []);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(32,84,145,0.28),transparent_35%),linear-gradient(180deg,#08111f_0%,#0b1220_48%,#070c14_100%)]">
      <div className="sticky top-0 z-20 border-b border-white/8 bg-slate-950/72 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/6 text-sm font-semibold text-white ring-1 ring-white/10">
              DR
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Performance Dashboard</div>
              <div className="text-sm font-semibold text-white">데일리 성과 리포트</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void onDropboxSync()}
              disabled={loading}
              className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-500/50"
            >
              Dropbox 동기화
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              엑셀 업로드
            </button>
            <button
              onClick={() => void onLogout()}
              className="rounded-full bg-white/8 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/14"
            >
              로그아웃
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] px-4 pb-12 pt-6 md:px-6">
        <UploadHistory history={history} onRollback={(uploadedAtValue) => void onRollback(uploadedAtValue)} />
        <WorkbookDiagnosticsBanner diagnostics={workbookDiagnostics} />

        {!blobConfigured ? (
          <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Vercel 환경 변수 <code>BLOB_READ_WRITE_TOKEN</code>이 없으면 업로드 결과가 현재 브라우저에서만 보입니다.
          </div>
        ) : null}

        {loadingStage ? (
          <div className="mb-6 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
            {loadingStage}
          </div>
        ) : null}

        {error ? (
          <div className="mb-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            오류: {error}
          </div>
        ) : null}

        {!result && booting ? (
          <div className="animate-pulse">
            <section className="mb-6 overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/60">
              <div className="grid xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.95fr)]">
                <div className="border-b border-white/8 p-6 xl:border-b-0 xl:border-r xl:p-8">
                  <div className="flex gap-2">
                    <div className="h-6 w-24 rounded-full bg-white/8" />
                    <div className="h-6 w-40 rounded-full bg-white/8" />
                  </div>
                  <div className="mt-5 h-10 w-48 rounded-xl bg-white/8" />
                  <div className="mt-3 h-4 w-72 rounded bg-white/8" />
                  <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                        <div className="h-3 w-16 rounded bg-white/8" />
                        <div className="mt-3 h-7 w-24 rounded bg-white/8" />
                        <div className="mt-2 h-3 w-32 rounded bg-white/8" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-6 xl:p-8">
                  <div className="h-3 w-12 rounded bg-white/8" />
                  <div className="mt-3 space-y-3">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="h-11 rounded-2xl bg-white/8" />
                    ))}
                  </div>
                </div>
              </div>
            </section>
            <div className="mb-6 h-10 w-48 rounded-full bg-white/8" />
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 rounded-[28px] border border-white/8 bg-slate-950/70" />
              ))}
            </div>
          </div>
        ) : null}

        {!result && !booting ? (
          <UploadEmptyState
            dragging={dragging}
            onPick={() => fileRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) void upload(file);
            }}
          />
        ) : null}

        {result && overall ? (
          <>
            <section className="mb-6 overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/60">
              <div className="grid xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
                <div className="border-b border-white/8 p-6 xl:border-b-0 xl:border-r xl:p-8">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/8 px-3 py-1 text-xs text-slate-300">기준일 {result.date}</span>
                    {uploadedAt ? (
                      <span className="rounded-full bg-white/8 px-3 py-1 text-xs text-slate-400">
                        마지막 업로드 {formatTimestamp(uploadedAt)}
                      </span>
                    ) : null}
                  </div>
                  <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white">
                    {result.date}
                    <span className="ml-3 text-2xl font-normal text-slate-400">({result.weekday})</span>
                  </h1>
                  <p className="mt-3 max-w-xl text-base leading-7 text-slate-400">
                    날짜와 매체를 선택해 매체별 인사이트와 상세 리포트를 빠르게 확인할 수 있습니다.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">비교 기준</span>
                    <div className="flex rounded-full border border-white/10 p-0.5">
                      {(["d1", "d7"] as const).map((base) => (
                        <button
                          key={base}
                          onClick={() => setCompareBase(base)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                            compareBase === base
                              ? "bg-white text-slate-950"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          {base === "d1" ? "전일 대비" : "전주 동요일"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div
                    className={`mt-5 grid gap-4 ${
                      kpiMetrics.length > 3
                        ? "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[1.55fr_0.9fr_1fr_0.9fr_0.9fr_1.05fr]"
                        : "sm:grid-cols-3"
                    }`}
                  >
                    {kpiSource && kpiMetrics.map((metric) => {
                      const todayVal = metric.getValue(kpiSource.today);
                      const compKpi = compareBase === "d1" ? kpiSource.d1 : kpiSource.d7;
                      const compVal = compKpi ? metric.getValue(compKpi) : null;
                      const delta = metric.deltaType === "pp"
                        ? diffPp(todayVal, compVal)
                        : diffPct(todayVal, compVal);
                      const formatted = todayVal != null
                        ? metric.unit === "%"
                          ? `${todayVal.toFixed(1)}%`
                          : `${num(todayVal)}${metric.unit}`
                        : "-";
                      return (
                        <MetricCard
                          key={metric.key}
                          label={metric.label}
                          value={formatted}
                          delta={delta}
                          deltaUnit={metric.deltaType === "pp" ? "p" : "%"}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="p-6 xl:p-8">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">탐색</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                    <select
                      aria-label="날짜 선택"
                      value={selectedDate}
                      onChange={(event) => void onDateChange(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none focus:border-sky-500"
                    >
                      {availableDates.map((date) => (
                        <option key={date} value={date}>
                          {date}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="매체 선택"
                      value={selectedMediaKey}
                      onChange={(event) => void onMediaChange(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none focus:border-sky-500"
                    >
                      <option value="all">전체 매체</option>
                      {allMediaOptions.map((media) => (
                        <option key={media.key} value={media.key}>
                          {media.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="캠페인 선택"
                      value={selectedCampaign}
                      onChange={(event) => {
                        const nextCampaign = event.target.value;
                        setSelectedCampaign(nextCampaign);
                        setSelectedGroup("");
                        void onDimensionChange({ campaign: nextCampaign, group: "" });
                      }}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none focus:border-sky-500"
                    >
                      <option value="">{campaignOptions.length ? "전체 캠페인" : "캠페인 값 없음"}</option>
                      {campaignOptions.map((campaign) => (
                        <option key={campaign} value={campaign}>
                          {campaign}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="그룹 선택"
                      value={selectedGroup}
                      onChange={(event) => {
                        const nextGroup = event.target.value;
                        setSelectedGroup(nextGroup);
                        void onDimensionChange({ group: nextGroup });
                      }}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none focus:border-sky-500"
                    >
                      <option value="">{groupOptions.length ? "전체 그룹" : "그룹 값 없음"}</option>
                      {groupOptions.map((group) => (
                        <option key={group} value={group}>
                          {group}
                        </option>
                      ))}
                    </select>
                    {selectedMediaKey === "toss" ? (
                      <CostFilterPanel value={tossCostFilter} onChange={setTossCostFilter} />
                    ) : null}
                    {!campaignOptions.length || !groupOptions.length ? (
                      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-xs leading-6 text-slate-400">
                        선택 가능한 캠페인/그룹 값이 없으면 현재 업로드 데이터의 `MASTER_RAW` 시트에서 해당 컬럼 값이 비어 있는 상태입니다.
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">최근 7일 바로가기</div>
                    <div className="flex flex-wrap gap-2">
                      {availableDates.slice(-7).reverse().map((date) => (
                        <button
                          key={date}
                          onClick={() => void onDateChange(date)}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                            selectedDate === date ? "bg-white text-slate-950" : "bg-white/6 text-slate-300 hover:bg-white/12"
                          }`}
                        >
                          {date}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="sticky top-[72px] z-10 mb-6 border-b border-white/10 bg-slate-950/70 px-1 pb-3 pt-2 backdrop-blur-xl">
              <div role="tablist" className="flex w-fit gap-1 rounded-full border border-white/8 bg-slate-950/70 p-1">
                {(["summary", "detail", "text"] as const).map((key) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium ${
                      tab === key ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {key === "summary" ? "요약" : key === "detail" ? "상세 리포트" : "텍스트"}
                  </button>
                ))}
              </div>
            </div>

            {tab !== "summary" && selectedMedia ? (
              <MediaInsightCard
                media={selectedMedia}
                insight={insightByMediaKey[selectedMedia.key] ?? buildFallbackInsight(selectedMedia)}
                loading={Boolean(loadingKeys[selectedMedia.key])}
                source={insightSourceByKey[selectedMedia.key]}
                error={insightErrorByKey[selectedMedia.key]}
                eager
                onVisible={ensureInsight}
              />
            ) : null}

            {tab === "summary" ? (
              <div className="space-y-8">
                <section>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/10">
                      매체 인사이트
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-white/30 to-transparent" />
                  </div>
                  <div className="space-y-4">
                    {(selectedMedia ? [selectedMedia] : mediaList).map((media, index) => (
                      <MediaInsightCard
                        key={`${media.key}-insight`}
                        media={media}
                        insight={insightByMediaKey[media.key] ?? buildFallbackInsight(media)}
                        loading={Boolean(loadingKeys[media.key])}
                        source={insightSourceByKey[media.key]}
                        error={insightErrorByKey[media.key]}
                        eager={index < 3}
                        onVisible={ensureInsight}
                      />
                    ))}
                  </div>
                </section>

                {selectedMedia && (selectedMedia.groups?.length ?? 0) > 0 ? (
                  <section className="defer-render-section">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="rounded-full bg-violet-500/12 px-3 py-1 text-xs font-semibold text-violet-200 ring-1 ring-violet-500/25">
                        그룹 인사이트
                      </span>
                      <span className="text-xs text-slate-400">{selectedMedia.name}</span>
                      <div className="h-px flex-1 bg-gradient-to-r from-white/30 to-transparent" />
                    </div>
                    <GroupInsightSection media={selectedMedia} />
                  </section>
                ) : null}

                {SECTIONS.map((section) => {
                  const medias = visibleMediaList.filter((media) => media.section === section);
                  if (!medias.length) return null;
                  return (
                    <section key={section} className="defer-render-section">
                      <div className="mb-4 flex items-center gap-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getSectionTone(section)}`}>
                          {getSectionLabel(section)}
                        </span>
                        <div className="h-px flex-1 bg-gradient-to-r from-white/30 to-transparent" />
                      </div>
                      <div className="grid gap-4 xl:grid-cols-2">
                        {medias.map((media) => (
                          <SummaryCard key={media.key} media={media} />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : null}

            {tab === "detail" ? (
              <div className="defer-render-section">
                {visibleMediaList.map((media) => (
                  <DetailPanel key={media.key} media={media} />
                ))}
              </div>
            ) : null}

            {tab === "text" ? (
              <TextReportSection result={result} copied={copied} setCopied={setCopied} />
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
