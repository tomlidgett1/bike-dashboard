import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Page } from "puppeteer-core";

const RUNTIME_PATH = path.join(
  process.cwd(),
  "src/lib/scrapers/supplier-browser-runtime.mjs",
);

let cachedSource: string | null = null;
let cachedMtimeMs = -1;

function loadRuntimeSource(): string {
  const mtimeMs = statSync(RUNTIME_PATH).mtimeMs;
  if (cachedSource && cachedMtimeMs === mtimeMs) return cachedSource;
  cachedSource = readFileSync(RUNTIME_PATH, "utf8");
  cachedMtimeMs = mtimeMs;
  return cachedSource;
}

export async function evaluateSupplierRuntime<T>(
  page: Page,
  exportName: string,
  arg?: unknown,
): Promise<T> {
  const runtimeSource = loadRuntimeSource();
  return page.evaluate(
    (source, fnName, value) => {
      const module = { exports: {} as Record<string, unknown> };
      // Runs the plain browser runtime in the page context.
      new Function("module", "exports", source)(module, module.exports);
      const fn = module.exports[fnName];
      if (typeof fn !== "function") {
        throw new Error(`Missing browser runtime export: ${fnName}`);
      }
      return value === undefined ? fn() : fn(value);
    },
    runtimeSource,
    exportName,
    arg,
  );
}
