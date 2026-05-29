import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";

// GET /api/integrations/github/oauth — Initiate GitHub OAuth
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const boardId = searchParams.get("boardId");
    const clientId = process.env.GITHUB_CLIENT_ID;

    if (!clientId) {
      return NextResponse.json({ error: "GitHub OAuth not configured. Set GITHUB_CLIENT_ID env var." }, { status: 500 });
    }

    const state = Buffer.from(JSON.stringify({ userId: user.id, boardId })).toString("base64");
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3010"}/api/integrations/github/callback`;

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo&state=${state}`;

    return NextResponse.json({ authUrl });
  } catch (err) {
    console.error("GitHub OAuth error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
