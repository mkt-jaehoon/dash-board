"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cpa, diffPct, rate } from "@/lib/analyzer";
import { InsightContent, MediaStats } from "@/lib/types";
import { getAssigned, getCost, num } from "@/components/media-utils";
import { parseApiResponse } from "@/lib/utils";

type InsightResponse = {
  insight?: InsightContent;
  source?: "cache" | "ai";
  model?: string;
  error?: string;
};

const INSIGHT_CONCURRENCY = 2;

export function buildFallbackInsight(media: MediaStats): InsightContent {
  const todayCost = getCost(media.today);
  const todayAssigned = getAssigned(media.today);
  const todayCpa = cpa(todayCost, media.today.db);
  const todayRate = rate(todayAssigned, media.today.db);
  const assignedCpa = todayAssigned > 0 ? todayCost / todayAssigned : null;
  const d1Cost = media.d1 ? getCost(media.d1) : null;
  const d7Cost = media.d7 ? getCost(media.d7) : null;

  const groups = media.groups ?? [];
  const topGroups = [...groups].sort((a, b) => b.today.db - a.today.db).slice(0, 3);
  const stalledGroups = groups.filter((g) => g.today.db === 0 && (g.d1?.db ?? 0) === 0).slice(0, 3);
  const riskGroups = groups.filter((g) => g.grade === "bad").slice(0, 3);

  const dbTrend: string[] = [
    `광고비 ${num(todayCost)}원, DB ${num(media.today.db)}건, DB CPA ${todayCpa != null ? `${num(todayCpa)}원` : "-"}`,
  ];
  if (media.d1) {
    dbTrend.push(
      `전일 대비 광고비 ${diffPct(todayCost, d1Cost) != null ? `${diffPct(todayCost, d1Cost)!.toFixed(0)}%` : "-"}, DB ${
        diffPct(media.today.db, media.d1.db) != null ? `${diffPct(media.today.db, media.d1.db)!.toFixed(0)}%` : "-"
      }`,
    );
  }
  if (media.d7) {
    dbTrend.push(
      `전주 동요일 대비 광고비 ${diffPct(todayCost, d7Cost) != null ? `${diffPct(todayCost, d7Cost)!.toFixed(0)}%` : "-"}, DB ${
        diffPct(media.today.db, media.d7.db) != null ? `${diffPct(media.today.db, media.d7.db)!.toFixed(0)}%` : "-"
      }`,
    );
  }
  if (topGroups.length) {
    dbTrend.push(`성과 기여 주요 그룹: ${topGroups.map((g) => g.name).join(", ")}`);
  }

  const payoutTrend: string[] = [
    `배당 ${num(todayAssigned)}건, 배당률 ${todayRate != null ? `${todayRate.toFixed(1)}%` : "-"}, 배당 CPA ${
      assignedCpa != null ? `${num(assignedCpa)}원` : "-"
    }`,
  ];
  if (media.d1) {
    payoutTrend.push("전일과 비교해 배당 흐름도 함께 확인하는 것이 좋습니다.");
  }

  const actionItems: string[] = [];
  if (stalledGroups.length) {
    actionItems.push(`최근 2일 성과 미발생 그룹: ${stalledGroups.map((g) => g.name).join(", ")}`);
  }
  if (riskGroups.length) {
    actionItems.push(`위험 판단 그룹: ${riskGroups.map((g) => g.name).join(", ")}`);
  }
  if (topGroups.length) {
    actionItems.push(`성과 기여 그룹 예산 유지 검토: ${topGroups.map((g) => g.name).join(", ")}`);
  }
  if (!actionItems.length) {
    actionItems.push("추가 그룹 점검이 필요합니다.");
  }

  return { dbTrend, payoutTrend, actionItems };
}

async function fetchInsight(params: {
  media: MediaStats;
  date: string;
  weekday: string;
  reportVersion: string;
}): Promise<InsightResponse> {
  const { media, date, weekday, reportVersion } = params;
  const response = await fetch("/api/insight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mediaKey: media.key,
      mediaName: media.name,
      section: media.section,
      date,
      weekday,
      reportVersion,
      kpi: {
        today: { db: media.today.db, cost: getCost(media.today), assigned: getAssigned(media.today) },
        d1: media.d1 ? { db: media.d1.db, cost: getCost(media.d1), assigned: getAssigned(media.d1) } : null,
        d7: media.d7 ? { db: media.d7.db, cost: getCost(media.d7), assigned: getAssigned(media.d7) } : null,
      },
      payoutRecent3: media.recentDaily.map((item) => ({
        date: item.date,
        startDate: item.startDate,
        endDate: item.endDate,
        db: item.kpi.db,
        cost: getCost(item.kpi),
        assigned: getAssigned(item.kpi),
      })),
      gradeCount: {
        good: media.creatives.filter((c) => c.grade === "good").length,
        caution: media.creatives.filter((c) => c.grade === "caution").length,
        bad: media.creatives.filter((c) => c.grade === "bad").length,
      },
      topCreatives: [...media.creatives]
        .sort((a, b) => b.today.db - a.today.db)
        .slice(0, 5)
        .map((c) => ({
          code: c.code,
          landing: c.landing,
          grade: c.grade,
          db: c.today.db,
          cost: getCost(c.today),
          assigned: getAssigned(c.today),
          d1Db: c.d1?.db ?? null,
          d7Db: c.d7?.db ?? null,
        })),
      d1Drivers: [...media.creatives]
        .sort((a, b) => Math.abs(b.today.db - (b.d1?.db ?? 0)) - Math.abs(a.today.db - (a.d1?.db ?? 0)))
        .slice(0, 3)
        .map((c) => ({
          code: c.code,
          landing: c.landing,
          grade: c.grade,
          db: c.today.db,
          cost: getCost(c.today),
          assigned: getAssigned(c.today),
          d1Db: c.d1?.db ?? null,
          d7Db: c.d7?.db ?? null,
        })),
      stalledGroups: media.creatives
        .filter((c) => c.today.db === 0 && (c.d1?.db ?? 0) === 0)
        .slice(0, 3)
        .map((c) => ({
          code: c.code,
          landing: c.landing,
          grade: c.grade,
          db: c.today.db,
          cost: getCost(c.today),
          assigned: getAssigned(c.today),
          d1Db: c.d1?.db ?? null,
          d7Db: c.d7?.db ?? null,
        })),
      topGroupStats: [...(media.groups ?? [])]
        .sort((a, b) => b.today.db - a.today.db)
        .slice(0, 5)
        .map((g) => ({
          name: g.name,
          db: g.today.db,
          cost: g.today.cost,
          assigned: g.today.assigned,
          d1Db: g.d1?.db ?? null,
          grade: g.grade,
          creativeCount: g.creativeCount,
        })),
      stalledGroupStats: (media.groups ?? [])
        .filter((g) => g.today.db === 0 && (g.d1?.db ?? 0) === 0)
        .slice(0, 5)
        .map((g) => ({
          name: g.name,
          db: g.today.db,
          cost: g.today.cost,
          assigned: g.today.assigned,
          d1Db: g.d1?.db ?? null,
          grade: g.grade,
          creativeCount: g.creativeCount,
        })),
      riskGroupStats: (media.groups ?? [])
        .filter((g) => g.grade === "bad")
        .slice(0, 5)
        .map((g) => ({
          name: g.name,
          db: g.today.db,
          cost: g.today.cost,
          assigned: g.today.assigned,
          d1Db: g.d1?.db ?? null,
          grade: g.grade,
          creativeCount: g.creativeCount,
        })),
    }),
  });

  return parseApiResponse<InsightResponse>(response);
}

export function useMediaInsights({
  resultDate,
  weekday,
  reportVersion,
  mediaList,
}: {
  resultDate?: string;
  weekday?: string;
  reportVersion?: string;
  mediaList: MediaStats[];
}) {
  const [insightByMediaKey, setInsightByMediaKey] = useState<Record<string, InsightContent>>({});
  const [insightSourceByKey, setInsightSourceByKey] = useState<Record<string, "cache" | "ai">>({});
  const [insightErrorByKey, setInsightErrorByKey] = useState<Record<string, string>>({});
  const [loadingKeys, setLoadingKeys] = useState<Record<string, boolean>>({});
  const requestedKeys = useRef(new Set<string>());
  const pendingKeys = useRef<string[]>([]);
  const inflightCount = useRef(0);

  const mediaMap = useMemo(() => new Map(mediaList.map((media) => [media.key, media])), [mediaList]);

  const pumpQueue = useCallback(async () => {
    if (!resultDate || !weekday || !reportVersion) return;

    while (inflightCount.current < INSIGHT_CONCURRENCY && pendingKeys.current.length > 0) {
      const mediaKey = pendingKeys.current.shift();
      if (!mediaKey) return;

      const media = mediaMap.get(mediaKey);
      if (!media) continue;

      inflightCount.current += 1;
      setLoadingKeys((prev) => ({ ...prev, [media.key]: true }));

      void (async () => {
        try {
          const data = await fetchInsight({ media, date: resultDate, weekday, reportVersion });
          if (data.insight) {
            setInsightByMediaKey((prev) => ({ ...prev, [media.key]: data.insight as InsightContent }));
            setInsightSourceByKey((prev) => (data.source ? { ...prev, [media.key]: data.source } : prev));
            setInsightErrorByKey((prev) => {
              const next = { ...prev };
              delete next[media.key];
              return next;
            });
          } else if (data.error) {
            setInsightErrorByKey((prev) => ({ ...prev, [media.key]: data.error as string }));
          }
        } catch (error) {
          setInsightErrorByKey((prev) => ({
            ...prev,
            [media.key]: error instanceof Error ? error.message : "AI 인사이트 생성에 실패했습니다.",
          }));
        } finally {
          inflightCount.current -= 1;
          setLoadingKeys((prev) => ({ ...prev, [media.key]: false }));
          void pumpQueue();
        }
      })();
    }
  }, [mediaMap, reportVersion, resultDate, weekday]);

  useEffect(() => {
    requestedKeys.current.clear();
    pendingKeys.current = [];
    inflightCount.current = 0;
    setInsightByMediaKey({});
    setInsightSourceByKey({});
    setInsightErrorByKey({});
    setLoadingKeys({});
  }, [reportVersion, resultDate]);

  const ensureInsight = useCallback(
    (mediaKey: string) => {
      const media = mediaMap.get(mediaKey);
      if (!media || requestedKeys.current.has(mediaKey)) return;

      requestedKeys.current.add(mediaKey);
      setInsightByMediaKey((prev) => (prev[mediaKey] ? prev : { ...prev, [mediaKey]: buildFallbackInsight(media) }));
      pendingKeys.current.push(mediaKey);
      void pumpQueue();
    },
    [mediaMap, pumpQueue],
  );

  return {
    insightByMediaKey,
    insightSourceByKey,
    insightErrorByKey,
    loadingKeys,
    ensureInsight,
  };
}
