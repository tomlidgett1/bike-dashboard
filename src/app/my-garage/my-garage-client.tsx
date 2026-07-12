"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bike,
  Calendar,
  Check,
  Mail,
  MessageSquare,
  ReceiptText,
  Users,
  Wrench,
} from "@/components/layout/app-sidebar/dashboard-icons";
import type { MyGarageConsent, MyGaragePayload } from "@/lib/crm/my-garage";
import { cn } from "@/lib/utils";

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md bg-white p-4 ring-1 ring-black/[0.06] sm:p-5">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {description ? <p className="mt-1 text-xs text-gray-500">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function IconChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
      {children}
    </span>
  );
}

function PreferenceRow({
  token,
  channel,
  purpose,
  label,
  description,
  initialGranted,
}: {
  token: string;
  channel: MyGarageConsent["channel"];
  purpose: MyGarageConsent["purpose"];
  label: string;
  description: string;
  initialGranted: boolean;
}) {
  const [granted, setGranted] = React.useState(initialGranted);
  const [saving, startSaving] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const update = () => {
    const next = !granted;
    setGranted(next);
    setError(null);
    startSaving(async () => {
      const response = await fetch("/api/my-garage/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, channel, purpose, granted: next }),
      });
      if (!response.ok) {
        setGranted(!next);
        const body = await response.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? "Could not save this preference.");
      }
    });
  };

  return (
    <div className="border-b border-gray-100 py-3 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={granted}
          disabled={saving}
          onClick={update}
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2",
            granted ? "bg-gray-900" : "bg-gray-200",
            saving && "opacity-60",
          )}
        >
          <span
            className={cn(
              "absolute top-1 h-5 w-5 rounded-md bg-white shadow-sm transition-transform",
              granted ? "translate-x-6" : "translate-x-1",
            )}
          />
          <span className="sr-only">{granted ? "Turn off" : "Turn on"} {label}</span>
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

function CommunityEventRow({
  token,
  event,
}: {
  token: string;
  event: MyGaragePayload["communityEvents"][number];
}) {
  const [registered, setRegistered] = React.useState(event.registered);
  const [saving, startSaving] = React.useTransition();

  const toggle = () => {
    const next = !registered;
    setRegistered(next);
    startSaving(async () => {
      const response = await fetch("/api/my-garage/community", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, eventId: event.id, registered: next }),
      });
      if (!response.ok) setRegistered(!next);
    });
  };

  return (
    <div className="flex items-start gap-3 border-b border-gray-100 py-3 last:border-0">
      <IconChip><Calendar className="h-4 w-4" /></IconChip>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{event.title}</p>
        <p className="mt-0.5 text-xs text-gray-500">{formatDate(event.startsAt)}</p>
        {event.description ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-600">{event.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={toggle}
        className={cn(
          "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2",
          registered
            ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
            : "bg-gray-900 text-white hover:bg-gray-800",
          saving && "opacity-60",
        )}
      >
        {registered ? <Check className="h-3.5 w-3.5" /> : null}
        {registered ? "Going" : "Join"}
      </button>
    </div>
  );
}

export function MyGarageClient({
  token,
  payload,
}: {
  token: string;
  payload: MyGaragePayload;
}) {
  const consentStatus = new Map(
    payload.consents.map((consent) => [`${consent.channel}:${consent.purpose}`, consent.status]),
  );

  return (
    <main className="min-h-dvh bg-gray-50 px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-md bg-white p-5 ring-1 ring-black/[0.06] sm:p-6">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-gray-400">
            {payload.store.name}
          </p>
          <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                {payload.customer.displayName}&apos;s garage
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                Your bikes, workshop updates and relationship with {payload.store.name}.
              </p>
            </div>
            <Link
              href={`/marketplace/store/${payload.store.ownerUserId}`}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-gray-900 px-4 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
            >
              Visit the store
            </Link>
          </div>
        </header>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Section
              title="Your bikes"
              description="Service dates and details shared by your bike store."
            >
              {payload.bikes.length === 0 ? (
                <p className="text-sm text-gray-500">No bikes have been linked yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {payload.bikes.map((bike) => (
                    <article key={bike.id} className="rounded-md bg-gray-50 p-3 ring-1 ring-black/[0.04]">
                      <div className="flex items-start gap-3">
                        <IconChip><Bike className="h-4 w-4" /></IconChip>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{bike.label}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {bike.isEbike ? "E-bike" : "Bike"}
                            {bike.colour ? ` · ${bike.colour}` : ""}
                          </p>
                          {bike.serialNumber ? (
                            <p className="mt-2 truncate font-mono text-[11px] text-gray-500">
                              Serial {bike.serialNumber}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs text-gray-600">
                            Next service: <span className="font-medium text-gray-900">{formatDate(bike.nextServiceDueAt)}</span>
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Section>

            <Section
              title="Workshop"
              description="The latest status is shown here as the workshop updates your job."
            >
              {payload.workorders.length === 0 ? (
                <p className="text-sm text-gray-500">No active workshop jobs.</p>
              ) : (
                <div>
                  {payload.workorders.map((workorder) => (
                    <article key={workorder.id} className="flex items-start gap-3 border-b border-gray-100 py-3 first:pt-0 last:border-0 last:pb-0">
                      <IconChip><Wrench className="h-4 w-4" /></IconChip>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">{workorder.title}</p>
                          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                            {workorder.statusLabel ?? workorder.status.replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {workorder.number ? `Job ${workorder.number} · ` : ""}
                          Updated {formatDate(workorder.updatedAt)}
                        </p>
                        {workorder.promisedAt ? (
                          <p className="mt-1 text-xs text-gray-600">Expected {formatDate(workorder.promisedAt)}</p>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Recent activity">
              {payload.events.length === 0 ? (
                <p className="text-sm text-gray-500">Your activity will appear here.</p>
              ) : (
                <div>
                  {payload.events.map((event) => (
                    <article key={event.id} className="flex items-start gap-3 border-b border-gray-100 py-3 first:pt-0 last:border-0 last:pb-0">
                      <IconChip><ReceiptText className="h-4 w-4" /></IconChip>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{event.title}</p>
                        <p className="mt-0.5 text-xs text-gray-600">{event.summary}</p>
                        <p className="mt-1 text-[11px] text-gray-400">{formatDate(event.occurredAt)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <aside className="space-y-4">
            {payload.loyalty.enabled ? (
              <Section title={payload.loyalty.name}>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-3xl font-semibold tabular-nums text-gray-900">
                      {payload.loyalty.points.toLocaleString("en-AU")}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Available points</p>
                  </div>
                  <IconChip><Check className="h-4 w-4" /></IconChip>
                </div>
              </Section>
            ) : null}

            <Section title="Communication preferences" description="Choose how the store may keep in touch.">
              <PreferenceRow
                token={token}
                channel="email"
                purpose="marketing"
                label="Email updates"
                description="Relevant products, events and rider offers."
                initialGranted={consentStatus.get("email:marketing") === "granted"}
              />
              <PreferenceRow
                token={token}
                channel="sms"
                purpose="marketing"
                label="Text updates"
                description="Occasional rider offers by text message."
                initialGranted={consentStatus.get("sms:marketing") === "granted"}
              />
              <PreferenceRow
                token={token}
                channel="email"
                purpose="community"
                label="Community invitations"
                description="Group rides, clinics and local events."
                initialGranted={consentStatus.get("email:community") === "granted"}
              />
              <div className="mt-3 rounded-md bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-500">
                Service and payment messages may still be sent when needed to complete work you requested.
              </div>
            </Section>

            <Section title="Community">
              {payload.communityEvents.length === 0 ? (
                <div className="flex items-start gap-3">
                  <IconChip><Users className="h-4 w-4" /></IconChip>
                  <p className="text-sm text-gray-500">No upcoming events yet.</p>
                </div>
              ) : (
                <div>
                  {payload.communityEvents.map((event) => (
                    <CommunityEventRow key={event.id} token={token} event={event} />
                  ))}
                </div>
              )}
            </Section>

            <section className="rounded-md bg-white p-4 text-xs text-gray-500 ring-1 ring-black/[0.06]">
              <div className="flex gap-2">
                <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{payload.customer.email ?? "No email recorded"}</span>
              </div>
              <div className="mt-2 flex gap-2">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{payload.customer.phone ?? "No mobile recorded"}</span>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
