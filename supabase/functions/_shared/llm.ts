// Shared LLM abstraction — supports Claude (Anthropic) and Gemini (Lovable AI Gateway)
// Toggle the active provider by changing LLM_PROVIDER env var or the default below.

export type LLMProvider = "claude" | "gemini";

interface LLMCallOptions {
  systemPrompt: string;
  userMessage: string;
  tools?: any[];
  toolChoice?: any;
  /** Override the default provider */
  provider?: LLMProvider;
  /** Model overrides per provider */
  model?: string;
}

interface LLMResult {
  toolCall?: { name: string; arguments: string };
  content?: string;
}

function getProvider(): LLMProvider {
  const env = Deno.env.get("LLM_PROVIDER");
  if (env === "gemini" || env === "claude") return env;
  return "claude"; // default to Claude for now
}

// ── Claude (Anthropic) ──

function convertToolsToClaude(tools: any[]): any[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

function convertToolChoiceClaude(toolChoice: any): any {
  if (toolChoice?.type === "function") {
    return { type: "tool", name: toolChoice.function.name };
  }
  return { type: "auto" };
}

async function callClaude(opts: LLMCallOptions): Promise<LLMResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const model = opts.model || "claude-sonnet-4-20250514";

  const body: any = {
    model,
    max_tokens: 16384,
    system: opts.systemPrompt,
    messages: [{ role: "user", content: opts.userMessage }],
  };

  if (opts.tools?.length) {
    body.tools = convertToolsToClaude(opts.tools);
    if (opts.toolChoice) {
      body.tool_choice = convertToolChoiceClaude(opts.toolChoice);
    }
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 429) throw new RateLimitError();
  if (response.status === 402) throw new CreditsExhaustedError();
  if (!response.ok) {
    const errText = await response.text();
    console.error("Claude error:", response.status, errText);
    throw new Error("Claude API call failed");
  }

  const data = await response.json();

  // Extract tool use block
  const toolBlock = data.content?.find((b: any) => b.type === "tool_use");
  if (toolBlock) {
    return {
      toolCall: {
        name: toolBlock.name,
        arguments: JSON.stringify(toolBlock.input),
      },
    };
  }

  // Extract text
  const textBlock = data.content?.find((b: any) => b.type === "text");
  return { content: textBlock?.text || "" };
}

// ── Gemini (Lovable AI Gateway) ──

async function callGemini(opts: LLMCallOptions): Promise<LLMResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const model = opts.model || "google/gemini-3-flash-preview";

  const body: any = {
    model,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userMessage },
    ],
  };

  if (opts.tools?.length) {
    body.tools = opts.tools;
    if (opts.toolChoice) body.tool_choice = opts.toolChoice;
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 429) throw new RateLimitError();
  if (response.status === 402) throw new CreditsExhaustedError();
  if (!response.ok) {
    const errText = await response.text();
    console.error("Gemini error:", response.status, errText);
    throw new Error("Gemini API call failed");
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall) {
    return {
      toolCall: {
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      },
    };
  }

  return { content: data.choices?.[0]?.message?.content || "" };
}

// ── Public API ──

export class RateLimitError extends Error {
  constructor() { super("Rate limited — please try again shortly"); }
}

export class CreditsExhaustedError extends Error {
  constructor() { super("AI credits exhausted. Please add credits."); }
}

export async function callLLM(opts: LLMCallOptions): Promise<LLMResult> {
  const provider = opts.provider || getProvider();
  return provider === "claude" ? callClaude(opts) : callGemini(opts);
}
