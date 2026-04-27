export function cpa(cost: number, db: number): number | null {
  return db > 0 ? cost / db : null;
}

export function rate(assigned: number, db: number): number | null {
  return db > 0 ? (assigned / db) * 100 : null;
}

export function cvr(db: number, clicks: number): number | null {
  return clicks > 0 ? (db / clicks) * 100 : null;
}

export function diffPct(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b === 0) return null;
  return ((a - b) / b) * 100;
}

export function diffPp(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return a - b;
}

// 포맷 helper — comments.ts / format.ts 양쪽이 공유한다.
export function num(value: number): string {
  return Math.round(value).toLocaleString("ko-KR");
}

export function fmt(value: number | null, type: "pct" | "pp"): string {
  if (value == null) return "-";
  const sign = value > 0 ? "+" : "";
  return type === "pct" ? `${sign}${value.toFixed(0)}%` : `${sign}${value.toFixed(1)}p`;
}
