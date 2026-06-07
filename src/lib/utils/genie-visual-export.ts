interface GenieTableColumn {
  key: string;
  label: string;
}

interface GenieTableExportPayload {
  title: string;
  columns: GenieTableColumn[];
  rows: Array<Record<string, string | number | null>>;
}

interface GeniePivotExportPayload {
  title: string;
  rowLabel: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<{
    row_label: string;
    cells: Record<string, number | null>;
    total?: number | null;
  }>;
  column_totals?: Record<string, number | null>;
  grand_total?: number | null;
}

function slugifyFilename(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "export";
}

function escapeCsvCell(value: string | number | null | undefined) {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function triggerDownload(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function tableToCsv(table: GenieTableExportPayload) {
  const header = table.columns.map((column) => escapeCsvCell(column.label)).join(",");
  const body = table.rows
    .map((row) =>
      table.columns.map((column) => escapeCsvCell(row[column.key])).join(","),
    )
    .join("\n");

  return `${header}\n${body}`;
}

export function downloadTableCsv(table: GenieTableExportPayload) {
  const csv = tableToCsv(table);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(URL.createObjectURL(blob), `${slugifyFilename(table.title)}.csv`);
}

export function pivotTableToCsv(table: GeniePivotExportPayload) {
  const headers = [table.rowLabel, ...table.columns.map((column) => column.label)];
  if (table.column_totals) headers.push("Total");

  const body = table.rows.map((row) => {
    const cells = [
      escapeCsvCell(row.row_label),
      ...table.columns.map((column) => escapeCsvCell(row.cells[column.key])),
    ];
    if (table.column_totals) cells.push(escapeCsvCell(row.total));
    return cells.join(",");
  });

  if (table.column_totals) {
    const totalRow = [
      escapeCsvCell("Total"),
      ...table.columns.map((column) => escapeCsvCell(table.column_totals?.[column.key])),
    ];
    if (table.column_totals) totalRow.push(escapeCsvCell(table.grand_total));
    body.push(totalRow.join(","));
  }

  return `${headers.map((header) => escapeCsvCell(header)).join(",")}\n${body.join("\n")}`;
}

export function downloadPivotTableCsv(table: {
  title: string;
  row_fields: Array<{ label: string }>;
  columns: GeniePivotExportPayload["columns"];
  rows: GeniePivotExportPayload["rows"];
  column_totals?: GeniePivotExportPayload["column_totals"];
  grand_total?: number | null;
}) {
  const csv = pivotTableToCsv({
    title: table.title,
    rowLabel: table.row_fields.map((field) => field.label).join(" / "),
    columns: table.columns,
    rows: table.rows,
    column_totals: table.column_totals,
    grand_total: table.grand_total,
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(URL.createObjectURL(blob), `${slugifyFilename(table.title)}.csv`);
}

const SVG_PRESENTATION_ATTRS = [
  "fill",
  "stroke",
  "stroke-width",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "color",
] as const;

function copyComputedSvgPresentation(from: Element, to: Element) {
  if (!(from instanceof SVGElement) || !(to instanceof SVGElement)) return;

  const computed = getComputedStyle(from);
  for (const attr of SVG_PRESENTATION_ATTRS) {
    const value = computed.getPropertyValue(attr);
    if (!value || value === "none" || value === "rgba(0, 0, 0, 0)") continue;
    to.setAttribute(attr, value);
  }

  const fromChildren = Array.from(from.children);
  const toChildren = Array.from(to.children);
  for (let index = 0; index < fromChildren.length; index += 1) {
    if (toChildren[index]) {
      copyComputedSvgPresentation(fromChildren[index], toChildren[index]);
    }
  }
}

async function svgElementToPng(
  svg: SVGElement,
  width: number,
  height: number,
): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGElement;
  copyComputedSvgPresentation(svg, clone);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(Math.ceil(width)));
  clone.setAttribute("height", String(Math.ceil(height)));

  const svgData = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to render chart image"));
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available");

    context.scale(scale, scale);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Failed to create PNG"));
          return;
        }
        resolve(blob);
      }, "image/png");
    });

    return pngBlob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function downloadChartCardAsPng(options: {
  cardEl: HTMLElement;
  title: string;
  subtitle?: string;
}) {
  const chartCanvas = options.cardEl.querySelector("canvas");
  const chartSvg = options.cardEl.querySelector("svg");
  const chartEl = chartCanvas ?? chartSvg;
  if (!chartEl) throw new Error("Chart not ready");

  const padding = 24;
  const titleLineHeight = 22;
  const subtitleLineHeight = 18;
  const headerGap = 12;
  const headerHeight =
    titleLineHeight + (options.subtitle ? subtitleLineHeight : 0) + headerGap;

  const chartRect = chartEl.getBoundingClientRect();
  const width = Math.ceil(chartRect.width + padding * 2);
  const height = Math.ceil(headerHeight + chartRect.height + padding);

  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");

  context.scale(scale, scale);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#171717";
  context.font = "600 16px system-ui, -apple-system, sans-serif";
  context.fillText(options.title, padding, padding + 16);

  if (options.subtitle) {
    context.fillStyle = "#737373";
    context.font = "12px system-ui, -apple-system, sans-serif";
    context.fillText(options.subtitle, padding, padding + titleLineHeight + 4);
  }

  if (chartCanvas instanceof HTMLCanvasElement) {
    context.drawImage(chartCanvas, padding, headerHeight, chartRect.width, chartRect.height);
  } else if (chartSvg instanceof SVGElement) {
    const chartPng = await svgElementToPng(chartSvg, chartRect.width, chartRect.height);
    const chartUrl = URL.createObjectURL(chartPng);

    try {
      const chartImage = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to compose chart image"));
        img.src = chartUrl;
      });

      context.drawImage(chartImage, padding, headerHeight, chartRect.width, chartRect.height);
    } finally {
      URL.revokeObjectURL(chartUrl);
    }
  }

  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to create PNG"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });

  triggerDownload(URL.createObjectURL(pngBlob), `${slugifyFilename(options.title)}.png`);
}
