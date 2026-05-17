import { NextRequest, NextResponse } from "next/server";
import { validateFormulaExpression } from "@/lib/formulas";
import { z } from "zod";

const validateSchema = z.object({
  formula: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = validateSchema.parse(body);
    const result = validateFormulaExpression(parsed.formula);

    if (!result.valid) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ valid: false, error: "formula is required" }, { status: 400 });
    }
    console.error("Validate formula error:", err);
    return NextResponse.json({ valid: false, error: "Internal server error" }, { status: 500 });
  }
}
