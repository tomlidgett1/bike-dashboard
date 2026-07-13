"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  ChevronDown,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  NestWorkspaceContext,
  NestWorkspaceField,
  NestWorkspaceKnowledgeItem,
} from "@/lib/nest/nest-workspace-types";
import { cn } from "@/lib/utils";
import { postNestWorkspace } from "./workspace-api";
import {
  ConfigEditorDialog,
  ConfirmActionDialog,
  KnowledgeEditorDialog,
} from "./workspace-dialogs";
import {
  BusyLabel,
  WorkspaceNotice,
  dropdownTransition,
  formatWorkspaceDate,
} from "./workspace-ui";

type KnowledgeEntry =
  | { type: "fact"; field: NestWorkspaceField }
  | { type: "behaviour"; field: NestWorkspaceField }
  | { type: "custom"; item: NestWorkspaceKnowledgeItem };

function KnowledgeRow({
  entry,
  onEditFact,
  onEditKnowledge,
  onDeleteKnowledge,
}: {
  entry: KnowledgeEntry;
  onEditFact: (field: NestWorkspaceField) => void;
  onEditKnowledge: (item: NestWorkspaceKnowledgeItem) => void;
  onDeleteKnowledge: (item: NestWorkspaceKnowledgeItem) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const isCustom = entry.type === "custom";
  const isBehaviour = entry.type === "behaviour";
  const field = entry.type !== "custom" ? entry.field : null;
  const title = isCustom ? entry.item.title : field!.label;
  const content = isCustom ? entry.item.content : field!.value;
  const summary = isCustom
    ? entry.item.summary || entry.item.content
    : field!.value;

  return (
    <article className="bg-white">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isCustom ? (
              <BookOpen className="h-4 w-4 shrink-0 text-gray-400" />
            ) : isBehaviour ? (
              <SlidersHorizontal className="h-4 w-4 shrink-0 text-gray-400" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-gray-400" />
            )}
            <h3 className="text-sm font-medium text-gray-900">{title}</h3>
          </div>
          <p
            className={cn(
              "mt-2 text-sm leading-relaxed text-gray-600",
              !open && "line-clamp-2",
              !content.trim() && "italic text-gray-400",
            )}
          >
            {summary.trim() || "No information added yet."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              isCustom
                ? onEditKnowledge(entry.item)
                : onEditFact(field!)
            }
            disabled={isCustom && Boolean(entry.item.legacyFieldKey)}
            aria-label={`Edit ${title}`}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          {isCustom ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onDeleteKnowledge(entry.item)}
              aria-label={`Delete ${title}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
          >
            {open ? "Less" : "More"}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={dropdownTransition}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 px-4 pb-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                {content.trim() || "No information added yet."}
              </p>
              <p className="mt-3 text-[11px] text-gray-400">
                Updated{" "}
                {formatWorkspaceDate(
                  isCustom ? entry.item.updatedAt : field!.updatedAt,
                )}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}

export function KnowledgeSection({
  context,
  onReload,
  refreshing = false,
}: {
  context: NestWorkspaceContext;
  onReload: () => Promise<void>;
  refreshing?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [editingField, setEditingField] =
    React.useState<NestWorkspaceField | null>(null);
  const [editingItem, setEditingItem] =
    React.useState<NestWorkspaceKnowledgeItem | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deletingItem, setDeletingItem] =
    React.useState<NestWorkspaceKnowledgeItem | null>(null);

  const entries = React.useMemo<KnowledgeEntry[]>(() => {
    const facts: KnowledgeEntry[] = context.fields
      .filter((field) => field.category === "business")
      .map((field) => ({ type: "fact", field }));
    const behaviours: KnowledgeEntry[] = context.fields
      .filter((field) => field.category === "behaviour")
      .map((field) => ({ type: "behaviour", field }));
    const custom: KnowledgeEntry[] = context.knowledge
      .filter((item) => !item.legacyFieldKey)
      .map((item) => ({ type: "custom", item }));
    return [...facts, ...behaviours, ...custom];
  }, [context.fields, context.knowledge]);

  const filteredEntries = React.useMemo(() => {
    const normalisedQuery = query.trim().toLocaleLowerCase("en-AU");
    if (!normalisedQuery) return entries;
    return entries.filter((entry) => {
      const searchable =
        entry.type === "custom"
          ? `${entry.item.title} ${entry.item.summary} ${entry.item.content}`
          : `${entry.field.label} ${entry.field.description} ${entry.field.value}`;
      return searchable.toLocaleLowerCase("en-AU").includes(normalisedQuery);
    });
  }, [entries, query]);

  const indexingCount = context.knowledge.filter(
    (item) => item.status === "processing",
  ).length;

  return (
    <section aria-label="Knowledge" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {context.displayName}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Everything Nest knows and how it behaves.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void onReload()}
          disabled={refreshing}
        >
          {refreshing ? (
            <BusyLabel>Refreshing…</BusyLabel>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </>
          )}
        </Button>
      </div>

      <div className="rounded-md border border-gray-200 bg-white px-4 py-3">
        <p className="text-sm font-medium text-gray-900">Live after save</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          When you save changes here, live Nest uses them on the next customer
          message. Changes in Learn only go live after you apply them.
        </p>
        {indexingCount > 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            {indexingCount}{" "}
            {indexingCount === 1 ? "note is" : "notes are"} still indexing and
            may take a moment to appear everywhere.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="bg-white pl-8"
            placeholder="Search knowledge…"
            aria-label="Search knowledge"
          />
        </div>
        <Button
          type="button"
          onClick={() => setCreating(true)}
          className="bg-gray-900 text-white hover:bg-gray-800"
        >
          <Plus className="h-4 w-4" />
          Add note
        </Button>
      </div>

      {filteredEntries.length > 0 ? (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-md border border-gray-200 bg-white">
          {filteredEntries.map((entry) => (
            <KnowledgeRow
              key={
                entry.type === "custom"
                  ? `knowledge-${entry.item.id}`
                  : `${entry.type}-${entry.field.key}`
              }
              entry={entry}
              onEditFact={setEditingField}
              onEditKnowledge={setEditingItem}
              onDeleteKnowledge={setDeletingItem}
            />
          ))}
        </div>
      ) : (
        <WorkspaceNotice
          title={entries.length === 0 ? "No knowledge yet" : "No matches"}
          action={
            entries.length === 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreating(true)}
              >
                Add the first note
              </Button>
            ) : undefined
          }
        >
          {entries.length === 0
            ? "Add store details or use Learn to teach Nest conversationally."
            : "Try a different search term."}
        </WorkspaceNotice>
      )}

      <ConfigEditorDialog
        field={editingField}
        expectedUpdatedAt={context.configUpdatedAt}
        onOpenChange={(open) => {
          if (!open) setEditingField(null);
        }}
        onSaved={onReload}
      />
      <KnowledgeEditorDialog
        item={editingItem}
        creating={creating}
        onOpenChange={(open) => {
          if (!open) {
            setEditingItem(null);
            setCreating(false);
          }
        }}
        onSaved={onReload}
      />
      <ConfirmActionDialog
        open={Boolean(deletingItem)}
        onOpenChange={(open) => {
          if (!open) setDeletingItem(null);
        }}
        title="Delete knowledge?"
        description="Nest will stop using this item."
        confirmLabel="Delete"
        busyLabel="Deleting…"
        destructive
        onConfirm={async () => {
          if (!deletingItem) return;
          await postNestWorkspace({
            action: "knowledge.delete",
            itemId: deletingItem.id,
            expectedUpdatedAt: deletingItem.updatedAt,
          });
          await onReload();
        }}
      >
        {deletingItem ? (
          <div className="rounded-md border border-gray-200 bg-white p-3">
            <p className="text-sm font-medium text-gray-900">
              {deletingItem.title}
            </p>
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-gray-500">
              {deletingItem.summary || deletingItem.content}
            </p>
          </div>
        ) : null}
      </ConfirmActionDialog>
    </section>
  );
}
