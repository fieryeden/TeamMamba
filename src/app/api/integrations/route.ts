import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { z } from "zod";

/**
 * GET /api/integrations
 * List all integration configs for the current user (optionally filtered by boardId)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const boardId = searchParams.get("boardId");

    const where: Record<string, unknown> = { createdById: user.id };
    if (boardId) where.boardId = boardId;

    const integrations = await prisma.integrationConfig.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ integrations });
  } catch (err) {
    console.error("List integrations error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const createIntegrationSchema = z.object({
  type: z.string().min(1),
  config: z.record(z.unknown()),
  boardId: z.string().uuid().optional(),
  enabled: z.boolean().default(true),
});

/**
 * POST /api/integrations
 * Create a new integration config
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const parsed = createIntegrationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { type, config, boardId, enabled } = parsed.data;

    // Validate type against supported integrations
    const SUPPORTED_TYPES = [
      "slack", "google_drive", "google_calendar", "outlook",
      "jira", "github", "gitlab", "zapier", "webhook",
      "microsoft_teams", "asana", "trello", "notion",
      "salesforce", "hubspot", "figma", "adobe_creative",
    ];

    if (!SUPPORTED_TYPES.includes(type)) {
      return NextResponse.json({ error: `Unsupported integration type: ${type}`, supportedTypes: SUPPORTED_TYPES }, { status: 400 });
    }

    const integration = await prisma.integrationConfig.create({
      data: {
        type,
        config: config as any,
        enabled,
        createdById: user.id,
        boardId: boardId ?? null,
      },
    });

    return NextResponse.json({ integration }, { status: 201 });
  } catch (err) {
    console.error("Create integration error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
