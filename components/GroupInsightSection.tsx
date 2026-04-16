"use client";

import { useState } from "react";
import { cpa, diffPct, rate } from "@/lib/analyzer";
import { GroupStats, MediaStats } from "@/lib/types";
import { Delta, getStateLabel, getStateTone, num } from "./media-utils";

function GroupCard({ group }: { group: GroupStats }) {
  const [open, setOpen] = useState(false);
  const groupCpa = cpa(group.today.cost, group.today.db);
  const groupRate = rate(group.today.assigned, group.today.db);
  const d1Cpa = group.d1 ? cpa(group.d1.cost, group.d1.db) : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-black/20">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full flex-col gap-3 px-4 py-4 text-left hover:bg-white/[0.02] lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${getStateTone(group.grade)}`}>
              {getStateLabel(group.grade)}
            </span>
            <span className="text-[11px] text-slate-500">소재 {group.creativeCount}개</span>
          </div>
          <div className="mt-2 break-words text-sm font-medium text-white">{group.name}</div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs lg:justify-end">
          <div>
            <span className="text-slate-500">DB </span>
            <span className="font-semibold text-white">{num(group.today.db)}건</span>
          </div>
          <div>
            <span className="text-slate-500">CPA </span>
            <span className="font-semibold text-white">{groupCpa != null ? `${num(groupCpa)}원` : "-"}</span>
          </div>
          <span className={`ml-auto shrink-0 text-slate-500 transition-transform duration-200 lg:ml-0 ${open ? "rotate-180" : ""}`}>
            ⌃
          </span>
        </div>
      </button>

      {open ? (
        <div className="border-t border-white/6 px-4 py-4">
          <div className="grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl bg-white/[0.03] px-3 py-3">
              <div className="text-[10px] text-slate-500">광고비</div>
              <div className="mt-1 break-keep font-semibold text-white">{num(group.today.cost)}원</div>
              <div className="mt-1">{group.d1 ? <Delta value={diffPct(group.today.cost, group.d1.cost)} /> : "-"}</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] px-3 py-3">
              <div className="text-[10px] text-slate-500">DB</div>
              <div className="mt-1 break-keep font-semibold text-white">{num(group.today.db)}건</div>
              <div className="mt-1">{group.d1 ? <Delta value={diffPct(group.today.db, group.d1.db)} /> : "-"}</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] px-3 py-3">
              <div className="text-[10px] text-slate-500">DB CPA</div>
              <div className="mt-1 break-keep font-semibold text-white">{groupCpa != null ? `${num(groupCpa)}원` : "-"}</div>
              <div className="mt-1">{group.d1 ? <Delta value={diffPct(groupCpa, d1Cpa)} /> : "-"}</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] px-3 py-3">
              <div className="text-[10px] text-slate-500">배당률</div>
              <div className="mt-1 break-keep font-semibold text-white">{groupRate != null ? `${groupRate.toFixed(1)}%` : "-"}</div>
            </div>
          </div>
          <div className="mt-3 break-words text-xs leading-5 text-slate-300">{group.comment}</div>
        </div>
      ) : null}
    </div>
  );
}

export function GroupInsightSection({ media }: { media: MediaStats }) {
  const groups = media.groups ?? [];
  if (!groups.length) return null;

  const topGroups = [...groups].sort((a, b) => b.today.db - a.today.db).slice(0, 5);
  const stalledGroups = groups.filter((g) => g.today.db === 0 && (g.d1?.db ?? 0) === 0);
  const riskGroups = groups.filter((g) => g.grade === "bad" && g.today.db > 0);

  return (
    <div className="space-y-5">
      {topGroups.length > 0 ? (
        <section>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">성과 기여 상위 그룹</div>
          <div className="space-y-2">
            {topGroups.map((group) => (
              <GroupCard key={group.name} group={group} />
            ))}
          </div>
        </section>
      ) : null}

      {stalledGroups.length > 0 ? (
        <section>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/90">최근 2일 성과 미발생 그룹</div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-4">
            <div className="flex flex-wrap gap-2">
              {stalledGroups.map((group) => (
                <span
                  key={group.name}
                  className="break-all rounded-full bg-amber-500/12 px-3 py-1 text-xs text-amber-200 ring-1 ring-amber-500/20"
                >
                  {group.name}
                </span>
              ))}
            </div>
            <div className="mt-3 text-xs leading-5 text-amber-100/75">
              최근 2일 연속 DB가 발생하지 않은 그룹입니다. 타게팅, 소재, 랜딩 흐름을 우선 점검하는 편이 좋습니다.
            </div>
          </div>
        </section>
      ) : null}

      {riskGroups.length > 0 ? (
        <section>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-300/90">위험 판단 그룹</div>
          <div className="space-y-2">
            {riskGroups.slice(0, 3).map((group) => (
              <GroupCard key={group.name} group={group} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
