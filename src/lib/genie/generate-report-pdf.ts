"use client";

const UNSUPPORTED_COLOR_FN = /\b(?:lab|oklch|oklab|lch)\(/i;

const CANVAS_STYLE_PROPS = [
  "accent-color",
  "background",
  "background-color",
  "background-image",
  "border",
  "border-bottom",
  "border-bottom-color",
  "border-color",
  "border-left",
  "border-left-color",
  "border-right",
  "border-right-color",
  "border-top",
  "border-top-color",
  "box-shadow",
  "caret-color",
  "color",
  "column-rule-color",
  "fill",
  "outline",
  "outline-color",
  "stroke",
  "text-decoration",
  "text-decoration-color",
  "font",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
  "white-space",
  "word-break",
  "overflow-wrap",
  "display",
  "flex",
  "flex-direction",
  "flex-wrap",
  "align-items",
  "justify-content",
  "gap",
  "grid-template-columns",
  "width",
  "min-width",
  "max-width",
  "height",
  "min-height",
  "max-height",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "border-radius",
  "border-width",
  "border-style",
  "opacity",
  "visibility",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "overflow",
  "table-layout",
  "border-collapse",
  "vertical-align",
] as const;

function stripUnsupportedStylesheets(clonedDocument: Document) {
  clonedDocument.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    node.parentNode?.removeChild(node);
  });
}

function safeCSSValue(computed: CSSStyleDeclaration, property: string): string | null {
  const value = computed.getPropertyValue(property).trim();
  if (!value || value === "initial" || value === "inherit" || value === "unset") return null;
  if (UNSUPPORTED_COLOR_FN.test(value)) {
    if (property === "background-image") return "none";
    if (property === "box-shadow" && value !== "none") return "none";
    return null;
  }
  return value;
}

/** html2canvas cannot parse Tailwind v4 lab()/oklch() tokens from stylesheets. */
export function syncComputedStylesForCanvasCapture(
  sourceRoot: HTMLElement,
  cloneRoot: HTMLElement,
) {
  const sourceNodes = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll("*"))];
  const cloneNodes = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll("*"))];

  cloneNodes.forEach((clone, index) => {
    const source = sourceNodes[index];
    if (!(clone instanceof HTMLElement) || !(source instanceof HTMLElement)) return;

    const computed = window.getComputedStyle(source);
    for (const property of CANVAS_STYLE_PROPS) {
      const value = safeCSSValue(computed, property);
      if (value) {
        clone.style.setProperty(property, value);
      }
    }

    if (source instanceof SVGElement && clone instanceof SVGElement) {
      const fill = safeCSSValue(computed, "fill");
      const stroke = safeCSSValue(computed, "stroke");
      if (fill) clone.setAttribute("fill", fill);
      if (stroke) clone.setAttribute("stroke", stroke);
    }
  });
}

/** Generate a PDF blob from a rendered Genie report element. */
export async function generateReportPdfBlob(element: HTMLElement): Promise<Blob> {
  const html2pdf = (await import("html2pdf.js")).default;
  const worker = html2pdf()
    .set({
      margin: [12, 12, 12, 12],
      filename: "genie-report.pdf",
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        onclone: (clonedDocument: Document, clonedElement: HTMLElement) => {
          stripUnsupportedStylesheets(clonedDocument);
          syncComputedStylesForCanvasCapture(element, clonedElement);
        },
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    })
    .from(element);

  const blob = await worker.outputPdf("blob");
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error("Could not generate the PDF.");
  }
  return blob;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
