import { Router } from "express";
import { db } from "@workspace/db";
import { generalMessagesTable, generalMessageSeenTable, usersTable } from "@workspace/db/schema";
import { eq, desc, lt, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// GET /api/general/messages
router.get("/messages", requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
  const before = req.query["before"] as string | undefined;

  const conditions = before ? [lt(generalMessagesTable.id, before)] : [];

  const messages = await db
    .select({
      id: generalMessagesTable.id,
      content: generalMessagesTable.content,
      senderId: generalMessagesTable.senderId,
      createdAt: generalMessagesTable.createdAt,
      anonLabel: usersTable.anonLabel,
    })
    .from(generalMessagesTable)
    .innerJoin(usersTable, eq(generalMessagesTable.senderId, usersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(generalMessagesTable.createdAt))
    .limit(limit);

  const reversed = messages.reverse();

  if (reversed.length === 0) {
    res.json([]);
    return;
  }

  const messageIds = reversed.map((m) => m.id);
  const seenRows = await db
    .select()
    .from(generalMessageSeenTable)
    .where(
      and(
        inArray(generalMessageSeenTable.messageId, messageIds),
        eq(generalMessageSeenTable.userId, req.userId!),
      ),
    );
  const seenSet = new Set(seenRows.map((r) => r.messageId));

  res.json(
    reversed.map((m) => ({
      id: m.id,
      content: m.content,
      senderId: m.senderId,
      senderLabel: m.anonLabel,
      createdAt: m.createdAt.toISOString(),
      seenByMe: m.senderId === req.userId || seenSet.has(m.id),
    })),
  );
});

export default router;
