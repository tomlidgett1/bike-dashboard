import { getOptionalEnv } from "./env.ts";

/** Whether inbound messages for this sender should use Nest Agent Runtime (NESTV3) before legacy orchestrator. */
export function nestV3RuntimeEnabledForHandle(handle: string): boolean {
  if (!/^(1|true|yes|on)$/i.test(getOptionalEnv("NEST_AGENT_RUNTIME_ENABLED") ?? "false")) {
    return false;
  }
  const allowed = (getOptionalEnv("NEST_AGENT_RUNTIME_ALLOWED_HANDLES") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(handle);
}
