"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { InsightContent, MediaStats } from "@/lib/types";
import { useVisibilityTrigger } from "@/components/dashboard/useVisibilityTrigger";
import {
  getMediaState,
  getSectionLabel,
  getSectionTone,
  getStateLabel,
  getStateTone,
} from "./media-utils";

function extractComment(actionItems: string[]) {
  const commentIndex = actionItems.findIndex((item) => item.startsWith("운영 코멘트"));
  if (commentIndex < 0) return { comment: null, actions: actionItems };

  const raw = actionItems[commentIndex];
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const comment = lines.slice(1).join(" ");
  const actions = actionItems.filter((_, index) => index !== commentIndex);
  return { comment: comment || null, actions };
}

function splitBlock(item: string) {
  const [title, ...rest] = item
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    title: title || "권장 액션",
    lines: rest.length ? rest : [item],
  };
}

function TrendBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</div>
      <div className="mt-3 space-y-2.5 text-sm leading-6 text-slate-300">
        {lines.map((line, index) => (
          <p key={`${title}-${index}`} className="break-words">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

export function MediaInsightCard({
  media,
  insight,
  loading = false,
  source,
  error,
  eager = false,
  onVisible,
}: {
  media: MediaStats;
  insight: InsightContent;
  loading?: boolean;
  source?: "cache" | "ai";
  error?: string;
  eager?: boolean;
  onVisible?: (mediaKey: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const state = getMediaState(media);
  const cardRef = useRef<HTMLElement>(null);
  const isVisible = useVisibilityTrigger(cardRef, !eager);

  useEffect(() => {
    if ((eager || isVisible) && onVisible) {
      onVisible(media.key);
    }
  }, [eager, isVisible, media.key, onVisible]);

  const { comment, actions } = useMemo(() => extractComment(insight.actionItems), [insight.actionItems]);
  const actionBlocks = useMemo(() => actions.map(splitBlock), [actions]);

  return (
    <section
      ref={cardRef}
      className="mb-6 overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/70 shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
    >
      <button
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? `${media.name} 인사이트 펼치기` : `${media.name} 인사이트 접기`}
        className="flex w-full flex-wrap items-start justify-between gap-4 px-5 py-5 text-left hover:bg-white/[0.02] md:items-center"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${getSectionTone(media.section)}`}>
              {getSectionLabel(media.section)}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${getStateTone(state)}`}>
              {getStateLabel(state)}
            </span>
            {loading ? (
              <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-400 ring-1 ring-sky-500/20">
                AI 생성 중
              </span>
            ) : source === "cache" ? (
              <span className="rounded-full bg-slate-500/10 px-2.5 py-1 text-[11px] text-slate-400 ring-1 ring-slate-500/20">
                캐시
              </span>
            ) : source === "ai" ? (
              <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-300 ring-1 ring-cyan-500/20">
                AI
              </span>
            ) : null}
            {error ? (
              <span
                className="rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-300 ring-1 ring-rose-500/20"
                title={error}
              >
                오류
              </span>
            ) : null}
          </div>
          <h2 className="mt-3 break-keep text-[1.35rem] font-semibold text-white md:text-2xl">{media.name} 인사이트</h2>
        </div>
        <span className={`shrink-0 pt-1 text-slate-500 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}>
          ⌃
        </span>
      </button>

      {!collapsed ? (
        <div className="border-t border-white/8 px-5 pb-5 pt-4">
          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.24fr)_minmax(300px,0.76fr)]">
            <div className="min-w-0 space-y-3">
              <TrendBlock
                title="DB 추이"
                lines={insight.dbTrend.length ? insight.dbTrend : ["생성된 추이 요약이 없습니다."]}
              />
              <TrendBlock
                title="배당 추이"
                lines={insight.payoutTrend.length ? insight.payoutTrend : ["생성된 배당 요약이 없습니다."]}
              />
              {comment ? (
                <div className="rounded-2xl border border-teal-500/30 bg-teal-500/[0.08] p-4 md:p-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-200">운영 코멘트</div>
                  <p className="mt-3 break-words text-sm leading-7 text-slate-100">{comment}</p>
                </div>
              ) : null}
            </div>

            <div className="min-w-0">
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4 md:p-5">
                <div className="text-sm font-semibold text-white">권장 액션</div>
                <div className="mt-3 space-y-3">
                  {actionBlocks.length ? (
                    actionBlocks.map((block, index) => (
                      <div key={`${block.title}-${index}`} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                        <div className="text-xs font-semibold text-slate-200">{block.title}</div>
                        <div className="mt-2 space-y-1.5 text-sm leading-6 text-slate-300">
                          {block.lines.map((line, lineIndex) => (
                            <p key={`${block.title}-${lineIndex}`} className="break-words">
                              {line}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3 text-sm text-slate-300">
                      추가 액션 제안이 없습니다.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
