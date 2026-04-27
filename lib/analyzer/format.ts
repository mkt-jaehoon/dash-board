import { AnalysisResult, KpiData, MediaStats, OverallStats } from "../types";
import { KPI_CONFIG } from "../config";
import { cpa, cvr, diffPct, diffPp, fmt, num, rate } from "./kpi";

function formatKpi(kpi: KpiData | null): string {
  if (!kpi) return "데이터 없음";
  const costPerDb = cpa(kpi.cost, kpi.db);
  const assignRate = rate(kpi.assigned, kpi.db);
  return [
    `DB ${Math.round(kpi.db)}건`,
    `CPA ${costPerDb != null ? `${num(costPerDb)}원` : "-"}`,
    `배당률 ${assignRate != null ? `${assignRate.toFixed(1)}%` : "-"}`,
    `비용 ${num(kpi.cost)}원`,
  ].join(" | ");
}

function gradeText(grade: "good" | "caution" | "bad"): string {
  return grade === "good" ? "양호" : grade === "caution" ? "주의" : "위험";
}

function overallStatus(overall: OverallStats): string {
  const todayCpa = cpa(overall.today.cost, overall.today.db);
  const todayRate = rate(overall.today.assigned, overall.today.db);

  if (
    overall.today.db >= KPI_CONFIG.db.target &&
    todayCpa !== null &&
    todayCpa <= KPI_CONFIG.cpa.excellent &&
    todayRate !== null &&
    todayRate >= KPI_CONFIG.rate.excellent
  ) {
    return "목표 달성";
  }

  if (
    overall.today.db < KPI_CONFIG.db.warn ||
    (todayCpa !== null && todayCpa > KPI_CONFIG.cpa.warn) ||
    (todayRate !== null && todayRate < KPI_CONFIG.rate.warn)
  ) {
    return "목표 미달";
  }

  return "주의 필요";
}

export function formatText(result: AnalysisResult): string {
  const { date, weekday, overall, mediaGroups } = result;
  const todayCpa = cpa(overall.today.cost, overall.today.db);
  const todayRate = rate(overall.today.assigned, overall.today.db);
  const monthAvgCpa = overall.monthAvg ? cpa(overall.monthAvg.cost, overall.monthAvg.db) : null;
  const monthAvgRate = overall.monthAvg ? rate(overall.monthAvg.assigned, overall.monthAvg.db) : null;

  const lines: string[] = [];
  lines.push("==========================================");
  lines.push(`데일리 성과 리포트 | ${date} (${weekday})`);
  lines.push("==========================================");
  lines.push("");
  lines.push("[전체 요약]");
  lines.push(
    `- 총 DB: ${num(overall.today.db)}건 | 목표 ${KPI_CONFIG.db.target}건 대비 ${Math.round(
      (overall.today.db / KPI_CONFIG.db.target) * 100,
    )}%`,
  );
  lines.push(`- DB CPA: ${todayCpa != null ? `${num(todayCpa)}원` : "-"}`);
  lines.push(`- 배당률: ${todayRate != null ? `${todayRate.toFixed(1)}%` : "-"}`);
  lines.push(`- 총 비용: ${num(overall.today.cost)}원`);
  lines.push(`- 상태: ${overallStatus(overall)}`);
  if (monthAvgCpa != null || monthAvgRate != null) {
    lines.push(
      `- 월평균 ${[
        monthAvgCpa != null ? `CPA ${num(monthAvgCpa)}원` : null,
        monthAvgRate != null ? `배당률 ${monthAvgRate.toFixed(1)}%` : null,
      ]
        .filter(Boolean)
        .join(" | ")}`,
    );
  }
  lines.push("");

  const sections: Array<[string, MediaStats[]]> = [
    ["DA 매체 성과", mediaGroups.DA],
    ["SA 매체 성과", mediaGroups.SA],
  ];

  for (const [sectionName, medias] of sections) {
    if (!medias.length) continue;

    lines.push("------------------------------------------");
    lines.push(`[${sectionName}]`);
    lines.push("------------------------------------------");
    lines.push("");

    for (const media of medias) {
      const mediaCpa = cpa(media.today.cost, media.today.db);
      const mediaRate = rate(media.today.assigned, media.today.db);
      const d1Cpa = media.d1 ? cpa(media.d1.cost, media.d1.db) : null;
      const d1Rate = media.d1 ? rate(media.d1.assigned, media.d1.db) : null;

      lines.push(`■ ${media.name}`);
      lines.push(
        `[오늘 요약] DB: ${num(media.today.db)}건 | CPA: ${
          mediaCpa != null ? `${num(mediaCpa)}원` : "-"
        } | 배당률: ${mediaRate != null ? `${mediaRate.toFixed(1)}%` : "-"} | 비용: ${num(media.today.cost)}원`,
      );
      if (media.d1) {
        lines.push(
          `전일 대비 DB ${fmt(diffPct(media.today.db, media.d1.db), "pct")} | CPA ${fmt(
            diffPct(mediaCpa, d1Cpa),
            "pct",
          )} | 배당률 ${fmt(diffPp(mediaRate, d1Rate), "pp")}`,
        );
      }
      lines.push("");

      if (!media.creatives.length) continue;

      lines.push("소재별 상세");
      for (const creative of media.creatives) {
        const creativeCvr = cvr(creative.today.db, creative.today.clicks);
        lines.push(`- [${creative.code}] 랜딩: ${creative.landing} (${creative.landingCategory})`);
        lines.push(
          `  오늘: ${formatKpi(creative.today)}${creativeCvr != null ? ` | CVR ${creativeCvr.toFixed(2)}%` : ""}`,
        );
        lines.push(`  전일(D-1): ${formatKpi(creative.d1)}`);
        lines.push(`  전주 동일요일(D-7): ${formatKpi(creative.d7)}`);
        lines.push(`  월평균: ${formatKpi(creative.monthAvg)}`);
        lines.push(`  상태: ${gradeText(creative.grade)} | ${creative.comment}`);
        lines.push("");
      }
    }
  }

  lines.push("==========================================");
  return lines.join("\n");
}
