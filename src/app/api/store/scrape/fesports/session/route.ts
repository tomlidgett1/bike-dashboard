import { NextRequest, NextResponse } from "next/server";
import type { CookieParam } from "puppeteer-core";
import { requireBicycleStore } from "@/lib/store/online-products-store-auth";
import {
  collectFesportsCookies,
  launchFesportsBrowser,
  loginToFesports,
} from "@/lib/scrapers/fesports-browser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBicycleStore();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "FEsports email and password are required for stock visibility." },
        { status: 400 },
      );
    }

    const browser = await launchFesportsBrowser();
    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      );
      await loginToFesports(page, email, password);
      const cookies = await collectFesportsCookies(page);
      const navUser = await page.$eval(
        ".navbar .dropdown-toggle",
        (el) => el.textContent?.trim() ?? "",
      );

      return NextResponse.json({
        success: true,
        cookies: cookies as CookieParam[],
        accountLabel: navUser,
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start FEsports session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
