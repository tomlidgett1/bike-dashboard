"use client";

import * as React from "react";
import { Loader2, Phone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  OPENAI_REALTIME_MODELS,
  OPENAI_REALTIME_VOICES,
  type PhoneAiCallSessionRow,
  type PhoneAiNumberRow,
  type TwilioIncomingNumber,
} from "@/lib/phone-ai/types";

export function PhoneAiLiveLab() {
  const [health, setHealth] = React.useState<{
    ok: boolean;
    bridgeConfigured: boolean;
    message?: string;
  } | null>(null);
  const [inventory, setInventory] = React.useState<TwilioIncomingNumber[]>([]);
  const [numbers, setNumbers] = React.useState<PhoneAiNumberRow[]>([]);
  const [calls, setCalls] = React.useState<PhoneAiCallSessionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [selectedSid, setSelectedSid] = React.useState("");
  const [draftModel, setDraftModel] = React.useState("gpt-realtime-2");
  const [draftVoice, setDraftVoice] = React.useState("marin");
  const [draftInstructions, setDraftInstructions] = React.useState(
    "You are Tom on a live phone call. Speak naturally — warm, relaxed, human. Use contractions and plain Australian English. Keep answers to one or two short sentences unless the caller asks for more.",
  );

  const selectedInventory = inventory.find((n) => n.sid === selectedSid);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, inventoryRes, numbersRes, callsRes] = await Promise.all([
        fetch("/api/phone-ai/health"),
        fetch("/api/phone-ai/twilio-inventory"),
        fetch("/api/phone-ai/numbers"),
        fetch("/api/phone-ai/calls?limit=20"),
      ]);

      const healthJson = (await healthRes.json()) as {
        ok: boolean;
        bridgeConfigured: boolean;
        message?: string;
      };
      setHealth(healthJson);

      if (inventoryRes.ok) {
        const inv = (await inventoryRes.json()) as { numbers: TwilioIncomingNumber[] };
        setInventory(inv.numbers ?? []);
      }

      if (numbersRes.ok) {
        const nums = (await numbersRes.json()) as { numbers: PhoneAiNumberRow[] };
        setNumbers(nums.numbers ?? []);
      }

      if (callsRes.ok) {
        const callJson = (await callsRes.json()) as { calls: PhoneAiCallSessionRow[] };
        setCalls(callJson.calls ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load phone AI data");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const registerNumber = async () => {
    if (!selectedInventory) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/phone-ai/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twilioPhoneNumberSid: selectedInventory.sid,
          twilioPhoneNumberE164: selectedInventory.phoneNumber,
          label: selectedInventory.friendlyName,
          openaiModel: draftModel,
          voice: draftVoice,
          instructions: draftInstructions,
        }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? "Registration failed");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSaving(false);
    }
  };

  const updateNumber = async (id: string, patch: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/phone-ai/numbers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Update failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="rounded-md border border-border/60 bg-white p-4">
        <p className="text-sm text-muted-foreground">
          Inbound PSTN calls hit Twilio Media Streams (AU1) → Sydney bridge → OpenAI Realtime
          WebSocket. Configure <code className="text-xs">PHONE_AI_BRIDGE_URL</code> and deploy the
          bridge service before registering numbers.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-white px-3 py-1.5">
          <span
            className={cn(
              "size-2 rounded-full",
              health?.ok ? "bg-emerald-500" : "bg-gray-300",
              health && !health.ok && health.bridgeConfigured && "bg-amber-500",
            )}
          />
          <span className="text-sm font-medium text-gray-800">
            Bridge {health?.ok ? "healthy" : health?.bridgeConfigured ? "unreachable" : "not configured"}
          </span>
        </div>
        <Button type="button" variant="outline" size="sm" className="rounded-md" onClick={() => void refresh()}>
          <RefreshCw className={cn("mr-2 size-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="rounded-md border border-border/60 bg-white p-4">
        <h3 className="mb-3 text-sm font-medium text-gray-800">Setup checklist</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>Twilio account homed in AU1 (Sydney) with AU phone numbers</li>
          <li>Bridge deployed to Fly.io <code className="text-xs">syd</code> with secrets set</li>
          <li><code className="text-xs">PHONE_AI_BRIDGE_URL</code> set in Vercel env</li>
          <li>Register a number below — webhooks point to the bridge automatically</li>
        </ul>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-white p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-md border border-border/60 bg-white p-4">
          <h3 className="text-sm font-medium text-gray-800">Register Twilio number</h3>

          <div className="space-y-2">
            <Label htmlFor="twilio-number">Twilio number</Label>
            <Select value={selectedSid} onValueChange={setSelectedSid}>
              <SelectTrigger id="twilio-number" className="rounded-md">
                <SelectValue placeholder="Select a number from your account" />
              </SelectTrigger>
              <SelectContent>
                {inventory.map((item) => (
                  <SelectItem key={item.sid} value={item.sid}>
                    {item.phoneNumber} — {item.friendlyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Model</Label>
              <Select value={draftModel} onValueChange={setDraftModel}>
                <SelectTrigger className="rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPENAI_REALTIME_MODELS.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Voice</Label>
              <Select value={draftVoice} onValueChange={setDraftVoice}>
                <SelectTrigger className="rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPENAI_REALTIME_VOICES.map((voice) => (
                    <SelectItem key={voice} value={voice}>
                      {voice}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone-instructions">Instructions</Label>
            <Textarea
              id="phone-instructions"
              value={draftInstructions}
              onChange={(e) => setDraftInstructions(e.target.value)}
              rows={3}
              className="resize-none rounded-md"
            />
          </div>

          <Button
            type="button"
            className="rounded-md"
            disabled={!selectedInventory || saving || !health?.bridgeConfigured}
            onClick={() => void registerNumber()}
          >
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Phone className="mr-2 size-4" />}
            Enable AI on number
          </Button>
        </div>

        <div className="space-y-3 rounded-md border border-border/60 bg-white p-4">
          <h3 className="text-sm font-medium text-gray-800">Active numbers</h3>
          {numbers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No numbers registered yet.</p>
          ) : (
            <div className="space-y-3">
              {numbers.map((number) => (
                <div key={number.id} className="rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{number.twilio_phone_number_e164}</p>
                      <p className="text-xs text-muted-foreground">{number.label}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">AI on</span>
                      <Switch
                        checked={number.enabled}
                        onCheckedChange={(enabled) =>
                          void updateNumber(number.id, { enabled })
                        }
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {number.openai_model} · {number.voice}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-md border border-border/60 bg-white">
        <div className="border-b border-border/60 px-4 py-3">
          <h3 className="text-sm font-medium text-gray-800">Recent calls</h3>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-4">
          {calls.length === 0 ? (
            <p className="text-sm text-muted-foreground">Call a registered number to test.</p>
          ) : (
            <div className="space-y-3">
              {calls.map((call) => (
                <div key={call.id} className="rounded-md border border-border/60 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-gray-800">
                      {call.from_e164 ?? "Unknown"} → {call.to_e164 ?? "Unknown"}
                    </span>
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {call.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(call.created_at).toLocaleString("en-AU")}
                    {call.latency_metrics?.speechToFirstAudioMs != null
                      ? ` · ${String(call.latency_metrics.speechToFirstAudioMs)}ms to first audio`
                      : ""}
                  </p>
                  {Array.isArray(call.transcript) && call.transcript.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {call.transcript.map((turn, index) => (
                        <p key={index} className="text-xs text-gray-700">
                          <span className="font-medium capitalize">{turn.role}:</span> {turn.text}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
