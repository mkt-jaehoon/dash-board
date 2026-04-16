"use client";

import { buildComment, cpa, diffPct, diffPp, rate } from "@/lib/analyzer";
import { DailyKpiPoint, MediaStats } from "@/lib/types";
import {
  Delta,
  getAssigned,
  getCost,
  getMediaState,
  getSectionLabel,
  getSectionTone,
  getStateLabel,
  getStateTone,
  num,
} from "./media-utils";

function formatWindowLabel(point: DailyKpiPoint): string {
  if (point.startDate && point.endDate) {
    return `${point.startDate.slice(5)} ~ ${point.endDate.slice(5)}`;
  }
  return point.date.slice(5);
}

function formatWonShort(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
  if (value >= 10000) return `${Math.round(value / 10000)}만`;
  return num(value);
}

function TrendMetric({
  label,
  primary,
  d1,
  d7,
  deltaUnit = "%",
}: {
  label: string;
  primary: string;
  d1: number | null;
  d7: number | null;
  deltaUnit?: "%" | "p";
}) {
  return (
    <div className="rounded-2xl bg-black/20 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 break-keep text-2xl font-semibold leading-none text-white">{primary}</div>
      <div className="mt-3 flex flex-col gap-1 text-xs">
        <span className="flex items-center gap-2">
          <span className="text-slate-500">전일</span>
          <Delta value={d1} unit={deltaUnit} />
        </span>
        <span className="flex items-center gap-2">
          <span className="text-slate-500">전주</span>
          <Delta value={d7} unit={deltaUnit} />
        </span>
      </div>
    </div>
  );
}

export function SummaryCard({ media }: { media: MediaStats }) {
  const mediaCpa = cpa(getCost(media.today), media.today.db);
  const mediaRate = rate(getAssigned(media.today), media.today.db);
  const d1Cpa = media.d1 ? cpa(getCost(media.d1), media.d1.db) : null;
  const d1Rate = media.d1 ? rate(getAssigned(media.d1), media.d1.db) : null;
  const d7Cpa = media.d7 ? cpa(getCost(media.d7), media.d7.db) : null;
  const d7Rate = media.d7 ? rate(getAssigned(media.d7), media.d7.db) : null;
  const state = getMediaState(media);

  const goodCount = media.creatives.filter((c) => c.grade === "good").length;
  const cautionCount = media.creatives.filter((c) => c.grade === "caution").length;
  const badCount = media.creatives.filter((c) => c.grade === "bad").length;
  const totalCreatives = media.creatives.length;

  return (
    <div className="overflow-hidden rounded-[24px] border border-white/8 bg-slate-950/70 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.2)] md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${getSectionTone(media.section)}`}>
              {getSectionLabel(media.section)}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${getStateTone(state)}`}>
              {getStateLabel(state)}
            </span>
          </div>
          <div className="mt-3 break-keep text-xl font-semibold text-white">{media.name}</div>
        </div>
        <div className="w-full rounded-2xl bg-black/20 px-4 py-3 text-left lg:w-auto lg:min-w-[180px] lg:text-right">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">광고비</div>
          <div className="mt-1 break-keep text-lg font-semibold text-white">{num(getCost(media.today))}원</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <TrendMetric
          label="DB"
          primary={`${num(media.today.db)}건`}
          d1={media.d1 ? diffPct(media.today.db, media.d1.db) : null}
          d7={media.d7 ? diffPct(media.today.db, media.d7.db) : null}
        />
        <TrendMetric
          label="DB CPA"
          primary={mediaCpa != null ? `${num(mediaCpa)}원` : "-"}
          d1={media.d1 ? diffPct(mediaCpa, d1Cpa) : null}
          d7={media.d7 ? diffPct(mediaCpa, d7Cpa) : null}
        />
        <TrendMetric
          label="배당률"
          primary={mediaRate != null ? `${mediaRate.toFixed(1)}%` : "-"}
          d1={media.d1 ? diffPp(mediaRate, d1Rate) : null}
          d7={media.d7 ? diffPp(mediaRate, d7Rate) : null}
          deltaUnit="p"
        />
      </div>

      {totalCreatives > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-slate-500">소재 {totalCreatives}개</span>
          <span className="text-slate-600">·</span>
          {goodCount > 0 ? (
            <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-emerald-400 ring-1 ring-emerald-500/20">
              양호 {goodCount}
            </span>
          ) : null}
          {cautionCount > 0 ? (
            <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-amber-400 ring-1 ring-amber-500/20">
              주의 {cautionCount}
            </span>
          ) : null}
          {badCount > 0 ? (
            <span className="rounded-full bg-rose-500/12 px-2 py-0.5 text-rose-400 ring-1 ring-rose-500/20">
              위험 {badCount}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-white/6 bg-black/20 px-4 py-3 text-sm leading-6 text-slate-300">
        <div className="break-words">{buildComment(media.today, media.d1, null)}</div>
      </div>

      {media.recentDaily.length >= 2 ? (
        <div className="mt-4 rounded-xl border border-white/6 bg-black/20 px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">배당 추이 777</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {media.recentDaily.map((point, index) => {
              const payoutRate = point.kpi.db > 0 ? (point.kpi.assigned / point.kpi.db) * 100 : null;
              const payoutCpa = point.kpi.assigned > 0 ? point.kpi.cost / point.kpi.assigned : null;
              const weekLabel =
                index === media.recentDaily.length - 1
                  ? "최근 1주차"
                  : `최근 ${media.recentDaily.length - index}주차`;

              return (
                <div key={`${point.date}-${index}`} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <div className="text-xs font-semibold text-white">{weekLabel}</div>
                  <div className="mt-1 text-xs text-slate-500">{formatWindowLabel(point)}</div>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">배당 수</span>
                      <span className="font-semibold text-white">{num(point.kpi.assigned)}건</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">배당률</span>
                      <span className="font-semibold text-white">{payoutRate != null ? `${payoutRate.toFixed(1)}%` : "-"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">배당 CPA</span>
                      <span className="font-semibold text-white">{payoutCpa != null ? `${formatWonShort(payoutCpa)}원` : "-"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
