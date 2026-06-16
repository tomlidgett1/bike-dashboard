import type { ReactNode } from "react";
import { PageContainer } from "@/components/dashboard";
import {
  FloatingCard,
  FloatingCardPage,
  FloatingCardPageBody,
  FloatingCardPageHeader,
} from "@/components/layout/floating-card-page";
import { cn } from "@/lib/utils";

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-gray-100", className)}
      aria-hidden
    />
  );
}

function SkeletonShell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}

/** Default wide settings page — storefront managers, optimise, account settings, etc. */
export function StoreSettingsRouteSkeleton() {
  return (
    <SkeletonShell label="Loading page">
      <PageContainer size="wide">
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <SkeletonBlock className="h-8 w-44 sm:w-56" />
              <SkeletonBlock className="h-4 w-full max-w-md" />
            </div>
            <SkeletonBlock className="h-8 w-28 shrink-0" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <SkeletonBlock className="h-28" />
            <SkeletonBlock className="h-28" />
            <SkeletonBlock className="h-28 sm:col-span-2 xl:col-span-1" />
          </div>

          <SkeletonBlock className="h-72" />
        </div>
      </PageContainer>
    </SkeletonShell>
  );
}

/** Products bulk optimise — floating card + stats toolbar + scrollable batch list. */
export function ProductsOptimiseRouteSkeleton() {
  return (
    <SkeletonShell label="Loading optimise workspace">
      <FloatingCardPage>
        <FloatingCardPageHeader>
          <div className="flex min-h-9 items-center justify-between gap-3">
            <SkeletonBlock className="h-7 w-40" />
            <SkeletonBlock className="h-8 w-32" />
          </div>
        </FloatingCardPageHeader>

        <FloatingCardPageBody>
          <FloatingCard>
            <div className="shrink-0 rounded-t-xl border-b border-border/60 bg-gray-50 px-4 py-3 md:px-5">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <SkeletonBlock className="h-14" />
                <SkeletonBlock className="h-14" />
                <SkeletonBlock className="h-14" />
                <SkeletonBlock className="h-14" />
              </div>
              <SkeletonBlock className="mt-3 h-9 w-full max-w-md" />
            </div>
            <div className="min-h-0 flex-1 space-y-2 px-4 py-4 md:px-5">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-24 w-full" />
              ))}
            </div>
          </FloatingCard>
        </FloatingCardPageBody>
      </FloatingCardPage>
    </SkeletonShell>
  );
}

/** Full-height products catalogue. */
export function ProductsRouteSkeleton() {
  return (
    <SkeletonShell label="Loading products">
      <FloatingCardPage>
        <FloatingCardPageHeader>
          <div className="flex min-h-9 items-center justify-between gap-3">
            <SkeletonBlock className="h-7 w-32" />
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-8 w-28" />
              <SkeletonBlock className="h-8 w-28" />
            </div>
          </div>
        </FloatingCardPageHeader>

        <FloatingCardPageBody>
          <FloatingCard>
            <div className="flex flex-col gap-2 rounded-t-xl border-b border-border/60 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center md:px-5">
              <SkeletonBlock className="h-9 w-full sm:max-w-[360px]" />
              <div className="flex flex-wrap items-center gap-2">
                <SkeletonBlock className="h-9 w-[190px]" />
                <SkeletonBlock className="h-9 w-[160px]" />
                <SkeletonBlock className="h-9 w-24" />
              </div>
            </div>

            <div className="min-h-0 flex-1 px-4 py-3 md:px-5">
              <SkeletonBlock className="mb-3 h-9 w-full" />
              <div className="space-y-2">
                {Array.from({ length: 12 }).map((_, index) => (
                  <SkeletonBlock key={index} className="h-12 w-full" />
                ))}
              </div>
            </div>
          </FloatingCard>
        </FloatingCardPageBody>
      </FloatingCardPage>
    </SkeletonShell>
  );
}

/** Customer enquiries — floating card + filter tabs + table. */
export function CustomerEnquiriesRouteSkeleton() {
  return (
    <SkeletonShell label="Loading customer enquiries">
      <FloatingCardPage>
        <FloatingCardPageHeader>
          <div className="flex min-h-9 items-center justify-between gap-3">
            <SkeletonBlock className="h-7 w-44" />
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-8 w-28" />
              <SkeletonBlock className="h-8 w-24" />
            </div>
          </div>
        </FloatingCardPageHeader>

        <FloatingCardPageBody>
          <FloatingCard>
            <div className="flex shrink-0 flex-col gap-2 rounded-t-xl border-b border-border/60 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
              <SkeletonBlock className="h-8 w-72" />
              <SkeletonBlock className="h-8 w-32" />
            </div>
            <div className="min-h-0 flex-1 px-4 py-3 md:px-5">
              <SkeletonBlock className="mb-3 h-9 w-full" />
              <div className="space-y-2">
                {Array.from({ length: 10 }).map((_, index) => (
                  <SkeletonBlock key={index} className="h-11 w-full" />
                ))}
              </div>
            </div>
          </FloatingCard>
        </FloatingCardPageBody>
      </FloatingCardPage>
    </SkeletonShell>
  );
}

/** Nest + legacy inbox — two-pane layout. */
export function DashboardInboxRouteSkeleton() {
  return (
    <SkeletonShell label="Loading inbox">
      <PageContainer
        size="full"
        className="flex h-full min-h-0 flex-col overflow-hidden !p-0 !pt-2.5"
      >
        <div className="flex min-h-0 flex-1 flex-col px-2 sm:px-3 lg:px-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <SkeletonBlock className="h-7 w-44" />
            <SkeletonBlock className="h-8 w-28" />
          </div>
          <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
            <SkeletonBlock className="hidden w-72 shrink-0 md:block" />
            <SkeletonBlock className="min-h-0 flex-1" />
          </div>
        </div>
      </PageContainer>
    </SkeletonShell>
  );
}

/** Store home — genie chat surface. */
export function DashboardHomeRouteSkeleton() {
  return (
    <SkeletonShell label="Loading home">
      <PageContainer
        size="full"
        className="flex h-full min-h-0 flex-col overflow-hidden !p-0 !pt-2.5"
      >
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-4 sm:px-3 lg:px-4">
          <SkeletonBlock className="mb-6 h-5 w-56" />
          <div className="space-y-3">
            <SkeletonBlock className="h-24 w-full max-w-2xl" />
            <SkeletonBlock className="h-16 w-full max-w-xl" />
          </div>
          <div className="mt-auto pt-6">
            <SkeletonBlock className="mx-auto h-12 w-full max-w-3xl" />
          </div>
        </div>
      </PageContainer>
    </SkeletonShell>
  );
}

/** Actions — header toolbar + bento grid. */
export function DashboardActionsRouteSkeleton() {
  return (
    <SkeletonShell label="Loading actions">
      <PageContainer size="full" className="!p-0 !pt-2.5 !pb-6">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col px-2 sm:px-3 lg:px-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <SkeletonBlock className="h-8 w-32" />
            <SkeletonBlock className="h-8 w-36" />
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <SkeletonBlock className="h-40 w-full" />
              <SkeletonBlock className="h-56 w-full" />
            </div>
            <SkeletonBlock className="h-[min(420px,calc(100vh-7rem))] w-full" />
          </div>
        </div>
      </PageContainer>
    </SkeletonShell>
  );
}

/** Data, purchases, listings — filter bar + data table. */
export function DashboardTableRouteSkeleton() {
  return (
    <SkeletonShell label="Loading table">
      <PageContainer size="wide">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SkeletonBlock className="h-8 w-40" />
            <div className="flex gap-2">
              <SkeletonBlock className="h-9 w-28" />
              <SkeletonBlock className="h-9 w-28" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <SkeletonBlock className="h-9 w-full max-w-sm" />
            <SkeletonBlock className="h-9 w-32" />
            <SkeletonBlock className="h-9 w-32" />
          </div>
          <div className="overflow-hidden rounded-md border border-gray-200/80 bg-white">
            <SkeletonBlock className="h-10 w-full rounded-none" />
            <div className="space-y-0 divide-y divide-gray-100 p-1">
              {Array.from({ length: 10 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-11 w-full rounded-none" />
              ))}
            </div>
          </div>
        </div>
      </PageContainer>
    </SkeletonShell>
  );
}

/** Lightspeed connect — metrics strip + inventory table. */
export function ConnectLightspeedRouteSkeleton() {
  return (
    <SkeletonShell label="Loading Lightspeed">
      <div className="space-y-3">
        <div className="border-b border-border bg-background px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <SkeletonBlock className="h-6 w-48" />
              <SkeletonBlock className="h-4 w-64" />
            </div>
            <div className="flex gap-2">
              <SkeletonBlock className="h-9 w-24" />
              <SkeletonBlock className="h-9 w-24" />
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-16" />
            ))}
          </div>
        </div>
        <div className="space-y-3 px-6 py-3">
          <SkeletonBlock className="h-20 w-full" />
          <SkeletonBlock className="h-10 w-full" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    </SkeletonShell>
  );
}

/** Marketplace help centre — simple content shell. */
export function MarketplaceHelpRouteSkeleton() {
  return (
    <SkeletonShell label="Loading help">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <SkeletonBlock className="h-9 w-56" />
        <SkeletonBlock className="h-4 w-full max-w-xl" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-32" />
        </div>
      </div>
    </SkeletonShell>
  );
}
