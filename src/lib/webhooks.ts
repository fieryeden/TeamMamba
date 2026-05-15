import { prisma } from "@/lib/prisma";
import crypto from "crypto";

type WebhookEvent = {
  event: string;
  boardId: string;
  itemId?: string;
  userId?: string;
  payload: Record<string, unknown>;
};

/**
 * Fire all active webhooks for a board when an event occurs.
 * Called from item/board CRUD routes after successful mutations.
 */
export async function fireWebhooks(event: WebhookEvent) {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: {
        boardId: event.boardId,
        isEnabled: true,
        events: { has: event.event },
      },
    });

    if (webhooks.length === 0) return;

    const payload = {
      event: event.event,
      boardId: event.boardId,
      itemId: event.itemId,
      timestamp: new Date().toISOString(),
      data: event.payload,
    };

    await Promise.allSettled(
      webhooks.map(async (webhook) => {
        const secret = webhook.secret || "default-secret";
        const signature = crypto
          .createHmac("sha256", secret)
          .update(JSON.stringify(payload))
          .digest("hex");

        let statusCode = 0;
        let success = false;
        let responseBody = "";

        try {
          const res = await fetch(webhook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Webhook-Signature": `sha256=${signature}`,
              "X-Webhook-Event": event.event,
              "X-Webhook-ID": webhook.id,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000),
          });
          statusCode = res.status;
          success = res.ok;
          responseBody = await res.text().catch(() => "");
        } catch (err) {
          success = false;
          statusCode = 0;
          responseBody = err instanceof Error ? err.message : "Unknown error";
        }

        // Log the delivery
        await prisma.webhookEvent.create({
          data: {
            webhookId: webhook.id,
            eventType: event.event,
            payload: payload as any,
            statusCode,
            success,
            response: responseBody.substring(0, 2000),
          },
        });

        // Update lastFiredAt
        await prisma.webhook.update({
          where: { id: webhook.id },
          data: { lastFiredAt: new Date() },
        }).catch(() => {});

        // Disable webhook after 5 consecutive failures
        if (!success) {
          const recentEvents = await prisma.webhookEvent.findMany({
            where: { webhookId: webhook.id },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { success: true },
          });
          const allFailed = recentEvents.length >= 5 && recentEvents.every((e) => !e.success);
          if (allFailed) {
            await prisma.webhook.update({
              where: { id: webhook.id },
              data: { isEnabled: false },
            });
          }
        }
      })
    );
  } catch (err) {
    console.error("Fire webhooks error:", err);
  }
}
