import {
  isPilotCustomerHandle,
  isEligibleForInlineYoutube,
  runCustomerAutomationTick,
  tryInlineYoutubeSend,
} from "./customer-automations.ts";

const LOG_PREFIX = "[onboard-listener]";

/**
 * Fires when onboard_count === 10: run the pin-favourite media automation.
 */
export async function onOnboardCountReachedTen(handle: string): Promise<void> {
  if (!isPilotCustomerHandle(handle)) {
    console.log(`${LOG_PREFIX} pin-favourite skip (not pilot)`, { handle });
    return;
  }

  console.log(
    `${LOG_PREFIX} running pin-favourite tick`,
    { handle, triggeredBy: "onboard_count_listener" },
  );

  const result = await runCustomerAutomationTick({
    handles: [handle],
    limit: 1,
    manual: false,
    triggeredBy: "onboard_count_listener",
  });

  console.log(
    `${LOG_PREFIX} pin-favourite tick finished`,
    {
      handle,
      processed: result.processed,
      sent: result.sent,
      skipped: result.skipped,
      errors: result.errors,
      actions: result.actions.map((a) => ({
        ruleKey: a.ruleKey,
        status: a.status,
        reason: a.reason,
      })),
    },
  );
}

/**
 * Fires on each onboarding turn (count 3-19, not 10): try to send an
 * inline YouTube video for the first interesting topic in the conversation.
 * One-shot — uses the existing claim guard so it only sends once.
 */
export async function onOnboardTurnYoutube(
  handle: string,
  onboardCount: number,
): Promise<void> {
  if (!isPilotCustomerHandle(handle)) return;
  if (!isEligibleForInlineYoutube(onboardCount)) return;

  console.log(
    `${LOG_PREFIX} inline YouTube check`,
    { handle, onboardCount },
  );

  const result = await tryInlineYoutubeSend(handle);

  if (result) {
    console.log(
      `${LOG_PREFIX} inline YouTube result`,
      {
        handle,
        status: result.status,
        reason: result.reason,
      },
    );
  } else {
    console.log(
      `${LOG_PREFIX} inline YouTube: no action (no topic or not eligible)`,
      { handle, onboardCount },
    );
  }
}
