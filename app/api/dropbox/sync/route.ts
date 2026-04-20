import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedRequest, unauthorizedJson } from "@/lib/auth";
import { runDropboxIngest } from "@/lib/dropbox-ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!isAuthenticatedRequest(req)) {
    return unauthorizedJson();
  }

  const body = (await req.json().catch(() => ({}))) as { date?: string; force?: boolean };
  try {
    const result = await runDropboxIngest({
      date: body.date,
      force: Boolean(body.force),
      notifySlack: true,
      trigger: "manual",
    });

    if (result.ok) {
      return NextResponse.json(result);
    }
    return NextResponse.json(
      { ok: false, error: result.error, folderPath: result.folderPath },
      { status: result.status },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dropbox 동기화 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
