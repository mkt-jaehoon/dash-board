"use client";

import { useState } from "react";
import { ReportHistoryItem } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";

export function UploadHistory({
  history,
  onRollback,
}: {
  history: ReportHistoryItem[];
  onRollback: (uploadedAt: string) => void;
}) {
  const [pendingRollback, setPendingRollback] = useState<string | null>(null);

  if (history.length <= 1) return null;

  return (
    <section className="mb-6 rounded-2xl border border-white/8 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Upload History</div>
          <div className="mt-1 text-sm text-slate-300">최근 업로드 이력에서 이전 버전으로 롤백할 수 있습니다.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {history.slice(0, 5).map((item, index) => {
            const isPending = pendingRollback === item.uploadedAt;

            if (index === 0) {
              return (
                <span
                  key={item.uploadedAt}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-950 ring-1 ring-white/80"
                >
                  현재 {formatTimestamp(item.uploadedAt)}
                </span>
              );
            }

            if (isPending) {
              return (
                <span key={item.uploadedAt} className="flex items-center gap-1">
                  <button
                    onClick={() => setPendingRollback(null)}
                    className="rounded-full border border-white/16 bg-transparent px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/[0.03]"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => {
                      setPendingRollback(null);
                      onRollback(item.uploadedAt);
                    }}
                    className="rounded-full bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-300 ring-1 ring-rose-500/30 hover:bg-rose-500/30"
                  >
                    확인
                  </button>
                </span>
              );
            }

            return (
              <button
                key={item.uploadedAt}
                onClick={() => setPendingRollback(item.uploadedAt)}
                className="rounded-full border border-white/16 bg-transparent px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-white/28 hover:bg-white/[0.03]"
              >
                롤백 {formatTimestamp(item.uploadedAt)}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
