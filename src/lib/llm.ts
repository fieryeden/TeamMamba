const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";

export interface LLMChatOptions {
  model?: string;
  provider?: "openai" | "anthropic";
  temperature?: number;
  maxOutputTokens?: number;
  maxInputTokens?: number;
  baseUrl?: string;
  apiKey?: string;
}

export interface LLMChatResult {
  text: string;
  provider: "openai" | "anthropic" | "none";
  model: string;
  fallback: boolean;
  truncated: boolean;
  promptTokensEstimate: number;
  completionTokensEstimate: number;
}

export interface LLMJSONResult<T> extends LLMChatResult {
  data: T | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function truncateTextToTokens(text: string, maxTokens: number): { text: string; truncated: boolean; tokens: number } {
  const tokens = estimateTokens(text);
  if (tokens <= maxTokens) {
    return { text, truncated: false, tokens };
  }

  const maxChars = Math.max(200, maxTokens * 4);
  const truncatedText = `${text.slice(0, maxChars)}\n\n[Truncated ${tokens - maxTokens} estimated tokens for context window.]`;
  return { text: truncatedText, truncated: true, tokens: maxTokens };
}

export function truncatePrompt(
  systemPrompt: string,
  userPrompt: string,
  maxInputTokens = 9000
): { systemPrompt: string; userPrompt: string; truncated: boolean; promptTokens: number } {
  const systemTokens = estimateTokens(systemPrompt);
  const userTokens = estimateTokens(userPrompt);
  const total = systemTokens + userTokens;

  if (total <= maxInputTokens) {
    return { systemPrompt, userPrompt, truncated: false, promptTokens: total };
  }

  const availableForUser = Math.max(1000, maxInputTokens - systemTokens);
  const truncatedUser = truncateTextToTokens(userPrompt, availableForUser);
  return {
    systemPrompt,
    userPrompt: truncatedUser.text,
    truncated: true,
    promptTokens: systemTokens + truncatedUser.tokens,
  };
}

function extractJsonObject(text: string): string | null {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function getProvider():
  | { provider: "openai"; key: string; model: string }
  | { provider: "anthropic"; key: string; model: string }
  | { provider: "none"; key: ""; model: "" } {
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", key: process.env.OPENAI_API_KEY, model: OPENAI_MODEL };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", key: process.env.ANTHROPIC_API_KEY, model: ANTHROPIC_MODEL };
  }
  return { provider: "none", key: "", model: "" };
}

async function callOpenAI(
  key: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  options: LLMChatOptions
): Promise<string> {
  const base = (options.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxOutputTokens ?? 800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const text = payload.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI returned an empty completion.");
  }
  return text;
}

async function callAnthropic(
  key: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  options: LLMChatOptions
): Promise<string> {
  const base = (options.baseUrl || "https://api.anthropic.com/v1").replace(/\/+$/, "");
  const response = await fetch(`${base}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      max_tokens: options.maxOutputTokens ?? 800,
      temperature: options.temperature ?? 0.2,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const text = payload.content?.find((entry) => entry.type === "text")?.text;
  if (!text) {
    throw new Error("Anthropic returned an empty completion.");
  }
  return text;
}

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  const maxRetries = 2;
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }
      const delay = 350 * 2 ** attempt;
      await sleep(delay);
      attempt += 1;
    }
  }
}

export async function chat(
  systemPrompt: string,
  userPrompt: string,
  options: LLMChatOptions = {}
): Promise<LLMChatResult> {
  const envProvider = getProvider();
  const effectiveKey = options.apiKey || "";
  const selected = options.provider
    ? options.provider === "openai"
      ? { provider: "openai" as const, key: effectiveKey || process.env.OPENAI_API_KEY ?? "", model: OPENAI_MODEL }
      : { provider: "anthropic" as const, key: effectiveKey || process.env.ANTHROPIC_API_KEY ?? "", model: ANTHROPIC_MODEL }
    : effectiveKey
      ? { provider: "openai" as const, key: effectiveKey, model: OPENAI_MODEL }
      : envProvider;
  const prompt = truncatePrompt(systemPrompt, userPrompt, options.maxInputTokens ?? 9000);

  if (selected.provider === "none" && !effectiveKey) {
    return {
      text: "",
      provider: "none",
      model: "none",
      fallback: true,
      truncated: prompt.truncated,
      promptTokensEstimate: prompt.promptTokens,
      completionTokensEstimate: 0,
    };
  }

  const text = await callWithRetry(() => {
    if (selected.provider === "openai") {
      return callOpenAI(selected.key, options.model ?? selected.model, prompt.systemPrompt, prompt.userPrompt, options);
    }
    return callAnthropic(selected.key, options.model ?? selected.model, prompt.systemPrompt, prompt.userPrompt, options);
  });

  return {
    text,
    provider: selected.provider,
    model: options.model ?? selected.model,
    fallback: false,
    truncated: prompt.truncated,
    promptTokensEstimate: prompt.promptTokens,
    completionTokensEstimate: estimateTokens(text),
  };
}

export async function chatJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  options: LLMChatOptions = {}
): Promise<LLMJSONResult<T>> {
  const response = await chat(systemPrompt, userPrompt, options);
  if (response.fallback || !response.text.trim()) {
    return {
      ...response,
      data: null,
    };
  }

  const raw = response.text.trim();
  const objectText = extractJsonObject(raw) ?? raw;

  try {
    const data = JSON.parse(objectText) as T;
    return {
      ...response,
      data,
    };
  } catch (error) {
    throw new Error(`Failed to parse LLM JSON response: ${(error as Error).message}`);
  }
}

// ─── Tool / Function Calling Support ──────────────────────────

export interface LLMTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatWithToolsResult {
  text: string;
  provider: string;
  model: string;
  fallback: boolean;
  toolCalls: LLMToolCall[];
  truncated: boolean;
  promptTokensEstimate: number;
  completionTokensEstimate: number;
}

async function callOpenAITools(
  key: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  tools: LLMTool[],
  options: LLMChatOptions,
): Promise<{ text: string; toolCalls: LLMToolCall[] }> {
  const base = (options.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxOutputTokens ?? 800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      tool_choice: "auto",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI tools request failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };

  const msg = payload.choices?.[0]?.message;
  const text = msg?.content || "";
  const toolCalls: LLMToolCall[] = (msg?.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
  }));

  return { text, toolCalls };
}

async function callAnthropicTools(
  key: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  tools: LLMTool[],
  options: LLMChatOptions,
): Promise<{ text: string; toolCalls: LLMToolCall[] }> {
  const base = (options.baseUrl || "https://api.anthropic.com/v1").replace(/\/+$/, "");
  const response = await fetch(`${base}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      max_tokens: options.maxOutputTokens ?? 800,
      temperature: options.temperature ?? 0.2,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic tools request failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as {
    content?: Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    >;
  };

  const textParts: string[] = [];
  const toolCalls: LLMToolCall[] = [];

  for (const block of payload.content || []) {
    if (block.type === "text") {
      textParts.push(block.text);
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input,
      });
    }
  }

  return { text: textParts.join("\n"), toolCalls };
}

export async function chatWithTools(
  systemPrompt: string,
  userPrompt: string,
  tools: LLMTool[],
  options: LLMChatOptions = {},
): Promise<ChatWithToolsResult> {
  const envProvider = getProvider();
  const effectiveKey = options.apiKey || "";
  const selected = options.provider
    ? options.provider === "openai"
      ? { provider: "openai" as const, key: effectiveKey || process.env.OPENAI_API_KEY ?? "", model: OPENAI_MODEL }
      : { provider: "anthropic" as const, key: effectiveKey || process.env.ANTHROPIC_API_KEY ?? "", model: ANTHROPIC_MODEL }
    : effectiveKey
      ? { provider: "openai" as const, key: effectiveKey, model: OPENAI_MODEL }
      : envProvider;
  const prompt = truncatePrompt(systemPrompt, userPrompt, options.maxInputTokens ?? 9000);

  if (selected.provider === "none" && !effectiveKey) {
    return {
      text: "",
      provider: "none",
      model: "none",
      fallback: true,
      toolCalls: [],
      truncated: prompt.truncated,
      promptTokensEstimate: prompt.promptTokens,
      completionTokensEstimate: 0,
    };
  }

  const { text, toolCalls } = await callWithRetry(() => {
    if (selected.provider === "openai") {
      return callOpenAITools(selected.key, options.model ?? selected.model, prompt.systemPrompt, prompt.userPrompt, tools, options);
    }
    return callAnthropicTools(selected.key, options.model ?? selected.model, prompt.systemPrompt, prompt.userPrompt, tools, options);
  });

  return {
    text,
    provider: selected.provider,
    model: options.model ?? selected.model,
    fallback: false,
    toolCalls,
    truncated: prompt.truncated,
    promptTokensEstimate: prompt.promptTokens,
    completionTokensEstimate: estimateTokens(text),
  };
}

export function isLLMConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}
