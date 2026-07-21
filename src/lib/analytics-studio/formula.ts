import type { AnalyticsSource } from "./catalog";
import type { AnalyticsAggFn, AnalyticsMeasure } from "./types";

/** Canonical function names shown in the formula bar and autocomplete. */
export const FORMULA_FUNCTIONS: Array<{
  name: string;
  agg: AnalyticsAggFn;
  needsColumn: boolean;
  aliases?: string[];
}> = [
  { name: "Sum", agg: "sum", needsColumn: true },
  { name: "Avg", agg: "avg", needsColumn: true },
  { name: "Median", agg: "median", needsColumn: true },
  { name: "Min", agg: "min", needsColumn: true },
  { name: "Max", agg: "max", needsColumn: true },
  { name: "Count", agg: "count", needsColumn: true },
  {
    name: "CountDistinct",
    agg: "count_distinct",
    needsColumn: true,
    aliases: ["Ndv"],
  },
  { name: "StdDev", agg: "stddev", needsColumn: true },
];

const FN_BY_ALIAS = new Map<string, (typeof FORMULA_FUNCTIONS)[number]>();
for (const fn of FORMULA_FUNCTIONS) {
  FN_BY_ALIAS.set(fn.name.toLowerCase(), fn);
  for (const alias of fn.aliases ?? []) {
    FN_BY_ALIAS.set(alias.toLowerCase(), fn);
  }
}

function displayColumnRef(source: AnalyticsSource | undefined, columnKey: string): string {
  if (columnKey === "*") return "*";
  const column = source?.columns.find((item) => item.key === columnKey);
  return column?.label ?? columnKey;
}

function resolveColumnRef(
  raw: string,
  source: AnalyticsSource | undefined,
): { column?: string; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Missing column reference." };
  if (trimmed === "*") return { column: "*" };

  const unwrapped = trimmed.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!unwrapped) return { error: "Empty column reference." };

  if (!source) {
    // Allow keys through when the source catalog is not loaded yet.
    return { column: unwrapped };
  }

  const byKey = source.columns.find(
    (column) => column.key.toLowerCase() === unwrapped.toLowerCase(),
  );
  if (byKey) return { column: byKey.key };

  const byLabel = source.columns.find(
    (column) => column.label.toLowerCase() === unwrapped.toLowerCase(),
  );
  if (byLabel) return { column: byLabel.key };

  return { error: `Unknown column "${unwrapped}".` };
}

/** Serialise a measure to a formula string for the fx bar. */
export function measureToFormula(
  measure: AnalyticsMeasure,
  source?: AnalyticsSource,
): string {
  if (measure.formula?.trim()) return measure.formula.trim();

  const fn =
    FORMULA_FUNCTIONS.find((item) => item.agg === measure.agg)?.name
    ?? measure.agg;
  if (measure.column === "*" && measure.agg === "count") {
    return "Count(*)";
  }
  const ref = displayColumnRef(source, measure.column);
  const bracketed = ref === "*" ? "*" : `[${ref}]`;
  return `${fn}(${bracketed})`;
}

export type ParseMeasureFormulaResult =
  | { ok: true; measure: AnalyticsMeasure }
  | { ok: false; error: string };

/**
 * Parse a core aggregate formula into an AnalyticsMeasure.
 * Supports CountDistinct([col]), count(distinct [col]), Count(*), Sum([col]), etc.
 */
export function parseMeasureFormula(
  text: string,
  source?: AnalyticsSource,
): ParseMeasureFormulaResult {
  const raw = text.trim();
  if (!raw) return { ok: false, error: "Enter a formula, e.g. Sum([Total])." };

  // Sugar: count(distinct [col]) → CountDistinct([col])
  const distinctSugar = raw.match(
    /^count\s*\(\s*distinct\s+(\[[^\]]+\]|[a-zA-Z0-9_.]+|\*)\s*\)$/i,
  );
  if (distinctSugar) {
    const resolved = resolveColumnRef(distinctSugar[1]!, source);
    if (resolved.error || !resolved.column) {
      return { ok: false, error: resolved.error ?? "Invalid column." };
    }
    if (resolved.column === "*") {
      return { ok: false, error: "CountDistinct needs a column, not *." };
    }
    const formula = `CountDistinct([${displayColumnRef(source, resolved.column)}])`;
    return {
      ok: true,
      measure: {
        agg: "count_distinct",
        column: resolved.column,
        formula,
      },
    };
  }

  const match = raw.match(
    /^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*(\[[^\]]+\]|[a-zA-Z0-9_.]+|\*)\s*\)$/,
  );
  if (!match) {
    return {
      ok: false,
      error: "Use Function([Column]), e.g. Sum([Total]) or CountDistinct([Customer]).",
    };
  }

  const fnName = match[1]!.toLowerCase();
  const arg = match[2]!;
  const fn = FN_BY_ALIAS.get(fnName);
  if (!fn) {
    return {
      ok: false,
      error: `Unknown function "${match[1]}". Try Sum, Avg, Count, CountDistinct, Min, Max, Median, or StdDev.`,
    };
  }

  const resolved = resolveColumnRef(arg, source);
  if (resolved.error || !resolved.column) {
    return { ok: false, error: resolved.error ?? "Invalid column." };
  }

  if (resolved.column === "*" && fn.agg !== "count") {
    return { ok: false, error: `${fn.name} needs a column, not *.` };
  }

  if (
    fn.agg !== "count"
    && fn.agg !== "count_distinct"
    && fn.agg !== "min"
    && fn.agg !== "max"
    && source
  ) {
    const column = source.columns.find((item) => item.key === resolved.column);
    if (column && column.type !== "number") {
      return {
        ok: false,
        error: `${fn.name} requires a number column.`,
      };
    }
  }

  const displayRef =
    resolved.column === "*"
      ? "*"
      : `[${displayColumnRef(source, resolved.column)}]`;
  const formula = `${fn.name}(${displayRef})`;

  return {
    ok: true,
    measure: {
      agg: fn.agg,
      column: resolved.column,
      formula,
    },
  };
}

export type FormulaSuggestion =
  | { kind: "function"; insert: string; label: string; detail: string }
  | { kind: "column"; insert: string; label: string; detail: string };

/** Autocomplete suggestions based on caret position in the formula text. */
export function formulaSuggestions(
  text: string,
  caret: number,
  source?: AnalyticsSource,
): FormulaSuggestion[] {
  const before = text.slice(0, Math.max(0, caret));
  const openBracket = before.lastIndexOf("[");
  const closeBracket = before.lastIndexOf("]");
  const openParen = before.lastIndexOf("(");

  // Inside [ … ] → column suggestions
  if (openBracket > closeBracket) {
    const partial = before.slice(openBracket + 1).toLowerCase();
    const columns = source?.columns ?? [];
    return columns
      .filter(
        (column) =>
          !partial
          || column.label.toLowerCase().includes(partial)
          || column.key.toLowerCase().includes(partial),
      )
      .slice(0, 12)
      .map((column) => ({
        kind: "column" as const,
        insert: `${column.label}]`,
        label: column.label,
        detail: column.key,
      }));
  }

  // After Function( with empty/partial arg starting without [
  if (openParen >= 0 && openParen > openBracket) {
    const afterParen = before.slice(openParen + 1).trimStart();
    if (!afterParen || /^[a-zA-Z0-9_.]*$/.test(afterParen)) {
      const partial = afterParen.toLowerCase();
      const columns = source?.columns ?? [];
      const columnHits = columns
        .filter(
          (column) =>
            !partial
            || column.label.toLowerCase().includes(partial)
            || column.key.toLowerCase().includes(partial),
        )
        .slice(0, 10)
        .map((column) => ({
          kind: "column" as const,
          insert: `[${column.label}]`,
          label: `[${column.label}]`,
          detail: column.key,
        }));
      if (partial === "" || "*".startsWith(partial) || "all".includes(partial)) {
        columnHits.unshift({
          kind: "column",
          insert: "*",
          label: "*",
          detail: "All rows (Count only)",
        });
      }
      return columnHits;
    }
  }

  // Function name at start / after whitespace
  const fnPartialMatch = before.match(/([a-zA-Z_][a-zA-Z0-9_]*)?$/);
  const partial = (fnPartialMatch?.[1] ?? "").toLowerCase();
  return FORMULA_FUNCTIONS.filter(
    (fn) =>
      !partial
      || fn.name.toLowerCase().startsWith(partial)
      || (fn.aliases ?? []).some((alias) => alias.toLowerCase().startsWith(partial)),
  ).map((fn) => ({
    kind: "function" as const,
    insert: `${fn.name}(`,
    label: fn.name,
    detail: fn.agg.replace(/_/g, " "),
  }));
}

/** Replace the token being typed with the suggestion insert text. */
export function applyFormulaSuggestion(
  text: string,
  caret: number,
  suggestion: FormulaSuggestion,
): { text: string; caret: number } {
  const before = text.slice(0, Math.max(0, caret));
  const after = text.slice(Math.max(0, caret));

  if (suggestion.kind === "column") {
    const openBracket = before.lastIndexOf("[");
    const closeBracket = before.lastIndexOf("]");
    const openParen = before.lastIndexOf("(");

    if (openBracket > closeBracket) {
      const prefix = before.slice(0, openBracket + 1);
      const next = prefix + suggestion.insert + after;
      return { text: next, caret: (prefix + suggestion.insert).length };
    }

    if (openParen >= 0) {
      const prefix = before.slice(0, openParen + 1);
      // Drop any partial arg after (
      const next = prefix + suggestion.insert + after.replace(/^\s*[a-zA-Z0-9_.]*/, "");
      const caretAt = (prefix + suggestion.insert).length;
      return { text: next, caret: caretAt };
    }
  }

  // Function: replace trailing partial identifier
  const fnPartialMatch = before.match(/([a-zA-Z_][a-zA-Z0-9_]*)?$/);
  const partial = fnPartialMatch?.[1] ?? "";
  const prefix = before.slice(0, before.length - partial.length);
  const next = prefix + suggestion.insert + after;
  return { text: next, caret: (prefix + suggestion.insert).length };
}
