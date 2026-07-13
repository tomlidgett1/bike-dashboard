"use client";

import * as React from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BRAND_KNOWLEDGE_PRODUCTS,
  BRAND_KNOWLEDGE_PRODUCT_LABELS,
  type BrandKnowledgeProduct,
} from "@/lib/nest-portal/lib/brand-knowledge";
import type {
  NestConflictAnalysis,
  NestWorkspaceField,
  NestWorkspaceKnowledgeItem,
} from "@/lib/nest/nest-workspace-types";
import { cn } from "@/lib/utils";
import {
  NestWorkspaceConflictError,
  postNestWorkspace,
} from "./workspace-api";
import {
  BusyLabel,
  FieldLabel,
  WorkspaceDialog,
} from "./workspace-ui";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function ConflictReview({
  conflict,
  proposed,
}: {
  conflict: NestConflictAnalysis;
  proposed: string;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-gray-300 bg-white p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-gray-500"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-medium text-gray-900">
            Review before saving
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
            {conflict.summary}
          </p>
        </div>
      </div>
      {conflict.matches.map((match) => (
        <div
          key={`${match.sourceType}-${match.sourceId}-${match.relationship}`}
          className="rounded-xl border border-gray-200 bg-white p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-gray-900">{match.title}</p>
            <span className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
              {match.relationship}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            {match.reason}
          </p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-gray-100 bg-white p-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                Existing information
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
                {match.existingText}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                Your proposed information
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
                {proposed}
              </p>
            </div>
          </div>
        </div>
      ))}
      <p className="text-xs leading-relaxed text-gray-500">
        {conflict.status === "overlap"
          ? "This can be kept as a separate detail, or you can edit it to merge the related information."
          : "Saving anyway may give Nest two different answers. Confirm only if the new wording should take priority."}
      </p>
    </div>
  );
}

export function ConfigEditorDialog({
  field,
  expectedUpdatedAt,
  onOpenChange,
  onSaved,
}: {
  field: NestWorkspaceField | null;
  expectedUpdatedAt: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}) {
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] =
    React.useState<NestConflictAnalysis | null>(null);
  const [checkedClear, setCheckedClear] = React.useState(false);

  React.useEffect(() => {
    setValue(field?.value ?? "");
    setError(null);
    setConflict(null);
    setCheckedClear(false);
  }, [field]);

  if (!field) return null;

  async function analyse(): Promise<NestConflictAnalysis | null> {
    if (!field) return null;
    setChecking(true);
    setError(null);
    setConflict(null);
    setCheckedClear(false);
    try {
      const data = await postNestWorkspace<{
        analysis: NestConflictAnalysis;
      }>({
        action: "analyse",
        title: field.label,
        content: value || " ",
        excludeSourceId: `config:${field.key}`,
      });
      if (data.analysis.status !== "clear") {
        setConflict(data.analysis);
      } else {
        setCheckedClear(true);
      }
      return data.analysis;
    } catch (caught) {
      setError(errorMessage(caught, "Could not check this change."));
      return null;
    } finally {
      setChecking(false);
    }
  }

  async function save(force: boolean) {
    if (!field || saving || checking) return;
    setError(null);
    if (!force) {
      const analysis = await analyse();
      if (!analysis || analysis.status !== "clear") {
        return;
      }
    }

    setSaving(true);
    try {
      await postNestWorkspace({
        action: "config.update",
        field: field.key,
        value,
        expectedUpdatedAt,
        force,
      });
      await onSaved();
      onOpenChange(false);
    } catch (caught) {
      if (caught instanceof NestWorkspaceConflictError) {
        setConflict(caught.conflict);
      } else {
        setError(errorMessage(caught, "Could not save this business fact."));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkspaceDialog
      open={Boolean(field)}
      onOpenChange={onOpenChange}
      title={conflict ? "Review conflicting information" : `Edit ${field.label}`}
      description={field.description}
    >
      <div className="space-y-4 px-5 py-5">
        <div className="space-y-2">
          <FieldLabel htmlFor={`nest-field-${field.key}`}>
            {field.label}
          </FieldLabel>
          <Textarea
            id={`nest-field-${field.key}`}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setConflict(null);
              setCheckedClear(false);
            }}
            rows={7}
            className="min-h-36 resize-y bg-white"
            placeholder={`Add ${field.label.toLowerCase()}…`}
            disabled={saving}
          />
          <p className="text-right text-[11px] tabular-nums text-gray-400">
            {value.length.toLocaleString("en-AU")} / 50,000
          </p>
        </div>

        {checkedClear ? (
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            No blocking conflict found.
          </div>
        ) : null}
        {conflict ? <ConflictReview conflict={conflict} proposed={value} /> : null}
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => void analyse()}
          disabled={saving || checking || value.length > 50_000}
        >
          {checking ? <BusyLabel>Checking…</BusyLabel> : "Check conflicts"}
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-gray-900 text-white hover:bg-gray-800"
            onClick={() => void save(Boolean(conflict))}
            disabled={saving || checking || value.length > 50_000}
          >
            {saving ? (
              <BusyLabel>Saving…</BusyLabel>
            ) : conflict ? (
              conflict.status === "overlap"
                ? "Keep as separate"
                : "Replace existing"
            ) : (
              "Review and save"
            )}
          </Button>
        </div>
      </div>
    </WorkspaceDialog>
  );
}

export function KnowledgeEditorDialog({
  item,
  creating,
  onOpenChange,
  onSaved,
}: {
  item: NestWorkspaceKnowledgeItem | null;
  creating: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}) {
  const open = creating || Boolean(item);
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [products, setProducts] = React.useState<BrandKnowledgeProduct[]>([
    "nest_chat",
  ]);
  const [saving, setSaving] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] =
    React.useState<NestConflictAnalysis | null>(null);
  const [checkedClear, setCheckedClear] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setContent(item?.content ?? "");
    setProducts(
      item?.assignedProducts.length ? [...item.assignedProducts] : ["nest_chat"],
    );
    setError(null);
    setConflict(null);
    setCheckedClear(false);
  }, [item, open]);

  function toggleProduct(product: BrandKnowledgeProduct) {
    setProducts((current) =>
      current.includes(product)
        ? current.filter((entry) => entry !== product)
        : [...current, product],
    );
    setConflict(null);
    setCheckedClear(false);
  }

  async function analyse(): Promise<NestConflictAnalysis | null> {
    if (!title.trim() || !content.trim()) {
      setError("Add a title and information before checking.");
      return null;
    }
    setChecking(true);
    setError(null);
    setConflict(null);
    setCheckedClear(false);
    try {
      const data = await postNestWorkspace<{
        analysis: NestConflictAnalysis;
      }>({
        action: "analyse",
        title: title.trim(),
        content: content.trim(),
        excludeSourceId: item ? `knowledge:${item.id}` : null,
      });
      if (data.analysis.status !== "clear") {
        setConflict(data.analysis);
      } else {
        setCheckedClear(true);
      }
      return data.analysis;
    } catch (caught) {
      setError(errorMessage(caught, "Could not check this knowledge."));
      return null;
    } finally {
      setChecking(false);
    }
  }

  async function save(force: boolean) {
    if (saving || checking) return;
    if (!title.trim() || !content.trim()) {
      setError("Add a title and information before saving.");
      return;
    }
    if (products.length === 0) {
      setError("Choose at least one Nest channel.");
      return;
    }
    setError(null);

    if (!force) {
      const analysis = await analyse();
      if (!analysis || analysis.status !== "clear") {
        return;
      }
    }

    setSaving(true);
    try {
      await postNestWorkspace({
        action: item ? "knowledge.update" : "knowledge.create",
        ...(item
          ? { itemId: item.id, expectedUpdatedAt: item.updatedAt }
          : {}),
        title: title.trim(),
        content: content.trim(),
        assignedProducts: products,
        force,
      });
      await onSaved();
      onOpenChange(false);
    } catch (caught) {
      if (caught instanceof NestWorkspaceConflictError) {
        setConflict(caught.conflict);
      } else {
        setError(errorMessage(caught, "Could not save this knowledge."));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkspaceDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        conflict
          ? "Review conflicting information"
          : item
            ? "Edit knowledge"
            : "Add knowledge"
      }
      description="Add a clear, standalone fact that Nest can use in customer conversations."
      className="sm:max-w-2xl"
    >
      <div className="space-y-4 px-5 py-5">
        <div className="space-y-2">
          <FieldLabel htmlFor="nest-knowledge-title">Title</FieldLabel>
          <Input
            id="nest-knowledge-title"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setConflict(null);
              setCheckedClear(false);
            }}
            maxLength={200}
            className="bg-white"
            placeholder="e.g. Workshop turnaround times"
            disabled={saving}
          />
        </div>
        <div className="space-y-2">
          <FieldLabel
            htmlFor="nest-knowledge-content"
            hint="Write the exact information Nest should rely on."
          >
            Information
          </FieldLabel>
          <Textarea
            id="nest-knowledge-content"
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setConflict(null);
              setCheckedClear(false);
            }}
            rows={9}
            className="min-h-44 resize-y bg-white"
            placeholder="Add the policy, answer or business detail…"
            disabled={saving}
          />
          <p className="text-right text-[11px] tabular-nums text-gray-400">
            {content.length.toLocaleString("en-AU")} / 100,000
          </p>
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-gray-800">
            Available to
          </legend>
          <p className="mt-0.5 text-xs text-gray-500">
            Choose where this information may be used.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {BRAND_KNOWLEDGE_PRODUCTS.map((product) => {
              const checked = products.includes(product);
              return (
                <label
                  key={product}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm transition-colors",
                    checked
                      ? "border-gray-400 text-gray-900"
                      : "border-gray-200 text-gray-600 hover:border-gray-300",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleProduct(product)}
                    className="size-4 rounded border-gray-300 accent-gray-900"
                    disabled={saving}
                  />
                  {BRAND_KNOWLEDGE_PRODUCT_LABELS[product]}
                </label>
              );
            })}
          </div>
        </fieldset>

        {checkedClear ? (
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            No blocking conflict found.
          </div>
        ) : null}
        {conflict ? (
          <ConflictReview conflict={conflict} proposed={content} />
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => void analyse()}
          disabled={
            saving ||
            checking ||
            content.length > 100_000 ||
            title.length > 200
          }
        >
          {checking ? <BusyLabel>Checking…</BusyLabel> : "Check conflicts"}
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-gray-900 text-white hover:bg-gray-800"
            onClick={() => void save(Boolean(conflict))}
            disabled={
              saving ||
              checking ||
              content.length > 100_000 ||
              title.length > 200
            }
          >
            {saving ? (
              <BusyLabel>Saving…</BusyLabel>
            ) : conflict ? (
              conflict.status === "overlap"
                ? "Keep as separate"
                : "Replace existing"
            ) : (
              "Review and save"
            )}
          </Button>
        </div>
      </div>
    </WorkspaceDialog>
  );
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busyLabel,
  destructive = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) setError(null);
  }, [open]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught, "The action could not be completed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkspaceDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className="sm:max-w-md"
    >
      {children ? <div className="px-5 py-4">{children}</div> : null}
      {error ? (
        <p
          role="alert"
          className="mx-5 mt-4 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700"
        >
          {error}
        </p>
      ) : null}
      <div
        className={cn(
          "flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end",
          (children || error) && "border-t border-gray-100",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => void confirm()}
          disabled={busy}
          className={cn(
            destructive
              ? "bg-gray-900 text-white hover:bg-gray-800"
              : "bg-gray-900 text-white hover:bg-gray-800",
          )}
        >
          {busy ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {busyLabel}
            </span>
          ) : (
            confirmLabel
          )}
        </Button>
      </div>
    </WorkspaceDialog>
  );
}
