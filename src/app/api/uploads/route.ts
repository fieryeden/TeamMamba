import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { uploadFileSchema } from "@/lib/validations";
import { broadcastToBoard } from "@/lib/socket";

const uploadDir = path.join(process.cwd(), "public", "uploads");

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file");
    const itemId = formData.get("itemId");
    const columnId = formData.get("columnId");
    const parsed = uploadFileSchema.parse({ itemId, columnId });

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    await mkdir(uploadDir, { recursive: true });
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const ext = path.extname(file.name) || "";
    const safeName = `${randomUUID()}${ext}`;
    const filepath = path.join(uploadDir, safeName);
    await writeFile(filepath, buffer);
    const fileMeta = {
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      url: `/uploads/${safeName}`,
      uploadedAt: new Date().toISOString(),
    };

    const item = await prisma.item.findUnique({
      where: { id: parsed.itemId },
      select: { id: true, boardId: true },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const existing = await prisma.columnValue.findFirst({
      where: { itemId: item.id, columnId: parsed.columnId },
      include: { column: true },
    });

    const existingFiles = Array.isArray(existing?.value) ? existing?.value : [];
    const nextFiles = [...existingFiles, fileMeta];

    const columnValue = existing
      ? await prisma.columnValue.update({
          where: { id: existing.id },
          data: { value: nextFiles as any },
          include: { column: true },
        })
      : await prisma.columnValue.create({
          data: {
            itemId: item.id,
            columnId: parsed.columnId,
            value: [fileMeta] as any,
          },
          include: { column: true },
        });

    broadcastToBoard(item.boardId, "column:updated", { boardId: item.boardId, columnValue });
    return NextResponse.json({ columnValue });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid upload payload" }, { status: 400 });
    }
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
