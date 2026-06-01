import type { AppConfig } from "../config.js";
import { aiHostUnavailable } from "../errors.js";

export type AiHostChatTurn = { role: "system" | "user" | "assistant"; content: string };

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

/** Deterministic canned reply used in test/mock mode (no OpenAI call). */
export function mockChatReply(systemPrompt: string, userContent: string): string {
  const mentionsUndo = /undo/i.test(userContent);
  const mentionsRamp = /\bramp\b|key\s*3|press\s*3/i.test(userContent);
  const parts = ["[mock] World Host here."];
  if (mentionsUndo) parts.push("To undo, press ⌘Z (Ctrl+Z on Windows/Linux), or use the Undo button.");
  if (mentionsRamp) parts.push("Key 3 selects the Ramp tool — press R to aim it, then click to place.");
  parts.push(`You asked: ${userContent.slice(0, 200)}`);
  parts.push(`(corpus ${systemPrompt.includes("WORLD-BUILDING GUIDE") ? "loaded" : "missing"})`);
  return parts.join(" ");
}

async function* mockStream(reply: string): AsyncGenerator<string> {
  for (const word of reply.split(" ")) {
    yield `${word} `;
  }
}

/**
 * Stream a chat completion as text deltas. Yields incremental content strings.
 * In mock mode (or test env without a key + mock flag) returns a canned, corpus-aware reply.
 */
export async function* streamChatCompletion(
  config: AppConfig,
  input: { model: string; system: string; messages: AiHostChatTurn[]; temperature?: number }
): AsyncGenerator<string> {
  if (config.tuning.aiWorldHostMockResponses) {
    const lastUser = [...input.messages].reverse().find((m) => m.role === "user");
    yield* mockStream(mockChatReply(input.system, lastUser?.content ?? ""));
    return;
  }

  if (!config.openAiApiKey) {
    throw aiHostUnavailable();
  }

  const response = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.openAiApiKey}`
    },
    body: JSON.stringify({
      model: input.model,
      temperature: input.temperature ?? 0.3,
      stream: true,
      messages: [{ role: "system", content: input.system }, ...input.messages]
    })
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    console.error("[ai-host] OpenAI chat request failed", {
      status: response.status,
      model: input.model,
      body: detail.slice(0, 500)
    });
    throw aiHostUnavailable();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      for (const line of event.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice("data:".length).trim();
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string | null } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // ignore keep-alive or partial frames
        }
      }
    }
  }
}

/** Collect a full (non-streamed) reply by draining the stream — used by tests and fallbacks. */
export async function collectChatReply(
  config: AppConfig,
  input: { model: string; system: string; messages: AiHostChatTurn[]; temperature?: number }
): Promise<string> {
  let full = "";
  for await (const delta of streamChatCompletion(config, input)) {
    full += delta;
  }
  return full.trim();
}
