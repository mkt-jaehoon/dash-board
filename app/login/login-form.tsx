"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { parseApiResponse } from "@/lib/utils";

type LoginResponse = {
  ok?: boolean;
  error?: string;
};

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await parseApiResponse<LoginResponse>(response);
      if (!response.ok) {
        throw new Error(data.error ?? "로그인에 실패했습니다.");
      }

      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-300">
          비밀번호
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none focus:border-sky-500"
          placeholder="비밀번호 입력"
          autoFocus
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          오류: {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading || !password}
        className="w-full rounded-2xl bg-teal-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-teal-200"
      >
        {loading ? "확인 중..." : "로그인"}
      </button>
    </form>
  );
}
