import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedRequest, unauthorizedJson } from "@/lib/auth";
import { parseWorkbook } from "@/lib/excel";
import { loadPrivateBlob } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!isAuthenticatedRequest(req)) {
    return unauthorizedJson();
  }

  try {
    const body = (await req.json()) as { blobPathname?: string };
    if (!body?.blobPathname) {
      return NextResponse.json({ error: "Blob 경로가 전달되지 않았습니다." }, { status: 400 });
    }

    const buffer = await loadPrivateBlob(body.blobPathname);
    const result = await parseWorkbook(buffer);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "엑셀 파싱에 실패했습니다." },
      { status: 500 },
    );
  }
}
