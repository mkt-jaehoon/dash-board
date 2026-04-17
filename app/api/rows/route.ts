import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedRequest, unauthorizedJson } from "@/lib/auth";
import { parseWorkbook } from "@/lib/excel";
import {
  isBlobConfigured,
  isMissingBlobError,
  loadPrivateBlob,
  loadPrivateJson,
  loadReportManifest,
} from "@/lib/storage";
import { RawRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

async function loadRowsData(pathname: string): Promise<RawRow[]> {
  if (/\.(xlsx|xls)$/i.test(pathname)) {
    const buffer = await loadPrivateBlob(pathname);
    const { rows } = await parseWorkbook(buffer);
    return rows;
  }

  try {
    return await loadPrivateJson<RawRow[]>(pathname);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unexpected token")) {
      const buffer = await loadPrivateBlob(pathname);
      const { rows } = await parseWorkbook(buffer);
      return rows;
    }
    throw error;
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthenticatedRequest(req)) {
    return unauthorizedJson();
  }

  try {
    if (!isBlobConfigured()) {
      return NextResponse.json({ rows: [], uploadedAt: null });
    }
    const manifest = await loadReportManifest();
    if (!manifest?.sourcePathname) {
      return NextResponse.json({ rows: [], uploadedAt: null });
    }
    const rows = await loadRowsData(manifest.sourcePathname);
    return NextResponse.json({ rows, uploadedAt: manifest.uploadedAt });
  } catch (error) {
    if (isMissingBlobError(error)) {
      return NextResponse.json({ rows: [], uploadedAt: null });
    }
    return NextResponse.json(
      { rows: [], error: error instanceof Error ? error.message : "Failed to load rows." },
      { status: 500 },
    );
  }
}
