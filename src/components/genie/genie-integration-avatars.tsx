"use client";

import * as React from "react";
import { AvatarCircles, type AvatarCircleItem } from "@/registry/magicui/avatar-circles";

type IntegrationStatus = {
  gmail?: { connected: boolean; email?: string | null };
  xero?: { configured: boolean; connected: boolean; organisation_name?: string | null };
  deputy?: { configured: boolean; connected: boolean; account_name?: string | null };
  lightspeed?: { connected: boolean; account_name?: string | null };
};

type LightspeedStatusPayload = {
  isConnected?: boolean;
  connection?: { status?: string; account_id?: string | null; account_name?: string | null } | null;
  accountInfo?: { id?: string; name?: string | null } | null;
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function isLightspeedLinked(payload: LightspeedStatusPayload | null): boolean {
  if (!payload) return false;
  if (payload.isConnected === true) return true;
  return (
    payload.connection?.status === "connected" &&
    Boolean(payload.connection.account_id || payload.accountInfo?.id)
  );
}

function buildAvatars(status: IntegrationStatus): AvatarCircleItem[] {
  const avatars: AvatarCircleItem[] = [];

  if (status.gmail?.connected) {
    avatars.push({
      imageUrl: "/gmailnew.webp",
      label: status.gmail.email ? `Gmail — ${status.gmail.email}` : "Gmail connected",
    });
  }

  if (status.xero?.configured && status.xero.connected) {
    avatars.push({
      imageUrl: "/xero.png",
      label: status.xero.organisation_name
        ? `Xero — ${status.xero.organisation_name}`
        : "Xero connected",
    });
  }

  if (status.deputy?.configured && status.deputy.connected) {
    avatars.push({
      imageUrl: "/deputy.png",
      label: status.deputy.account_name
        ? `Deputy — ${status.deputy.account_name}`
        : "Deputy connected",
    });
  }

  if (status.lightspeed?.connected) {
    avatars.push({
      imageUrl: "/ls.png",
      label: status.lightspeed.account_name
        ? `Lightspeed — ${status.lightspeed.account_name}`
        : "Lightspeed connected",
      imageScale: 1.15,
    });
  }

  return avatars;
}

/**
 * Overlapping integration avatars shown above the Genie input when services are connected.
 */
export function GenieIntegrationAvatars({ className }: { className?: string }) {
  const [avatars, setAvatars] = React.useState<AvatarCircleItem[] | null>(null);

  const loadAvatars = React.useCallback(async () => {
    const [gmail, xero, deputy, lightspeed] = await Promise.all([
      fetchJson<{
        configured?: boolean;
        connected?: boolean;
        accounts?: Array<{ email_address?: string | null }>;
        gmail?: { email_address?: string | null };
      }>("/api/composio/status"),
      fetchJson<{
        configured?: boolean;
        connected?: boolean;
        organisation_name?: string | null;
      }>("/api/xero/status"),
      fetchJson<{
        configured?: boolean;
        connected?: boolean;
        account_name?: string | null;
      }>("/api/deputy/status"),
      fetchJson<LightspeedStatusPayload>("/api/lightspeed/status"),
    ]);

    return buildAvatars({
      gmail: gmail
        ? {
            connected: gmail.connected === true,
            email:
              gmail.accounts?.[0]?.email_address ??
              gmail.gmail?.email_address ??
              null,
          }
        : undefined,
      xero: xero
        ? {
            configured: xero.configured === true,
            connected: xero.connected === true,
            organisation_name: xero.organisation_name,
          }
        : undefined,
      deputy: deputy
        ? {
            configured: deputy.configured === true,
            connected: deputy.connected === true,
            account_name: deputy.account_name,
          }
        : undefined,
      lightspeed: isLightspeedLinked(lightspeed)
        ? {
            connected: true,
            account_name:
              lightspeed?.accountInfo?.name ??
              lightspeed?.connection?.account_name ??
              null,
          }
        : undefined,
    });
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    void loadAvatars().then((next) => {
      if (!cancelled) setAvatars(next);
    });

    const refresh = () => {
      void loadAvatars().then((next) => {
        if (!cancelled) setAvatars(next);
      });
    };

    window.addEventListener("focus", refresh);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [loadAvatars]);

  if (!avatars || avatars.length === 0) return null;

  return <AvatarCircles avatarUrls={avatars} size="sm" className={className} />;
}
