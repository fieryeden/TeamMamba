import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseInboundEmailRequest, getPrimaryRecipientAddress } from "@/lib/email-parser";

/**
 * POST /api/email/inbound
 * Webhook endpoint for inbound email from Resend / Mailgun / Postmark.
 * Looks up the board by "to" address, creates an item with the email content.
 */
export async function POST(req: NextRequest) {
  try {
    const email = await parseInboundEmailRequest(req);
    const toAddress = getPrimaryRecipientAddress(email);

    if (!toAddress) {
      return NextResponse.json({ status: "ignored", reason: "no_to_address" });
    }

    // Look up the board by target email address
    const boardEmail = await prisma.boardEmailAddress.findUnique({
      where: { address: toAddress.toLowerCase() },
      include: { board: { include: { columns: true, groups: true } } },
    });

    if (!boardEmail || !boardEmail.isEnabled) {
      return NextResponse.json({ status: "ignored", reason: "no_matching_board" });
    }

    const board = boardEmail.board;

    // Find or create a default group
    let groupId = boardEmail.defaultGroupId;
    if (!groupId) {
      const firstGroup = board.groups[0];
      if (firstGroup) groupId = firstGroup.id;
    }

    if (!groupId) {
      const group = await prisma.group.create({
        data: {
          boardId: board.id,
          name: "Inbox (Email)",
          color: "#fdab3d",
          position: 0,
        },
      });
      groupId = group.id;
    }

    // Create the item
    const item = await prisma.item.create({
      data: {
        boardId: board.id,
        groupId,
        name: email.subject || "No Subject",
        position: 0,
      },
    });

    // Create column values for the email body
    const longTextColumn = board.columns.find(
      (c) => c.columnType === "LONG_TEXT"
    );
    if (longTextColumn) {
      await prisma.columnValue.create({
        data: {
          itemId: item.id,
          columnId: longTextColumn.id,
          value: {
            text: email.textBody || email.htmlBody || "",
            html: email.htmlBody || null,
          } as any,
        },
      });
    }

    // Check if sender matches a board member — assign if so
    if (email.fromAddress) {
      const senderClean = email.fromAddress.toLowerCase().trim();
      const member = await prisma.boardMember.findFirst({
        where: { boardId: board.id, user: { email: { equals: senderClean, mode: "insensitive" } } },
        include: { user: true },
      });
      if (member) {
        await prisma.itemAssignee.create({
          data: { itemId: item.id, userId: member.userId },
        });
      }
    }

    // Set default status if configured
    if (boardEmail.defaultStatus) {
      const statusColumn = board.columns.find(
        (c) => c.columnType === "STATUS"
      );
      if (statusColumn) {
        await prisma.columnValue.create({
          data: {
            itemId: item.id,
            columnId: statusColumn.id,
            value: { label: boardEmail.defaultStatus } as any,
          },
        });
      }
    }

    // Log activity
    await prisma.activity.create({
      data: {
        boardId: board.id,
        itemId: item.id,
        userId: "system",
        action: "ITEM_CREATED",
        details: {
          source: "email",
          from: email.fromAddress,
          subject: email.subject,
        } as any,
      },
    });

    return NextResponse.json({ status: "created", itemId: item.id });
  } catch (err) {
    console.error("Email inbound error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
