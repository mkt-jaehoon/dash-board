import { NextRequest, NextResponse } from "next/server";
import { applyAuthCookie, getDashboardPassword, verifyPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { password?: string };
    const password = body?.password ?? "";
    const expectedPassword = getDashboardPassword();

    if (!verifyPassword(password, expectedPassword)) {
      return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    applyAuthCookie(response);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
