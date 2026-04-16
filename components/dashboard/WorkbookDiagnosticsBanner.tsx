"use client";

import { WorkbookDiagnostics } from "@/lib/types";

export function WorkbookDiagnosticsBanner({ diagnostics }: { diagnostics: WorkbookDiagnostics | null }) {
  if (!diagnostics) return null;

  const hasMissingFields = diagnostics.missingFields.length > 0;
  const hasUnknownHeaders = diagnostics.unknownHeaders.length > 0;

  if (!hasMissingFields && !hasUnknownHeaders) {
    return (
      <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
        업로드 헤더 진단 완료: <span className="font-semibold">{diagnostics.sheetName}</span> 시트의 주요 컬럼을 정상 인식했습니다.
      </div>
    );
  }

  if (!hasMissingFields && hasUnknownHeaders) {
    return (
      <div className="mb-6 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
        <div className="font-medium">업로드 헤더 진단 완료: 주요 컬럼은 정상 인식했습니다.</div>
        <div className="mt-1">참고용 추가 컬럼: {diagnostics.unknownHeaders.join(", ")}</div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      <div className="font-medium">
        업로드 헤더 진단: <span className="font-semibold">{diagnostics.sheetName}</span> 시트에서 확인이 필요한 항목이 있습니다.
      </div>
      {diagnostics.missingFields.length > 0 ? <div className="mt-1">누락 필드: {diagnostics.missingFields.join(", ")}</div> : null}
      {diagnostics.unknownHeaders.length > 0 ? <div className="mt-1">미인식 헤더: {diagnostics.unknownHeaders.join(", ")}</div> : null}
    </div>
  );
}
