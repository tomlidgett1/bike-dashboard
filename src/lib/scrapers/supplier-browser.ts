import puppeteer, {
  type Browser,
  type ElementHandle,
  type Page,
} from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import {
  assertSafeSupplierUrl,
  type SupplierCredentials,
} from "@/lib/scrapers/supplier-security";
import type { SupplierScraperLogger } from "@/lib/scrapers/supplier-logger";
import { evaluateSupplierRuntime } from "@/lib/scrapers/supplier-page-runtime";
import type { SupplierLoginSelectors } from "@/lib/scrapers/supplier-types";

export interface SupplierSnapshotElement {
  tag: string;
  selector: string;
  text: string;
  href: string | null;
  src: string | null;
  type: string | null;
  name: string | null;
  role: string | null;
  placeholder: string | null;
  itemprop: string | null;
}

export interface SupplierPageSnapshot {
  url: string;
  title: string;
  headings: string[];
  bodyText: string;
  elements: SupplierSnapshotElement[];
  structuredData: string[];
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const USERNAME_SELECTORS = [
  'input[type="email"]',
  'input[autocomplete="username"]',
  'input[name*="email" i]',
  'input[id*="email" i]',
  'input[name*="user" i]',
  'input[id*="user" i]',
  'input[type="text"]',
];

const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[autocomplete="current-password"]',
  'input[name*="password" i]',
  'input[id*="password" i]',
];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button[name*="login" i]',
  'button[id*="login" i]',
  'button[class*="login" i]',
];

function hostnamesMatch(left: string, right: string): boolean {
  const a = left.toLowerCase().replace(/^www\./, "");
  const b = right.toLowerCase().replace(/^www\./, "");
  return a === b;
}

export async function launchSupplierBrowser(
  logger?: SupplierScraperLogger,
): Promise<Browser> {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION);
  logger?.step("browser", isServerless ? "Launching serverless Chromium" : "Launching local Chrome");

  if (isServerless) {
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1440, height: 1000 },
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
      const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        defaultViewport: { width: 1440, height: 1000 },
      });
      logger?.success("browser", "Browser ready", { executablePath });
      return browser;
    } catch {
      logger?.detail("browser", "Browser launch candidate failed", { executablePath });
    }
  }

  throw new Error(
    "YJ could not launch its secure browser. Configure CHROME_EXECUTABLE for this environment.",
  );
}

export async function prepareSupplierPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-AU,en;q=0.9",
  });
  page.setDefaultNavigationTimeout(60_000);
  page.setDefaultTimeout(20_000);
  const approvedHosts = new Set<string>();
  const blockedHosts = new Set<string>();
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    void (async () => {
      const requestUrl = request.url();
      if (/^(?:data|blob|about):/i.test(requestUrl)) {
        await request.continue();
        return;
      }

      try {
        const hostname = new URL(requestUrl).hostname.toLowerCase();
        if (blockedHosts.has(hostname)) {
          await request.abort("blockedbyclient");
          return;
        }
        if (!approvedHosts.has(hostname)) {
          await assertSafeSupplierUrl(requestUrl);
          approvedHosts.add(hostname);
        }
        await request.continue();
      } catch {
        try {
          const hostname = new URL(requestUrl).hostname.toLowerCase();
          blockedHosts.add(hostname);
        } catch {
          // The URL is invalid and will be blocked below.
        }
        await request.abort("blockedbyclient");
      }
    })();
  });
  return page;
}

async function firstExistingSelector(
  page: Page,
  selectors: string[],
): Promise<string | null> {
  for (const selector of selectors) {
    try {
      if (await page.$(selector)) return selector;
    } catch {
      // Ignore invalid selectors supplied by an earlier draft.
    }
  }
  return null;
}

async function clearAndType(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  const element = (await page.$(selector)) as ElementHandle<HTMLInputElement> | null;
  if (!element) throw new Error(`YJ could not find the login field (${selector}).`);
  await element.evaluate((input) => {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await element.type(value, { delay: 15 });
}

export async function navigateSupplierPage(
  page: Page,
  rawUrl: string,
  allowedHostname: string,
  logger?: SupplierScraperLogger,
): Promise<void> {
  const url = await assertSafeSupplierUrl(rawUrl, allowedHostname);
  logger?.detail("navigate", `Opening ${url.pathname || "/"}`, { url: url.toString() });
  await page.goto(url.toString(), {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  // Short idle wait: many B2B sites never go fully idle (analytics/websockets).
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 3_000 }).catch(() => undefined);
  const finalUrl = new URL(page.url());
  if (!hostnamesMatch(finalUrl.hostname, allowedHostname)) {
    throw new Error("The supplier redirected YJ to a different website.");
  }
  logger?.detail("navigate", "Page loaded", {
    title: await page.title(),
    url: page.url(),
  });
}

export async function loginToSupplier(
  page: Page,
  loginUrl: string,
  allowedHostname: string,
  credentials: SupplierCredentials,
  savedSelectors?: SupplierLoginSelectors | null,
  logger?: SupplierScraperLogger,
): Promise<SupplierLoginSelectors | null> {
  logger?.step("login", "Opening supplier login page", { loginUrl });
  await navigateSupplierPage(page, loginUrl, allowedHostname, logger);

  const usernameSelector = await firstExistingSelector(page, [
    savedSelectors?.username ?? "",
    ...USERNAME_SELECTORS,
  ].filter(Boolean));
  const passwordSelector = await firstExistingSelector(page, [
    savedSelectors?.password ?? "",
    ...PASSWORD_SELECTORS,
  ].filter(Boolean));

  if (!passwordSelector) {
    logger?.warn("login", "No password field found, continuing without login");
    return null;
  }
  if (!credentials.username || !credentials.password) {
    throw new Error("This supplier requires a username and password.");
  }
  if (!usernameSelector) {
    throw new Error("YJ found a password field but could not identify the username field.");
  }

  const submitSelector = await firstExistingSelector(page, [
    savedSelectors?.submit ?? "",
    ...SUBMIT_SELECTORS,
  ].filter(Boolean));
  if (!submitSelector) {
    throw new Error("YJ could not identify the supplier login button.");
  }

  logger?.detail("login", "Submitting credentials", {
    usernameSelector,
    passwordSelector,
    submitSelector,
    username: credentials.username,
  });

  await clearAndType(page, usernameSelector, credentials.username);
  await clearAndType(page, passwordSelector, credentials.password);

  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => undefined),
    page.click(submitSelector),
  ]);
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 3_000 }).catch(() => undefined);

  const finalUrl = new URL(page.url());
  if (!hostnamesMatch(finalUrl.hostname, allowedHostname)) {
    throw new Error("The supplier login redirected YJ to a different website.");
  }

  const loginState = await evaluateSupplierRuntime<{
    hasPassword: boolean;
    hasCaptcha: boolean;
    hasTwoFactor: boolean;
    hasLoginError: boolean;
    title: string;
    url: string;
  }>(page, "captureSupplierLoginState");

  logger?.detail("login", "Checked post-login page", loginState);

  if (loginState.hasCaptcha) {
    throw new Error("This supplier requires a CAPTCHA. Guided CAPTCHA login is not yet supported.");
  }
  if (loginState.hasTwoFactor) {
    throw new Error("This supplier requires a verification code. Guided two-factor login is not yet supported.");
  }
  if (loginState.hasLoginError || loginState.hasPassword) {
    throw new Error("Supplier login failed. Check the username and password.");
  }

  logger?.success("login", "Supplier login succeeded", { url: page.url() });
  return {
    username: usernameSelector,
    password: passwordSelector,
    submit: submitSelector,
  };
}

export async function snapshotSupplierPage(
  page: Page,
  logger?: SupplierScraperLogger,
): Promise<SupplierPageSnapshot> {
  logger?.detail("snapshot", "Capturing page snapshot", { url: page.url() });
  const snapshot = await evaluateSupplierRuntime<SupplierPageSnapshot>(
    page,
    "captureSupplierPageSnapshot",
  );
  logger?.detail("snapshot", "Snapshot captured", {
    title: snapshot.title,
    headings: snapshot.headings.length,
    elements: snapshot.elements.length,
  });
  return snapshot;
}
