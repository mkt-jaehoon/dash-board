"use client";

import { useState } from "react";

export type CostOperator = "" | "eq" | "gt" | "gte" | "lt" | "lte" | "between";

export interface CostFilterValue {
  operator: CostOperator;
  value: number;
  valueTo: number;
}

const OPERATOR_OPTIONS: Array<{ value: CostOperator; label: string }> = [
  { value: "", label: "필터 없음" },
  { value: "eq", label: "같음" },
  { value: "gt", label: "보다 큼" },
  { value: "gte", label: "이상" },
  { value: "lt", label: "보다 작음" },
  { value: "lte", label: "이하" },
  { value: "between", label: "사이" },
];

export function applyCostFilter(cost: number, filter: CostFilterValue): boolean {
  if (!filter.operator) return true;
  const v = filter.value;
  switch (filter.operator) {
    case "eq":
      return cost === v;
    case "gt":
      return cost > v;
    case "gte":
      return cost >= v;
    case "lt":
      return cost < v;
    case "lte":
      return cost <= v;
    case "between":
      return cost >= v && cost <= filter.valueTo;
    default:
      return true;
  }
}

export function CostFilterPanel({
  value,
  onChange,
}: {
  value: CostFilterValue;
  onChange: (next: CostFilterValue) => void;
}) {
  const [localValue, setLocalValue] = useState(value.value || 0);
  const [localValueTo, setLocalValueTo] = useState(value.valueTo || 0);

  function handleApply(op: CostOperator) {
    onChange({ operator: op, value: localValue, valueTo: localValueTo });
  }

  return (
    <div className="rounded-2xl border border-teal-500/20 bg-teal-500/[0.06] px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-300/90">
        토스 비용 필터
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <select
          aria-label="필터 조건"
          value={value.operator}
          onChange={(e) => {
            const op = e.target.value as CostOperator;
            if (!op) {
              onChange({ operator: "", value: 0, valueTo: 0 });
            } else {
              handleApply(op);
            }
          }}
          className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-teal-500"
        >
          {OPERATOR_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {value.operator ? (
          <>
            <div className="flex items-center gap-1">
              <input
                type="number"
                aria-label="비용 기준값"
                value={localValue || ""}
                onChange={(e) => setLocalValue(Number(e.target.value))}
                onBlur={() => handleApply(value.operator)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleApply(value.operator);
                }}
                placeholder="금액 (원)"
                className="w-28 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-teal-500"
              />
              <span className="text-xs text-slate-500">원</span>
            </div>

            {value.operator === "between" ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500">~</span>
                <input
                  type="number"
                  aria-label="비용 상한값"
                  value={localValueTo || ""}
                  onChange={(e) => setLocalValueTo(Number(e.target.value))}
                  onBlur={() => handleApply(value.operator)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleApply(value.operator);
                  }}
                  placeholder="금액 (원)"
                  className="w-28 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-teal-500"
                />
                <span className="text-xs text-slate-500">원</span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
