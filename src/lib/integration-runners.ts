import crypto from "crypto";

export type SupportedIntegrationRunnerType =
  | "slack"
  | "microsoft_teams"
  | "github"
  | "webhook"
  | "zapier";

export type IntegrationRunAction = "TEST" | "EXECUTE" | "AUTOMATION";

export interface IntegrationConfigInput {
  id: string;
  type: string;
  config: unknown;
  enabled: boolean;
  boardId: string | null;
}

export interface IntegrationItemContext {
  id: string;
  boardId: string;
  boardName?: string;
  name: string;
  columnValues: Array<{ columnId: string; columnTitle?: string; columnType?: string; value: unknown }>;
  assignees: Array<{ userId: string; firstName?: string | null; lastName?: string | null }>;
}

export interface IntegrationRunContext {
  action: IntegrationRunAction;
  item?: IntegrationItemContext;
  itemUrl?: string;
  messageOverride?: string;
}

export interface IntegrationRunResult {
  ok: boolean;
  status?: number;
  data?: unknown;
}

type IntegrationRunner = (
  integration: IntegrationConfigInput,
  context: IntegrationRunContext
) => Promise<IntegrationRunResult>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readString(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseRepo(config: Record<string, unknown>): { owner: string; repo: string } | null {
  const owner = readString(config, "owner");
  const repo = readString(config, "repo");
  if (owner && repo && !repo.includes("/")) return { owner, repo };

  const combined = repo ?? readString(config, "repository");
  if (!combined) return null;
  const [fromOwner, fromRepo] = combined.split("/");
  if (!fromOwner || !fromRepo) return null;
  return { owner: fromOwner, repo: fromRepo };
}

function getStatusLabel(item?: IntegrationItemContext): string {
  if (!item) return "n/a";
  const status = item.columnValues.find((value) => value.columnType === "STATUS" || value.columnTitle?.toLowerCase().includes("status"));
  if (!status) return "n/a";
  if (typeof status.value === "string") return status.value;
  if (typeof status.value === "number") return String(status.value);
  return JSON.stringify(status.value);
}

function getAssigneeLabel(item?: IntegrationItemContext): string {
  if (!item || item.assignees.length === 0) return "Unassigned";
  const names = item.assignees.map((entry) => {
    const fullName = [entry.firstName, entry.lastName].filter(Boolean).join(" ").trim();
    return fullName || entry.userId;
  });
  return names.join(", ");
}

function buildItemMessage(item: IntegrationItemContext, itemUrl?: string): string {
  const lines = [
    `Item: ${item.name}`,
    `Status: ${getStatusLabel(item)}`,
    `Assignee: ${getAssigneeLabel(item)}`,
  ];
  if (itemUrl) lines.push(`Link: ${itemUrl}`);
  return lines.join("\n");
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function slackLikeRunner(
  integration: IntegrationConfigInput,
  context: IntegrationRunContext,
  options?: { teams?: boolean }
): Promise<IntegrationRunResult> {
  const config = asRecord(integration.config);
  const webhookUrl = readString(config, "webhookUrl") ?? readString(config, "url");
  if (!webhookUrl) {
    throw new Error("Missing webhookUrl in integration config");
  }

  const message = context.messageOverride
    ?? (context.item ? buildItemMessage(context.item, context.itemUrl) : "TeamMamba integration test ✅");

  const payload = options?.teams
    ? { text: message }
    : {
        text: message,
        mrkdwn: true,
      };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const rawBody = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    data: rawBody ? parseJsonSafe(rawBody) : null,
  };
}

async function githubRunner(
  integration: IntegrationConfigInput,
  context: IntegrationRunContext
): Promise<IntegrationRunResult> {
  const config = asRecord(integration.config);
  const accessToken = readString(config, "accessToken") ?? readString(config, "token");
  if (!accessToken) throw new Error("Missing accessToken in integration config");

  const parsed = parseRepo(config);
  if (!parsed) throw new Error("Missing repo in config. Use owner/repo or owner + repo fields.");

  if (context.action === "TEST") {
    const verifyResponse = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    const raw = await verifyResponse.text();
    return {
      ok: verifyResponse.ok,
      status: verifyResponse.status,
      data: raw ? parseJsonSafe(raw) : null,
    };
  }

  if (!context.item) throw new Error("GitHub issue creation requires an item payload");

  const issueTitle = `[TeamMamba] ${context.item.name}`;
  const issueBody = buildItemMessage(context.item, context.itemUrl);

  const createResponse = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/issues`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: issueTitle, body: issueBody }),
  });

  const raw = await createResponse.text();
  return {
    ok: createResponse.ok,
    status: createResponse.status,
    data: raw ? parseJsonSafe(raw) : null,
  };
}

async function webhookRunner(
  integration: IntegrationConfigInput,
  context: IntegrationRunContext
): Promise<IntegrationRunResult> {
  const config = asRecord(integration.config);
  const targetUrl = readString(config, "url") ?? readString(config, "webhookUrl");
  if (!targetUrl) throw new Error("Missing webhook url in integration config");

  const secret = readString(config, "secret") ?? "";
  const payload = context.item
    ? {
        source: "TeamMamba",
        action: context.action,
        timestamp: new Date().toISOString(),
        item: {
          id: context.item.id,
          boardId: context.item.boardId,
          name: context.item.name,
          status: getStatusLabel(context.item),
          assignee: getAssigneeLabel(context.item),
          url: context.itemUrl ?? null,
        },
      }
    : {
        source: "TeamMamba",
        action: context.action,
        test: true,
        message: context.messageOverride ?? "TeamMamba integration test ✅",
        timestamp: new Date().toISOString(),
      };

  const body = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-TeamMamba-Signature": `sha256=${signature}`,
      "X-TeamMamba-Action": context.action,
    },
    body,
  });

  const raw = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    data: raw ? parseJsonSafe(raw) : null,
  };
}

async function zapierRunner(
  integration: IntegrationConfigInput,
  context: IntegrationRunContext
): Promise<IntegrationRunResult> {
  const config = asRecord(integration.config);
  const webhookUrl = readString(config, "webhookUrl");
  if (!webhookUrl) throw new Error("Missing webhookUrl in integration config");

  const payload = context.item
    ? {
        action: context.action,
        boardId: context.item.boardId,
        itemId: context.item.id,
        itemName: context.item.name,
        status: getStatusLabel(context.item),
        assignee: getAssigneeLabel(context.item),
        url: context.itemUrl ?? null,
        timestamp: new Date().toISOString(),
      }
    : {
        action: context.action,
        test: true,
        message: context.messageOverride ?? "TeamMamba integration test ✅",
        timestamp: new Date().toISOString(),
      };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    data: raw ? parseJsonSafe(raw) : null,
  };
}

export const INTEGRATION_RUNNERS: Record<SupportedIntegrationRunnerType, IntegrationRunner> = {
  slack: (integration, context) => slackLikeRunner(integration, context),
  microsoft_teams: (integration, context) => slackLikeRunner(integration, context, { teams: true }),
  github: githubRunner,
  webhook: webhookRunner,
  zapier: zapierRunner,
};

export function hasIntegrationRunner(type: string): type is SupportedIntegrationRunnerType {
  return Object.prototype.hasOwnProperty.call(INTEGRATION_RUNNERS, type);
}

export async function runIntegration(
  integration: IntegrationConfigInput,
  context: IntegrationRunContext
): Promise<IntegrationRunResult> {
  if (!integration.enabled && context.action !== "TEST") {
    throw new Error("Integration is disabled");
  }

  if (!hasIntegrationRunner(integration.type)) {
    throw new Error(`No runner configured for integration type: ${integration.type}`);
  }

  return INTEGRATION_RUNNERS[integration.type](integration, context);
}
