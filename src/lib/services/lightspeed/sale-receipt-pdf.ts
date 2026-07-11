import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

const LIGHTSPEED_CLOUD_ORIGIN = "https://cloud.lightspeedapp.com";

/** Rewrite relative Lightspeed asset URLs (e.g. barcode images) for headless rendering. */
export function prepareLightspeedReceiptHtml(html: string): string {
  return html.replace(/(\s(?:src|href))="\//g, `$1="${LIGHTSPEED_CLOUD_ORIGIN}/`);
}

async function launchReceiptBrowser() {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION);

  if (isServerless) {
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 800, height: 1200 },
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
      return await puppeteer.launch({ executablePath, headless: true });
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    "Could not launch a browser for receipt PDF generation. Set CHROME_EXECUTABLE if Chrome is installed in a non-standard location.",
  );
}

/**
 * Render Lightspeed DisplayTemplate HTML to a print-quality PDF (logo, barcode, styling).
 */
export async function renderHtmlReceiptPdf(html: string): Promise<Uint8Array> {
  const prepared = prepareLightspeedReceiptHtml(html);
  const browser = await launchReceiptBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(prepared, {
      waitUntil: "load",
      timeout: 45_000,
    });
    // Allow barcode/logo network requests to finish.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "8mm",
        right: "8mm",
        bottom: "8mm",
        left: "8mm",
      },
    });

    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}
