import Fastify from "fastify";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";
import { getConfig } from "./config.js";
import { MediaStreamBridge } from "./media-bridge.js";
import {
  buildTwilioValidationUrl,
  twimlConnectStream,
  validateTwilioRequest,
} from "./twilio-auth.js";
import { upsertCallSession } from "./supabase.js";

function formBodyToRecord(body: unknown): Record<string, string> {
  if (!body || typeof body !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") out[key] = value;
    else if (value != null) out[key] = String(value);
  }
  return out;
}

async function main() {
  const config = getConfig();
  const app = Fastify({ logger: true });

  await app.register(formbody);
  await app.register(websocket);

  app.get("/health", async () => ({
    ok: true,
    service: "twilio-openai-bridge",
    region: "syd",
    timestamp: new Date().toISOString(),
  }));

  const handleTwilioIncoming = async (
    request: { body: unknown; headers: Record<string, string | string[] | undefined> },
    reply: { code: (status: number) => { send: (body: string) => void }; type: (contentType: string) => { send: (body: string) => void } },
    validationPath: string,
  ) => {
    const params = formBodyToRecord(request.body);
    const signature = request.headers["x-twilio-signature"] as string | undefined;
    const validationUrl = buildTwilioValidationUrl(config.publicUrl, validationPath);

    if (
      !validateTwilioRequest(config.twilioAuthToken, signature, validationUrl, params)
    ) {
      return reply.code(403).send("Invalid Twilio signature");
    }

    const callSid = params.CallSid ?? "";
    const from = params.From ?? "";
    const to = params.To ?? "";

    if (callSid) {
      await upsertCallSession({
        callSid,
        fromE164: from,
        toE164: to,
        status: "ringing",
      });
    }

    const wsBase = config.publicUrl.replace(/^http/, "ws");
    const streamUrl = `${wsBase.replace(/\/$/, "")}/media`;

    reply
      .type("text/xml")
      .send(twimlConnectStream(streamUrl, { From: from, To: to, CallSid: callSid }));
  };

  app.post("/twilio/incoming", async (request, reply) =>
    handleTwilioIncoming(request, reply, "/twilio/incoming"),
  );

  app.post("/twiml-inbound", async (request, reply) =>
    handleTwilioIncoming(request, reply, "/twiml-inbound"),
  );

  app.post("/twilio/status", async (request, reply) => {
    const params = formBodyToRecord(request.body);
    const signature = request.headers["x-twilio-signature"] as string | undefined;
    const validationUrl = buildTwilioValidationUrl(config.publicUrl, "/twilio/status");

    if (
      !validateTwilioRequest(config.twilioAuthToken, signature, validationUrl, params)
    ) {
      return reply.code(403).send("Invalid Twilio signature");
    }

    const callSid = params.CallSid ?? "";
    const callStatus = params.CallStatus ?? "";
    const duration = params.CallDuration ? Number(params.CallDuration) : undefined;

    if (callSid) {
      const terminal = ["completed", "busy", "failed", "no-answer", "canceled"].includes(
        callStatus,
      );
      if (terminal) {
        await upsertCallSession({
          callSid,
          fromE164: params.From,
          toE164: params.To,
          status: callStatus === "completed" ? "completed" : "failed",
          durationSeconds: Number.isFinite(duration) ? duration : undefined,
          errorMessage: callStatus !== "completed" ? callStatus : undefined,
        });
      }
    }

    reply.send("");
  });

  app.register(async (mediaRoutes) => {
    mediaRoutes.get("/media", { websocket: true }, (socket) => {
      new MediaStreamBridge(socket);
    });
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`Bridge listening on :${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
