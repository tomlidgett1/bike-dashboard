import type { ToolContract } from './types.ts';

export const emailDraftTool: ToolContract = {
  name: 'email_draft',
  description:
    "Create an email draft. Stores the draft locally for the user to review. Does NOT send the email. After creating a draft, show it to the user and wait for explicit confirmation before sending with email_send.",
  namespace: 'email.write',
  sideEffect: 'draft',
  idempotent: false,
  requiresConfirmation: false,
  timeoutMs: 5000,
  inputSchema: {
    type: 'object' as const,
    properties: {
      to: {
        type: 'array',
        items: { type: 'string' },
        description: 'Recipient email addresses.',
      },
      subject: {
        type: 'string',
        description: 'Email subject line.',
      },
      body: {
        type: 'string',
        description: 'Email body text. Include greeting and sign-off.',
      },
      cc: {
        type: 'array',
        items: { type: 'string' },
        description: 'CC recipients (optional).',
      },
      bcc: {
        type: 'array',
        items: { type: 'string' },
        description: 'BCC recipients (optional).',
      },
      reply_to_thread_id: {
        type: 'string',
        description: 'Thread ID to reply to (optional).',
      },
      reply_all: {
        type: 'boolean',
        description: 'Whether to reply-all (default false).',
      },
      account: {
        type: 'string',
        description: 'Optional: which connected account to use.',
      },
    },
    required: ['to', 'subject', 'body'],
  },
  handler: async (input, ctx) => {
    if (!ctx.authUserId) return { content: 'Email not connected. The user needs to verify their account first to access email.' };

    const { createPendingEmailSend } = await import('../state.ts');
    const { findAccountForRecipients } = await import('../gmail-helpers.ts');
    const to = Array.isArray(input.to) ? input.to.filter((v): v is string => typeof v === 'string' && v.includes('@')) : [];
    if (to.length === 0) {
      return { content: 'Cannot create draft: no valid recipient email addresses provided. Please provide at least one recipient.' };
    }
    const subject = typeof input.subject === 'string' ? input.subject : null;
    const bodyText = typeof input.body === 'string' ? input.body : null;
    const cc = Array.isArray(input.cc) ? input.cc.filter((v): v is string => typeof v === 'string') : [];
    const bcc = Array.isArray(input.bcc) ? input.bcc.filter((v): v is string => typeof v === 'string') : [];
    const replyToThreadId = typeof input.reply_to_thread_id === 'string' ? input.reply_to_thread_id : null;
    const replyAll = typeof input.reply_all === 'boolean' ? input.reply_all : false;
    const requestedAccount = typeof input.account === 'string' && input.account.includes('@') ? input.account : null;

    // Resolve the sender mailbox: prefer the account that has previously
    // emailed this recipient, so the conversation thread stays on the
    // account the recipient already knows. Only honour an explicit
    // `account` arg when the model truly knows which mailbox to use
    // (e.g. user said "send from my work account").
    let resolvedAccount: string | null = requestedAccount;
    let accountSource: 'requested' | 'history' | 'sole_account' | 'primary_fallback' | 'unknown' = requestedAccount ? 'requested' : 'unknown';
    if (!resolvedAccount) {
      try {
        const match = await findAccountForRecipients(ctx.authUserId, [...to, ...cc, ...bcc]);
        if (match) {
          resolvedAccount = match.account;
          accountSource = match.source;
          console.log(`[email-write] sender resolved (${match.source}): ${match.account}${match.lastSentAt ? ` last_sent=${new Date(match.lastSentAt).toISOString()}` : ''}`);
        }
      } catch (err) {
        console.warn(`[email-write] sender resolution failed: ${(err as Error).message}`);
      }
    } else {
      console.log(`[email-write] sender taken from explicit account arg: ${resolvedAccount}`);
    }

    const pendingAction = await createPendingEmailSend({
      chatId: ctx.chatId,
      account: resolvedAccount,
      to,
      subject,
      bodyText,
      cc,
      bcc,
      replyToThreadId,
      replyAll,
      metadata: { account_source: accountSource },
    });

    if (!pendingAction) {
      return {
        content: 'Failed to create draft. Please try again.',
        structuredData: { action: 'draft', draftId: null },
      };
    }

    console.log(`[email-write] draft stored locally: pending_action_id=${pendingAction.id}, from=${resolvedAccount ?? 'unknown'}, to=${to.join(',')}, subject=${subject}`);

    return {
      content: JSON.stringify({
        draft_id: String(pendingAction.id),
        status: 'awaiting_user_approval',
        preview: {
          from: resolvedAccount,
          from_source: accountSource,
          to,
          subject,
          bodyText: bodyText?.substring(0, 500),
        },
        instructions: 'When you show this draft to the user, you MUST include the From line so they can see which mailbox will send it. Then ask explicitly for confirmation before calling email_send.',
      }),
      structuredData: {
        action: 'draft',
        draftId: String(pendingAction.id),
        from: resolvedAccount,
        fromSource: accountSource,
        to,
        subject,
        bodyText,
        pendingActionId: pendingAction.id,
      },
    };
  },
};

export const emailUpdateDraftTool: ToolContract = {
  name: 'email_update_draft',
  description:
    "Update an existing pending email draft. Use when the user asks to revise the email before sending. Only works on drafts with status 'awaiting_user_approval'.",
  namespace: 'email.write',
  sideEffect: 'draft',
  idempotent: false,
  requiresConfirmation: false,
  timeoutMs: 5000,
  inputSchema: {
    type: 'object' as const,
    properties: {
      draft_id: {
        type: 'string',
        description: 'The draft ID to update. Optional if there is exactly one pending draft.',
      },
      to: {
        type: 'array',
        items: { type: 'string' },
        description: 'Updated recipient list (optional).',
      },
      subject: {
        type: 'string',
        description: 'Updated subject (optional).',
      },
      body: {
        type: 'string',
        description: 'Updated body text (optional).',
      },
      cc: {
        type: 'array',
        items: { type: 'string' },
        description: 'Updated CC recipients (optional).',
      },
      bcc: {
        type: 'array',
        items: { type: 'string' },
        description: 'Updated BCC recipients (optional).',
      },
    },
    required: [],
  },
  handler: async (input, ctx) => {
    if (!ctx.authUserId) return { content: 'Email not connected.' };

    const { updatePendingEmailDraft } = await import('../state.ts');
    const { findAccountForRecipients } = await import('../gmail-helpers.ts');

    const draftIdStr = typeof input.draft_id === 'string' ? input.draft_id : null;
    const draftId = draftIdStr ? parseInt(draftIdStr, 10) : (ctx.pendingEmailSend?.id ?? null);

    if (!draftId || isNaN(draftId)) {
      return { content: 'No pending draft to update. Create a draft first.' };
    }

    const updates: Record<string, unknown> = {};
    let recipientsChanged = false;
    if (Array.isArray(input.to)) {
      updates.to = input.to.filter((v: unknown): v is string => typeof v === 'string');
      recipientsChanged = true;
    }
    if (typeof input.subject === 'string') updates.subject = input.subject;
    if (typeof input.body === 'string') updates.bodyText = input.body;
    if (Array.isArray(input.cc)) {
      updates.cc = input.cc.filter((v: unknown): v is string => typeof v === 'string');
      recipientsChanged = true;
    }
    if (Array.isArray(input.bcc)) {
      updates.bcc = input.bcc.filter((v: unknown): v is string => typeof v === 'string');
      recipientsChanged = true;
    }

    const updated = await updatePendingEmailDraft(draftId, updates as Parameters<typeof updatePendingEmailDraft>[1]);

    if (!updated) {
      return { content: 'Could not update draft. It may have already been sent or cancelled.' };
    }

    // If recipients changed, re-derive the sender from sent history so
    // the From: stays correct for the new recipient set.
    let resolvedAccount = updated.account ?? null;
    let accountSource: 'unchanged' | 'history' | 'sole_account' | 'primary_fallback' | 'unknown' = 'unchanged';
    if (recipientsChanged) {
      try {
        const match = await findAccountForRecipients(ctx.authUserId, [
          ...updated.to,
          ...updated.cc,
          ...updated.bcc,
        ]);
        if (match) {
          resolvedAccount = match.account;
          accountSource = match.source;
          if (match.account !== updated.account) {
            const { getAdminClient } = await import('../supabase.ts');
            const { PENDING_ACTIONS_TABLE } = await import('../env.ts');
            const supabase = getAdminClient();
            await supabase
              .from(PENDING_ACTIONS_TABLE)
              .update({ account: match.account })
              .eq('id', updated.id);
            console.log(`[email-write] sender re-resolved (${match.source}) after recipient change: ${match.account}`);
          }
        }
      } catch (err) {
        console.warn(`[email-write] sender re-resolution failed: ${(err as Error).message}`);
      }
    }

    console.log(`[email-write] draft updated: pending_action_id=${updated.id}, from=${resolvedAccount ?? 'unknown'}`);

    return {
      content: JSON.stringify({
        draft_id: String(updated.id),
        status: updated.status,
        preview: {
          from: resolvedAccount,
          from_source: accountSource,
          to: updated.to,
          subject: updated.subject,
          bodyText: updated.bodyText?.substring(0, 500),
        },
        instructions: 'Re-show the updated draft to the user with the From line, then ask for confirmation again before calling email_send.',
      }),
      structuredData: {
        action: 'update_draft',
        draftId: String(updated.id),
        from: resolvedAccount,
        fromSource: accountSource,
        to: updated.to,
        subject: updated.subject,
        pendingActionId: updated.id,
      },
    };
  },
};

export const emailSendTool: ToolContract = {
  name: 'email_send',
  description:
    "Send a previously created email draft. Reads the draft from the draft store, creates it in Gmail/Outlook, and sends it in one step. ONLY call after explicit user confirmation.",
  namespace: 'email.write',
  sideEffect: 'commit',
  idempotent: false,
  requiresConfirmation: true,
  timeoutMs: 20000,
  inputSchema: {
    type: 'object' as const,
    properties: {
      draft_id: {
        type: 'string',
        description: 'The draft ID to send. Optional if there is exactly one pending draft.',
      },
    },
    required: [],
  },
  handler: async (input, ctx) => {
    if (!ctx.authUserId) return { content: 'Email not connected. The user needs to verify their account first to access email.' };

    const { getLatestPendingEmailSend, completePendingEmailSend, failPendingEmailSend } = await import('../state.ts');

    const draftIdStr = typeof input.draft_id === 'string' ? input.draft_id : null;
    const draftId = draftIdStr ? parseInt(draftIdStr, 10) : null;

    let draft = ctx.pendingEmailSend;
    if (draftId && draft?.id !== draftId) {
      draft = await getLatestPendingEmailSend(ctx.chatId);
    }
    if (!draft) {
      draft = await getLatestPendingEmailSend(ctx.chatId);
    }

    if (!draft) {
      return {
        content: 'No pending draft to send. Create a draft first with email_draft.',
        structuredData: { action: 'send', sent: false, error: 'no_pending_draft' },
      };
    }

    if (draft.status !== 'awaiting_confirmation') {
      return {
        content: `This draft has already been ${draft.status}. Create a new draft if needed.`,
        structuredData: { action: 'send', sent: false, error: `draft_status_${draft.status}` },
      };
    }

    if (!draft.bodyText || draft.to.length === 0) {
      return {
        content: 'Draft is incomplete (missing body or recipients). Please update the draft first.',
        structuredData: { action: 'send', sent: false, error: 'incomplete_draft' },
      };
    }

    try {
      const { sendDraftTool: gmailCreateDraft, sendEmailTool: gmailSendEmail } = await import('../gmail-helpers.ts');

      const draftResult = await gmailCreateDraft(ctx.authUserId, {
        to: draft.to,
        subject: draft.subject,
        body: draft.bodyText,
        cc: draft.cc.length > 0 ? draft.cc : undefined,
        bcc: draft.bcc.length > 0 ? draft.bcc : undefined,
        reply_to_thread_id: draft.replyToThreadId ?? undefined,
        reply_all: draft.replyAll,
        account: draft.account ?? undefined,
      });

      const dr = draftResult as Record<string, unknown>;
      const gmailDraftId = typeof dr.draft_id === 'string' ? dr.draft_id : null;
      // Always pin send-time account to the one stored on the draft so the
      // mailbox the user already approved (and saw in the From: line) is
      // the one that actually sends.
      const account = (draft.account ?? (typeof dr.account === 'string' ? dr.account : undefined)) ?? undefined;

      if (!gmailDraftId) {
        await failPendingEmailSend(draft.id, 'draft_creation_failed');
        return {
          content: JSON.stringify({
            status: 'send_failed',
            sent: false,
            verified: false,
            error: 'draft_creation_failed',
            _instruction: 'The email was NOT sent. Tell the user honestly that creating the draft on the provider failed and ask if they want to retry. NEVER say "Done", "Sent", or imply the email went through.',
          }),
          structuredData: { action: 'send', sent: false, verified: false, error: 'draft_creation_failed', pendingActionId: draft.id },
        };
      }

      const sendResult = await gmailSendEmail(ctx.authUserId, {
        draft_id: gmailDraftId,
        account,
      });

      const sr = sendResult as Record<string, unknown>;
      const messageId = typeof sr.message_id === 'string' ? sr.message_id : null;

      // No message_id means the provider didn't acknowledge the send. Treat
      // as a hard failure — never tell the user it was sent.
      if (!messageId) {
        await failPendingEmailSend(draft.id, 'no_message_id_from_provider');
        return {
          content: JSON.stringify({
            status: 'send_failed',
            sent: false,
            verified: false,
            error: 'no_message_id_from_provider',
            _instruction: 'The provider did not return a message id, so the send is NOT confirmed. Tell the user the send did not go through and ask if they want to retry. NEVER say "Done" or "Sent".',
          }),
          structuredData: { action: 'send', sent: false, verified: false, error: 'no_message_id_from_provider', pendingActionId: draft.id },
        };
      }

      const { resolveToken, verifyEmailSentWithRetry } = await import('../gmail-helpers.ts');
      let verified = false;
      let verifyReason: string | undefined;
      try {
        const { accessToken, provider: resolvedProvider } = await resolveToken(ctx.authUserId, account as string | undefined);
        const verification = await verifyEmailSentWithRetry(accessToken, messageId, resolvedProvider as 'google' | 'microsoft');
        verified = verification.verified;
        verifyReason = verification.reason;
        console.log(`[email-write] verification: verified=${verified}${verifyReason ? `, reason=${verifyReason}` : ''}`);
      } catch (verifyErr) {
        console.warn(`[email-write] verification threw (treated as unverified): ${(verifyErr as Error).message}`);
        verifyReason = `verification exception: ${(verifyErr as Error).message}`;
      }

      if (!verified) {
        // The send API succeeded but the provider hasn't surfaced the
        // message in its sent index after several retries. Do NOT mark the
        // pending action as completed — leave it as failed/pending so the
        // user is told honestly we couldn't confirm delivery.
        await failPendingEmailSend(draft.id, `unverified: ${verifyReason ?? 'unknown'}`);
        console.warn(`[email-write] email send unverified: pending_action_id=${draft.id}, message_id=${messageId}, reason=${verifyReason}`);
        return {
          content: JSON.stringify({
            status: 'unverified',
            sent: false,
            verified: false,
            message_id: messageId,
            from: account ?? null,
            to: draft.to,
            subject: draft.subject,
            reason: verifyReason ?? 'verification timed out',
            _instruction: 'CRITICAL: the send is NOT confirmed. The provider accepted the request but the message has not appeared in the SENT folder/label after multiple checks. Tell the user EXACTLY: "I tried to send the email but I haven\'t been able to confirm it landed in your sent folder yet — please check Gmail/Outlook directly and let me know if it didn\'t go through." Do NOT respond with "Done ✓" or "Sent" under any circumstances.',
          }),
          structuredData: {
            action: 'send',
            sent: false,
            verified: false,
            messageId,
            from: account ?? null,
            to: draft.to,
            subject: draft.subject,
            pendingActionId: draft.id,
            reason: verifyReason ?? 'verification timed out',
          },
        };
      }

      await completePendingEmailSend(draft.id, messageId, true);
      console.log(`[email-write] email verified_sent: pending_action_id=${draft.id}, message_id=${messageId}`);

      return {
        content: JSON.stringify({
          status: 'verified_sent',
          sent: true,
          verified: true,
          message_id: messageId,
          from: account ?? null,
          to: draft.to,
          subject: draft.subject,
          _instruction: 'The send is fully confirmed. Respond with exactly "Done ✓" (nothing else unless the user asked a question).',
        }),
        structuredData: {
          action: 'send',
          sent: true,
          verified: true,
          messageId,
          from: account ?? null,
          to: draft.to,
          subject: draft.subject,
          pendingActionId: draft.id,
        },
      };
    } catch (err) {
      await failPendingEmailSend(draft.id, (err as Error).message);
      return {
        content: JSON.stringify({
          status: 'send_failed',
          sent: false,
          verified: false,
          error: (err as Error).message,
          _instruction: 'The email was NOT sent. Tell the user honestly the send failed and offer to try again. NEVER say "Done" or "Sent".',
        }),
        structuredData: {
          action: 'send',
          sent: false,
          verified: false,
          error: (err as Error).message,
          pendingActionId: draft.id,
        },
      };
    }
  },
};

export const emailCancelDraftTool: ToolContract = {
  name: 'email_cancel_draft',
  description:
    "Cancel a pending email draft. Use when the user says they don't want to send it.",
  namespace: 'email.write',
  sideEffect: 'draft',
  idempotent: true,
  requiresConfirmation: false,
  timeoutMs: 5000,
  inputSchema: {
    type: 'object' as const,
    properties: {
      draft_id: {
        type: 'string',
        description: 'The draft ID to cancel. Optional if there is exactly one pending draft.',
      },
    },
    required: [],
  },
  handler: async (input, ctx) => {
    const { cancelPendingEmailSends } = await import('../state.ts');

    const draftIdStr = typeof input.draft_id === 'string' ? input.draft_id : null;

    if (draftIdStr) {
      const { getAdminClient } = await import('../supabase.ts');
      const { PENDING_ACTIONS_TABLE } = await import('../env.ts');
      const supabase = getAdminClient();
      await supabase
        .from(PENDING_ACTIONS_TABLE)
        .update({ status: 'cancelled', failure_reason: 'user_cancelled' })
        .eq('id', parseInt(draftIdStr, 10));
    } else {
      await cancelPendingEmailSends(ctx.chatId, 'user_cancelled');
    }

    return {
      content: JSON.stringify({ ok: true, status: 'cancelled' }),
      structuredData: { action: 'cancel_draft', cancelled: true },
    };
  },
};
