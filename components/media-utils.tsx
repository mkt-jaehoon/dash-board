"use client";

import { KPI_CONFIG } from "@/lib/config";
import { cpa, rate } from "@/lib/analyzer";
import { KpiData, MediaStats, SectionType } from "@/lib/types";

export const num = (value: number) => Math.round(value).toLocaleString("ko-KR");

export function getCost(data: KpiData | null | undefined): number {
  return data?.cost ?? 0;
}

export function getAssigned(data: KpiData | null | undefined): number {
  return data?.assigned ?? 0;
}

export function getSectionLabel(section: SectionType): string {
  if (section === "BIGCRAFT") return "BIGCRAFT";
  if (section === "OTHER") return "기타";
  return section;
}

export function getSectionTone(section: SectionType): string {
  if (section === "DA") return "bg-sky-500/12 text-sky-200 ring-sky-500/25";
  if (section === "SA") return "bg-amber-500/12 text-amber-200 ring-amber-500/25";
  if (section === "BIGCRAFT") return "bg-fuchsia-500/12 text-fuchsia-200 ring-fuchsia-500/25";
  return "bg-emerald-500/12 text-emerald-200 ring-emerald-500/25";
}

export function getStateTone(state: "good" | "caution" | "bad"): string {
  if (state === "good") return "bg-emerald-500/12 text-emerald-200 ring-emerald-500/25";
  if (state === "caution") return "bg-amber-500/12 text-amber-100 ring-amber-500/25";
  return "bg-rose-500/12 text-rose-200 ring-rose-500/25";
}

export function getMediaState(media: MediaStats): "good" | "caution" | "bad" {
  const mediaCpa = cpa(getCost(media.today), media.today.db);
  const mediaRate = rate(getAssigned(media.today), media.today.db);
  if (getCost(media.today) === 0 && media.today.db > 0) return "caution";
  if (mediaCpa != null && mediaCpa > KPI_CONFIG.cpa.warn) return "bad";
  if (mediaRate != null && mediaRate < KPI_CONFIG.rate.warn) return "bad";
  if (mediaCpa != null && mediaCpa > KPI_CONFIG.cpa.excellent) return "caution";
  if (mediaRate != null && mediaRate < KPI_CONFIG.rate.excellent) return "caution";
  return "good";
}

export function getStateLabel(state: "good" | "caution" | "bad") {
  if (state === "good") return "양호";
  if (state === "caution") return "주의";
  return "위험";
}

export function Delta({ value, unit = "%" }: { value: number | null; unit?: "%" | "p" }) {
  if (value == null) return <span className="text-slate-500">-</span>;
  const cls = value > 0 ? "text-emerald-400" : value < 0 ? "text-rose-400" : "text-slate-400";
  return (
    <span className={cls}>
      {value > 0 ? "+" : ""}
      {value.toFixed(unit === "%" ? 0 : 1)}
      {unit}
    </span>
  );
}
