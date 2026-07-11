"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Loader2,
  Pen,
  Plus,
  TrashBinTrash,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  NEST_COMPOSE_BUILTIN_META,
  NEST_COMPOSE_MAX_ACTIONS,
  NEST_COMPOSE_MAX_CUSTOM_BODY,
  NEST_COMPOSE_MAX_CUSTOM_LABEL,
  createCustomComposeAction,
  missingBuiltinActions,
  type NestComposeBuiltinAction,
  type NestComposeCustomAction,
  type NestComposeQuickAction,
} from "@/lib/nest/compose-quick-actions";

function SortableActionRow({
  action,
  onEdit,
  onRemove,
}: {
  action: NestComposeQuickAction;
  onEdit: (action: NestComposeCustomAction) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: action.id,
  });
  const label =
    action.kind === "builtin"
      ? NEST_COMPOSE_BUILTIN_META[action.builtin].label
      : action.label;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-2",
        isDragging && "z-10 shadow-md",
      )}
    >
      <button
        type="button"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-700"
        aria-label={`Reorder ${label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{label}</p>
        <p className="truncate text-[11px] text-gray-400">
          {action.kind === "builtin"
            ? NEST_COMPOSE_BUILTIN_META[action.builtin].description
            : action.body}
        </p>
      </div>
      {action.kind === "custom" ? (
        <button
          type="button"
          onClick={() => onEdit(action)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-700"
          aria-label={`Edit ${label}`}
        >
          <Pen className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onRemove(action.id)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-700"
        aria-label={`Remove ${label}`}
      >
        <TrashBinTrash className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function NestComposeQuickActionsEditor({
  open,
  onOpenChange,
  actions,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: NestComposeQuickAction[];
  onSave: (actions: NestComposeQuickAction[]) => Promise<void>;
}) {
  const [mounted, setMounted] = React.useState(false);
  const [draft, setDraft] = React.useState<NestComposeQuickAction[]>(actions);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editorMode, setEditorMode] = React.useState<"list" | "custom">("list");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [label, setLabel] = React.useState("");
  const [body, setBody] = React.useState("");
  const panelRef = React.useRef<HTMLDivElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const missingBuiltins = missingBuiltinActions(draft);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setDraft(actions);
    setError(null);
    setEditorMode("list");
    setEditingId(null);
    setLabel("");
    setBody("");
  }, [open, actions]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (editorMode === "custom") {
          setEditorMode("list");
          return;
        }
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange, editorMode]);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((current) => {
      const oldIndex = current.findIndex((item) => item.id === active.id);
      const newIndex = current.findIndex((item) => item.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  }

  function startCreateCustom() {
    if (draft.length >= NEST_COMPOSE_MAX_ACTIONS) {
      setError(`You can have up to ${NEST_COMPOSE_MAX_ACTIONS} quick actions.`);
      return;
    }
    setEditingId(null);
    setLabel("");
    setBody("");
    setEditorMode("custom");
    setError(null);
  }

  function startEditCustom(action: NestComposeCustomAction) {
    setEditingId(action.id);
    setLabel(action.label);
    setBody(action.body);
    setEditorMode("custom");
    setError(null);
  }

  function saveCustomDraft() {
    const nextLabel = label.trim();
    const nextBody = body.trim();
    if (!nextLabel || !nextBody) {
      setError("Add a button label and message body.");
      return;
    }
    if (editingId) {
      setDraft((current) =>
        current.map((item) =>
          item.id === editingId && item.kind === "custom"
            ? {
                ...item,
                label: nextLabel.slice(0, NEST_COMPOSE_MAX_CUSTOM_LABEL),
                body: nextBody.slice(0, NEST_COMPOSE_MAX_CUSTOM_BODY),
              }
            : item,
        ),
      );
    } else {
      if (draft.length >= NEST_COMPOSE_MAX_ACTIONS) {
        setError(`You can have up to ${NEST_COMPOSE_MAX_ACTIONS} quick actions.`);
        return;
      }
      setDraft((current) => [...current, createCustomComposeAction(nextLabel, nextBody)]);
    }
    setEditorMode("list");
    setEditingId(null);
    setLabel("");
    setBody("");
    setError(null);
  }

  function addBuiltin(action: NestComposeBuiltinAction) {
    if (draft.length >= NEST_COMPOSE_MAX_ACTIONS) {
      setError(`You can have up to ${NEST_COMPOSE_MAX_ACTIONS} quick actions.`);
      return;
    }
    setDraft((current) => [...current, action]);
    setError(null);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save quick actions.");
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) return null;

  if (!open) return null;

  return createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" />
          <div
            ref={panelRef}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-t-xl border border-gray-200 bg-white shadow-xl sm:rounded-xl animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {editorMode === "custom"
                    ? editingId
                      ? "Edit quick action"
                      : "New quick action"
                    : "Quick actions"}
                </p>
                <p className="text-[11px] text-gray-500">
                  {editorMode === "custom"
                    ? "Use {name}, {store}, {phone}, and {review_url} in the message."
                    : "Drag to reorder. Add custom drafts for your shop."}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  editorMode === "custom" ? setEditorMode("list") : onOpenChange(false)
                }
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
              {editorMode === "list" ? (
                <div className="space-y-3">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onDragEnd}
                  >
                    <SortableContext
                      items={draft.map((item) => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {draft.map((action) => (
                          <SortableActionRow
                            key={action.id}
                            action={action}
                            onEdit={startEditCustom}
                            onRemove={(id) =>
                              setDraft((current) => current.filter((item) => item.id !== id))
                            }
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>

                  {draft.length === 0 ? (
                    <p className="rounded-md border border-dashed border-gray-200 bg-white px-3 py-6 text-center text-sm text-gray-500">
                      No quick actions yet.
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-md"
                      onClick={startCreateCustom}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Custom
                    </Button>
                    {missingBuiltins.map((action) => (
                      <Button
                        key={action.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-md"
                        onClick={() => addBuiltin(action)}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        {NEST_COMPOSE_BUILTIN_META[action.builtin].label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-gray-600" htmlFor="qa-label">
                      Button label
                    </label>
                    <Input
                      id="qa-label"
                      value={label}
                      maxLength={NEST_COMPOSE_MAX_CUSTOM_LABEL}
                      onChange={(event) => setLabel(event.target.value)}
                      placeholder="e.g. Parts arrived"
                      className="h-9 rounded-md"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-gray-600" htmlFor="qa-body">
                      Message
                    </label>
                    <Textarea
                      id="qa-body"
                      value={body}
                      maxLength={NEST_COMPOSE_MAX_CUSTOM_BODY}
                      onChange={(event) => setBody(event.target.value)}
                      placeholder="Just letting you know the parts for your bike have arrived…"
                      className="min-h-[120px] rounded-md"
                    />
                  </div>
                  <Button
                    type="button"
                    className="h-9 w-full rounded-md"
                    onClick={saveCustomDraft}
                  >
                    {editingId ? "Update action" : "Add action"}
                  </Button>
                </div>
              )}

              {error ? (
                <p className="mt-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
                  {error}
                </p>
              ) : null}
            </div>

            {editorMode === "list" ? (
              <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 rounded-md"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="h-9 rounded-md"
                  onClick={() => void save()}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            ) : null}
          </div>
        </div>,
    document.body,
  );
}
