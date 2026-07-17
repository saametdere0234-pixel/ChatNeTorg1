import { Router } from "express";
import { db } from "@workspace/db";
import { generalMessagesTable, generalMessageSeenTable, usersTable } from "@workspace/db/schema";
import { eq, desc, lt, gte, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

// GET /api/general/messages
router.get("/messages", requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
  const before = req.query["before"] as string | undefined;

  // Fetch the requesting user's registration time so new users only see
  // messages sent after they joined
  const [me] = await db
    .select({ createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  const conditions = [
    gte(generalMessagesTable.createdAt, me!.createdAt),
    ...(before ? [lt(generalMessagesTable.id, before)] : []),
  ];

  const messages = await db
    .select({
      id: generalMessagesTable.id,
      content: generalMessagesTable.content,
      senderId: generalMessagesTable.senderId,
      createdAt: generalMessagesTable.createdAt,
      username: usersTable.username,
      anonLabel: usersTable.anonLabel,
      isGuest: usersTable.isGuest,
      friendToken: usersTable.friendToken,
    })
    .from(generalMessagesTable)
    .innerJoin(usersTable, eq(generalMessagesTable.senderId, usersTable.id))
    .where(and(...conditions))
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
      senderLabel: m.isGuest ? m.anonLabel : m.username,
      senderToken: m.isGuest ? null : m.friendToken,
      createdAt: m.createdAt.toISOString(),
      seenByMe: m.senderId === req.userId || seenSet.has(m.id),
    })),
  );
});

export default router;
