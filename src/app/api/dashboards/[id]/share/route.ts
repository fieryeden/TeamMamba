import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

function buildSharePayload(shareEnabled: boolean, shareToken: string | null) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3010";
  const shareUrl = shareEnabled && shareToken ? `${baseUrl}/share-dashboard/${shareToken}` : null;
  const embedCode = shareUrl
    ? `<iframe src="${shareUrl}" width="100%" height="720" style="border:0;border-radius:12px;" loading="lazy"></iframe>`
    : null;

  return {
    shareEnabled,
    shareToken,
    shareUrl,
    embedCode,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const dashboard = await prisma.dashboard.findUnique({
      where: { id, ownerId: user.id },
      select: { shareEnabled: true, shareToken: true },
    });

    if (!dashboard) return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });

    return NextResponse.json(buildSharePayload(dashboard.shareEnabled, dashboard.shareToken));
  } catch (err) {
    console.error("Get dashboard share error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const enabled = Boolean(body.enabled);
    const regenerate = Boolean(body.regenerate);

    const existing = await prisma.dashboard.findUnique({
      where: { id, ownerId: user.id },
      select: { id: true, shareToken: true },
    });
    if (!existing) return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });

    const shareToken = enabled
      ? (regenerate || !existing.shareToken ? randomBytes(20).toString("hex") : existing.shareToken)
      : existing.shareToken;

    const dashboard = await prisma.dashboard.update({
      where: { id },
      data: {
        shareEnabled: enabled,
        shareToken,
      },
      select: { shareEnabled: true, shareToken: true },
    });

    return NextResponse.json(buildSharePayload(dashboard.shareEnabled, dashboard.shareToken));
  } catch (err) {
    console.error("Update dashboard share error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
