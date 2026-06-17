"use client";

import * as React from "react";
import { AlertCircle, Loader2, Send } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { GmailLogo } from "@/components/genie/gmail-logo";
import {
  defaultPdfEmailBody,
  defaultPdfEmailSubject,
  sanitisePdfFilename,
} from "@/lib/genie/pdf-request";
import { blobToBase64, generateReportPdfBlob } from "@/lib/genie/generate-report-pdf";

export function SendPdfDialog({
  open,
  onOpenChange,
  reportElement,
  getReportElement,
  reportTitle,
  defaultRecipientEmail,
  onGmailConnectNeeded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportElement?: HTMLElement | null;
  getReportElement?: () => HTMLElement | null;
  reportTitle: string;
  defaultRecipientEmail?: string | null;
  onGmailConnectNeeded?: () => void;
}) {
  const [recipientEmail, setRecipientEmail] = React.useState(defaultRecipientEmail ?? "");
  const [subject, setSubject] = React.useState(defaultPdfEmailSubject(reportTitle));
  const [body, setBody] = React.useState(defaultPdfEmailBody(reportTitle));
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setRecipientEmail(defaultRecipientEmail ?? "");
    setSubject(defaultPdfEmailSubject(reportTitle));
    setBody(defaultPdfEmailBody(reportTitle));
    setStatus("idle");
    setErrorMessage("");
  }, [open, defaultRecipientEmail, reportTitle]);

  const sendPdf = async () => {
    const recipient = recipientEmail.trim();
    if (!recipient) {
      setStatus("error");
      setErrorMessage("Enter a recipient email address.");
      return;
    }

    setStatus("sending");
    setErrorMessage("");
    try {
      let element = getReportElement?.() ?? reportElement ?? null;
      if (!element) {
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        element = getReportElement?.() ?? reportElement ?? null;
      }
      if (!element) {
        setStatus("error");
        setErrorMessage("The report is not ready yet. Try again in a moment.");
        return;
      }

      const pdfBlob = await generateReportPdfBlob(element);
      const pdfBase64 = await blobToBase64(pdfBlob);
      const response = await fetch("/api/genie/send-report-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_email: recipient,
          subject: subject.trim(),
          body: body.trim(),
          filename: sanitisePdfFilename(reportTitle),
          pdf_base64: pdfBase64,
          action: "send",
        }),
      });
      const data = await response.json().catch(() => null);
      if (response.status === 409) {
        onGmailConnectNeeded?.();
        setStatus("error");
        setErrorMessage(data?.error || "Connect Gmail before sending.");
        return;
      }
      if (!response.ok || !data?.ok) {
        setStatus("error");
        setErrorMessage(data?.error || "Could not send the PDF email.");
        return;
      }
      setStatus("sent");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Could not send the PDF email.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="animate-in fade-in duration-200"
        className="animate-in slide-in-from-bottom-4 zoom-in-95 rounded-md border border-slate-200 bg-white p-0 shadow-xl duration-300 ease-out sm:max-w-lg"
        showCloseButton={status !== "sending"}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/[0.06]">
              <GmailLogo />
            </span>
            <p className="text-sm font-semibold tracking-tight text-gray-900">Gmail</p>
          </div>
          <DialogHeader className="text-left">
            <DialogTitle className="text-base font-semibold text-slate-900">Send PDF via Gmail</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Attach the generated report and send it from your connected Gmail account.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="send-pdf-recipient" className="text-xs font-medium text-slate-600">
              To
            </Label>
            <Input
              id="send-pdf-recipient"
              type="email"
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
              placeholder="name@example.com"
              disabled={status === "sending" || status === "sent"}
              className="rounded-md"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="send-pdf-subject" className="text-xs font-medium text-slate-600">
              Subject
            </Label>
            <Input
              id="send-pdf-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              disabled={status === "sending" || status === "sent"}
              className="rounded-md"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="send-pdf-body" className="text-xs font-medium text-slate-600">
              Message
            </Label>
            <Textarea
              id="send-pdf-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              disabled={status === "sending" || status === "sent"}
              className="rounded-md resize-none"
            />
          </div>

          {status === "sent" ? (
            <div className="rounded-md border border-emerald-200 bg-white px-3 py-2.5 text-sm text-emerald-700">
              PDF sent to {recipientEmail.trim()}.
            </div>
          ) : null}

          {status === "error" && errorMessage ? (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-white px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={status === "sending"}
            className="rounded-md"
          >
            {status === "sent" ? "Close" : "Cancel"}
          </Button>
          {status !== "sent" ? (
            <Button
              type="button"
              onClick={sendPdf}
              disabled={status === "sending"}
              className={cn(
                "rounded-md bg-slate-900 text-white hover:bg-slate-700",
                status === "sending" && "opacity-70",
              )}
            >
              {status === "sending" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send PDF
                </>
              )}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
