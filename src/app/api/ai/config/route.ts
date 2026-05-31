import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";
import { saveAIConfig, getAIConfig } from "@/lib/ai-config";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const config = await getAIConfig(user.id);
    return NextResponse.json({
      provider: config?.provider ?? null,
      model: config?.model ?? null,
      baseUrl: config?.baseUrl ?? null,
      hasApiKey: Boolean(config?.apiKey),
    });
  } catch (err) {
    console.error("AI config GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { provider, model, baseUrl, apiKey } = body as {
      provider?: string;
      model?: string;
      baseUrl?: string;
      apiKey?: string;
    };

    await saveAIConfig(user.id, {
      provider: provider as any,
      model,
      baseUrl,
      apiKey,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("AI config POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
