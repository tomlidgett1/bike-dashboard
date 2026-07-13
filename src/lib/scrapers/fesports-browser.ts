import puppeteer, { type Browser, type CookieParam, type Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

const FESPORTS_BASE_URL = "https://www.fesports.com.au";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function launchFesportsBrowser(): Promise<Browser> {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION);

  if (isServerless) {
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 900 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const candidates = [
    process.env.CHROME_EXECUTABLE,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean) as string[];

  for (const executablePath of candidates) {
    try {
      return await puppeteer.launch({
        executablePath,
        headless: true,
        defaultViewport: { width: 1280, height: 900 },
      });
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    "Could not launch a browser for FEsports scraping. Set CHROME_EXECUTABLE if Chrome is installed in a non-standard location.",
  );
}

export async function applyFesportsCookies(page: Page, cookies: CookieParam[] | null | undefined) {
  if (!cookies?.length) return;
  await page.setCookie(...cookies);
}

export async function collectFesportsCookies(page: Page): Promise<CookieParam[]> {
  const cookies = await page.cookies(FESPORTS_BASE_URL);
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  }));
}

export async function loginToFesports(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto(`${FESPORTS_BASE_URL}/Login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('input[name="email"]', { timeout: 15_000 });
  await page.type('input[name="email"]', email, { delay: 20 });
  await page.type('input[name="password"]', password, { delay: 20 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => undefined),
    page.click('form.register-form button[type="submit"], form.register-form input[type="submit"]'),
  ]);
  await sleep(1_000);

  if (page.url().includes("/Login")) {
    throw new Error("FEsports login failed. Check your email and password.");
  }

  const navUser = await page.$eval(".navbar .dropdown-toggle", (el) => el.textContent?.trim() ?? "");
  if (navUser.toLowerCase().includes("guest")) {
    throw new Error("FEsports login did not activate a reseller session.");
  }
}

export async function withFesportsPage<T>(
  cookies: CookieParam[] | null | undefined,
  runner: (page: Page) => Promise<T>,
): Promise<T> {
  const browser = await launchFesportsBrowser();
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    );
    await applyFesportsCookies(page, cookies);
    return await runner(page);
  } finally {
    await browser.close();
  }
}
