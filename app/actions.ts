"use server";

import { parseWorkbook } from "@/lib/excel";
import { WorkbookParseResult } from "@/lib/types";

export async function parseExcelAction(formData: FormData): Promise<WorkbookParseResult> {
  const file = formData.get("file") as File;
  if (!file) {
    throw new Error("파일이 전달되지 않았습니다.");
  }
  const buffer = await file.arrayBuffer();
  return parseWorkbook(buffer);
}
