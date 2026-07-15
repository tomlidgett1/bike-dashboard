import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_FIELD_MAPPING } from "@/lib/scrapers/fesports-field-mapping";
import { requireSupplierScraperManager } from "@/lib/scrapers/supplier-auth";
import { buildSupplierScraper } from "@/lib/scrapers/supplier-engine";
import {
  createSupplierSseStream,
  SupplierScraperLogger,
} from "@/lib/scrapers/supplier-logger";
import { encryptSupplierCredentials } from "@/lib/scrapers/supplier-security";
import {
  listSupplierScrapers,
  toStoredSupplierScraper,
} from "@/lib/scrapers/supplier-storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface BuildRequestBody {
  name?: unknown;
  websiteUrl?: unknown;
  loginUrl?: unknown;
  username?: unknown;
  password?: unknown;
}

async function buildAndSaveSupplierScraper(
  auth: Awaited<ReturnType<typeof requireSupplierScraperManager>> & object,
  body: BuildRequestBody,
  logger: SupplierScraperLogger,
) {
  if ("error" in auth) throw new Error("Unauthorised.");

  const websiteUrl = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
  const loginUrl = typeof body.loginUrl === "string" ? body.loginUrl.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const requestedName = typeof body.name === "string" ? body.name.trim() : "";

  if (!websiteUrl) {
    throw new Error("Enter the supplier website.");
  }
  if (username && !password) {
    throw new Error("Enter the supplier password.");
  }

  const credentials = { username, password };
  const encryptedCredentials = encryptSupplierCredentials(credentials);
  const { config, sampleProducts } = await buildSupplierScraper({
    websiteUrl,
    loginUrl: loginUrl || websiteUrl,
    credentials,
    logger,
  });
  const name = (requestedName || config.supplierName).slice(0, 120);

  logger.step("save", "Saving reusable scraper");
  const { data, error } = await auth.supabase
    .from("store_supplier_scrapers")
    .insert({
      store_id: auth.storeId,
      owner_user_id: auth.user.id,
      created_by: auth.actorUserId,
      name,
      base_url: config.baseUrl,
      login_url: config.loginUrl,
      credential_ciphertext: encryptedCredentials,
      config,
      field_mapping: DEFAULT_FIELD_MAPPING,
      status: "draft",
      last_error: null,
    })
    .select(
      [
        "id",
        "name",
        "base_url",
        "login_url",
        "config",
        "field_mapping",
        "status",
        "last_run_at",
        "last_run_status",
        "last_run_summary",
        "last_error",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not save the supplier scraper.");
  }

  logger.success("save", "Scraper saved");
  return {
    success: true,
    scraper: toStoredSupplierScraper(data as never),
    sampleProducts,
    logs: logger.getEntries(),
  };
}

export async function GET() {
  const auth = await requireSupplierScraperManager();
  if ("error" in auth) return auth.error;

  try {
    return NextResponse.json({
      scrapers: await listSupplierScrapers(auth),
    });
  } catch (error) {
    console.error("[supplier-scrapers/list]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load supplier scrapers." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSupplierScraperManager();
  if ("error" in auth) return auth.error;

  const body = (await request.json()) as BuildRequestBody;
  const wantsStream = request.headers.get("accept")?.includes("text/event-stream");

  if (wantsStream) {
    return createSupplierSseStream(async (send, logger) => {
      const result = await buildAndSaveSupplierScraper(auth, body, logger);
      send({ event: "result", ...result });
    });
  }

  try {
    const logger = new SupplierScraperLogger();
    const result = await buildAndSaveSupplierScraper(auth, body, logger);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[supplier-scrapers/build]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "YJ could not build this supplier scraper.",
      },
      { status: 500 },
    );
  }
}
