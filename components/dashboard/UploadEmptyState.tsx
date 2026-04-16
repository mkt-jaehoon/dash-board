"use client";

import type { DragEvent } from "react";

export function UploadEmptyState({
  dragging,
  onPick,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  dragging: boolean;
  onPick: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}) {
  return (
    <section
      className={`mb-6 rounded-[28px] border border-white/8 bg-slate-950/60 p-10 ${dragging ? "border-sky-400/50" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onPick}
    >
      <div className="grid gap-8 lg:grid-cols-[1.3fr_0.9fr]">
        <div>
          <div className="inline-flex rounded-full bg-sky-500/15 px-3 py-1 text-xs font-medium text-sky-200 ring-1 ring-sky-500/20">
            첫 업로드 또는 공유 조회
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white">엑셀만 올리면 최신 데일리 리포트를 바로 확인할 수 있습니다.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
            새 파일을 업로드하면 날짜별 성과를 자동으로 분석하고, 이후 방문자는 마지막 저장본을 같은 화면에서 바로 확인할 수 있습니다.
          </p>
        </div>
        <div className="grid gap-3">
          {[
            "지원 파일: 데일리 리포트 MMDD.xlsx",
            "기준 시트: MASTER_RAW",
            "DATE 컬럼 기준으로 날짜별 조회 가능",
            "저장된 최신 리포트는 같은 링크에서 바로 공유 가능",
          ].map((item) => (
            <div key={item} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
