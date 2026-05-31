import { prisma } from "@/lib/prisma";

export type AIConfig = {
  provider?: "openai" | "anthropic";
  model?: string;
  baseUrl?: string;
  apiKey?: string;
};

/**
 * Get AI configuration for a user.
 * Priority: database-stored config > environment variables.
 */
export async function getAIConfig(userId: string): Promise<AIConfig | null> {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });
    if (!settings) return null;

    return {
      provider: (settings.aiProvider as AIConfig["provider"]) ?? undefined,
      model: settings.aiModel ?? undefined,
      baseUrl: settings.aiBaseUrl ?? undefined,
      apiKey: settings.aiApiKey ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Save AI configuration for a user.
 */
export async function saveAIConfig(userId: string, config: AIConfig): Promise<void> {
  await prisma.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      aiProvider: config.provider ?? null,
      aiModel: config.model ?? null,
      aiBaseUrl: config.baseUrl ?? null,
      aiApiKey: config.apiKey ?? null,
    },
    update: {
      aiProvider: config.provider ?? null,
      aiModel: config.model ?? null,
      aiBaseUrl: config.baseUrl ?? null,
      aiApiKey: config.apiKey ?? null,
    },
  });
}

/**
 * Merge request-level config with stored config and env vars.
 * Request-level values take highest priority.
 */
export function mergeAIConfig(
  requestConfig: AIConfig,
  storedConfig: AIConfig | null,
): AIConfig {
  return {
    provider: requestConfig.provider || storedConfig?.provider || undefined,
    model: requestConfig.model || storedConfig?.model || undefined,
    baseUrl: requestConfig.baseUrl || storedConfig?.baseUrl || undefined,
    apiKey: requestConfig.apiKey || storedConfig?.apiKey || undefined,
  };
}
