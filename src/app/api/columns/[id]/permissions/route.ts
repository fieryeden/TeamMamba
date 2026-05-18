import { NextRequest, NextResponse } from "next/server";
import { BoardRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

const EDITABLE_ROLES: BoardRole[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

async function getColumnWithMembership(columnId: string, userId: string) {
  const column = await prisma.boardColumn.findUnique({
    where: { id: columnId },
    include: {
      board: {
        select: {
          id: true,
          members: { where: { userId }, select: { role: true } },
        },
      },
    },
  });

  if (!column) return { error: "Column not found", status: 404 as const };

  const membership = column.board.members[0];
  if (!membership) return { error: "Forbidden", status: 403 as const };
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    return { error: "Only board owners/admins can manage column permissions", status: 403 as const };
  }

  return { column };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const access = await getColumnWithMembership(id, user.id);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

    const permissions = await prisma.columnPermission.findMany({
      where: { columnId: id },
      orderBy: { role: "asc" },
    });

    return NextResponse.json({ permissions });
  } catch (err) {
    console.error("Get column permissions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const access = await getColumnWithMembership(id, user.id);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

    const body = await req.json();
    const role = body.role as BoardRole;
    const canView = Boolean(body.canView);
    const canEdit = Boolean(body.canEdit);

    if (!EDITABLE_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const permission = await prisma.columnPermission.upsert({
      where: { columnId_role: { columnId: id, role } },
      update: {
        canView: role === "OWNER" ? true : canView,
        canEdit: role === "OWNER" ? true : canEdit,
      },
      create: {
        columnId: id,
        boardId: access.column.boardId,
        role,
        canView: role === "OWNER" ? true : canView,
        canEdit: role === "OWNER" ? true : canEdit,
      },
    });

    return NextResponse.json({ permission }, { status: 201 });
  } catch (err) {
    console.error("Create column permission error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const access = await getColumnWithMembership(id, user.id);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

    const body = await req.json();
    const permissions = Array.isArray(body.permissions)
      ? (body.permissions as Array<{ role: BoardRole; canView: boolean; canEdit: boolean }>).
          filter((entry) => EDITABLE_ROLES.includes(entry.role))
      : [];

    if (permissions.length === 0) {
      return NextResponse.json({ error: "permissions array required" }, { status: 400 });
    }

    await prisma.$transaction(
      permissions.map((entry) =>
        prisma.columnPermission.upsert({
          where: { columnId_role: { columnId: id, role: entry.role } },
          update: {
            canView: entry.role === "OWNER" ? true : Boolean(entry.canView),
            canEdit: entry.role === "OWNER" ? true : Boolean(entry.canEdit),
          },
          create: {
            columnId: id,
            boardId: access.column.boardId,
            role: entry.role,
            canView: entry.role === "OWNER" ? true : Boolean(entry.canView),
            canEdit: entry.role === "OWNER" ? true : Boolean(entry.canEdit),
          },
        })
      )
    );

    const updated = await prisma.columnPermission.findMany({
      where: { columnId: id },
      orderBy: { role: "asc" },
    });

    return NextResponse.json({ permissions: updated });
  } catch (err) {
    console.error("Update column permissions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const access = await getColumnWithMembership(id, user.id);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

    const body = await req.json().catch(() => ({}));
    const role = body.role as BoardRole | undefined;

    if (!role || !EDITABLE_ROLES.includes(role)) {
      return NextResponse.json({ error: "role required" }, { status: 400 });
    }

    if (role === "OWNER") {
      return NextResponse.json({ error: "OWNER permission cannot be removed" }, { status: 400 });
    }

    await prisma.columnPermission.deleteMany({ where: { columnId: id, role } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete column permission error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
