"use client";

import { Delta } from "@/components/media-utils";

export function MetricCard({
  label,
  value,
  sub,
  delta,
  deltaUnit,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  deltaUnit?: "%" | "p";
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-[22px] border border-white/8 bg-slate-950/70 p-4 shadow-[0_14px_32px_rgba(0,0,0,0.18)]">
      <div className="min-w-0 text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 min-w-0">
        <span className="block break-keep text-[clamp(0.95rem,1.1vw,1.35rem)] font-semibold leading-[1.2] tracking-tight text-white">
          {value}
        </span>
        {delta !== undefined ? (
          <span className="mt-1 block text-[11px] sm:text-xs">
            <Delta value={delta ?? null} unit={deltaUnit ?? "%"} />
          </span>
        ) : null}
      </div>
      {sub ? <div className="mt-auto break-words border-t border-white/10 pt-3 text-sm leading-5 text-slate-400/80">{sub}</div> : null}
    </div>
  );
}
