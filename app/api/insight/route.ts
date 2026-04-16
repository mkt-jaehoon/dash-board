import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedRequest, unauthorizedJson } from "@/lib/auth";
import { loadCachedInsight, saveCachedInsight } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 30;

type KpiSnapshot = {
  db: number;
  cost: number;
  assigned: number;
};

type DailyTrendSnapshot = {
  date: string;
  startDate?: string;
  endDate?: string;
  db: number;
  cost: number;
  assigned: number;
};

type CreativeSnapshot = {
  code: string;
  landing: string;
  grade: string;
  db: number;
  cost: number;
  assigned: number;
  d1Db?: number | null;
  d7Db?: number | null;
};

type GroupSnapshot = {
  name: string;
  db: number;
  cost: number;
  assigned: number;
  d1Db?: number | null;
  grade: string;
  creativeCount: number;
};

type InsightRequest = {
  mediaKey: string;
  mediaName: string;
  section: string;
  date: string;
  weekday: string;
  reportVersion: string;
  kpi: {
    today: KpiSnapshot;
    d1: KpiSnapshot | null;
    d7: KpiSnapshot | null;
  };
  payoutRecent3: DailyTrendSnapshot[];
  gradeCount: { good: number; caution: number; bad: number };
  topCreatives: CreativeSnapshot[];
  d1Drivers: CreativeSnapshot[];
  stalledGroups: CreativeSnapshot[];
  topGroupStats?: GroupSnapshot[];
  stalledGroupStats?: GroupSnapshot[];
  riskGroupStats?: GroupSnapshot[];
  forceRefresh?: boolean;
};

type InsightPayload = {
  dbTrend: string[];
  payoutTrend: string[];
  actionItems: string[];
};

type AnthropicMessageResponse = {
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string; type?: string };
};

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_MODEL_RETRIES = 2;

function safeDiv(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortDate(value: string) {
  const date = parseDate(value);
  if (!date) return value;
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}(${WEEKDAYS[date.getUTCDay()]})`;
}

function formatWindowLabel(item: DailyTrendSnapshot) {
  if (item.startDate && item.endDate) {
    return `${formatShortDate(item.startDate)}~${formatShortDate(item.endDate)}`;
  }
  return formatShortDate(item.date);
}

function formatWonShort(value: number) {
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)}억원`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)}만원`;
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatRate(value: number | null) {
  if (value == null) return "-";
  return `${value.toFixed(0)}%`;
}

function formatCpa(value: number | null) {
  if (value == null) return "-";
  return formatWonShort(value);
}

function formatSignedPercent(now: number | null, prev: number | null) {
  if (now == null || prev == null || prev === 0) return null;
  const diff = ((now - prev) / Math.abs(prev)) * 100;
  return `${diff > 0 ? "+" : ""}${diff.toFixed(0)}%`;
}

function buildDriverLine(item: CreativeSnapshot) {
  const value = safeDiv(item.cost, item.db);
  const parts = [item.code];
  if (item.db > 0) parts.push(`DB ${item.db}건`);
  if (value != null) parts.push(`CPA ${formatCpa(value)}`);
  return `- ${parts.join(" / ")}`;
}

function buildBaseInsight(body: InsightRequest): InsightPayload {
  const recent3 = body.payoutRecent3.slice(-3);
  const recent3Total = recent3.reduce(
    (acc, item) => ({ db: acc.db + item.db, cost: acc.cost + item.cost, assigned: acc.assigned + item.assigned }),
    { db: 0, cost: 0, assigned: 0 },
  );

  const recent3DbCpa = safeDiv(recent3Total.cost, recent3Total.db);
  const todayDbCpa = safeDiv(body.kpi.today.cost, body.kpi.today.db);
  const todayAssignedCpa = safeDiv(body.kpi.today.cost, body.kpi.today.assigned);
  const todayRate = safeDiv(body.kpi.today.assigned, body.kpi.today.db);
  const d1DbCpa = body.kpi.d1 ? safeDiv(body.kpi.d1.cost, body.kpi.d1.db) : null;

  const dbTrend: string[] = [];
  const payoutTrend: string[] = [];
  const actionItems: string[] = [];

  if (recent3.length >= 3) {
    dbTrend.push(
      `최근 21일 7일 누적 기준 비용 ${formatWonShort(recent3Total.cost)}, DB ${recent3Total.db}건, DB CPA ${formatCpa(recent3DbCpa)}`,
    );
    for (const item of recent3) {
      dbTrend.push(
        `${formatWindowLabel(item)} 비용 ${formatWonShort(item.cost)}, DB ${item.db}건, DB CPA ${formatCpa(
          safeDiv(item.cost, item.db),
        )}`,
      );
    }
  } else {
    dbTrend.push(
      `당일 비용 ${formatWonShort(body.kpi.today.cost)}, DB ${body.kpi.today.db}건, DB CPA ${formatCpa(todayDbCpa)}, 배당 ${body.kpi.today.assigned}건, 배당 CPA ${formatCpa(todayAssignedCpa)}, 배당률 ${formatRate(todayRate != null ? todayRate * 100 : null)}`,
    );
  }

  if (body.kpi.d1) {
    const diffParts = [
      formatSignedPercent(body.kpi.today.cost, body.kpi.d1.cost) ? `비용 ${formatSignedPercent(body.kpi.today.cost, body.kpi.d1.cost)}` : null,
      formatSignedPercent(body.kpi.today.db, body.kpi.d1.db) ? `DB ${formatSignedPercent(body.kpi.today.db, body.kpi.d1.db)}` : null,
      formatSignedPercent(todayDbCpa, d1DbCpa) ? `DB CPA ${formatSignedPercent(todayDbCpa, d1DbCpa)}` : null,
    ].filter(Boolean);
    if (diffParts.length) dbTrend.push(`전일 대비 ${diffParts.join(" / ")}`);
  }

  if (body.kpi.d7 && body.kpi.d7.cost > 0) {
    const d7DbCpa = safeDiv(body.kpi.d7.cost, body.kpi.d7.db);
    const diffParts = [
      formatSignedPercent(body.kpi.today.cost, body.kpi.d7.cost) ? `비용 ${formatSignedPercent(body.kpi.today.cost, body.kpi.d7.cost)}` : null,
      formatSignedPercent(body.kpi.today.db, body.kpi.d7.db) ? `DB ${formatSignedPercent(body.kpi.today.db, body.kpi.d7.db)}` : null,
      formatSignedPercent(todayDbCpa, d7DbCpa) ? `DB CPA ${formatSignedPercent(todayDbCpa, d7DbCpa)}` : null,
    ].filter(Boolean);
    if (diffParts.length) dbTrend.push(`전주 동일요일 대비 ${diffParts.join(" / ")}`);
  }

  if (recent3.length >= 3) {
    payoutTrend.push(`배당 추이: ${recent3.map((item) => `${item.assigned}건`).join(" → ")}`);
    payoutTrend.push(
      `배당률 추이: ${recent3
        .map((item) => formatRate(safeDiv(item.assigned, item.db) != null ? safeDiv(item.assigned, item.db)! * 100 : null))
        .join(" → ")}`,
    );
    payoutTrend.push(`배당 CPA 추이: ${recent3.map((item) => formatCpa(safeDiv(item.cost, item.assigned))).join(" → ")}`);
  } else {
    payoutTrend.push(
      `당일 배당 ${body.kpi.today.assigned}건, 배당 CPA ${formatCpa(todayAssignedCpa)}, 배당률 ${formatRate(
        todayRate != null ? todayRate * 100 : null,
      )}`,
    );
  }

  const topGroupLines = (body.topGroupStats ?? []).slice(0, 3).map((g) => {
    const groupCpa = safeDiv(g.cost, g.db);
    return `- ${g.name} (DB ${g.db}건${groupCpa != null ? `, CPA ${formatCpa(groupCpa)}` : ""}, 소재 ${g.creativeCount}개)`;
  });
  if (topGroupLines.length) {
    actionItems.push(`성과 기여 주요 그룹\n${topGroupLines.join("\n")}`);
  }

  const stalledGroupLines = (body.stalledGroupStats ?? []).slice(0, 3).map((g) => `- ${g.name}`);
  if (stalledGroupLines.length) {
    actionItems.push(`최근 2일 성과 미발생 그룹\n${stalledGroupLines.join("\n")}`);
  }

  const riskGroupLines = (body.riskGroupStats ?? []).slice(0, 3).map((g) => {
    const groupCpa = safeDiv(g.cost, g.db);
    return `- ${g.name} (DB ${g.db}건${groupCpa != null ? `, CPA ${formatCpa(groupCpa)}` : ""})`;
  });
  if (riskGroupLines.length) {
    actionItems.push(`위험 판단 그룹\n${riskGroupLines.join("\n")}`);
  }

  const d1DriverLines = body.d1Drivers.slice(0, 3).map(buildDriverLine);
  if (d1DriverLines.length) {
    actionItems.push(`전일 대비 변동에 영향을 준 소재\n${d1DriverLines.join("\n")}`);
  }

  const stalledLines = body.stalledGroups.slice(0, 3).map((item) => `- ${item.code}`);
  if (stalledLines.length) {
    actionItems.push(`최근 2일 연속 성과가 없는 소재\n${stalledLines.join("\n")}`);
  }

  return { dbTrend, payoutTrend, actionItems };
}

function parseAiText(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);
}

async function requestAnthropic(prompt: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { text: "", model: DEFAULT_MODEL };

  let lastError = "";

  for (let attempt = 0; attempt < MAX_MODEL_RETRIES; attempt += 1) {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 220,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
      cache: "no-store",
    });

    const data = (await response.json()) as AnthropicMessageResponse;
    if (!response.ok) {
      lastError = data.error?.message || `Anthropic API request failed with status ${response.status}.`;
      console.error("[insight] anthropic request failed", { model: DEFAULT_MODEL, attempt: attempt + 1, message: lastError });
      continue;
    }

    const text = (data.content ?? [])
      .filter((item) => item.type === "text")
      .map((item) => (typeof item.text === "string" ? item.text : ""))
      .map((value) => value.trim())
      .filter(Boolean)
      .join("\n");

    return { text, model: DEFAULT_MODEL };
  }

  if (lastError) {
    console.error("[insight] generation failed", { model: DEFAULT_MODEL, message: lastError });
  }

  return { text: "", model: DEFAULT_MODEL };
}

function buildAiPrompt(body: InsightRequest, base: InsightPayload) {
  return [
    "당신은 퍼포먼스 마케터의 일일 코멘트를 작성하는 광고 운영자입니다.",
    "아래 데이터를 보고 실무형 운영 코멘트 2줄만 작성하세요.",
    "",
    "[목표]",
    "- 대시보드에 바로 붙여 넣을 수 있는 짧은 운영 코멘트 작성",
    "- 숫자 나열보다 원인 해석과 다음 액션 우선",
    "",
    "[출력 규칙]",
    "- 반드시 정확히 2줄만 출력",
    "- 각 줄은 18~32자 이내의 짧은 문장",
    "- 제목, 번호, 기호 없이 문장만 출력",
    "- 광고비, DB, CPA, 배당 수치를 그대로 반복하지 말 것",
    "- 데이터 부족, 비교 데이터 없음 같은 무의미한 문구 금지",
    "- 과장, 추측, 모호한 표현 금지",
    "",
    "[해석 우선순위]",
    "1. 최근 흐름이 개선인지 악화인지 판단",
    "2. DB와 배당 흐름에서 어디가 병목인지 판단",
    "3. 상위 소재와 변동 소재가 성과를 이끄는지 판단",
    "4. 마지막에 운영 액션 시사점으로 마무리",
    "",
    `[매체] ${body.mediaName}`,
    `[DB 흐름] ${base.dbTrend.join(" / ")}`,
    `[배당 흐름] ${base.payoutTrend.join(" / ")}`,
    `[소재 등급] 양호 ${body.gradeCount.good}, 주의 ${body.gradeCount.caution}, 위험 ${body.gradeCount.bad}`,
    `[성과 기여 그룹] ${(body.topGroupStats ?? []).map((g) => g.name).join(" / ") || "없음"}`,
    `[성과 미발생 그룹] ${(body.stalledGroupStats ?? []).map((g) => g.name).join(" / ") || "없음"}`,
    `[위험 그룹] ${(body.riskGroupStats ?? []).map((g) => g.name).join(" / ") || "없음"}`,
    `[전일 변동 소재] ${body.d1Drivers.map((item) => item.code).join(" / ") || "없음"}`,
    `[상위 소재] ${body.topCreatives.map((item) => item.code).join(" / ") || "없음"}`,
    `[중단 후보] ${body.stalledGroups.map((item) => item.code).join(" / ") || "없음"}`,
  ].join("\n");
}

export async function POST(request: NextRequest) {
  if (!isAuthenticatedRequest(request)) {
    return unauthorizedJson();
  }

  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const body = (await request.json()) as InsightRequest;

    if (!body.mediaKey || !body.date || !body.reportVersion) {
      return NextResponse.json({ error: "Insight cache key is missing." }, { status: 400 });
    }

    if (!body.forceRefresh) {
      const cached = await loadCachedInsight<InsightPayload>(body.date, body.mediaKey, body.reportVersion);
      if (cached) {
        return NextResponse.json({ insight: cached, source: "cache", model: DEFAULT_MODEL });
      }
    }

    const baseInsight = buildBaseInsight(body);
    const { text, model } = await requestAnthropic(buildAiPrompt(body, baseInsight));
    const aiLines = parseAiText(text);

    const insight: InsightPayload = {
      dbTrend: baseInsight.dbTrend,
      payoutTrend: baseInsight.payoutTrend,
      actionItems: aiLines.length ? [...baseInsight.actionItems, `운영 코멘트\n${aiLines.join("\n")}`] : baseInsight.actionItems,
    };

    await saveCachedInsight(body.date, body.mediaKey, body.reportVersion, insight);
    return NextResponse.json({ insight, source: "ai", model });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI insight generation failed.";
    console.error("[insight] generation failed", { model: DEFAULT_MODEL, message });
    return NextResponse.json({ error: message, model: DEFAULT_MODEL }, { status: 500 });
  }
}
