// Shared OpenAI Responses API helpers for CRM agent.

import OpenAI from "openai";

export const CRM_AGENT_MODEL = "gpt-5.5";

let client: OpenAI | null = null;

export function getCrmOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

type ResponseOutputItem = {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
};

export function extractOutputText(response: OpenAI.Responses.Response): string {
  let outputText = "";
  for (const item of response.output ?? []) {
    if (item.type === "message") {
      for (const content of (item as ResponseOutputItem).content ?? []) {
        if (content.type === "output_text" && content.text) outputText += content.text;
      }
    }
  }
  return outputText;
}

export function parseJsonFromModel<T>(text: string): T | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}
