import { prisma } from "@/lib/prisma";

function serializeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export async function recordItemVersion(
  itemId: string,
  field: string,
  oldValue: unknown,
  newValue: unknown,
  userId: string
) {
  const oldSerialized = serializeValue(oldValue);
  const newSerialized = serializeValue(newValue);
  if (oldSerialized === newSerialized) return;

  await prisma.itemVersion.create({
    data: {
      itemId,
      field,
      oldValue: oldSerialized,
      newValue: newSerialized,
      changedById: userId,
    },
  });
}
