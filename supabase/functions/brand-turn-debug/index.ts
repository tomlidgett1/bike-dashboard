import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleBrandTurn } from '../_shared/orchestrator/handle-brand-turn.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const result = await handleBrandTurn({
      chatId: String(body.chatId ?? ''),
      senderHandle: String(body.senderHandle ?? ''),
      brandKey: String(body.brandKey ?? 'ash'),
      message: String(body.message ?? 'Hi'),
      sessionStartedAt: new Date().toISOString(),
      isGroupChat: false,
      participantNames: [],
      chatName: null,
      service: 'iMessage',
      images: [],
      audio: [],
      voiceMode: false,
      providerMessageId: body.providerMessageId ?? null,
    });

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const error = err as Error;
    return new Response(JSON.stringify({
      ok: false,
      error: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 12),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
