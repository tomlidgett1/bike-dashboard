/**
 * Row-level calculated columns for Build a Table.
 * Expressions support + - * / parentheses, Abs(), and [Column] refs.
 */

import { getSalesField, getSalesFieldsForGrain } from "./sales-fields";
import type {
  CalculatedColumn,
  TableBuilderFieldFormat,
  TableBuilderGrain,
} from "./types";

export type FormulaColumnRef = {
  key: string;
  label: string;
};

export type ParseFormulaResult =
  | { ok: true; expression: string; referencedKeys: string[] }
  | { ok: false; error: string };

export type EvaluateFormulaResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

type Token =
  | { kind: "number"; value: number }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "ref"; value: string }
  | { kind: "ident"; value: string }
  | { kind: "comma" };

type AstNode =
  | { kind: "number"; value: number }
  | { kind: "ref"; key: string }
  | { kind: "unary"; op: "-"; arg: AstNode }
  | { kind: "binary"; op: "+" | "-" | "*" | "/"; left: AstNode; right: AstNode }
  | { kind: "call"; name: "abs"; arg: AstNode };

const CALC_KEY_PREFIX = "calc.";

export function isCalculatedColumnKey(key: string): boolean {
  return key.startsWith(CALC_KEY_PREFIX);
}

export function normaliseCalculatedColumns(
  value: CalculatedColumn[] | null | undefined,
): CalculatedColumn[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: CalculatedColumn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const key = typeof item.key === "string" ? item.key.trim() : "";
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const expression =
      typeof item.expression === "string" ? item.expression.trim() : "";
    // Allow empty expression for draft formula columns (empty until authored).
    if (!key || !label || !isCalculatedColumnKey(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const format =
      item.format === "currency" || item.format === "percent" || item.format === "number"
        ? item.format
        : "currency";
    next.push({
      key,
      label,
      expression,
      type: "number",
      format,
    });
  }
  return next;
}

export function slugifyCalculatedKey(label: string, existingKeys: Set<string>): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "metric";
  let key = `${CALC_KEY_PREFIX}${base}`;
  let i = 2;
  while (existingKeys.has(key)) {
    key = `${CALC_KEY_PREFIX}${base}_${i}`;
    i += 1;
  }
  return key;
}

export type FormulaParseOptions = {
  /** Other formula columns that may be referenced by label or key. */
  calculatedColumns?: CalculatedColumn[];
  /** Key of the formula being authored; excluded from refs to block self-reference. */
  selfKey?: string;
};

export function formulaColumnRefs(
  grain: TableBuilderGrain,
  options: FormulaParseOptions = {},
): FormulaColumnRef[] {
  const salesRefs = getSalesFieldsForGrain(grain)
    .filter((field) => field.type === "number")
    .map((field) => ({ key: field.key, label: field.label }));

  const calcRefs = normaliseCalculatedColumns(options.calculatedColumns)
    .filter(
      (col) =>
        col.key !== options.selfKey
        && Boolean(col.expression.trim() || col.label.trim()),
    )
    .map((col) => ({ key: col.key, label: col.label }));

  // Prefer unique labels; if a formula reuses a sales label, keep both by key.
  const seenLabels = new Set(salesRefs.map((ref) => ref.label.toLowerCase()));
  const merged = [...salesRefs];
  for (const ref of calcRefs) {
    if (seenLabels.has(ref.label.toLowerCase())) {
      merged.push({ key: ref.key, label: ref.label });
      continue;
    }
    seenLabels.add(ref.label.toLowerCase());
    merged.push(ref);
  }
  return merged;
}

export function formulaPresets(grain: TableBuilderGrain): Array<{
  label: string;
  expression: string;
  format: TableBuilderFieldFormat;
  description: string;
}> {
  if (grain === "sale") {
    return [
      {
        label: "Gross profit",
        expression: "[Sale subtotal] - [Sale average cost]",
        format: "currency",
        description: "Sale subtotal less average cost",
      },
      {
        label: "Gross margin %",
        expression:
          "([Sale subtotal] - [Sale average cost]) / [Sale subtotal]",
        format: "percent",
        description: "Gross profit as a share of subtotal",
      },
    ];
  }
  return [
    {
      label: "Gross profit",
      expression:
        "[Line subtotal] - ([Line average cost] * Abs([Quantity]))",
      format: "currency",
      description: "Line subtotal less average cost × quantity",
    },
    {
      label: "Gross margin %",
      expression:
        "([Line subtotal] - ([Line average cost] * Abs([Quantity]))) / [Line subtotal]",
      format: "percent",
      description: "Gross profit as a share of line subtotal",
    },
  ];
}

function resolveRef(
  raw: string,
  refs: FormulaColumnRef[],
): { key?: string; error?: string } {
  const unwrapped = raw.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!unwrapped) return { error: "Empty column reference." };

  const byKey = refs.find(
    (ref) => ref.key.toLowerCase() === unwrapped.toLowerCase(),
  );
  if (byKey) return { key: byKey.key };

  const byLabel = refs.find(
    (ref) => ref.label.toLowerCase() === unwrapped.toLowerCase(),
  );
  if (byLabel) return { key: byLabel.key };

  // Fallback: known catalog field even if not in numeric refs list
  const field = getSalesField(unwrapped);
  if (field?.type === "number") return { key: field.key };

  return { error: `Unknown column "${unwrapped}".` };
}

function tokenize(input: string): Token[] | { error: string } {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if ("+-*/".includes(ch)) {
      tokens.push({ kind: "op", value: ch as "+" | "-" | "*" | "/" });
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i += 1;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma" });
      i += 1;
      continue;
    }
    if (ch === "[") {
      const end = input.indexOf("]", i + 1);
      if (end < 0) return { error: "Unclosed column reference […]." };
      tokens.push({ kind: "ref", value: input.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j]!)) j += 1;
      const raw = input.slice(i, j);
      const value = Number(raw);
      if (!Number.isFinite(value)) return { error: `Invalid number "${raw}".` };
      tokens.push({ kind: "number", value });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[a-zA-Z0-9_.]/.test(input[j]!)) j += 1;
      tokens.push({ kind: "ident", value: input.slice(i, j) });
      i = j;
      continue;
    }
    return { error: `Unexpected character "${ch}".` };
  }
  return tokens;
}

function parseAst(
  tokens: Token[],
  refs: FormulaColumnRef[],
): { ast?: AstNode; referencedKeys?: string[]; error?: string } {
  let pos = 0;
  const referenced = new Set<string>();

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const parseExpression = (): AstNode | { error: string } => {
    let left = parseTerm();
    if ("error" in left) return left;
    while (
      peek()?.kind === "op"
      && ((peek() as { value: string }).value === "+"
        || (peek() as { value: string }).value === "-")
    ) {
      const opTok = consume() as { kind: "op"; value: "+" | "-" };
      const right = parseTerm();
      if ("error" in right) return right;
      left = { kind: "binary", op: opTok.value, left, right };
    }
    return left;
  };

  const parseTerm = (): AstNode | { error: string } => {
    let left = parseUnary();
    if ("error" in left) return left;
    while (
      peek()?.kind === "op"
      && ((peek() as { value: string }).value === "*"
        || (peek() as { value: string }).value === "/")
    ) {
      const opTok = consume() as { kind: "op"; value: "*" | "/" };
      const right = parseUnary();
      if ("error" in right) return right;
      left = { kind: "binary", op: opTok.value, left, right };
    }
    return left;
  };

  const parseUnary = (): AstNode | { error: string } => {
    if (peek()?.kind === "op" && (peek() as { value: string }).value === "-") {
      consume();
      const arg = parseUnary();
      if ("error" in arg) return arg;
      return { kind: "unary", op: "-", arg };
    }
    if (peek()?.kind === "op" && (peek() as { value: string }).value === "+") {
      consume();
      return parseUnary();
    }
    return parsePrimary();
  };

  const parsePrimary = (): AstNode | { error: string } => {
    const tok = peek();
    if (!tok) return { error: "Unexpected end of formula." };

    if (tok.kind === "number") {
      consume();
      return { kind: "number", value: tok.value };
    }

    if (tok.kind === "ref") {
      consume();
      const resolved = resolveRef(tok.value, refs);
      if (resolved.error || !resolved.key) {
        return { error: resolved.error ?? "Invalid column." };
      }
      referenced.add(resolved.key);
      return { kind: "ref", key: resolved.key };
    }

    if (tok.kind === "ident") {
      consume();
      const name = tok.value.toLowerCase();
      if (name === "abs") {
        if (peek()?.kind !== "lparen") {
          return { error: "Abs expects parentheses, e.g. Abs([Quantity])." };
        }
        consume();
        const arg = parseExpression();
        if ("error" in arg) return arg;
        if (peek()?.kind !== "rparen") return { error: "Missing ) after Abs(…" };
        consume();
        return { kind: "call", name: "abs", arg };
      }
      // Bare field key without brackets
      const resolved = resolveRef(tok.value, refs);
      if (resolved.error || !resolved.key) {
        return { error: `Unknown name "${tok.value}". Use [Column] for fields.` };
      }
      referenced.add(resolved.key);
      return { kind: "ref", key: resolved.key };
    }

    if (tok.kind === "lparen") {
      consume();
      const inner = parseExpression();
      if ("error" in inner) return inner;
      if (peek()?.kind !== "rparen") return { error: "Missing closing )." };
      consume();
      return inner;
    }

    return { error: "Expected a number, column, or (expression)." };
  };

  const ast = parseExpression();
  if ("error" in ast) return { error: ast.error };
  if (pos < tokens.length) return { error: "Unexpected trailing characters." };
  return { ast, referencedKeys: Array.from(referenced) };
}

function evalAst(
  node: AstNode,
  values: Record<string, number | null>,
): number | null {
  switch (node.kind) {
    case "number":
      return node.value;
    case "ref": {
      const value = values[node.key];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }
    case "unary": {
      const arg = evalAst(node.arg, values);
      return arg == null ? null : -arg;
    }
    case "call": {
      const arg = evalAst(node.arg, values);
      return arg == null ? null : Math.abs(arg);
    }
    case "binary": {
      const left = evalAst(node.left, values);
      const right = evalAst(node.right, values);
      if (left == null || right == null) return null;
      if (node.op === "+") return left + right;
      if (node.op === "-") return left - right;
      if (node.op === "*") return left * right;
      if (right === 0) return null;
      return left / right;
    }
    default:
      return null;
  }
}

function roundValue(
  value: number | null,
  format: TableBuilderFieldFormat | undefined,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (format === "percent") {
    // Store as fraction (0.25) when expression is already a ratio.
    return Math.round(value * 1e6) / 1e6;
  }
  if (format === "currency" || format === "number") {
    return Math.round(value * 100) / 100;
  }
  return value;
}

/** Validate and normalise a formula expression against available columns. */
export function parseCalculatedFormula(
  expression: string,
  grain: TableBuilderGrain,
  options: FormulaParseOptions = {},
): ParseFormulaResult {
  const raw = expression.trim();
  if (!raw) return { ok: false, error: "Enter a formula, e.g. [Line subtotal] - [Line average cost]." };

  const tokens = tokenize(raw);
  if ("error" in tokens) return { ok: false, error: tokens.error };

  const refs = formulaColumnRefs(grain, options);
  const parsed = parseAst(tokens, refs);
  if (parsed.error || !parsed.ast || !parsed.referencedKeys) {
    return { ok: false, error: parsed.error ?? "Invalid formula." };
  }
  if (parsed.referencedKeys.length === 0) {
    return { ok: false, error: "Formula must reference at least one column." };
  }
  if (options.selfKey && parsed.referencedKeys.includes(options.selfKey)) {
    return { ok: false, error: "A formula cannot reference itself." };
  }

  return {
    ok: true,
    expression: raw,
    referencedKeys: parsed.referencedKeys,
  };
}

/** Evaluate a formula against a projected row of numeric values. */
export function evaluateCalculatedFormula(
  expression: string,
  grain: TableBuilderGrain,
  values: Record<string, number | null>,
  format?: TableBuilderFieldFormat,
  options: FormulaParseOptions = {},
): EvaluateFormulaResult {
  const parsed = parseCalculatedFormula(expression, grain, options);
  if (!parsed.ok) return parsed;

  const tokens = tokenize(parsed.expression);
  if ("error" in tokens) return { ok: false, error: tokens.error };
  const astResult = parseAst(tokens, formulaColumnRefs(grain, options));
  if (astResult.error || !astResult.ast) {
    return { ok: false, error: astResult.error ?? "Invalid formula." };
  }

  const value = roundValue(evalAst(astResult.ast, values), format);
  return { ok: true, value };
}

export type CompileFormulaSqlResult =
  | { ok: true; sql: string }
  | { ok: false; error: string };

function astToSql(
  node: AstNode,
  refSql: (key: string) => string | null,
): string | null {
  switch (node.kind) {
    case "number":
      return Number.isFinite(node.value) ? String(node.value) : null;
    case "ref":
      return refSql(node.key);
    case "unary": {
      const arg = astToSql(node.arg, refSql);
      return arg == null ? null : `(-${arg})`;
    }
    case "call": {
      const arg = astToSql(node.arg, refSql);
      return arg == null ? null : `ABS(${arg})`;
    }
    case "binary": {
      const left = astToSql(node.left, refSql);
      const right = astToSql(node.right, refSql);
      if (left == null || right == null) return null;
      if (node.op === "/") {
        // Match evaluateCalculatedFormula: division by zero yields NULL.
        return `(${left} / NULLIF(${right}, 0))`;
      }
      return `(${left} ${node.op} ${right})`;
    }
    default:
      return null;
  }
}

/**
 * Compile a formula to a SQL expression. `refSql` maps a referenced column
 * key (catalog field or another formula) to its SQL; return null to fail the
 * compile. Mirrors evaluateCalculatedFormula semantics (NULL on divide by
 * zero; rounding is the caller's concern).
 */
export function compileCalculatedFormulaToSql(
  expression: string,
  grain: TableBuilderGrain,
  refSql: (key: string) => string | null,
  options: FormulaParseOptions = {},
): CompileFormulaSqlResult {
  const parsed = parseCalculatedFormula(expression, grain, options);
  if (!parsed.ok) return parsed;

  const tokens = tokenize(parsed.expression);
  if ("error" in tokens) return { ok: false, error: tokens.error };
  const astResult = parseAst(tokens, formulaColumnRefs(grain, options));
  if (astResult.error || !astResult.ast) {
    return { ok: false, error: astResult.error ?? "Invalid formula." };
  }

  const sql = astToSql(astResult.ast, refSql);
  if (sql == null) {
    return { ok: false, error: "Formula references an unavailable column." };
  }
  return { ok: true, sql };
}

/**
 * Order calculated columns so dependencies evaluate before dependents.
 * Returns an error when a cycle is detected.
 */
export function orderCalculatedColumns(
  calculatedColumns: CalculatedColumn[],
  grain: TableBuilderGrain,
): { ok: true; columns: CalculatedColumn[] } | { ok: false; error: string } {
  const calcs = normaliseCalculatedColumns(calculatedColumns);
  const byKey = new Map(calcs.map((col) => [col.key, col]));
  const calcKeys = new Set(byKey.keys());

  const edges = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const col of calcs) {
    indegree.set(col.key, 0);
    edges.set(col.key, []);
  }

  for (const col of calcs) {
    if (!col.expression.trim()) continue;
    const parsed = parseCalculatedFormula(col.expression, grain, {
      calculatedColumns: calcs,
      selfKey: col.key,
    });
    if (!parsed.ok) continue;
    for (const dep of parsed.referencedKeys) {
      if (!calcKeys.has(dep) || dep === col.key) continue;
      edges.get(dep)!.push(col.key);
      indegree.set(col.key, (indegree.get(col.key) ?? 0) + 1);
    }
  }

  const queue = calcs
    .filter((col) => (indegree.get(col.key) ?? 0) === 0)
    .map((col) => col.key);
  const ordered: CalculatedColumn[] = [];

  while (queue.length > 0) {
    const key = queue.shift()!;
    const col = byKey.get(key);
    if (col) ordered.push(col);
    for (const next of edges.get(key) ?? []) {
      const nextDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) queue.push(next);
    }
  }

  if (ordered.length !== calcs.length) {
    return {
      ok: false,
      error: "Circular formula reference detected. Remove the loop between formula columns.",
    };
  }

  return { ok: true, columns: ordered };
}

/** Detect whether the given set of formulas contains a dependency cycle. */
export function hasCalculatedColumnCycle(
  calculatedColumns: CalculatedColumn[],
  grain: TableBuilderGrain,
): boolean {
  return !orderCalculatedColumns(calculatedColumns, grain).ok;
}

/** Collect catalog (non-formula) field keys needed to evaluate calculated columns. */
export function calculatedColumnDependencies(
  calculatedColumns: CalculatedColumn[],
  grain: TableBuilderGrain,
): string[] {
  const calcs = normaliseCalculatedColumns(calculatedColumns);
  const byKey = new Map(calcs.map((col) => [col.key, col]));
  const deps = new Set<string>();
  const visiting = new Set<string>();

  const walk = (key: string) => {
    if (visiting.has(key)) return;
    visiting.add(key);
    const calc = byKey.get(key);
    if (!calc?.expression.trim()) return;
    const parsed = parseCalculatedFormula(calc.expression, grain, {
      calculatedColumns: calcs,
      selfKey: calc.key,
    });
    if (!parsed.ok) return;
    for (const ref of parsed.referencedKeys) {
      if (byKey.has(ref)) {
        walk(ref);
        continue;
      }
      if (getSalesField(ref)?.type === "number") deps.add(ref);
    }
  };

  for (const col of calcs) walk(col.key);
  return Array.from(deps);
}

export function getCalculatedColumn(
  key: string,
  calculatedColumns: CalculatedColumn[],
): CalculatedColumn | undefined {
  return calculatedColumns.find((col) => col.key === key);
}
