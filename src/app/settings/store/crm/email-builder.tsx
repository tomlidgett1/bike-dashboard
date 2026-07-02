"use client";

import * as React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CampaignContent, EmailBlock } from "@/lib/crm/types";
import { defaultBuilderBlocks, ensureCampaignDesign } from "@/lib/crm/design";
import { LightspeedProductPicker } from "./lightspeed-product-picker";

function newBlock(type: EmailBlock["type"]): EmailBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case "hero":
      return { id, type: "hero", title: "Headline", imageUrl: "" };
    case "heading":
      return { id, type: "heading", text: "Section heading", align: "left" };
    case "text":
      return { id, type: "text", body: "Your message here.", align: "left" };
    case "button":
      return { id, type: "button", text: "Shop now", url: "" };
    case "image":
      return { id, type: "image", url: "", alt: "" };
    case "products":
      return { id, type: "products", items: [], layout: "row" };
    case "spacer":
      return { id, type: "spacer", height: 24 };
    case "divider":
      return { id, type: "divider" };
    default:
      return { id, type: "text", body: "", align: "left" };
  }
}

function SortableBlock(props: {
  block: EmailBlock;
  onChange: (block: EmailBlock) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.block.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const { block, onChange, onRemove } = props;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md border border-border/60 bg-white p-3 shadow-sm",
        isDragging && "z-10 opacity-90 ring-2 ring-zinc-900/10",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {block.type}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-muted-foreground hover:text-foreground"
          aria-label="Remove block"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {block.type === "hero" ? (
        <div className="space-y-2">
          <Input
            value={block.title ?? ""}
            onChange={(e) => onChange({ ...block, title: e.target.value })}
            placeholder="Headline"
            className="h-8"
          />
          <Input
            value={block.imageUrl ?? ""}
            onChange={(e) => onChange({ ...block, imageUrl: e.target.value })}
            placeholder="Hero image URL"
            className="h-8"
          />
        </div>
      ) : null}

      {block.type === "heading" ? (
        <Input
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder="Heading"
          className="h-8"
        />
      ) : null}

      {block.type === "text" ? (
        <Textarea
          rows={3}
          value={block.body}
          onChange={(e) => onChange({ ...block, body: e.target.value })}
        />
      ) : null}

      {block.type === "button" ? (
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            placeholder="Button text"
            className="h-8"
          />
          <Input
            value={block.url}
            onChange={(e) => onChange({ ...block, url: e.target.value })}
            placeholder="Link URL"
            className="h-8"
          />
        </div>
      ) : null}

      {block.type === "image" ? (
        <div className="space-y-2">
          <Input
            value={block.url}
            onChange={(e) => onChange({ ...block, url: e.target.value })}
            placeholder="Image URL"
            className="h-8"
          />
          <Input
            value={block.linkUrl ?? ""}
            onChange={(e) => onChange({ ...block, linkUrl: e.target.value })}
            placeholder="Optional link URL"
            className="h-8"
          />
        </div>
      ) : null}

      {block.type === "products" ? (
        <div className="space-y-2">
          <LightspeedProductPicker
            onSelect={(item) =>
              onChange({ ...block, items: [...(block.items ?? []), item].slice(0, 4) })
            }
          />
          {(block.items ?? []).map((item, index) => (
            <div key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate flex-1">{item.title}</span>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...block,
                    items: (block.items ?? []).filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {block.type === "spacer" ? (
        <Input
          type="number"
          min={8}
          max={80}
          value={block.height}
          onChange={(e) => onChange({ ...block, height: Number(e.target.value) || 24 })}
          className="h-8"
        />
      ) : null}
    </div>
  );
}

export function EmailBuilder(props: {
  content: CampaignContent;
  onChange: (content: CampaignContent) => void;
}) {
  const blocks = props.content.design?.blocks ?? defaultBuilderBlocks();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const setBlocks = (next: EmailBlock[]) => {
    const design = ensureCampaignDesign(props.content);
    props.onChange({
      ...props.content,
      design: { ...design, mode: "builder", blocks: next },
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((block) => block.id === active.id);
    const newIndex = blocks.findIndex((block) => block.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setBlocks(arrayMove(blocks, oldIndex, newIndex));
  };

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {blocks.map((block) => (
              <SortableBlock
                key={block.id}
                block={block}
                onChange={(next) =>
                  setBlocks(blocks.map((entry) => (entry.id === next.id ? next : entry)))
                }
                onRemove={() => setBlocks(blocks.filter((entry) => entry.id !== block.id))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex flex-wrap gap-1.5">
        {(
          ["hero", "heading", "text", "button", "image", "products", "spacer", "divider"] as const
        ).map((type) => (
          <Button
            key={type}
            variant="outline"
            size="sm"
            onClick={() => setBlocks([...blocks, newBlock(type)])}
          >
            <Plus className="mr-1 size-3" />
            {type}
          </Button>
        ))}
      </div>
    </div>
  );
}
