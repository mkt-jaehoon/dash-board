export const REPORT_SHEET_NAME = "MASTER_RAW";

export const KPI_CONFIG = {
  db: {
    target: Number(process.env.NEXT_PUBLIC_KPI_DB_TARGET ?? 900),
    warn: Number(process.env.NEXT_PUBLIC_KPI_DB_WARN ?? 700),
  },
  cpa: {
    excellent: Number(process.env.NEXT_PUBLIC_KPI_CPA_EXCELLENT ?? 50000),
    warn: Number(process.env.NEXT_PUBLIC_KPI_CPA_WARN ?? 80000),
  },
  rate: {
    excellent: Number(process.env.NEXT_PUBLIC_KPI_RATE_EXCELLENT ?? 33),
    warn: Number(process.env.NEXT_PUBLIC_KPI_RATE_WARN ?? 20),
  },
} as const;

export const AUTH_COOKIE = "dashboard-auth";
