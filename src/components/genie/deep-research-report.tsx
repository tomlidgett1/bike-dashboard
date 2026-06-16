"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Download, FileText, Loader2 } from "lucide-react";
import { GenieChart } from "@/components/genie/genie-chart";
import { GenieDataTable } from "@/components/genie/genie-data-table";
import { GeniePivotTable } from "@/components/genie/genie-pivot-table";
import { renderGenieMarkdown } from "@/lib/genie/render-markdown";
import type { GenieChartPayload, GenieTablePayload } from "@/lib/genie/visual-payloads";
import type { GeniePivotTablePayload } from "@/lib/genie/pivot-table";

/**
 * A deep-research result is detected by the synthesis H1 the orchestrator is told
 * to emit. Cheap and deterministic — no extra flag needs to round-trip through
 * job persistence.
 */
export function isDeepResearchReport(content: string | undefined | null): boolean {
  if (!content) return false;
  return /^\s*#\s+Deep Business Review/i.test(content);
}

// Print from a body-level portal so chat scroll containers cannot clip the
// generated PDF pages.
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm; }
  html,
  body {
    margin: 0 !important;
    background: #fff !important;
    overflow: visible !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body * { visibility: hidden !important; }
  .deep-report-print-portal,
  .deep-report-print-portal * {
    visibility: visible !important;
  }
  .deep-report-print-portal {
    display: block !important;
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    overflow: visible !important;
    background: #fff !important;
  }
  .deep-report-no-print { display: none !important; }
  .deep-report-print-document {
    width: 182mm !important;
    max-width: 182mm !important;
    margin: 0 auto !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }
  .deep-report-print-document,
  .deep-report-print-document * {
    overflow: visible !important;
  }
  .deep-report-logo {
    display: block !important;
    height: 9mm !important;
    width: auto !important;
    max-width: 48mm !important;
  }
  .deep-report-prose {
    break-inside: auto !important;
  }
  .deep-report-print-document h2,
  .deep-report-print-document h3,
  .deep-report-print-document h4 {
    break-after: avoid-page;
  }
  .deep-report-print-document table {
    width: 100% !important;
    max-width: 100% !important;
    table-layout: fixed !important;
    font-size: 8.5px !important;
  }
  .deep-report-print-document th,
  .deep-report-print-document td {
    min-width: 0 !important;
    max-width: none !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
    padding: 4px 5px !important;
  }
  .deep-report-print-document [class*="sticky"] {
    position: static !important;
  }
  .deep-report-print-document [class*="truncate"] {
    overflow: visible !important;
    text-overflow: clip !important;
    white-space: normal !important;
  }
  .deep-report-print-document [data-genie-echart] {
    min-height: 58mm !important;
  }
}
`;

export function DeepResearchReport({
  content,
  charts,
  tables,
  pivotTables,
  storeName,
  dateLabel,
  title,
  toolbarLabel,
  eyebrow,
  subtitle,
  footerText,
}: {
  content: string;
  charts?: GenieChartPayload[];
  tables?: GenieTablePayload[];
  pivotTables?: GeniePivotTablePayload[];
  storeName?: string;
  dateLabel?: string;
  title?: string;
  toolbarLabel?: string;
  eyebrow?: string;
  subtitle?: string;
  footerText?: string;
}) {
  const [printing, setPrinting] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canUseDOM = typeof document !== "undefined";

  React.useEffect(() => {
    if (!printing) return;
    const finish = () => setPrinting(false);
    window.addEventListener("afterprint", finish);
    // Let the printing class paint before invoking the print dialog.
    const timer = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        setPrinting(false);
      }
    }, 350);
    return () => {
      window.removeEventListener("afterprint", finish);
      window.clearTimeout(timer);
    };
  }, [printing]);

  const html = React.useMemo(() => {
    // The card supplies its own styled title; drop the report's leading H1.
    const body = content.replace(/^\s*#\s+Deep Business Review[^\n]*\r?\n+/i, "");
    return renderGenieMarkdown(body);
  }, [content]);
  const hasVisuals =
    Boolean(charts?.length) || Boolean(tables?.length) || Boolean(pivotTables?.length);
  const reportTitle =
    title ?? (storeName ? `${storeName} — Deep Business Review` : "Deep Business Review");
  const isDeepReview = isDeepResearchReport(content);
  const reportEyebrow = eyebrow ?? (isDeepReview ? "Confidential — Internal Board Memo" : "");
  const reportSubtitle =
    subtitle ??
    `Autonomous forensic analysis across finance, sales, inventory, customers, staffing, suppliers & market${
      dateLabel ? ` · ${dateLabel}` : ""
    }`;
  const reportFooter =
    footerText ??
    "Generated by Yellow Jersey Genie · Deep Business Review · Evidence tagged PROVEN / SUGGESTED / PLAUSIBLE / UNKNOWN. Verify material figures before acting.";

  const renderReportDocument = (printMode = false) => (
    <div
      className={`deep-report-page ${
        printMode
          ? "deep-report-print-document bg-white text-slate-800"
          : "mx-auto w-full max-w-[820px] rounded-md border border-slate-200 bg-white px-8 py-10 text-slate-800 shadow-sm sm:px-12"
      }`}
    >
      <header className="mb-8 border-b border-slate-200 pb-5">
        <div className={reportEyebrow ? "mb-5 flex items-start justify-between gap-4" : "mb-5"}>
          <Image
            src="/yjlogo.svg"
            alt="Yellow Jersey"
            width={180}
            height={35}
            unoptimized
            className="deep-report-logo h-8 w-auto max-w-[180px]"
          />
          {reportEyebrow ? (
            <p className="text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">
              {reportEyebrow}
            </p>
          ) : null}
        </div>
        <h1 className="mt-1 text-lg font-bold text-slate-900">
          {reportTitle}
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          {reportSubtitle}
        </p>
      </header>

      <article
        className="deep-report-prose text-[13.5px] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {hasVisuals ? (
        <section className="mt-10 border-t border-slate-200 pt-6">
          <h2 className="mb-4 text-base font-bold text-slate-900">
            Appendix — Supporting charts &amp; data
          </h2>
          <div className="space-y-5">
            {charts?.map((chart, index) => (
              <GenieChart
                key={`dr-chart-${chart.title}-${index}`}
                chart={chart}
                variant={printMode ? "dashboard" : "chat"}
                showExport={!printMode}
              />
            ))}
            {pivotTables?.map((table, index) => (
              <GeniePivotTable
                key={`dr-pivot-${table.title}-${index}`}
                table={table}
                showCsvDownload={!printMode}
              />
            ))}
            {tables?.map((table, index) => (
              <GenieDataTable
                key={`dr-table-${table.title}-${index}`}
                table={table}
                variant={printMode ? "dashboard" : "chat"}
                showCsvDownload={!printMode}
              />
            ))}
          </div>
        </section>
      ) : null}

      <footer className="mt-10 border-t border-slate-200 pt-4 text-[10px] text-slate-400">
        {reportFooter}
      </footer>
    </div>
  );

  return (
    <div ref={rootRef} className="w-full">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* Toolbar — not printed */}
      <div className="deep-report-no-print mb-3 flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white/70 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-amber-400 to-yellow-500 text-white">
            <FileText className="h-4 w-4" />
          </span>
          {toolbarLabel ?? "Deep Business Review"}
        </div>
        <button
          type="button"
          onClick={() => setPrinting(true)}
          disabled={printing}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {printing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {printing ? "Preparing…" : "Download PDF"}
        </button>
      </div>

      {/* The document — A4-like page in chat; a portal copy is used for printing. */}
      {renderReportDocument()}
      {printing && canUseDOM
        ? createPortal(
            <div className="deep-report-print-portal">{renderReportDocument(true)}</div>,
            document.body,
          )
        : null}
    </div>
  );
}
