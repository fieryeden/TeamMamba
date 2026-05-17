import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { z } from "zod";

const patchSchema = z.object({
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

/**
 * GET /api/integrations/[id]
 * Get a single integration config
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const integration = await prisma.integrationConfig.findUnique({ where: { id } });
    if (!integration || integration.createdById !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ integration });
  } catch (err) {
    console.error("Get integration error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/integrations/[id]
 * Update integration config or enabled status
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const integration = await prisma.integrationConfig.findUnique({ where: { id } });
    if (!integration || integration.createdById !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const updated = await prisma.integrationConfig.update({
      where: { id },
      data: parsed.data as Record<string, unknown> as any,
    });

    return NextResponse.json({ integration: updated });
  } catch (err) {
    console.error("Patch integration error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/integrations/[id]
 * Remove an integration config
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const integration = await prisma.integrationConfig.findUnique({ where: { id } });
    if (!integration || integration.createdById !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.integrationConfig.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete integration error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
