import { LoginForm } from "./login-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const nextPath = searchParams?.next || "/";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(32,84,145,0.28),transparent_35%),linear-gradient(180deg,#08111f_0%,#0b1220_48%,#070c14_100%)] px-4">
      <section className="w-full max-w-md rounded-[28px] border border-white/8 bg-slate-950/80 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
        <div className="inline-flex rounded-full bg-teal-500/15 px-3 py-1 text-xs font-medium text-teal-200 ring-1 ring-teal-500/20">
          Protected Dashboard
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">비밀번호를 입력하세요.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">확인된 사용자만 접근할 수 있습니다.</p>
        <LoginForm nextPath={nextPath} />
      </section>
    </main>
  );
}
