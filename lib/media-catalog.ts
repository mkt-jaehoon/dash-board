import { RawRow, SectionType } from "./types";

export interface MediaCatalogEntry {
  key: string;
  name: string;
  section: SectionType;
  order: number;
  match: (row: RawRow) => boolean;
}

function includesAny(values: Array<string | null | undefined>, keywords: string[]) {
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

/**
 * 매체 카탈로그
 * - 새 매체를 추가할 때는 여기 항목만 등록하면 된다.
 * - match는 RawRow의 mediaGroup/media 값을 기준으로 동작한다.
 */
export const MEDIA_CATALOG: MediaCatalogEntry[] = [
  {
    key: "toss",
    name: "토스",
    section: "DA",
    order: 1,
    match: (row) => includesAny([row.mediaGroup, row.media], ["토스"]),
  },
  {
    key: "carrot",
    name: "당근",
    section: "DA",
    order: 2,
    match: (row) => includesAny([row.mediaGroup, row.media], ["당근"]),
  },
  {
    key: "kakao_sa",
    name: "카카오모먼트 (SA)",
    section: "SA",
    order: 3,
    match: (row) => includesAny([row.mediaGroup, row.media], ["카카오"]) && row.mediaType === "SA",
  },
  {
    key: "kakao_da",
    name: "카카오모먼트 (DA)",
    section: "DA",
    order: 4,
    match: (row) => includesAny([row.mediaGroup, row.media], ["카카오"]) && row.mediaType === "DA",
  },
  {
    key: "meta_da",
    name: "메타 (DA)",
    section: "DA",
    order: 5,
    match: (row) => includesAny([row.mediaGroup, row.media], ["메타", "meta"]) && row.mediaType === "DA",
  },
  {
    key: "meta_va",
    name: "메타 (VA)",
    section: "DA",
    order: 6,
    match: (row) => includesAny([row.mediaGroup, row.media], ["메타", "meta"]) && row.mediaType === "VA",
  },
  {
    key: "naver_sa",
    name: "네이버 SA",
    section: "SA",
    order: 7,
    match: (row) => includesAny([row.mediaGroup, row.media], ["네이버", "naver"]) && row.mediaType === "SA",
  },
  {
    key: "naver_bs",
    name: "네이버 BS",
    section: "SA",
    order: 8,
    match: (row) => includesAny([row.mediaGroup, row.media], ["네이버", "naver"]) && row.mediaType === "BS",
  },
  {
    key: "google_sa",
    name: "구글 SA",
    section: "SA",
    order: 9,
    match: (row) => includesAny([row.mediaGroup, row.media], ["구글", "google"]) && row.mediaType === "SA",
  },
  {
    key: "google_da",
    name: "구글 (DA)",
    section: "DA",
    order: 10,
    match: (row) => includesAny([row.mediaGroup, row.media], ["구글", "google"]) && row.mediaType === "DA",
  },
  {
    key: "kakaobank",
    name: "카카오뱅크",
    section: "OTHER",
    order: 11,
    match: (row) => includesAny([row.mediaGroup, row.media], ["카카오뱅크"]),
  },
  {
    key: "samjumsan",
    name: "삼쩜삼",
    section: "OTHER",
    order: 12,
    match: (row) => includesAny([row.mediaGroup, row.media], ["삼쩜삼"]),
  },
  {
    key: "etc_item",
    name: "기타항목",
    section: "OTHER",
    order: 13,
    match: (row) => includesAny([row.mediaGroup, row.media], ["기타항목"]),
  },
];

export function findCatalogEntry(mediaKey: string): MediaCatalogEntry | undefined {
  return MEDIA_CATALOG.find((entry) => entry.key === mediaKey);
}

export function getMetaMatcher() {
  return (row: RawRow) =>
    MEDIA_CATALOG.some(
      (entry) => (entry.key === "meta_da" || entry.key === "meta_va") && entry.match(row),
    );
}
