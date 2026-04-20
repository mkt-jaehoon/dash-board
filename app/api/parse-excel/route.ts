import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedRequest, unauthorizedJson } from "@/lib/auth";
import { parseWorkbook } from "@/lib/excel";
import { loadPrivateBlob } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED_UPLOAD_EXTENSIONS = /\.(xlsx|xls|parsed\.json)$/i;

function isAllowedUploadPath(pathname: string) {
  if (pathname.includes("..") || pathname.includes("\\")) return false;
  if (!pathname.startsWith("uploads/")) return false;
  return ALLOWED_UPLOAD_EXTENSIONS.test(pathname);
}

export async function POST(req: NextRequest) {
  if (!isAuthenticatedRequest(req)) {
    return unauthorizedJson();
  }

  try {
    const body = (await req.json()) as { blobPathname?: string };
    if (!body?.blobPathname) {
      return NextResponse.json({ error: "Blob 경로가 전달되지 않았습니다." }, { status: 400 });
    }

    if (!isAllowedUploadPath(body.blobPathname)) {
      return NextResponse.json({ error: "허용되지 않는 Blob 경로입니다." }, { status: 400 });
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
