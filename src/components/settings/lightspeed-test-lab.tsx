"use client";

import * as React from "react";
import { Beaker, ExternalLink, Loader2, Play, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type LabTab = "customer" | "inquiry" | "nest" | "connection" | "presets" | "receipt";

const TABS: Array<{ id: LabTab; label: string }> = [
  { id: "customer", label: "Customer scan" },
  { id: "inquiry", label: "Enquiry match" },
  { id: "nest", label: "Nest search" },
  { id: "receipt", label: "Receipt" },
  { id: "connection", label: "Connection" },
  { id: "presets", label: "Presets" },
];

function ReceiptResultPanel({
  loading,
  loadingMessage,
  result,
  error,
}: {
  loading: boolean;
  loadingMessage?: string | null;
  result: unknown;
  error: string | null;
}) {
  const html =
    result && typeof result === "object" && "html" in result && typeof (result as { html: unknown }).html === "string"
      ? (result as { html: string }).html
      : null;

  const openReceiptWindow = React.useCallback(() => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) {
      popup.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
    }
  }, [html]);

  const printReceipt = React.useCallback(() => {
    if (!html) return;
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(() => iframe.remove(), 1000);
    };
  }, [html]);

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">Receipt preview</p>
        <div className="flex items-center gap-2">
          {loading ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {loadingMessage ?? "Rendering…"}
            </span>
          ) : null}
          {html ? (
            <>
              <Button type="button" variant="outline" size="sm" className="rounded-md" onClick={openReceiptWindow}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Open
              </Button>
              <Button type="button" variant="outline" size="sm" className="rounded-md" onClick={printReceipt}>
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">{error}</p>
      ) : null}
      {html ? (
        <iframe
          title="Lightspeed sale receipt"
          srcDoc={html}
          sandbox="allow-same-origin"
          className="h-[min(70vh,720px)] w-full rounded-md border border-gray-100 bg-white"
        />
      ) : null}
      {!loading && !error && !html ? (
        <p className="text-sm text-gray-500">Enter a sale ID and render to preview the receipt HTML here.</p>
      ) : null}
      {result && !html ? (
        <pre className="mt-3 max-h-[240px] overflow-auto rounded-md border border-gray-100 bg-gray-50 p-3 text-xs text-gray-800">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function ResultPanel({
  loading,
  loadingMessage,
  result,
  error,
}: {
  loading: boolean;
  loadingMessage?: string | null;
  result: unknown;
  error: string | null;
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">Response</p>
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {loadingMessage ?? "Running…"}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">{error}</p>
      ) : null}
      {!error && result ? (
        <pre className="max-h-[420px] overflow-auto rounded-md border border-gray-100 bg-gray-50 p-3 text-xs text-gray-800">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
      {!loading && !error && !result ? (
        <p className="text-sm text-gray-500">Run a test to see the JSON response here.</p>
      ) : null}
    </div>
  );
}

export function LightspeedTestLab() {
  const [tab, setTab] = React.useState<LabTab>("customer");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<unknown>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [phone, setPhone] = React.useState("+61428808811");
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [senderEmail, setSenderEmail] = React.useState("");
  const [senderName, setSenderName] = React.useState("Julie");
  const [nestQuery, setNestQuery] = React.useState("");
  const [nestLimit, setNestLimit] = React.useState("8");
  const [maxScanPages, setMaxScanPages] = React.useState("5");
  const [presetQuery, setPresetQuery] = React.useState("account-info");
  const [saleId, setSaleId] = React.useState("61157");
  const [receiptTemplate, setReceiptTemplate] = React.useState("SaleReceipt");
  const [receiptPrint, setReceiptPrint] = React.useState(true);
  const [receiptPageWidth, setReceiptPageWidth] = React.useState("auto");
  const [receiptPageHeight, setReceiptPageHeight] = React.useState("2000mm");
  const [loadingMessage, setLoadingMessage] = React.useState<string | null>(null);

  const runGet = React.useCallback(async (path: string) => {
    setLoading(true);
    setLoadingMessage("Calling Lightspeed…");
    setError(null);
    setResult(null);
    try {
      const res = await fetch(path, {
        cache: "no-store",
        signal: AbortSignal.timeout(240_000),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Request failed.");
        setResult(data);
        return;
      }
      setResult(data);
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        setError("Request timed out after 4 minutes. Try lowering max scan pages.");
      } else {
        setError(err instanceof Error ? err.message : "Request failed.");
      }
    } finally {
      setLoading(false);
      setLoadingMessage(null);
    }
  }, []);

  const runPost = React.useCallback(async (body: Record<string, unknown>) => {
    setLoading(true);
    setLoadingMessage(
      body.action === "customer_scan" || body.action === "customer_lookup"
        ? "Running customer lookup (filters, then paginated scan)…"
        : "Calling Lightspeed…",
    );
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/lightspeed/lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(240_000),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Request failed.");
        setResult(data);
        return;
      }
      setResult(data);
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        setError("Request timed out after 4 minutes. Try lowering max scan pages.");
      } else {
        setError(err instanceof Error ? err.message : "Request failed.");
      }
    } finally {
      setLoading(false);
      setLoadingMessage(null);
    }
  }, []);

  const runCustomerLookup = React.useCallback(() => {
    void runPost({
      action: "customer_scan",
      phone: phone.trim(),
      email: email.trim(),
      name: name.trim(),
      maxScanPages: Number.parseInt(maxScanPages, 10) || 5,
    });
  }, [email, maxScanPages, name, phone, runPost]);

  const runInquiryLookup = React.useCallback(() => {
    const params = new URLSearchParams({
      mode: "inquiry",
      maxScanPages,
      senderEmail: senderEmail.trim(),
      senderName: senderName.trim(),
    });
    void runGet(`/api/lightspeed/lab?${params.toString()}`);
  }, [maxScanPages, runGet, senderEmail, senderName]);

  const runNestSearch = React.useCallback(() => {
    const params = new URLSearchParams({
      mode: "nest_search",
      q: nestQuery.trim(),
      limit: nestLimit.trim() || "8",
    });
    void runGet(`/api/lightspeed/lab?${params.toString()}`);
  }, [nestLimit, nestQuery, runGet]);

  const runStatus = React.useCallback(() => {
    void runGet("/api/lightspeed/lab?mode=status");
  }, [runGet]);

  const runPreset = React.useCallback(() => {
    const params = new URLSearchParams({
      mode: "preset",
      query: presetQuery,
    });
    void runGet(`/api/lightspeed/lab?${params.toString()}`);
  }, [presetQuery, runGet]);

  const runReceipt = React.useCallback(() => {
    const params = new URLSearchParams({
      mode: "sale_receipt",
      saleId: saleId.trim(),
      template: receiptTemplate.trim() || "SaleReceipt",
    });
    if (receiptPrint) params.set("print", "1");
    if (receiptPageWidth.trim()) params.set("page_width", receiptPageWidth.trim());
    if (receiptPageHeight.trim()) params.set("page_height", receiptPageHeight.trim());
    void runGet(`/api/lightspeed/lab?${params.toString()}`);
  }, [receiptPageHeight, receiptPageWidth, receiptPrint, receiptTemplate, runGet, saleId]);

  React.useEffect(() => {
    if (tab === "connection") void runStatus();
  }, [tab, runStatus]);

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-gray-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white">
            <Beaker className="h-4 w-4 text-gray-600" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">Lightspeed API lab</p>
            <p className="mt-1 text-sm text-gray-600">
              Test customer lookup via paginated{" "}
              <code className="text-xs">GET Customer.json?load_relations=[&quot;Contact&quot;]</code>, enquiry
              matching, Nest search, sale receipt rendering, and connection state. Results are live against your
              connected store.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              tab === item.id
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "customer" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4 rounded-md border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-900">Customer scan</p>
            <p className="text-sm text-gray-600">
              Accepts +61, 04…, or spaced numbers — normalised to Lightspeed&apos;s local format before lookup.
              Returns <code className="text-xs">firstName</code> and <code className="text-xs">lastName</code> only.
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="lab-phone">Phone</Label>
                <Input
                  id="lab-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+61428808811"
                  className="rounded-md"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lab-email">Email</Label>
                <Input
                  id="lab-email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="customer@example.com"
                  className="rounded-md"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lab-name">Name</Label>
                <Input
                  id="lab-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Julie Smith"
                  className="rounded-md"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lab-max-pages">Max scan pages</Label>
                <Input
                  id="lab-max-pages"
                  value={maxScanPages}
                  onChange={(event) => setMaxScanPages(event.target.value)}
                  className="rounded-md"
                />
              </div>
            </div>
            <Button type="button" className="rounded-md" onClick={runCustomerLookup} disabled={loading}>
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
              Run customer scan
            </Button>
          </div>
          <ResultPanel loading={loading} loadingMessage={loadingMessage} result={result} error={error} />
        </div>
      ) : null}

      {tab === "inquiry" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4 rounded-md border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-900">Enquiry sender match</p>
            <p className="text-sm text-gray-600">
              Uses the same path as the customer enquiries slide-out: scan + full inquiry context (bikes,
              workorders, sales).
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="lab-sender-email">Sender email</Label>
                <Input
                  id="lab-sender-email"
                  value={senderEmail}
                  onChange={(event) => setSenderEmail(event.target.value)}
                  placeholder="customer@gmail.com or +614…"
                  className="rounded-md"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lab-sender-name">Sender name</Label>
                <Input
                  id="lab-sender-name"
                  value={senderName}
                  onChange={(event) => setSenderName(event.target.value)}
                  placeholder="Julie"
                  className="rounded-md"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lab-inquiry-max-pages">Max scan pages</Label>
                <Input
                  id="lab-inquiry-max-pages"
                  value={maxScanPages}
                  onChange={(event) => setMaxScanPages(event.target.value)}
                  className="rounded-md"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="rounded-md" onClick={runInquiryLookup} disabled={loading}>
                {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
                Run enquiry lookup
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-md"
                disabled={loading}
                onClick={() =>
                  void runPost({
                    action: "inquiry_context",
                    senderEmail: senderEmail.trim(),
                    senderName: senderName.trim(),
                  })
                }
              >
                POST inquiry context only
              </Button>
            </div>
          </div>
          <ResultPanel loading={loading} loadingMessage={loadingMessage} result={result} error={error} />
        </div>
      ) : null}

      {tab === "nest" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4 rounded-md border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-900">Nest customer search</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="lab-nest-query">Query</Label>
                <Input
                  id="lab-nest-query"
                  value={nestQuery}
                  onChange={(event) => setNestQuery(event.target.value)}
                  placeholder="Phone, name, or partial match"
                  className="rounded-md"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lab-nest-limit">Limit</Label>
                <Input
                  id="lab-nest-limit"
                  value={nestLimit}
                  onChange={(event) => setNestLimit(event.target.value)}
                  className="rounded-md"
                />
              </div>
            </div>
            <Button type="button" className="rounded-md" onClick={runNestSearch} disabled={loading}>
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
              Run Nest search
            </Button>
          </div>
          <ResultPanel loading={loading} loadingMessage={loadingMessage} result={result} error={error} />
        </div>
      ) : null}

      {tab === "receipt" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4 rounded-md border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-900">Sale receipt</p>
            <p className="text-sm text-gray-600">
              Renders printable receipt HTML via{" "}
              <code className="text-xs">DisplayTemplate/Sale/{"{saleID}"}.html?template=SaleReceipt</code>. This
              returns rendered HTML, not structured sale JSON.
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="lab-sale-id">Sale ID</Label>
                <Input
                  id="lab-sale-id"
                  value={saleId}
                  onChange={(event) => setSaleId(event.target.value)}
                  placeholder="61157"
                  className="rounded-md"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lab-receipt-template">Template</Label>
                <Input
                  id="lab-receipt-template"
                  value={receiptTemplate}
                  onChange={(event) => setReceiptTemplate(event.target.value)}
                  placeholder="SaleReceipt"
                  className="rounded-md"
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">Print layout</p>
                  <p className="text-xs text-gray-600">Passes print=1 to Lightspeed</p>
                </div>
                <Switch checked={receiptPrint} onCheckedChange={setReceiptPrint} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lab-receipt-page-width">Page width</Label>
                  <Input
                    id="lab-receipt-page-width"
                    value={receiptPageWidth}
                    onChange={(event) => setReceiptPageWidth(event.target.value)}
                    placeholder="auto"
                    className="rounded-md"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lab-receipt-page-height">Page height</Label>
                  <Input
                    id="lab-receipt-page-height"
                    value={receiptPageHeight}
                    onChange={(event) => setReceiptPageHeight(event.target.value)}
                    placeholder="2000mm"
                    className="rounded-md"
                  />
                </div>
              </div>
            </div>
            <Button type="button" className="rounded-md" onClick={runReceipt} disabled={loading || !saleId.trim()}>
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
              Render receipt
            </Button>
          </div>
          <ReceiptResultPanel loading={loading} loadingMessage={loadingMessage} result={result} error={error} />
        </div>
      ) : null}

      {tab === "connection" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4 rounded-md border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-900">Connection &amp; cache</p>
            <p className="text-sm text-gray-600">
              Check OAuth status, rate-limit backoff, and whether the in-memory phone name index is warm.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="rounded-md" onClick={runStatus} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                )}
                Refresh status
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-md"
                disabled={loading}
                onClick={() => void runPost({ action: "warm_phone_index", maxPages: Number(maxScanPages) || 80 })}
              >
                Warm phone index
              </Button>
            </div>
          </div>
          <ResultPanel loading={loading} loadingMessage={loadingMessage} result={result} error={error} />
        </div>
      ) : null}

      {tab === "presets" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4 rounded-md border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-900">Preset API calls</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="lab-preset">Preset</Label>
                <select
                  id="lab-preset"
                  value={presetQuery}
                  onChange={(event) => setPresetQuery(event.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-white px-3 text-sm"
                >
                  <option value="account-info">Account info</option>
                  <option value="categories">Categories (first 20)</option>
                </select>
              </div>
            </div>
            <Button type="button" className="rounded-md" onClick={runPreset} disabled={loading}>
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
              Run preset
            </Button>
          </div>
          <ResultPanel loading={loading} loadingMessage={loadingMessage} result={result} error={error} />
        </div>
      ) : null}
    </div>
  );
}
