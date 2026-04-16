import { NextRequest, NextResponse } from "next/server";
import { analyze } from "@/lib/analyzer";
import { isAuthenticatedRequest, unauthorizedJson } from "@/lib/auth";
import { parseWorkbook } from "@/lib/excel";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!isAuthenticatedRequest(req)) {
    return unauthorizedJson();
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const selectedDate = formData.get("selectedDate");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows } = await parseWorkbook(buffer);
    const result = analyze(rows, typeof selectedDate === "string" ? selectedDate : undefined);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "분석 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
