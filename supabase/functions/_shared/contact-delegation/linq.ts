import { createChat, sendMessage } from '../linq.ts';
import type { DelegationRuntime } from './types.ts';
import { getContactDelegationConfig } from './config.ts';

export function createContactDelegationRuntime(): DelegationRuntime {
  const config = getContactDelegationConfig();
  const dryRun = config.mode !== 'live';

  return {
    dryRun,
    sendOwnerMessage: async (chatId, text, effect) => {
      if (dryRun) {
        console.log('[contact-delegation] dry-run owner message', { chatId, text, effect });
        return `dry_run_owner_${crypto.randomUUID()}`;
      }
      const response = await sendMessage(chatId, text, effect);
      return response.message?.id ?? null;
    },
    sendTargetMessage: async (chatId, text) => {
      if (dryRun) {
        console.log('[contact-delegation] dry-run target message', { chatId, text });
        return `dry_run_target_${crypto.randomUUID()}`;
      }
      const response = await sendMessage(chatId, text);
      return response.message?.id ?? null;
    },
    createTargetChat: async (from, to, text) => {
      if (dryRun) {
        const id = `dry_run_chat_${crypto.randomUUID()}`;
        console.log('[contact-delegation] dry-run create target chat', { from, to, text, chatId: id });
        return {
          chatId: id,
          messageId: `dry_run_message_${crypto.randomUUID()}`,
          deliveryStatus: 'dry_run',
        };
      }
      const response = await createChat(from, to, text);
      return {
        chatId: response.chat?.id ?? null,
        messageId: response.chat?.message?.id ?? null,
        deliveryStatus: response.chat?.message?.delivery_status ?? null,
      };
    },
  };
}
