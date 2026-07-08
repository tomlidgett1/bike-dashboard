"use client";

import { renderGenieMarkdown } from "@/lib/genie/render-markdown";
import { cn } from "@/lib/utils";

const PROSE_CLASS =
  "[&>p+p]:mt-1.5 [&_h2+p]:mt-1 [&_h3+p]:mt-1 [&_p+div]:mt-1.5 [&_div+h2]:mt-2.5 [&_strong]:font-semibold [&_blockquote]:my-2 [&_blockquote]:rounded-md [&_blockquote]:border [&_blockquote]:border-gray-200 [&_blockquote]:bg-white [&_blockquote]:px-3.5 [&_blockquote]:py-2.5";

export function GenieMarkdownContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const trimmed = content.trim();
  if (!trimmed) return null;

  return (
    <div
      className={cn("genie-chat-prose text-sm leading-relaxed text-gray-800", className)}
      dangerouslySetInnerHTML={{ __html: renderGenieMarkdown(trimmed) }}
    />
  );
}
