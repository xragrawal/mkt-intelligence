// Shared LLM abstraction — supports Gemini Direct (Google AI), Lovable AI Gateway, and Claude (Anthropic)
// Toggle the active provider by passing `provider` option or setting LLM_PROVIDER env var.

export type LLMProvider = "gemini_direct" | "lovable" | "claude";

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
  if (env === "gemini_direct" || env === "lovable" || env === "claude") return env;
  return "gemini_direct"; // default
}

// ── Gemini Direct (Google AI Studio / Generative Language API) ──

/** Recursively sanitize a JSON Schema for Gemini's API:
 *  - Convert `"type": ["string", "null"]` → `"type": "string", "nullable": true`
 *  - Remove `additionalProperties` (unsupported)
 */
function sanitizeSchemaForGemini(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeSchemaForGemini);

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "additionalProperties") continue;
    if (key === "type" && Array.isArray(value)) {
      const types = (value as string[]).filter(t => t !== "null");
      result.type = types.length === 1 ? types[0] : types[0] || "string";
      if ((value as string[]).includes("null")) result.nullable = true;
    } else {
      result[key] = sanitizeSchemaForGemini(value);
    }
  }
  return result;
}

function convertToolsToGeminiDirect(tools: any[]): any[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: sanitizeSchemaForGemini(t.function.parameters),
  }));
}

async function callGeminiDirect(opts: LLMCallOptions): Promise<LLMResult> {
  const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured");

  const model = opts.model || "gemini-2.5-flash";

  const contents: any[] = [];
  
  // System instruction is separate in Gemini API
  const systemInstruction = { parts: [{ text: opts.systemPrompt }] };
  
  contents.push({ role: "user", parts: [{ text: opts.userMessage }] });

  const body: any = {
    contents,
    system_instruction: systemInstruction,
    generationConfig: {
      maxOutputTokens: 16384,
    },
  };

  if (opts.tools?.length) {
    body.tools = [{
      function_declarations: convertToolsToGeminiDirect(opts.tools),
    }];
    if (opts.toolChoice) {
      // Force a specific function call
      body.tool_config = {
        function_calling_config: {
          mode: "ANY",
          allowed_function_names: opts.toolChoice?.function?.name ? [opts.toolChoice.function.name] : undefined,
        },
      };
    }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 429) throw new RateLimitError();
  if (response.status === 402) throw new CreditsExhaustedError();
  if (!response.ok) {
    const errText = await response.text();
    console.error("Gemini Direct error:", response.status, errText);
    throw new Error("Gemini Direct API call failed: " + errText);
  }

  const data = await response.json();
  
  // Extract function call from Gemini response
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  
  const fnCallPart = parts.find((p: any) => p.functionCall);
  if (fnCallPart) {
    return {
      toolCall: {
        name: fnCallPart.functionCall.name,
        arguments: JSON.stringify(fnCallPart.functionCall.args),
      },
    };
  }

  // Extract text
  const textPart = parts.find((p: any) => p.text);
  return { content: textPart?.text || "" };
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

  const toolBlock = data.content?.find((b: any) => b.type === "tool_use");
  if (toolBlock) {
    return {
      toolCall: {
        name: toolBlock.name,
        arguments: JSON.stringify(toolBlock.input),
      },
    };
  }

  const textBlock = data.content?.find((b: any) => b.type === "text");
  return { content: textBlock?.text || "" };
}

// ── Lovable AI Gateway ──

async function callLovable(opts: LLMCallOptions): Promise<LLMResult> {
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
    console.error("Lovable AI error:", response.status, errText);
    throw new Error("Lovable AI Gateway call failed");
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

export const LLM_PROVIDERS: { id: LLMProvider; label: string; model: string }[] = [
  { id: "gemini_direct", label: "Gemini 2.5 Flash", model: "gemini-2.5-flash" },
  { id: "lovable", label: "Lovable AI", model: "google/gemini-3-flash-preview" },
  { id: "claude", label: "Claude Sonnet 4", model: "claude-sonnet-4-20250514" },
];

export async function callLLM(opts: LLMCallOptions): Promise<LLMResult> {
  const provider = opts.provider || getProvider();
  switch (provider) {
    case "gemini_direct": return callGeminiDirect(opts);
    case "claude": return callClaude(opts);
    case "lovable": return callLovable(opts);
    default: return callGeminiDirect(opts);
  }
}
