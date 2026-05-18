import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import crypto from "crypto";

/**
 * GET /api/boards/[id]/email-address
 * Retrieve (or auto-generate) the board's inbound email address.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: boardId } = await params;
    const membership = await prisma.boardMember.findFirst({
      where: { boardId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let emailAddress = await prisma.boardEmailAddress.findUnique({
      where: { boardId },
    });

    // Auto-generate if missing
    if (!emailAddress) {
      const shortId = boardId.slice(0, 8).toLowerCase();
      const address = `board-${shortId}@teammamba.app`;
      const secret = crypto.randomBytes(32).toString("hex");

      emailAddress = await prisma.boardEmailAddress.create({
        data: { boardId, address, secret, isEnabled: true },
      });
    }

    return NextResponse.json({
      address: emailAddress.address,
      isEnabled: emailAddress.isEnabled,
      defaultGroupId: emailAddress.defaultGroupId,
      defaultStatus: emailAddress.defaultStatus,
    });
  } catch (err) {
    console.error("Get board email address error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/boards/[id]/email-address
 * Update email ingestion settings.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: boardId } = await params;
    const membership = await prisma.boardMember.findFirst({
      where: { boardId, userId: user.id },
    });
    if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
      return NextResponse.json({ error: "Only owners/admins can update email settings" }, { status: 403 });
    }

    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body.isEnabled === "boolean") data.isEnabled = body.isEnabled;
    if (body.defaultGroupId !== undefined) data.defaultGroupId = body.defaultGroupId || null;
    if (body.defaultStatus !== undefined) data.defaultStatus = body.defaultStatus || null;

    const updated = await prisma.boardEmailAddress.upsert({
      where: { boardId },
      update: data,
      create: {
        boardId,
        address: `board-${boardId.slice(0, 8).toLowerCase()}@teammamba.app`,
        secret: crypto.randomBytes(32).toString("hex"),
        isEnabled: body.isEnabled ?? true,
        defaultGroupId: body.defaultGroupId || null,
        defaultStatus: body.defaultStatus || null,
      },
    });

    return NextResponse.json({
      address: updated.address,
      isEnabled: updated.isEnabled,
      defaultGroupId: updated.defaultGroupId,
      defaultStatus: updated.defaultStatus,
    });
  } catch (err) {
    console.error("Update board email address error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/boards/[id]/email-address
 * Disable email ingestion (does NOT delete the record).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: boardId } = await params;
    const membership = await prisma.boardMember.findFirst({
      where: { boardId, userId: user.id },
    });
    if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
      return NextResponse.json({ error: "Only owners/admins can disable email ingestion" }, { status: 403 });
    }

    const existing = await prisma.boardEmailAddress.findUnique({ where: { boardId } });
    if (!existing) {
      return NextResponse.json({ success: true, message: "No email address configured" });
    }

    await prisma.boardEmailAddress.update({
      where: { boardId },
      data: { isEnabled: false },
    });

    return NextResponse.json({ success: true, address: existing.address, isEnabled: false });
  } catch (err) {
    console.error("Disable board email error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
