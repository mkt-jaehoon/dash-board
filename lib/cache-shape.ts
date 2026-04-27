import { ANALYSIS_VERSION } from "./analyzer";

// 캐시된 AnalysisResult 가 현재 스키마와 호환되는지 검사한다.
// 1) analysisVersion 일치, 2) 요청 date 일치, 3) mediaGroups 의 4 섹션 모두 배열,
// 4) 메타 DA/VA 가 있으면 meta_total 도 같이 있어야 함, 5) 모든 media 가 recentDaily/groups 를 배열로 가짐.
export function isCurrentAnalysisShape(result: unknown, expectedDate?: string): boolean {
  if (!result || typeof result !== "object") return false;
  const analysisVersion = (result as { analysisVersion?: unknown }).analysisVersion;
  if (analysisVersion !== ANALYSIS_VERSION) return false;
  const resultDate = (result as { date?: unknown }).date;
  if (expectedDate && resultDate !== expectedDate) return false;
  const mediaGroups = (result as { mediaGroups?: Record<string, unknown[]> }).mediaGroups;
  if (!mediaGroups || typeof mediaGroups !== "object") return false;
  const requiredSections = ["DA", "SA", "BIGCRAFT", "OTHER"];
  if (!requiredSections.every((section) => Array.isArray(mediaGroups[section]))) return false;

  const daGroups = mediaGroups.DA;
  if (!Array.isArray(daGroups)) return false;
  const hasMetaDa = daGroups.some((media) => (media as { key?: unknown })?.key === "meta_da");
  const hasMetaVa = daGroups.some((media) => (media as { key?: unknown })?.key === "meta_va");
  const hasMetaTotal = daGroups.some((media) => (media as { key?: unknown })?.key === "meta_total");
  if ((hasMetaDa || hasMetaVa) && !hasMetaTotal) return false;

  return Object.values(mediaGroups).every((group) => {
    if (!Array.isArray(group)) return false;
    return group.every((media) => {
      if (!media || typeof media !== "object") return false;
      const recentDaily = (media as { recentDaily?: unknown }).recentDaily;
      if (!Array.isArray(recentDaily)) return false;
      const groups = (media as { groups?: unknown }).groups;
      if (!Array.isArray(groups)) return false;
      return true;
    });
  });
}
