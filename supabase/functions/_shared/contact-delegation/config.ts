import { getListEnv, getOptionalEnv } from '../env.ts';

export type ContactDelegationMode = 'dry_run' | 'live';

export interface ContactDelegationConfig {
  enabled: boolean;
  mode: ContactDelegationMode;
  allowedHandles: string[];
  maxOwnerTasksPerDay: number;
  maxTargetFollowups: number;
  maxActivePerTarget: number;
  defaultExpiryHours: number;
}

function readIntEnv(name: string, fallback: number): number {
  const raw = getOptionalEnv(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getContactDelegationConfig(): ContactDelegationConfig {
  const mode = getOptionalEnv('CONTACT_DELEGATION_MODE') === 'live' ? 'live' : 'dry_run';
  return {
    enabled: /^(1|true|yes|on)$/i.test(getOptionalEnv('CONTACT_DELEGATION_ENABLED') ?? 'false'),
    mode,
    allowedHandles: getListEnv('CONTACT_DELEGATION_ALLOWED_HANDLES'),
    maxOwnerTasksPerDay: readIntEnv('CONTACT_DELEGATION_MAX_OWNER_TASKS_PER_DAY', 3),
    maxTargetFollowups: readIntEnv('CONTACT_DELEGATION_MAX_TARGET_FOLLOWUPS', 2),
    maxActivePerTarget: readIntEnv('CONTACT_DELEGATION_MAX_ACTIVE_PER_TARGET', 1),
    defaultExpiryHours: readIntEnv('CONTACT_DELEGATION_DEFAULT_EXPIRY_HOURS', 24),
  };
}

export function isHandleAllowedForContactDelegation(handle: string, config = getContactDelegationConfig()): boolean {
  if (config.allowedHandles.length === 0) return true;
  return config.allowedHandles.includes(handle);
}
