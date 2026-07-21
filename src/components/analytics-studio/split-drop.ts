import type { AnalyticsVizType, AnalyticsWorkbookElement } from "@/lib/analytics-studio/types";
import { ANALYTICS_GRID_ROW_PX } from "./constants";

export type SplitSide = "left" | "right";

export type SplitDropIntent = {
  draggedId: string;
  targetId: string;
  side: SplitSide;
};

export type LayoutSnapshot = Record<string, { x: number; y: number; w: number; h: number }>;

export type GridMetrics = {
  cols: number;
  rowHeight: number;
  margin: [number, number];
  containerPadding: [number, number];
  width: number;
};

/** Minimum columns so both panes can keep minW=2. */
const MIN_SPLIT_WIDTH = 4;

export const ELEMENT_ID_ATTR = "data-element-id";

export function minHeightForViz(viz: AnalyticsVizType): number {
  return viz === "text" ? 1 : 6;
}

export function snapshotLayouts(elements: AnalyticsWorkbookElement[]): LayoutSnapshot {
  return Object.fromEntries(
    elements.map((element) => [
      element.id,
      {
        x: element.layout.x,
        y: element.layout.y,
        w: element.layout.w,
        h: element.layout.h,
      },
    ]),
  );
}

function colWidthPx(metrics: GridMetrics): number {
  const [marginX] = metrics.margin;
  const [padX] = metrics.containerPadding;
  return (metrics.width - marginX * (metrics.cols - 1) - padX * 2) / metrics.cols;
}

/** Convert a pointer position into fractional grid coordinates. */
export function clientPointToGrid(
  clientX: number,
  clientY: number,
  gridEl: HTMLElement,
  metrics: GridMetrics,
): { x: number; y: number } | null {
  const rect = gridEl.getBoundingClientRect();
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) {
    return null;
  }

  const [marginX, marginY] = metrics.margin;
  const [padX, padY] = metrics.containerPadding;
  const colWidth = colWidthPx(metrics);
  if (colWidth <= 0) return null;

  const x = (localX - padX) / (colWidth + marginX);
  const y = (localY - padY) / (metrics.rowHeight + marginY);
  return { x, y };
}

/** Pixel box for a grid rect, relative to the react-grid-layout element. */
export function gridRectToPixels(
  rect: { x: number; y: number; w: number; h: number },
  metrics: GridMetrics,
): { left: number; top: number; width: number; height: number } {
  const [marginX, marginY] = metrics.margin;
  const [padX, padY] = metrics.containerPadding;
  const colWidth = colWidthPx(metrics);
  return {
    left: padX + rect.x * (colWidth + marginX),
    top: padY + rect.y * (metrics.rowHeight + marginY),
    width: rect.w * colWidth + Math.max(0, rect.w - 1) * marginX,
    height: rect.h * metrics.rowHeight + Math.max(0, rect.h - 1) * marginY,
  };
}

/**
 * Detect a horizontal split by mapping the pointer onto drag-start slots.
 * Uses the snapshot so RGL collision pushes do not hide the target.
 */
export function findSplitDropIntent(
  draggedId: string,
  gridX: number,
  gridY: number,
  snapshot: LayoutSnapshot,
): SplitDropIntent | null {
  let best: { id: string; area: number; side: SplitSide } | null = null;

  for (const [id, rect] of Object.entries(snapshot)) {
    if (id === draggedId) continue;
    if (rect.w < MIN_SPLIT_WIDTH) continue;
    if (gridX < rect.x || gridX >= rect.x + rect.w) continue;
    if (gridY < rect.y || gridY >= rect.y + rect.h) continue;

    const area = rect.w * rect.h;
    const relX = (gridX - rect.x) / rect.w;
    if (!best || area < best.area) {
      best = {
        id,
        area,
        side: relX < 0.5 ? "left" : "right",
      };
    }
  }

  if (!best) return null;
  return { draggedId, targetId: best.id, side: best.side };
}

function collides(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  if (a.x + a.w <= b.x) return false;
  if (a.x >= b.x + b.w) return false;
  if (a.y + a.h <= b.y) return false;
  if (a.y >= b.y + b.h) return false;
  return true;
}

/** Pack items upward without overlaps (simple vertical compact). */
export function compactElementsVertically(
  elements: AnalyticsWorkbookElement[],
): AnalyticsWorkbookElement[] {
  const sorted = [...elements].sort(
    (a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x,
  );
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
  const nextById = new Map<string, AnalyticsWorkbookElement>();

  for (const element of sorted) {
    let y = 0;
    let hit = placed.find((item) =>
      collides({ x: element.layout.x, y, w: element.layout.w, h: element.layout.h }, item),
    );
    while (hit) {
      y = hit.y + hit.h;
      hit = placed.find((item) =>
        collides({ x: element.layout.x, y, w: element.layout.w, h: element.layout.h }, item),
      );
    }
    const layout = {
      x: element.layout.x,
      y,
      w: element.layout.w,
      h: element.layout.h,
      rowPx: ANALYTICS_GRID_ROW_PX,
    };
    placed.push(layout);
    nextById.set(element.id, { ...element, layout });
  }

  return elements.map((element) => nextById.get(element.id) ?? element);
}

/**
 * Split the target's drag-start slot into two side-by-side panes.
 */
export function applyHorizontalSplit(
  elements: AnalyticsWorkbookElement[],
  intent: SplitDropIntent,
  snapshot: LayoutSnapshot,
): AnalyticsWorkbookElement[] {
  const target = elements.find((element) => element.id === intent.targetId);
  const dragged = elements.find((element) => element.id === intent.draggedId);
  const slot = snapshot[intent.targetId];
  if (!target || !dragged || !slot) return elements;
  if (slot.w < MIN_SPLIT_WIDTH) return elements;

  const { x, y, w } = slot;
  const leftW = Math.max(2, Math.floor(w / 2));
  const rightW = w - leftW;
  if (rightW < 2) return elements;

  const splitH = Math.max(
    slot.h,
    dragged.layout.h,
    minHeightForViz(target.viz),
    minHeightForViz(dragged.viz),
  );

  const left = { x, y, w: leftW, h: splitH, rowPx: ANALYTICS_GRID_ROW_PX };
  const right = {
    x: x + leftW,
    y,
    w: rightW,
    h: splitH,
    rowPx: ANALYTICS_GRID_ROW_PX,
  };

  const draggedLayout = intent.side === "left" ? left : right;
  const targetLayout = intent.side === "left" ? right : left;

  const next = elements.map((element) => {
    if (element.id === intent.draggedId) {
      return { ...element, layout: draggedLayout };
    }
    if (element.id === intent.targetId) {
      return { ...element, layout: targetLayout };
    }
    return element;
  });

  return compactElementsVertically(next);
}
