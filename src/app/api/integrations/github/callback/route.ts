import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

// GET /api/integrations/github/callback — OAuth callback
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.redirect("/login");

    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code) return NextResponse.redirect("/settings?error=oauth_failed");

    const { boardId } = JSON.parse(Buffer.from(state || "", "base64").toString());

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return NextResponse.redirect("/settings?error=oauth_failed");
    }

    if (boardId) {
      await prisma.integrationConfig.create({
        data: {
          boardId,
          userId: user.id,
          type: "github",
          config: { accessToken, connected: true },
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      });
    }

    return NextResponse.redirect("/settings?success=github_connected");
  } catch (err) {
    console.error("GitHub OAuth callback error:", err);
    return NextResponse.redirect("/settings?error=oauth_failed");
  }
}
