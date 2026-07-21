import { NextRequest, NextResponse } from "next/server";
import { extractBikeFromUrl } from "@/lib/scrapers/bike-url-extract";
import { requireSupplierScraperManager } from "@/lib/scrapers/supplier-auth";
import {
  createSupplierSseStream,
  SupplierScraperLogger,
} from "@/lib/scrapers/supplier-logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await requireSupplierScraperManager();
  if ("error" in auth) return auth.error;

  const body = (await request.json()) as { url?: unknown };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "Paste the bike's product page URL." }, { status: 400 });
  }

  const wantsStream = request.headers.get("accept")?.includes("text/event-stream");
  if (wantsStream) {
    return createSupplierSseStream(async (send, logger) => {
      const draft = await extractBikeFromUrl(url, logger);
      send({ event: "result", success: true, draft });
    });
  }

  try {
    const logger = new SupplierScraperLogger();
    const draft = await extractBikeFromUrl(url, logger);
    return NextResponse.json({ success: true, draft, logs: logger.getEntries() });
  } catch (error) {
    console.error("[bike-url/extract]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "YJ could not read this bike page.",
      },
      { status: 500 },
    );
  }
}
