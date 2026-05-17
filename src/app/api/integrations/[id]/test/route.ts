import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { runIntegration } from "@/lib/integration-runners";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const integration = await prisma.integrationConfig.findUnique({ where: { id } });
    if (!integration || integration.createdById !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let success = false;
    let result: unknown = null;
    let message = "Connection test failed";

    try {
      const runResult = await runIntegration(
        {
          id: integration.id,
          type: integration.type,
          config: integration.config,
          enabled: integration.enabled,
          boardId: integration.boardId,
        },
        {
          action: "TEST",
          messageOverride: "TeamMamba integration test ✅",
        }
      );

      success = runResult.ok;
      result = runResult;
      message = runResult.ok
        ? "Connection test passed"
        : `Connection test failed with status ${runResult.status ?? "unknown"}`;
    } catch (err) {
      success = false;
      const errorMessage = err instanceof Error ? err.message : "Unknown test error";
      result = { error: errorMessage };
      message = errorMessage;
    }

    await prisma.integrationLog.create({
      data: {
        integrationId: integration.id,
        action: "TEST",
        success,
        result: JSON.parse(JSON.stringify(result ?? null)),
      },
    });

    return NextResponse.json({ success, message });
  } catch (err) {
    console.error("Test integration error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
