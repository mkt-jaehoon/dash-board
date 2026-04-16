"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(32,84,145,0.28),transparent_35%),linear-gradient(180deg,#08111f_0%,#0b1220_48%,#070c14_100%)] px-4">
      <section className="w-full max-w-lg rounded-[28px] border border-white/8 bg-slate-950/80 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
        <div className="inline-flex rounded-full bg-rose-500/15 px-3 py-1 text-xs font-medium text-rose-200 ring-1 ring-rose-500/20">
          Unexpected Error
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">문제가 발생했습니다</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          일시적인 오류일 수 있습니다. 다시 시도하거나 페이지를 새로고침해 주세요.
        </p>
        <div className="mt-6 rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-slate-300">
          {error.message || "알 수 없는 오류"}
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => reset()}
            className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
          >
            다시 시도
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-2xl bg-white/8 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/14"
          >
            새로고침
          </button>
        </div>
      </section>
    </main>
  );
}
