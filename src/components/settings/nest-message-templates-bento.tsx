"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NestSettingsBentoShell } from "@/components/settings/nest-settings-bento-shell";
import type { BentoShellVariant } from "@/components/settings/bento-variant-styles";
import {
  formatNestOutboundMessage,
  NEST_MESSAGE_PLACEHOLDER_HINT,
  type NestMessageTemplateSettings,
} from "@/lib/nest/message-format";

async function fetchNestMessageTemplates(): Promise<{
  templates: NestMessageTemplateSettings;
  storeName: string | null;
}> {
  const res = await fetch("/api/store/nest-settings", { cache: "no-store" });
  const data = (await res.json()) as {
    templates?: NestMessageTemplateSettings;
    storeName?: string | null;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "Could not load message settings.");
  return {
    templates: data.templates ?? { intro: "Hi {name},", signoff: "— {store}" },
    storeName: data.storeName ?? null,
  };
}

async function saveNestMessageTemplates(templates: NestMessageTemplateSettings): Promise<void> {
  const res = await fetch("/api/store/nest-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(templates),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Could not save message settings.");
}

export function NestMessageTemplatesBento({
  variant = "light-beige-floating",
  className,
}: {
  variant?: BentoShellVariant;
  className?: string;
}) {
  const [intro, setIntro] = React.useState("Hi {name},");
  const [signoff, setSignoff] = React.useState("— {store}");
  const [storeName, setStoreName] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetchNestMessageTemplates()
      .then((data) => {
        if (cancelled) return;
        setIntro(data.templates.intro);
        setSignoff(data.templates.signoff);
        setStoreName(data.storeName);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load message settings.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const preview = formatNestOutboundMessage("Your wheel true is ready for pickup.", {
    firstName: "Tom",
    storeName,
    templates: { intro, signoff },
  });

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveNestMessageTemplates({ intro: intro.trim(), signoff: signoff.trim() });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save message settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <NestSettingsBentoShell
      title="Message intro and signoff"
      description="Used for outbound Nest texts such as work order pickup messages. Keep it short."
      variant={variant}
      className={className}
    >
      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-10 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading message settings…
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {error ? (
            <div className="rounded-md border border-red-100 bg-white px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          ) : null}
          {saved ? (
            <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
              Message settings saved.
            </div>
          ) : null}

          <p className="text-xs text-gray-500">{NEST_MESSAGE_PLACEHOLDER_HINT}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nest-intro">Intro</Label>
              <Input
                id="nest-intro"
                type="text"
                value={intro}
                onChange={(event) => {
                  setIntro(event.target.value);
                  setSaved(false);
                }}
                placeholder="Hi {name},"
                disabled={saving}
                className="rounded-md border-gray-200 bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nest-signoff">Signoff</Label>
              <Input
                id="nest-signoff"
                type="text"
                value={signoff}
                onChange={(event) => {
                  setSignoff(event.target.value);
                  setSaved(false);
                }}
                placeholder="— {store}"
                disabled={saving}
                className="rounded-md border-gray-200 bg-white"
              />
            </div>
          </div>

          <div className="rounded-[18px] border border-black/[0.05] bg-white/80 px-3 py-2.5">
            <p className="text-xs font-medium text-gray-500">Preview</p>
            <p className="mt-1 text-sm text-foreground">{preview}</p>
          </div>

          <div className="mt-auto flex justify-end pt-1">
            <Button type="button" onClick={() => void save()} disabled={saving} className="rounded-md">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>
      )}
    </NestSettingsBentoShell>
  );
}
