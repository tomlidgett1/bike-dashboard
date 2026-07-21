"use client";

import * as React from "react";
import { Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import {
  consumeSupplierSse,
  type SupplierLogEntry,
} from "@/lib/scrapers/supplier-logger";
import type {
  SupplierBrowseMode,
  SupplierBrowseOption,
  SupplierScrapeTarget,
} from "@/lib/scrapers/supplier-types";
import { cn } from "@/lib/utils";

interface CrawlLogLine {
  id?: string;
  timestamp?: string;
  elapsedMs?: number;
  level?: string;
  step?: string;
  message?: string;
}

interface RunProgress {
  message?: string;
  logs?: CrawlLogLine[];
  logsUpdatedAt?: string;
  scraped?: number;
  queued?: number;
  pending?: number;
  imagesProcessed?: number;
  imagesRemaining?: number;
  lastProduct?: string;
  urlsFoundSoFar?: number;
  productsScraped?: number;
  collectStage?: string;
  targetName?: string;
  pageIndex?: number;
  targetsDone?: number;
  targetsTotal?: number;
  recentUrls?: string[];
  awaitingSelection?: boolean;
}

interface CatalogueRun {
  id: string;
  status: string;
  phase: string;
  progress: RunProgress | null;
  products_found: number;
  products_upserted: number;
  images_processed?: number;
  error_message?: string | null;
  coverage_status?: string;
  authoritative_total?: number | null;
  discovered_url_count?: number;
  ingested_url_count?: number;
  failed_url_count?: number;
  unresolved_url_count?: number;
  updated_at: string;
}

interface CatalogueScrapeConfigSummary {
  supplierName?: string | null;
  browseModes: SupplierBrowseMode[];
  brandOptions: SupplierBrowseOption[];
  categoryOptions: SupplierBrowseOption[];
}

interface CatalogueListItem {
  id: string;
  name: string;
  baseUrl: string;
  status: string;
  productCount: number;
  lastRunStatus: string | null;
  lastError: string | null;
  scrapeConfig?: CatalogueScrapeConfigSummary | null;
  activeRun?: CatalogueRun | null;
  latestRun?: CatalogueRun | null;
}

function formatLogTime(timestamp?: string): string {
  if (!timestamp) return "";
  try {
    return new Date(timestamp).toLocaleTimeString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-AU").format(value);
}

function urlsCollectedCount(run: CatalogueRun | null | undefined): number {
  if (!run) return 0;
  const fromProgress =
    typeof run.progress?.urlsFoundSoFar === "number"
      ? run.progress.urlsFoundSoFar
      : 0;
  const fromFound =
    typeof run.products_found === "number" ? run.products_found : 0;
  const fromDiscovered =
    typeof run.discovered_url_count === "number" ? run.discovered_url_count : 0;
  return Math.max(fromProgress, fromFound, fromDiscovered);
}

function hasSelectableLayout(
  catalogue: CatalogueListItem,
): catalogue is CatalogueListItem & {
  scrapeConfig: CatalogueScrapeConfigSummary;
} {
  const config = catalogue.scrapeConfig;
  if (!config) return false;
  return config.brandOptions.length > 0 || config.categoryOptions.length > 0;
}

/**
 * Rebuild parent → child browse trees from flat discovered URLs.
 * e.g. /brand/focus/e-mtb/ becomes parent Focus with child E-MTB.
 * Deeper paths (/brand/focus/e-mtb/jam2/) nest under the mid-level child when present.
 */
function groupOptionsByUrlHierarchy(options: SupplierBrowseOption[]): {
  parents: SupplierBrowseOption[];
  childrenByParentId: Record<string, SupplierBrowseOption[]>;
} {
  type Parsed = {
    option: SupplierBrowseOption;
    segments: string[];
    origin: string;
  };

  const parsed: Parsed[] = [];
  for (const option of options) {
    try {
      const url = new URL(option.url);
      const segments = url.pathname
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean);
      if (segments.length === 0) continue;
      parsed.push({ option, segments, origin: url.origin });
    } catch {
      // Ignore unparseable URLs.
    }
  }

  const titleCase = (slug: string) =>
    slug
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());

  // Mid-level: /brand/{parent}/{child}/
  const brandGrouped = new Map<
    string,
    { parent: SupplierBrowseOption; children: SupplierBrowseOption[] }
  >();
  // Deep: /brand/{parent}/{child}/{leaf}/ → attach under mid child url key
  const deepByMidUrl = new Map<string, SupplierBrowseOption[]>();
  const leftovers: SupplierBrowseOption[] = [];

  for (const item of parsed) {
    const brandIndex = item.segments.findIndex(
      (segment) => segment.toLowerCase() === "brand",
    );
    if (brandIndex < 0) {
      leftovers.push(item.option);
      continue;
    }

    const depth = item.segments.length - (brandIndex + 1);
    if (depth < 2) {
      leftovers.push(item.option);
      continue;
    }

    const parentSlug = item.segments[brandIndex + 1]!;
    const parentKey = `${item.origin}/brand/${parentSlug}`.toLowerCase();

    if (depth === 2) {
      const existing = brandGrouped.get(parentKey);
      if (!existing) {
        brandGrouped.set(parentKey, {
          parent: {
            id: `group-brand-${parentSlug}`,
            kind: "brand",
            name: titleCase(parentSlug),
            url: `${item.origin}/brand/${parentSlug}/`,
            imageUrl: null,
            parentId: null,
          },
          children: [item.option],
        });
      } else {
        existing.children.push(item.option);
      }
      continue;
    }

    // depth >= 3: nest under mid-level URL brand/parent/child/
    const midUrl = `${item.origin}/brand/${parentSlug}/${item.segments[brandIndex + 2]}/`.toLowerCase();
    const deepList = deepByMidUrl.get(midUrl) ?? [];
    deepList.push(item.option);
    deepByMidUrl.set(midUrl, deepList);

    // Ensure parent brand group exists even if mid-level option is missing.
    if (!brandGrouped.has(parentKey)) {
      brandGrouped.set(parentKey, {
        parent: {
          id: `group-brand-${parentSlug}`,
          kind: "brand",
          name: titleCase(parentSlug),
          url: `${item.origin}/brand/${parentSlug}/`,
          imageUrl: null,
          parentId: null,
        },
        children: [],
      });
    }
  }

  // Attach deep leaves under matching mid-level children.
  const childrenByParentId: Record<string, SupplierBrowseOption[]> = {};
  const parents: SupplierBrowseOption[] = [];

  for (const group of brandGrouped.values()) {
    // If a mid-level page was never discovered, synthesise it from deep URLs.
    const childUrls = new Set(
      group.children.map((child) => child.url.replace(/\/$/, "").toLowerCase()),
    );
    for (const [midUrl, deepChildren] of deepByMidUrl.entries()) {
      if (!midUrl.startsWith(group.parent.url.replace(/\/$/, "").toLowerCase())) {
        continue;
      }
      if (![...childUrls].some((url) => midUrl.startsWith(url))) {
        const slug = midUrl.split("/").filter(Boolean).at(-1) || "category";
        const syntheticMid: SupplierBrowseOption = {
          id: `group-mid-${slug}-${midUrl.length}`,
          kind: "subcategory",
          name: titleCase(slug),
          url: midUrl.endsWith("/") ? midUrl : `${midUrl}/`,
          imageUrl: null,
          parentId: group.parent.id,
        };
        group.children.push(syntheticMid);
        childUrls.add(syntheticMid.url.replace(/\/$/, "").toLowerCase());
        childrenByParentId[syntheticMid.id] = deepChildren;
      }
    }

    for (const child of group.children) {
      const key = child.url.replace(/\/$/, "").toLowerCase();
      const deep = deepByMidUrl.get(key) ?? deepByMidUrl.get(`${key}/`);
      if (deep && deep.length > 0) {
        childrenByParentId[child.id] = deep;
      }
    }

    if (group.children.length === 0) continue;
    parents.push(group.parent);
    childrenByParentId[group.parent.id] = group.children;
  }

  // Name-prefix grouping (e.g. "100% Eyewear" under "100%") helps some
  // catalogues, but on FE Sports every /Shop/C_* hub is its own brand and
  // must stay a selectable parent. Nesting sibling brand hubs hides the real
  // product grids (/Shop/c_230_{id}).
  const looksLikeFesportsBrandHubs =
    leftovers.filter((option) => /\/Shop\/C_\d+\b/i.test(option.url)).length >=
    Math.max(3, Math.floor(leftovers.length * 0.5));

  const claimed = new Set<string>();
  const nameGrouped = new Map<string, SupplierBrowseOption[]>();
  if (!looksLikeFesportsBrandHubs) {
    for (const option of leftovers) {
      const name = option.name.trim();
      if (!name.includes(" ")) continue;
      const candidates = leftovers
        .filter(
          (parent) =>
            parent.id !== option.id &&
            name.toLowerCase().startsWith(`${parent.name.trim().toLowerCase()} `),
        )
        .sort((a, b) => b.name.length - a.name.length);
      const parent = candidates[0];
      if (!parent) continue;
      const list = nameGrouped.get(parent.id) ?? [];
      list.push(option);
      nameGrouped.set(parent.id, list);
      claimed.add(option.id);
    }
  }

  for (const option of leftovers) {
    if (claimed.has(option.id)) continue;
    parents.push(option);
    const children = nameGrouped.get(option.id) ?? [];
    if (children.length > 0) {
      childrenByParentId[option.id] = children;
    }
  }

  if (parents.length === 0) {
    return { parents: options, childrenByParentId: {} };
  }

  return { parents, childrenByParentId };
}

function CrawlStatusTooltip({
  label,
  run,
  fallbackError,
}: {
  label: string;
  run: CatalogueRun | null | undefined;
  fallbackError?: string | null;
}) {
  const logs = Array.isArray(run?.progress?.logs) ? run.progress.logs : [];
  const message =
    run?.progress?.message ||
    (run ? `${run.status} · ${run.phase}` : null) ||
    fallbackError ||
    "No crawl activity yet";

  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 outline-none hover:bg-gray-50"
        >
          {label.replace(/_/g, " ")}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={8}
        className="max-w-none border border-gray-200 bg-white p-0 text-gray-800 shadow-lg [&_svg]:bg-white [&_svg]:fill-white"
      >
        <div className="w-[min(28rem,calc(100vw-2rem))] rounded-md bg-white">
          <div className="border-b border-gray-100 px-3 py-2">
            <p className="text-xs font-medium text-gray-900">{message}</p>
            {run ? (
              <>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {run.products_upserted || 0} upserted
                  {typeof run.products_found === "number"
                    ? ` · ${run.products_found} found`
                    : ""}
                  {typeof run.progress?.urlsFoundSoFar === "number"
                    ? ` · ${run.progress.urlsFoundSoFar} URLs queued so far`
                    : ""}
                  {run.progress?.logsUpdatedAt
                    ? ` · logs ${formatLogTime(run.progress.logsUpdatedAt)}`
                    : run.updated_at
                      ? ` · updated ${formatLogTime(run.updated_at)}`
                      : ""}
                </p>
                {run.progress?.collectStage ? (
                  <p className="mt-1 text-[11px] text-gray-600">
                    Stage: {run.progress.collectStage}
                    {run.progress.targetName
                      ? ` · ${run.progress.targetName}`
                      : ""}
                    {typeof run.progress.pageIndex === "number"
                      ? ` · page ${run.progress.pageIndex}`
                      : ""}
                  </p>
                ) : null}
                {run.coverage_status && run.coverage_status !== "unknown" ? (
                  <p className="mt-1 text-[11px] text-gray-600">
                    Coverage: {run.coverage_status}
                    {typeof run.ingested_url_count === "number"
                      ? ` · ${run.ingested_url_count}/${run.discovered_url_count ?? 0} ingested`
                      : ""}
                    {run.authoritative_total != null
                      ? ` · supplier total ${run.authoritative_total}`
                      : " · no authoritative supplier total"}
                    {run.failed_url_count
                      ? ` · ${run.failed_url_count} failed`
                      : ""}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
          {Array.isArray(run?.progress?.recentUrls) &&
          run.progress.recentUrls.length > 0 ? (
            <div className="border-b border-gray-100 px-3 py-2">
              <p className="mb-1 text-[11px] font-medium text-gray-700">
                Latest collected URLs
              </p>
              <ul className="max-h-28 space-y-0.5 overflow-y-auto font-mono text-[10px] leading-snug text-gray-600">
                {run.progress.recentUrls.slice(-15).map((url) => (
                  <li key={url} className="truncate" title={url}>
                    {url}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="max-h-64 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
            {logs.length === 0 ? (
              <p className="text-gray-500">
                {run?.error_message ||
                  fallbackError ||
                  "Waiting for live crawl logs…"}
              </p>
            ) : (
              <ul className="space-y-1">
                {logs.slice(-100).map((entry, index) => (
                  <li
                    key={entry.id || `${entry.timestamp}-${index}`}
                    className="text-gray-700"
                  >
                    <span className="text-gray-400">
                      {formatLogTime(entry.timestamp)}
                    </span>{" "}
                    <span className="text-gray-500">[{entry.step}]</span>{" "}
                    <span className="break-all">{entry.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function mapFesportsBrandToProductGrids(
  brand: SupplierBrowseOption,
  categoryOptions: SupplierBrowseOption[],
): SupplierBrowseOption[] {
  const brandId = brand.url.match(/\/Shop\/C_(\d+)\b/i)?.[1];
  if (!brandId) return [];
  return categoryOptions
    .filter((option) =>
      new RegExp(`/Shop/c_\\d+_${brandId}\\b`, "i").test(option.url),
    )
    .map((option) => ({
      ...option,
      kind: "subcategory" as const,
      parentId: brand.id,
    }));
}

function CatalogueSelectPanel({
  catalogue,
  onStarted,
  onError,
}: {
  catalogue: CatalogueListItem & { scrapeConfig: CatalogueScrapeConfigSummary };
  onStarted: (message: string) => void;
  onError: (message: string) => void;
}) {
  const config = catalogue.scrapeConfig;
  const defaultMode: SupplierBrowseMode = (() => {
    const brandHierarchy = groupOptionsByUrlHierarchy(config.brandOptions);
    const hasBrandGroups =
      Object.keys(brandHierarchy.childrenByParentId).length > 0;
    if (hasBrandGroups) return "brand";
    // FE Sports and similar: prefer brands when both lists exist so product
    // grids can nest under brand hubs (category mode is usually leaf listings).
    if (config.brandOptions.length > 0) return "brand";
    if (
      config.browseModes.includes("category") &&
      config.categoryOptions.length > 0
    ) {
      return "category";
    }
    return "category";
  })();

  const [browseMode, setBrowseMode] =
    React.useState<SupplierBrowseMode>(defaultMode);
  const [optionSearch, setOptionSearch] = React.useState("");
  const [selectedOptionIds, setSelectedOptionIds] = React.useState<Set<string>>(
    new Set(),
  );
  const [selectedSubcategoryIds, setSelectedSubcategoryIds] = React.useState<
    Set<string>
  >(new Set());
  const [expandedParentIds, setExpandedParentIds] = React.useState<Set<string>>(
    new Set(),
  );
  // Browser discoveries only; never overwrite config-derived children.
  const [apiChildrenByParent, setApiChildrenByParent] = React.useState<
    Record<string, SupplierBrowseOption[]>
  >({});
  const [loadingParentIds, setLoadingParentIds] = React.useState<Set<string>>(
    new Set(),
  );
  const [subDiscoveryProgress, setSubDiscoveryProgress] = React.useState<{
    done: number;
    total: number;
  } | null>(null);
  const [isDiscoveringSubs, setIsDiscoveringSubs] = React.useState(false);
  const [discoveryLogs, setDiscoveryLogs] = React.useState<
    Array<{ id: string; message: string; level?: string }>
  >([]);
  const [hasRunDiscovery, setHasRunDiscovery] = React.useState(false);
  const [isStarting, setIsStarting] = React.useState(false);
  const discoveryLogEndRef = React.useRef<HTMLDivElement | null>(null);

  const hierarchy = React.useMemo(
    () =>
      groupOptionsByUrlHierarchy(
        browseMode === "brand" ? config.brandOptions : config.categoryOptions,
      ),
    [browseMode, config.brandOptions, config.categoryOptions],
  );

  const nestedByParent = React.useMemo(() => {
    const merged: Record<string, SupplierBrowseOption[]> = {
      ...hierarchy.childrenByParentId,
    };

    // FE Sports: brand hubs map to product grids already in categoryOptions.
    if (browseMode === "brand" && config.categoryOptions.length > 0) {
      for (const brand of hierarchy.parents) {
        const related = mapFesportsBrandToProductGrids(
          brand,
          config.categoryOptions,
        );
        if (related.length > 0) {
          merged[brand.id] = related;
        }
      }
    }

    // Explicit discovery results win over config/hierarchy guesses.
    for (const [parentId, children] of Object.entries(apiChildrenByParent)) {
      merged[parentId] = children;
    }
    return merged;
  }, [
    hierarchy.childrenByParentId,
    hierarchy.parents,
    apiChildrenByParent,
    browseMode,
    config.categoryOptions,
  ]);

  const availableOptions = hierarchy.parents;

  const filteredOptions = availableOptions.filter((option) => {
    const query = optionSearch.trim().toLowerCase();
    if (!query) return true;
    if (option.name.toLowerCase().includes(query)) return true;
    return (nestedByParent[option.id] ?? []).some((child) =>
      child.name.toLowerCase().includes(query),
    );
  });

  const changeBrowseMode = (mode: SupplierBrowseMode) => {
    setBrowseMode(mode);
    setSelectedOptionIds(new Set());
    setSelectedSubcategoryIds(new Set());
    setExpandedParentIds(new Set());
    setApiChildrenByParent({});
    setOptionSearch("");
    setDiscoveryLogs([]);
    setSubDiscoveryProgress(null);
    setHasRunDiscovery(false);
    setLoadingParentIds(new Set());
  };

  const childrenOf = (parentId: string) => nestedByParent[parentId] ?? [];

  const pushDiscoveryLog = React.useCallback(
    (message: string, level = "info") => {
      setDiscoveryLogs((current) => [
        ...current,
        {
          id: `${Date.now()}-${current.length}-${Math.random().toString(36).slice(2, 7)}`,
          message,
          level,
        },
      ]);
    },
    [],
  );

  React.useEffect(() => {
    discoveryLogEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [discoveryLogs]);

  const toggleOption = (optionId: string) => {
    setSelectedOptionIds((current) => {
      const next = new Set(current);
      if (next.has(optionId)) {
        next.delete(optionId);
        setExpandedParentIds((expanded) => {
          const nextExpanded = new Set(expanded);
          nextExpanded.delete(optionId);
          return nextExpanded;
        });
        setSelectedSubcategoryIds((subs) => {
          const nextSubs = new Set(subs);
          for (const category of childrenOf(optionId)) {
            nextSubs.delete(category.id);
            for (const deep of childrenOf(category.id)) {
              nextSubs.delete(deep.id);
            }
          }
          return nextSubs;
        });
      } else {
        next.add(optionId);
        setExpandedParentIds((expanded) => new Set(expanded).add(optionId));
        const children = childrenOf(optionId);
        if (children.length > 0) {
          setSelectedSubcategoryIds((subs) => {
            const nextSubs = new Set(subs);
            for (const child of children) nextSubs.add(child.id);
            return nextSubs;
          });
        }
      }
      return next;
    });
  };

  const toggleVisibleOptions = () => {
    const allSelected =
      filteredOptions.length > 0 &&
      filteredOptions.every((option) => selectedOptionIds.has(option.id));
    setSelectedOptionIds((current) => {
      const next = new Set(current);
      for (const option of filteredOptions) {
        if (allSelected) next.delete(option.id);
        else next.add(option.id);
      }
      return next;
    });
    if (!allSelected) {
      setExpandedParentIds((expanded) => {
        const next = new Set(expanded);
        for (const option of filteredOptions) next.add(option.id);
        return next;
      });
      setSelectedSubcategoryIds((subs) => {
        const nextSubs = new Set(subs);
        for (const option of filteredOptions) {
          for (const child of childrenOf(option.id)) nextSubs.add(child.id);
        }
        return nextSubs;
      });
    }
  };

  const startNestedDiscovery = async () => {
    const ids = [...selectedOptionIds].filter((id) => !id.startsWith("group-"));
    if (ids.length === 0) {
      onError(`Select at least one ${browseMode} first.`);
      return;
    }

    setIsDiscoveringSubs(true);
    setHasRunDiscovery(true);
    setDiscoveryLogs([]);
    setSubDiscoveryProgress({ done: 0, total: ids.length });
    setLoadingParentIds(new Set(ids));
    pushDiscoveryLog(
      `Starting nested discovery for ${ids.length} ${browseMode}${ids.length === 1 ? "" : "s"}…`,
    );

    const applyChildren = (
      batch: string[],
      categoriesByOption: Record<string, SupplierBrowseOption[]>,
    ) => {
      setApiChildrenByParent((current) => {
        const next = { ...current };
        for (const id of batch) {
          next[id] = categoriesByOption[id] ?? [];
        }
        return next;
      });
      setSelectedSubcategoryIds((subs) => {
        const nextSubs = new Set(subs);
        for (const id of batch) {
          for (const child of categoriesByOption[id] ?? []) {
            nextSubs.add(child.id);
          }
        }
        return nextSubs;
      });
      setExpandedParentIds((expanded) => {
        const next = new Set(expanded);
        for (const id of batch) next.add(id);
        return next;
      });
    };

    try {
      // Fast path: FE Sports brand → product grid from discovered layout.
      const mapped: Record<string, SupplierBrowseOption[]> = {};
      const needApi: string[] = [];
      if (browseMode === "brand" && config.categoryOptions.length > 0) {
        for (const id of ids) {
          const brand =
            hierarchy.parents.find((option) => option.id === id) ||
            config.brandOptions.find((option) => option.id === id);
          if (!brand) {
            needApi.push(id);
            continue;
          }
          const related = mapFesportsBrandToProductGrids(
            brand,
            config.categoryOptions,
          );
          if (related.length > 0) {
            mapped[id] = related;
            pushDiscoveryLog(
              `${brand.name}: mapped ${related.length} product categor${related.length === 1 ? "y" : "ies"} → ${related.map((item) => item.name).join(", ")}`,
              "success",
            );
          } else {
            needApi.push(id);
            pushDiscoveryLog(
              `${brand.name}: no product grid in layout, will open brand page`,
            );
          }
        }
      } else {
        needApi.push(...ids);
      }

      const mappedIds = Object.keys(mapped);
      if (mappedIds.length > 0) {
        applyChildren(mappedIds, mapped);
        setLoadingParentIds((current) => {
          const next = new Set(current);
          for (const id of mappedIds) next.delete(id);
          return next;
        });
        setSubDiscoveryProgress({
          done: mappedIds.length,
          total: ids.length,
        });
      }

      let completed = mappedIds.length;
      for (let i = 0; i < needApi.length; i += 10) {
        const batch = needApi.slice(i, i + 10);
        const batchNames = batch
          .map(
            (id) =>
              hierarchy.parents.find((option) => option.id === id)?.name ?? id,
          )
          .join(", ");
        pushDiscoveryLog(`Opening supplier pages for: ${batchNames}`);

        const response = await fetch(
          `/api/admin/supplier-catalogue/${catalogue.id}/browse-categories`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            body: JSON.stringify({ mode: browseMode, optionIds: batch }),
          },
        );

        const contentType = response.headers.get("content-type") ?? "";
        let categoriesByOption: Record<string, SupplierBrowseOption[]> = {};

        if (contentType.includes("text/event-stream")) {
          const payload = await consumeSupplierSse<{
            event: "result";
            categoriesByOption?: Record<string, SupplierBrowseOption[]>;
            categoriesByBrand?: Record<string, SupplierBrowseOption[]>;
          }>(
            response,
            (entry: SupplierLogEntry) => {
              pushDiscoveryLog(entry.message, entry.level);
            },
          );
          categoriesByOption =
            payload.categoriesByOption ?? payload.categoriesByBrand ?? {};
        } else {
          const payload = (await response.json()) as {
            error?: string;
            categoriesByOption?: Record<string, SupplierBrowseOption[]>;
            categoriesByBrand?: Record<string, SupplierBrowseOption[]>;
          };
          if (!response.ok) {
            throw new Error(payload.error || "Could not load categories.");
          }
          categoriesByOption =
            payload.categoriesByOption ?? payload.categoriesByBrand ?? {};
        }

        for (const id of batch) {
          if (!(id in categoriesByOption)) categoriesByOption[id] = [];
          const parent = hierarchy.parents.find((option) => option.id === id);
          const count = (categoriesByOption[id] ?? []).length;
          pushDiscoveryLog(
            `${parent?.name ?? id}: found ${count} nested option${count === 1 ? "" : "s"}`,
            count > 0 ? "success" : "info",
          );
        }

        applyChildren(batch, categoriesByOption);
        completed += batch.length;
        setSubDiscoveryProgress({ done: completed, total: ids.length });
        setLoadingParentIds((current) => {
          const next = new Set(current);
          for (const id of batch) next.delete(id);
          return next;
        });
      }

      pushDiscoveryLog(
        `Nested discovery complete (${completed}/${ids.length}).`,
        "success",
      );
    } catch (loadError) {
      pushDiscoveryLog(
        loadError instanceof Error
          ? loadError.message
          : "Could not load nested categories.",
        "error",
      );
      onError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load nested categories.",
      );
    } finally {
      setIsDiscoveringSubs(false);
      setLoadingParentIds(new Set());
      setSubDiscoveryProgress(null);
    }
  };
  const buildScrapeTargets = (): SupplierScrapeTarget[] => {
    const targets: SupplierScrapeTarget[] = [];
    const pushTarget = (
      item: SupplierBrowseOption,
      labelPrefix?: string,
    ) => {
      targets.push({
        id: item.id,
        name: labelPrefix ? `${labelPrefix} · ${item.name}` : item.name,
        url: item.url,
        parentId: item.parentId ?? null,
      });
    };

    for (const parentId of selectedOptionIds) {
      const parent = availableOptions.find((option) => option.id === parentId);
      if (!parent) continue;
      const children = childrenOf(parentId);
      const selectedChildren = children.filter((child) =>
        selectedSubcategoryIds.has(child.id),
      );

      if (children.length === 0) {
        pushTarget(parent);
        continue;
      }

      for (const child of selectedChildren) {
        const deep = childrenOf(child.id);
        const selectedDeep = deep.filter((item) =>
          selectedSubcategoryIds.has(item.id),
        );
        if (deep.length > 0 && selectedDeep.length > 0) {
          for (const item of selectedDeep) {
            pushTarget(item, `${parent.name} · ${child.name}`);
          }
        } else {
          pushTarget(child, parent.name);
        }
      }
    }
    return targets;
  };

  const canStartScoped = (() => {
    if (selectedOptionIds.size === 0) return false;
    for (const parentId of selectedOptionIds) {
      if (loadingParentIds.has(parentId)) return false;
      const children = childrenOf(parentId);
      if (children.length === 0) continue;
      if (!children.some((child) => selectedSubcategoryIds.has(child.id))) {
        return false;
      }
    }
    return true;
  })();

  const startCrawl = async (body: Record<string, unknown>, fallback: string) => {
    setIsStarting(true);
    try {
      const response = await fetch(
        `/api/admin/supplier-catalogue/${catalogue.id}/crawl`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || fallback);
      }
      onStarted(payload.message || fallback);
    } catch (startError) {
      onError(startError instanceof Error ? startError.message : fallback);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-md border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">
            Select what to crawl
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {availableOptions.length} groups from discovered layout. FE Sports
            brands show their product grid underneath. Use discovery to refresh
            or dig deeper.
          </p>
        </div>
        <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
          {config.categoryOptions.length > 0 ? (
            <button
              type="button"
              onClick={() => changeBrowseMode("category")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                browseMode === "category"
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              By category
            </button>
          ) : null}
          {config.brandOptions.length > 0 ? (
            <button
              type="button"
              onClick={() => changeBrowseMode("brand")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                browseMode === "brand"
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              By brand
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={optionSearch}
          onChange={(event) => setOptionSearch(event.target.value)}
          placeholder={`Search ${browseMode === "brand" ? "brands" : "categories"}`}
          className="w-56 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-200"
        />
        <button
          type="button"
          onClick={toggleVisibleOptions}
          disabled={filteredOptions.length === 0}
          className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {filteredOptions.every((option) => selectedOptionIds.has(option.id)) &&
          filteredOptions.length > 0
            ? "Deselect shown"
            : "Select shown"}
        </button>
        <span className="text-xs text-gray-500">
          {selectedOptionIds.size} selected
        </span>
        <button
          type="button"
          disabled={selectedOptionIds.size === 0 || isDiscoveringSubs}
          onClick={() => void startNestedDiscovery()}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm",
            selectedOptionIds.size === 0 || isDiscoveringSubs
              ? "opacity-50"
              : "hover:bg-gray-800",
          )}
        >
          {isDiscoveringSubs ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Discovering…
            </>
          ) : browseMode === "brand" ? (
            "Start nested brand discovery"
          ) : (
            "Start subcategory discovery"
          )}
        </button>
      </div>

      {isDiscoveringSubs || hasRunDiscovery || discoveryLogs.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {isDiscoveringSubs ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
              ) : null}
              <p className="text-sm font-medium text-gray-900">
                {isDiscoveringSubs
                  ? "Nested discovery in progress"
                  : "Nested discovery log"}
              </p>
            </div>
            {subDiscoveryProgress ? (
              <span className="text-xs tabular-nums text-gray-600">
                {subDiscoveryProgress.done} / {subDiscoveryProgress.total}
              </span>
            ) : null}
          </div>
          {subDiscoveryProgress ? (
            <Progress
              className="h-2"
              value={
                subDiscoveryProgress.total > 0
                  ? Math.round(
                      (subDiscoveryProgress.done /
                        subDiscoveryProgress.total) *
                        100,
                    )
                  : 0
              }
            />
          ) : null}
          <div className="max-h-48 overflow-y-auto rounded-md border border-gray-100 bg-white px-3 py-2 font-mono text-[11px] leading-relaxed">
            {discoveryLogs.length === 0 ? (
              <p className="text-gray-500">Waiting for discovery logs…</p>
            ) : (
              <ul className="space-y-1">
                {discoveryLogs.map((entry) => (
                  <li
                    key={entry.id}
                    className={cn(
                      "break-all text-gray-700",
                      entry.level === "error" && "text-red-700",
                      entry.level === "success" && "text-gray-900",
                    )}
                  >
                    <span className="text-gray-400">
                      [{entry.level || "info"}]
                    </span>{" "}
                    {entry.message}
                  </li>
                ))}
              </ul>
            )}
            <div ref={discoveryLogEndRef} />
          </div>
        </div>
      ) : selectedOptionIds.size > 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-600 shadow-sm">
          {selectedOptionIds.size} selected. Press{" "}
          <span className="font-medium text-gray-800">
            {browseMode === "brand"
              ? "Start nested brand discovery"
              : "Start subcategory discovery"}
          </span>{" "}
          to load nested options with live progress.
        </div>
      ) : null}

      <div className="max-h-96 space-y-2 overflow-y-auto rounded-md border border-gray-200 bg-white p-3">
        {filteredOptions.map((option) => {
          const isSelected = selectedOptionIds.has(option.id);
          const children = childrenOf(option.id);
          const isExpanded = expandedParentIds.has(option.id) || isSelected;
          const isDiscovering = loadingParentIds.has(option.id);
          return (
            <div
              key={option.id}
              className="rounded-md border border-gray-200 bg-white"
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleOption(option.id)}
                />
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium text-gray-900"
                  onClick={() => {
                    setExpandedParentIds((current) => {
                      const next = new Set(current);
                      if (next.has(option.id)) next.delete(option.id);
                      else next.add(option.id);
                      return next;
                    });
                  }}
                >
                  {option.name}
                </button>
                {isDiscovering ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-gray-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    finding…
                  </span>
                ) : children.length > 0 ? (
                  <span className="shrink-0 text-[11px] text-gray-500">
                    {children.length} nested
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-gray-400">
                    leaf
                  </span>
                )}
              </div>

              {isExpanded && children.length > 0 ? (
                <div className="space-y-2 border-t border-gray-100 px-3 py-2">
                  {children.map((child) => {
                    const deep = childrenOf(child.id);
                    const childSelected = selectedSubcategoryIds.has(child.id);
                    return (
                      <div key={child.id} className="space-y-1">
                        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            checked={childSelected}
                            onChange={() => {
                              setSelectedSubcategoryIds((current) => {
                                const next = new Set(current);
                                if (next.has(child.id)) {
                                  next.delete(child.id);
                                  for (const item of deep) next.delete(item.id);
                                } else {
                                  next.add(child.id);
                                  for (const item of deep) next.add(item.id);
                                }
                                return next;
                              });
                              if (!selectedOptionIds.has(option.id)) {
                                setSelectedOptionIds((current) =>
                                  new Set(current).add(option.id),
                                );
                              }
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {child.name}
                          </span>
                          {deep.length > 0 ? (
                            <span className="text-[10px] text-gray-400">
                              {deep.length}
                            </span>
                          ) : null}
                        </label>
                        {childSelected && deep.length > 0 ? (
                          <div className="ml-5 grid gap-1 sm:grid-cols-2">
                            {deep.map((item) => {
                              const deepSelected = selectedSubcategoryIds.has(
                                item.id,
                              );
                              return (
                                <label
                                  key={item.id}
                                  className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-100 px-2 py-1 text-[11px] text-gray-600"
                                >
                                  <input
                                    type="checkbox"
                                    checked={deepSelected}
                                    onChange={() => {
                                      setSelectedSubcategoryIds((current) => {
                                        const next = new Set(current);
                                        if (next.has(item.id)) next.delete(item.id);
                                        else next.add(item.id);
                                        return next;
                                      });
                                    }}
                                  />
                                  <span className="truncate">{item.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        {filteredOptions.length === 0 ? (
          <p className="text-sm text-gray-500">
            No {browseMode === "brand" ? "brands" : "categories"} match.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          disabled={!canStartScoped || isStarting}
          onClick={() =>
            void startCrawl(
              {
                mode: browseMode,
                scrapeTargets: buildScrapeTargets(),
              },
              "Scoped crawl started.",
            )
          }
          className={cn(
            "rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm",
            !canStartScoped || isStarting ? "opacity-50" : "hover:bg-gray-800",
          )}
        >
          {isStarting ? "Starting…" : "Crawl selected"}
        </button>
        <button
          type="button"
          disabled={isStarting}
          onClick={() =>
            void startCrawl(
              { entireCatalogue: true },
              "Full catalogue crawl started.",
            )
          }
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Crawl entire catalogue
        </button>
      </div>
    </div>
  );
}

/**
 * Allowlisted managers (admins + Ashburton Cycles, etc.) can add B2B
 * suppliers into the shared catalogue. API enforces access.
 */
export function StoreSharedCatalogueIngest() {
  const [baseUrl, setBaseUrl] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [catalogues, setCatalogues] = React.useState<CatalogueListItem[]>([]);
  const [forbidden, setForbidden] = React.useState(false);
  const [selectingId, setSelectingId] = React.useState<string | null>(null);

  const loadCatalogues = React.useCallback(async () => {
    const response = await fetch("/api/admin/supplier-catalogue");
    if (response.status === 403 || response.status === 401) {
      setForbidden(true);
      return;
    }
    if (!response.ok) return;
    const payload = (await response.json()) as {
      catalogues?: CatalogueListItem[];
    };
    setCatalogues(payload.catalogues ?? []);
    setForbidden(false);
  }, []);

  React.useEffect(() => {
    void loadCatalogues();
  }, [loadCatalogues]);

  const hasActiveCrawl = catalogues.some((catalogue) => catalogue.activeRun);
  React.useEffect(() => {
    if (!hasActiveCrawl) return;
    const timer = window.setInterval(() => {
      void loadCatalogues();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasActiveCrawl, loadCatalogues]);

  // Auto-open select panel when layout discovery finishes for a catalogue.
  React.useEffect(() => {
    if (selectingId) return;
    const ready = catalogues.find(
      (catalogue) =>
        !catalogue.activeRun &&
        hasSelectableLayout(catalogue) &&
        (catalogue.latestRun?.progress?.awaitingSelection ||
          catalogue.status === "ready"),
    );
    if (ready) setSelectingId(ready.id);
  }, [catalogues, selectingId]);

  if (forbidden) {
    return (
      <div className="mx-6 my-6 rounded-md border border-gray-200 bg-white px-5 py-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">
          Shared supplier catalogue
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Catalogue managers can add B2B suppliers here. Use{" "}
          <a
            href="/settings/store/supplier-lookup"
            className="font-medium text-gray-800 underline-offset-2 hover:underline"
          >
            Supplier Lookup
          </a>{" "}
          to search the shared catalogue.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div className="mx-6 my-6 space-y-4">
        <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">
            Add supplier to shared catalogue
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Discover the B2B layout first, then choose brands/categories to crawl
            (same idea as Supplier scrapers). Full-catalogue crawls are still
            available but can take hours.
          </p>

          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void (async () => {
                setIsSubmitting(true);
                setError(null);
                setMessage(null);
                try {
                  const response = await fetch("/api/admin/supplier-catalogue", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      baseUrl,
                      username,
                      password,
                      name: name || undefined,
                      discoverOnly: true,
                    }),
                  });
                  const payload = (await response.json()) as {
                    error?: string;
                    message?: string;
                    catalogueId?: string;
                  };
                  if (!response.ok) {
                    throw new Error(payload.error || "Failed to start discovery");
                  }
                  setMessage(
                    payload.message ||
                      "Discovering layout. You can select what to crawl when it finishes.",
                  );
                  setPassword("");
                  if (payload.catalogueId) setSelectingId(payload.catalogueId);
                  await loadCatalogues();
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Discovery failed",
                  );
                } finally {
                  setIsSubmitting(false);
                }
              })();
            }}
          >
            <label className="sm:col-span-2 block text-sm">
              <span className="mb-1 block font-medium text-gray-700">
                B2B website URL
              </span>
              <input
                required
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://supplier.example.com"
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-200"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Login</span>
              <input
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-200"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">
                Password
              </span>
              <input
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-200"
              />
            </label>
            <label className="sm:col-span-2 block text-sm">
              <span className="mb-1 block font-medium text-gray-700">
                Supplier name (optional)
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="FE Sports"
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-200"
              />
            </label>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className={cn(
                  "rounded-md bg-gray-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors",
                  isSubmitting ? "opacity-60" : "hover:bg-gray-800",
                )}
              >
                {isSubmitting ? "Discovering…" : "Discover layout"}
              </button>
              {message ? (
                <span className="text-sm text-gray-600">{message}</span>
              ) : null}
              {error ? (
                <span className="text-sm text-gray-700">{error}</span>
              ) : null}
            </div>
          </form>
        </div>

        {catalogues.length > 0 ? (
          <div className="rounded-md border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3 text-sm font-medium text-gray-800">
              Shared catalogues
            </div>
            <ul className="divide-y divide-gray-100">
              {catalogues.map((catalogue) => {
                const run = catalogue.activeRun || catalogue.latestRun;
                const urlCount = urlsCollectedCount(run);
                const showUrlBadge =
                  Boolean(catalogue.activeRun) || urlCount > 0;
                const canSelect =
                  !catalogue.activeRun && hasSelectableLayout(catalogue);
                const isSelecting = selectingId === catalogue.id && canSelect;

                return (
                  <li key={catalogue.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">
                          {catalogue.name}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {catalogue.baseUrl}
                        </p>
                        {catalogue.activeRun ? (
                          <p className="mt-1 text-xs text-gray-600">
                            {catalogue.activeRun.progress?.message ||
                              `Running (${catalogue.activeRun.phase})`}
                            {` · ${
                              catalogue.activeRun.products_upserted ||
                              catalogue.activeRun.progress?.productsScraped ||
                              0
                            } saved`}
                          </p>
                        ) : catalogue.lastError ? (
                          <p className="mt-1 text-xs text-gray-600">
                            {catalogue.lastError}
                          </p>
                        ) : hasSelectableLayout(catalogue) ? (
                          <p className="mt-1 text-xs text-gray-600">
                            Layout ready ·{" "}
                            {catalogue.scrapeConfig!.brandOptions.length} brands ·{" "}
                            {catalogue.scrapeConfig!.categoryOptions.length}{" "}
                            categories
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                        {showUrlBadge ? (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums",
                              catalogue.activeRun
                                ? "border-gray-200 bg-white text-gray-800 shadow-sm"
                                : "border-gray-200 bg-white text-gray-600",
                            )}
                            title="Total product URLs collected for this crawl"
                          >
                            {formatCount(urlCount)} URL
                            {urlCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        <CrawlStatusTooltip
                          label={
                            catalogue.activeRun
                              ? catalogue.activeRun.phase === "discovering" &&
                                catalogue.activeRun.progress?.collectStage
                                ? "crawling"
                                : catalogue.activeRun.phase
                              : catalogue.status
                          }
                          run={run}
                          fallbackError={catalogue.lastError}
                        />
                        <span>
                          {formatCount(
                            Math.max(
                              catalogue.productCount,
                              catalogue.activeRun?.products_upserted || 0,
                              catalogue.activeRun?.progress?.productsScraped ||
                                0,
                            ),
                          )}{" "}
                          products
                        </span>
                        {catalogue.activeRun ? (
                          <button
                            type="button"
                            className="rounded-md border border-gray-200 bg-white px-2.5 py-1 font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                            onClick={() => {
                              void (async () => {
                                setError(null);
                                setMessage(null);
                                const response = await fetch(
                                  `/api/admin/supplier-catalogue/${catalogue.id}/stop`,
                                  { method: "POST" },
                                );
                                const payload = (await response.json()) as {
                                  error?: string;
                                  message?: string;
                                };
                                if (!response.ok) {
                                  setError(
                                    payload.error || "Failed to stop crawl",
                                  );
                                } else {
                                  setMessage(
                                    payload.message || "Crawl stopped.",
                                  );
                                }
                                await loadCatalogues();
                              })();
                            }}
                          >
                            Stop crawl
                          </button>
                        ) : null}
                        {canSelect ? (
                          <button
                            type="button"
                            className="rounded-md border border-gray-200 bg-white px-2.5 py-1 font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                            onClick={() =>
                              setSelectingId((current) =>
                                current === catalogue.id ? null : catalogue.id,
                              )
                            }
                          >
                            {isSelecting ? "Hide selection" : "Select & crawl"}
                          </button>
                        ) : null}
                        {!catalogue.activeRun && !hasSelectableLayout(catalogue) ? (
                          <button
                            type="button"
                            className="rounded-md border border-gray-200 bg-white px-2.5 py-1 font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                            onClick={() => {
                              void (async () => {
                                await fetch(
                                  `/api/admin/supplier-catalogue/${catalogue.id}/crawl`,
                                  {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({ discoverOnly: true }),
                                  },
                                );
                                await loadCatalogues();
                              })();
                            }}
                          >
                            Discover layout
                          </button>
                        ) : null}
                        {!catalogue.activeRun && hasSelectableLayout(catalogue) ? (
                          <button
                            type="button"
                            className="rounded-md border border-gray-200 bg-white px-2.5 py-1 font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                            onClick={() => {
                              void (async () => {
                                await fetch(
                                  `/api/admin/supplier-catalogue/${catalogue.id}/crawl`,
                                  {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      entireCatalogue: true,
                                    }),
                                  },
                                );
                                await loadCatalogues();
                              })();
                            }}
                          >
                            Entire catalogue
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {isSelecting && hasSelectableLayout(catalogue) ? (
                      <CatalogueSelectPanel
                        catalogue={catalogue}
                        onStarted={(startedMessage) => {
                          setMessage(startedMessage);
                          setError(null);
                          setSelectingId(null);
                          void loadCatalogues();
                        }}
                        onError={(startedError) => {
                          setError(startedError);
                        }}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
