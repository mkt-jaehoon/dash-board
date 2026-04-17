import { get } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedRequest, unauthorizedJson } from "@/lib/auth";
import { parseWorkbook } from "@/lib/excel";
import {
  isBlobConfigured,
  isMissingBlobError,
  loadPrivateBlob,
  loadReportManifest,
} from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

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

    const pathname = manifest.sourcePathname;
    const uploadedAt = manifest.uploadedAt;

    if (pathname.endsWith(".parsed.json")) {
      try {
        const blob = await get(pathname, { access: "private" });
        if (blob?.statusCode === 200 && blob.stream) {
          const upstream = new Response(blob.stream).body;
          if (upstream) {
            const encoder = new TextEncoder();
            const prefix = encoder.encode(
              `{"uploadedAt":${JSON.stringify(uploadedAt)},"rows":`,
            );
            const suffix = encoder.encode("}");
            const reader = upstream.getReader();
            const stream = new ReadableStream<Uint8Array>({
              async start(controller) {
                controller.enqueue(prefix);
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    controller.enqueue(value);
                  }
                  controller.enqueue(suffix);
                  controller.close();
                } catch (error) {
                  controller.error(error);
                }
              },
              cancel(reason) {
                void reader.cancel(reason);
              },
            });
            return new Response(stream, {
              status: 200,
              headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "private, no-store",
              },
            });
          }
        }
      } catch (error) {
        if (!isMissingBlobError(error)) throw error;
      }
    }

    const buffer = await loadPrivateBlob(pathname);
    const { rows } = await parseWorkbook(buffer);
    return NextResponse.json({ rows, uploadedAt });
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
