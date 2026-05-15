import { prisma } from "@/lib/prisma";

interface AuditLogInput {
  action: string;
  userId: string;
  boardId?: string;
  itemId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Create an audit log entry. Non-blocking — errors are logged but don't throw.
 * Call this after every significant mutation in the system.
 */
export async function createAuditLog(input: AuditLogInput) {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        userId: input.userId,
        boardId: input.boardId || null,
        itemId: input.itemId || null,
        details: input.details ? (input.details as any) : undefined,
        ipAddress: input.ipAddress || null,
        userAgent: input.userAgent || null,
      },
    });
  } catch (err) {
    console.error("Audit log write error:", err);
  }
}
