const COOLDOWN_MS = 5 * 60 * 1000;
const STORAGE_PREFIX = "lightspeed-action-required:last-shown:v1:";

export const LIGHTSPEED_ACTION_REQUIRED_COOLDOWN_MS = COOLDOWN_MS;

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`;
}

export function readActionRequiredLastShownAt(scope: string | null): number {
  if (!scope || typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    const value = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function writeActionRequiredLastShownAt(scope: string, at = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(scope), String(at));
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function isActionRequiredCooldownElapsed(
  scope: string | null,
  now = Date.now(),
): boolean {
  if (!scope) return false;
  return now - readActionRequiredLastShownAt(scope) >= COOLDOWN_MS;
}

/** Prevent preview + global host from opening at the same time. */
let activeSurfaces = 0;

export function claimActionRequiredSurface(): boolean {
  if (activeSurfaces > 0) return false;
  activeSurfaces += 1;
  return true;
}

export function releaseActionRequiredSurface(): void {
  activeSurfaces = Math.max(0, activeSurfaces - 1);
}

export function isActionRequiredSurfaceActive(): boolean {
  return activeSurfaces > 0;
}
