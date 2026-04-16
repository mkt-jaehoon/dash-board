"use client";

import { useState } from "react";
import { cpa, rate } from "@/lib/analyzer";
import { MediaStats } from "@/lib/types";
import {
  getAssigned,
  getCost,
  getSectionLabel,
  getSectionTone,
  getStateLabel,
  getStateTone,
  num,
} from "./media-utils";

export function DetailPanel({ media }: { media: MediaStats }) {
  const [open, setOpen] = useState(false);
  const creatives = [...media.creatives].sort((a, b) => b.today.db - a.today.db);

  return (
    <div className="mb-4 overflow-hidden rounded-[24px] border border-white/8 bg-slate-950/70">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full flex-col gap-4 px-5 py-5 text-left hover:bg-white/[0.03] lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${getSectionTone(media.section)}`}>
              {getSectionLabel(media.section)}
            </span>
            <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-slate-300">소재 {creatives.length}개</span>
          </div>
          <div className="mt-3 break-keep text-xl font-semibold text-white">{media.name}</div>
        </div>

        <div className="grid w-full gap-3 text-left sm:grid-cols-3 lg:w-auto lg:min-w-[320px] lg:text-right">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">DB</div>
            <div className="mt-1 text-base font-semibold text-white">{num(media.today.db)}건</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">DB CPA</div>
            <div className="mt-1 text-base font-semibold text-white">
              {(() => {
                const value = cpa(getCost(media.today), media.today.db);
                return value != null ? `${num(value)}원` : "-";
              })()}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">배당률</div>
            <div className="mt-1 text-base font-semibold text-white">
              {(() => {
                const value = rate(getAssigned(media.today), media.today.db);
                return value != null ? `${value.toFixed(1)}%` : "-";
              })()}
            </div>
          </div>
        </div>
      </button>

      {open ? (
        <div className="border-t border-white/8 px-4 py-4">
          <div className="space-y-3">
            {creatives.map((creative) => {
              const creativeCpa = cpa(getCost(creative.today), creative.today.db);
              const creativeRate = rate(getAssigned(creative.today), creative.today.db);
              return (
                <div key={`${media.key}-${creative.code}`} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${getStateTone(creative.grade)}`}>
                          {getStateLabel(creative.grade)}
                        </span>
                        <span className="max-w-full break-all rounded-full bg-white/8 px-2.5 py-1 font-mono text-[11px] text-slate-300">
                          {creative.code}
                        </span>
                      </div>
                      <div className="mt-2 break-words text-sm text-slate-400">
                        랜딩: {creative.landing} ({creative.landingCategory})
                      </div>
                      <div className="mt-3 break-words text-sm leading-6 text-slate-300">{creative.comment}</div>
                    </div>

                    <div className="grid gap-3 text-sm sm:grid-cols-3 xl:min-w-[320px]">
                      <div className="rounded-xl bg-white/[0.03] px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">DB</div>
                        <div className="mt-1 font-semibold text-white">{num(creative.today.db)}건</div>
                      </div>
                      <div className="rounded-xl bg-white/[0.03] px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">DB CPA</div>
                        <div className="mt-1 font-semibold text-white">{creativeCpa != null ? `${num(creativeCpa)}원` : "-"}</div>
                      </div>
                      <div className="rounded-xl bg-white/[0.03] px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">배당률</div>
                        <div className="mt-1 font-semibold text-white">{creativeRate != null ? `${creativeRate.toFixed(1)}%` : "-"}</div>
                      </div>
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
