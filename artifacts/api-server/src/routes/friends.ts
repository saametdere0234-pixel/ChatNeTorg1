import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  friendshipsTable,
  directMessagesTable,
} from "@workspace/db/schema";
import { eq, and, or, desc, isNull } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { generateId } from "../lib/ids.js";
import { AddFriendBody } from "@workspace/api-zod";

const router = Router();

function displayName(user: { username: string; anonLabel: string; isGuest: boolean }): string {
  return user.isGuest ? user.anonLabel : user.username;
}

// GET /api/friends
router.get("/", requireAuth, async (req, res) => {
  const userId = req.userId!;

  const friendships = await db
    .select()
    .from(friendshipsTable)
    .where(or(eq(friendshipsTable.user1Id, userId), eq(friendshipsTable.user2Id, userId)));

  if (friendships.length === 0) {
    res.json([]);
    return;
  }

  const friendIds = friendships.map((f) => (f.user1Id === userId ? f.user2Id : f.user1Id));
  const friendUsers = await db.select().from(usersTable).where(
    or(...friendIds.map((id) => eq(usersTable.id, id))),
  );
  const userMap = new Map(friendUsers.map((u) => [u.id, u]));

  const result = await Promise.all(
    friendships.map(async (friendship) => {
      const friendId = friendship.user1Id === userId ? friendship.user2Id : friendship.user1Id;
      const friend = userMap.get(friendId)!;

      const unreadMessages = await db
        .select({ id: directMessagesTable.id })
        .from(directMessagesTable)
        .where(
          and(
            eq(directMessagesTable.friendshipId, friendship.id),
            eq(directMessagesTable.senderId, friendId),
            isNull(directMessagesTable.seenAt),
          ),
        );

      return {
        id: friendId,
        label: displayName(friend),
        friendToken: friend.isGuest ? null : friend.friendToken,
        createdAt: friendship.createdAt.toISOString(),
        unreadCount: unreadMessages.length,
      };
    }),
  );

  res.json(result);
});

// POST /api/friends/add
router.post("/add", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const parsed = AddFriendBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid token format" });
    return;
  }
  const { token } = parsed.data;

  if (!/^\d{2}\.\d{2}\.\d{2}\.\d{2}$/.test(token)) {
    res.status(400).json({ error: "Token must be in xx.xx.xx.xx format" });
    return;
  }

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.friendToken, token)).limit(1);
  if (!targetUser) {
    res.status(404).json({ error: "Token not found" });
    return;
  }
  if (targetUser.id === userId) {
    res.status(400).json({ error: "Cannot add yourself" });
    return;
  }

  // Quiet mode check
  if (targetUser.quietMode) {
    res.status(403).json({ error: "This user is not accepting friend requests." });
    return;
  }

  // Check if already friends
  const existing = await db
    .select()
    .from(friendshipsTable)
    .where(
      or(
        and(eq(friendshipsTable.user1Id, userId), eq(friendshipsTable.user2Id, targetUser.id)),
        and(eq(friendshipsTable.user1Id, targetUser.id), eq(friendshipsTable.user2Id, userId)),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    res.status(400).json({ error: "Already friends" });
    return;
  }

  const [friendship] = await db
    .insert(friendshipsTable)
    .values({ id: generateId(), user1Id: userId, user2Id: targetUser.id })
    .returning();

  res.status(201).json({
    id: targetUser.id,
    label: displayName(targetUser),
    friendToken: targetUser.isGuest ? null : targetUser.friendToken,
    createdAt: friendship.createdAt.toISOString(),
    unreadCount: 0,
  });
});

// DELETE /api/friends/:friendId
router.delete("/:friendId", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { friendId } = req.params;

  const [friendship] = await db
    .select()
    .from(friendshipsTable)
    .where(
      or(
        and(eq(friendshipsTable.user1Id, userId), eq(friendshipsTable.user2Id, friendId)),
        and(eq(friendshipsTable.user1Id, friendId), eq(friendshipsTable.user2Id, userId)),
      ),
    )
    .limit(1);

  if (!friendship) {
    res.status(404).json({ error: "Friendship not found" });
    return;
  }

  // Delete DMs first (foreign key), then friendship
  await db.delete(directMessagesTable).where(eq(directMessagesTable.friendshipId, friendship.id));
  await db.delete(friendshipsTable).where(eq(friendshipsTable.id, friendship.id));

  res.json({ removed: true });
});

// GET /api/friends/:friendId/messages
router.get("/:friendId/messages", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { friendId } = req.params;

  const [friendship] = await db
    .select()
    .from(friendshipsTable)
    .where(
      or(
        and(eq(friendshipsTable.user1Id, userId), eq(friendshipsTable.user2Id, friendId)),
        and(eq(friendshipsTable.user1Id, friendId), eq(friendshipsTable.user2Id, userId)),
      ),
    )
    .limit(1);

  if (!friendship) {
    res.status(403).json({ error: "Not friends" });
    return;
  }

  const messages = await db
    .select()
    .from(directMessagesTable)
    .where(eq(directMessagesTable.friendshipId, friendship.id))
    .orderBy(desc(directMessagesTable.createdAt))
    .limit(50);

  const reversed = messages.reverse();
  res.json(
    reversed.map((m) => ({
      id: m.id,
      content: m.content,
      senderId: m.senderId,
      fromMe: m.senderId === userId,
      createdAt: m.createdAt.toISOString(),
      seenAt: m.seenAt?.toISOString() ?? null,
    })),
  );
});

// POST /api/friends/:friendId/seen
router.post("/:friendId/seen", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { friendId } = req.params;

  const [friendship] = await db
    .select()
    .from(friendshipsTable)
    .where(
      or(
        and(eq(friendshipsTable.user1Id, userId), eq(friendshipsTable.user2Id, friendId)),
        and(eq(friendshipsTable.user1Id, friendId), eq(friendshipsTable.user2Id, userId)),
      ),
    )
    .limit(1);

  if (!friendship) {
    res.status(403).json({ error: "Not friends" });
    return;
  }

  const now = new Date();
  const updated = await db
    .update(directMessagesTable)
    .set({ seenAt: now })
    .where(
      and(
        eq(directMessagesTable.friendshipId, friendship.id),
        eq(directMessagesTable.senderId, friendId),
        isNull(directMessagesTable.seenAt),
      ),
    )
    .returning();

  res.json({ markedCount: updated.length });
});

export default router;
