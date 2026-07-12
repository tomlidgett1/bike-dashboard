import {
  Bike,
  Mail,
  MessageSquareText,
  NotebookPen,
  ReceiptText,
  Wrench,
} from "lucide-react";
import type { CrmCustomerEvent } from "@/components/crm/types";
import { formatCrmDateTime } from "@/components/crm/types";

function EventIcon({ kind }: { kind: string }) {
  const className = "h-3.5 w-3.5";
  if (kind === "purchase") return <ReceiptText className={className} aria-hidden />;
  if (kind === "workorder") return <Wrench className={className} aria-hidden />;
  if (kind === "email" || kind === "sms") return <Mail className={className} aria-hidden />;
  if (kind === "enquiry" || kind === "call") {
    return <MessageSquareText className={className} aria-hidden />;
  }
  if (kind === "bike") return <Bike className={className} aria-hidden />;
  return <NotebookPen className={className} aria-hidden />;
}

export function TimelineEvent({ event }: { event: CrmCustomerEvent }) {
  return (
    <article className="group relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
      <span className="absolute bottom-0 left-[0.95rem] top-8 w-px bg-gray-200 group-last:hidden" />
      <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-500 ring-1 ring-inset ring-gray-200">
        <EventIcon kind={event.kind} />
      </span>
      <div className="min-w-0 pt-0.5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h3 className="text-sm font-medium text-gray-900">{event.title}</h3>
          <time className="text-xs text-gray-500" dateTime={event.occurredAt}>
            {formatCrmDateTime(event.occurredAt)}
          </time>
        </div>
        {event.summary ? (
          <p className="mt-1 text-sm leading-5 text-gray-600">{event.summary}</p>
        ) : null}
        <p className="mt-1.5 text-xs capitalize text-gray-400">
          {event.source.replaceAll("_", " ")}
          {event.actorLabel ? ` · ${event.actorLabel}` : ""}
        </p>
      </div>
    </article>
  );
}
