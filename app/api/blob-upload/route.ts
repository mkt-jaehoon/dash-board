import { handleUpload } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedRequest, unauthorizedJson } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!isAuthenticatedRequest(req)) {
    return unauthorizedJson();
  }

  const body = await req.json();

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "application/json",
        ],
        addRandomSuffix: false,
        allowOverwrite: true,
        maximumSizeInBytes: 50 * 1024 * 1024,
      }),
      onUploadCompleted: async () => {
        return;
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Blob 업로드 토큰 생성에 실패했습니다." },
      { status: 400 },
    );
  }
}
