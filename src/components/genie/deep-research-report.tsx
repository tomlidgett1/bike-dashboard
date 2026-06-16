"use client";

import * as React from "react";
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

// Classic print-isolation: hide everything, re-show only the printing document
// subtree (charts already rendered on screen come along into the PDF). Scoped to
// the instance that was clicked via the `deep-report-printing` class.
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .deep-report-printing, .deep-report-printing * { visibility: visible !important; }
  .deep-report-printing {
    position: absolute !important;
    left: 0; top: 0; width: 100% !important; max-width: none !important;
    margin: 0 !important; box-shadow: none !important; border: 0 !important;
    border-radius: 0 !important; padding: 0 !important;
  }
  .deep-report-no-print { display: none !important; }
  .deep-report-page { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; }
  @page { size: A4; margin: 14mm; }
}
`;

export function DeepResearchReport({
  content,
  charts,
  tables,
  pivotTables,
  storeName,
  dateLabel,
}: {
  content: string;
  charts?: GenieChartPayload[];
  tables?: GenieTablePayload[];
  pivotTables?: GeniePivotTablePayload[];
  storeName?: string;
  dateLabel?: string;
}) {
  const [printing, setPrinting] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

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
    }, 90);
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

  return (
    <div ref={rootRef} className="w-full">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* Toolbar — not printed */}
      <div className="deep-report-no-print mb-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 text-white">
            <FileText className="h-4 w-4" />
          </span>
          Deep Business Review
        </div>
        <button
          type="button"
          onClick={() => setPrinting(true)}
          disabled={printing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {printing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {printing ? "Preparing…" : "Download PDF"}
        </button>
      </div>

      {/* The document — A4-like page; this subtree is what prints */}
      <div
        className={`deep-report-page mx-auto w-full max-w-[820px] rounded-xl border border-slate-200 bg-white px-8 py-10 text-slate-800 shadow-sm sm:px-12 ${
          printing ? "deep-report-printing" : ""
        }`}
      >
        <header className="mb-8 border-b border-slate-200 pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">
            Confidential — Internal Board Memo
          </p>
          <h1 className="mt-1 text-lg font-bold text-slate-900">
            {storeName ? `${storeName} — Deep Business Review` : "Deep Business Review"}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Autonomous forensic analysis across finance, sales, inventory, customers, staffing,
            suppliers &amp; market
            {dateLabel ? ` · ${dateLabel}` : ""}
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
                <GenieChart key={`dr-chart-${chart.title}-${index}`} chart={chart} />
              ))}
              {pivotTables?.map((table, index) => (
                <GeniePivotTable key={`dr-pivot-${table.title}-${index}`} table={table} />
              ))}
              {tables?.map((table, index) => (
                <GenieDataTable key={`dr-table-${table.title}-${index}`} table={table} />
              ))}
            </div>
          </section>
        ) : null}

        <footer className="mt-10 border-t border-slate-200 pt-4 text-[10px] text-slate-400">
          Generated by Yellow Jersey Genie · Deep Business Review · Evidence tagged
          PROVEN / SUGGESTED / PLAUSIBLE / UNKNOWN. Verify material figures before acting.
        </footer>
      </div>
    </div>
  );
}
