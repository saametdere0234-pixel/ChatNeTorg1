import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { db } from "@workspace/db";
import {
  usersTable,
  generalMessagesTable,
  generalMessageSeenTable,
  friendshipsTable,
  directMessagesTable,
} from "@workspace/db/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { verifyToken } from "./lib/auth.js";
import { generateId } from "./lib/ids.js";
import { logger } from "./lib/logger.js";

interface AuthSocket {
  userId: string;
  displayLabel: string; // username for registered users, anonLabel for guests
  friendToken: string | null; // null for guests
}

export function initSocket(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/api/socket.io",
  });

  // Auth middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth["token"] as string | undefined;
    if (!token) return next(new Error("No token"));
    const payload = verifyToken(token);
    if (!payload) return next(new Error("Invalid token"));

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
    if (!user) return next(new Error("User not found"));

    (socket as unknown as { _auth: AuthSocket })._auth = {
      userId: user.id,
      displayLabel: user.isGuest ? user.anonLabel : user.username,
      friendToken: user.isGuest ? null : user.friendToken,
    };
    next();
  });

  // Typing timers: map of `room:userId` -> timeout
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function getAuth(socket: Parameters<Parameters<typeof io.on>[1]>[0]): AuthSocket {
    return (socket as unknown as { _auth: AuthSocket })._auth;
  }

  io.on("connection", (socket) => {
    const { userId, displayLabel, friendToken } = getAuth(socket);
    logger.info({ userId }, "Socket connected");

    // ── General chat ──────────────────────────────────────────────────
    socket.on("join-general", () => {
      socket.join("general");
    });

    socket.on("leave-general", () => {
      socket.leave("general");
    });

    socket.on("general-message", async (data: { content: string }) => {
      if (!data?.content?.trim()) return;
      // Allow up to 500KB for images (base64)
      const content = data.content.trim().slice(0, 524288);
      const id = generateId();

      await db.insert(generalMessagesTable).values({ id, senderId: userId, content });

      const msg = {
        id,
        content,
        senderId: userId,
        senderLabel: displayLabel,
        senderToken: friendToken,
        createdAt: new Date().toISOString(),
        seenByMe: true,
      };

      io.to("general").emit("new-general-message", msg);
    });

    socket.on("seen-general", async (data: { messageId: string }) => {
      if (!data?.messageId) return;
      try {
        await db
          .insert(generalMessageSeenTable)
          .values({ messageId: data.messageId, userId })
          .onConflictDoNothing();
        io.to("general").emit("general-seen", { messageId: data.messageId, userId });
      } catch {
        // ignore duplicate seen
      }
    });

    // ── DM chat ───────────────────────────────────────────────────────
    socket.on("join-dm", async (data: { friendId: string }) => {
      if (!data?.friendId) return;
      const roomId = dmRoom(userId, data.friendId);
      const [friendship] = await db
        .select()
        .from(friendshipsTable)
        .where(
          or(
            and(eq(friendshipsTable.user1Id, userId), eq(friendshipsTable.user2Id, data.friendId)),
            and(eq(friendshipsTable.user1Id, data.friendId), eq(friendshipsTable.user2Id, userId)),
          ),
        )
        .limit(1);
      if (!friendship) return;
      socket.join(roomId);
    });

    socket.on("leave-dm", (data: { friendId: string }) => {
      if (!data?.friendId) return;
      socket.leave(dmRoom(userId, data.friendId));
    });

    socket.on("dm-message", async (data: { friendId: string; content: string }) => {
      if (!data?.friendId || !data?.content?.trim()) return;
      // Allow up to 500KB for images (base64)
      const content = data.content.trim().slice(0, 524288);

      const [friendship] = await db
        .select()
        .from(friendshipsTable)
        .where(
          or(
            and(eq(friendshipsTable.user1Id, userId), eq(friendshipsTable.user2Id, data.friendId)),
            and(eq(friendshipsTable.user1Id, data.friendId), eq(friendshipsTable.user2Id, userId)),
          ),
        )
        .limit(1);

      if (!friendship) return;

      const id = generateId();
      await db.insert(directMessagesTable).values({
        id,
        friendshipId: friendship.id,
        senderId: userId,
        content,
      });

      const room = dmRoom(userId, data.friendId);
      const msgForSender = { id, content, senderId: userId, fromMe: true, createdAt: new Date().toISOString(), seenAt: null };
      const msgForReceiver = { id, content, senderId: userId, fromMe: false, createdAt: new Date().toISOString(), seenAt: null };

      socket.emit("new-dm", { message: msgForSender, fromFriendId: data.friendId });
      socket.to(room).emit("new-dm", { message: msgForReceiver, fromFriendId: userId });
      socket.to(`user:${data.friendId}`).emit("dm-notification", { fromFriendId: userId });
    });

    socket.on("dm-seen", async (data: { friendId: string }) => {
      if (!data?.friendId) return;
      const [friendship] = await db
        .select()
        .from(friendshipsTable)
        .where(
          or(
            and(eq(friendshipsTable.user1Id, userId), eq(friendshipsTable.user2Id, data.friendId)),
            and(eq(friendshipsTable.user1Id, data.friendId), eq(friendshipsTable.user2Id, userId)),
          ),
        )
        .limit(1);

      if (!friendship) return;

      const now = new Date();
      const updated = await db
        .update(directMessagesTable)
        .set({ seenAt: now })
        .where(
          and(
            eq(directMessagesTable.friendshipId, friendship.id),
            eq(directMessagesTable.senderId, data.friendId),
            isNull(directMessagesTable.seenAt),
          ),
        )
        .returning({ id: directMessagesTable.id });

      if (updated.length > 0) {
        const seenAt = now.toISOString();
        const room = dmRoom(userId, data.friendId);
        io.to(room).emit("messages-seen", { byUserId: userId, seenAt, messageIds: updated.map((m) => m.id) });
      }
    });

    // ── Typing indicators ─────────────────────────────────────────────
    socket.on("typing", (data: { room: string }) => {
      if (!data?.room) return;
      const key = `${data.room}:${userId}`;

      if (data.room === "general") {
        socket.to("general").emit("typing", { userId, anonLabel: displayLabel, room: "general" });
      } else {
        const room = dmRoom(userId, data.room);
        socket.to(room).emit("typing", { userId, anonLabel: displayLabel, room: data.room });
      }

      clearTimeout(typingTimers.get(key));
      typingTimers.set(
        key,
        setTimeout(() => {
          emitStopTyping(socket, data.room, userId, io);
          typingTimers.delete(key);
        }, 3000),
      );
    });

    socket.on("stop-typing", (data: { room: string }) => {
      if (!data?.room) return;
      const key = `${data.room}:${userId}`;
      clearTimeout(typingTimers.get(key));
      typingTimers.delete(key);
      emitStopTyping(socket, data.room, userId, io);
    });

    // ── User presence room ────────────────────────────────────────────
    socket.join(`user:${userId}`);

    socket.on("disconnect", () => {
      logger.info({ userId }, "Socket disconnected");
      for (const [key, timer] of typingTimers) {
        if (key.endsWith(`:${userId}`)) {
          clearTimeout(timer);
          typingTimers.delete(key);
        }
      }
    });
  });

  return io;
}

function dmRoom(userA: string, userB: string): string {
  return `dm:${[userA, userB].sort().join(":")}`;
}

function emitStopTyping(
  socket: Parameters<Parameters<SocketIOServer["on"]>[1]>[0],
  room: string,
  userId: string,
  io: SocketIOServer,
): void {
  if (room === "general") {
    socket.to("general").emit("stop-typing", { userId, room: "general" });
  } else {
    const dmRoomName = dmRoom(userId, room);
    io.to(dmRoomName).emit("stop-typing", { userId, room });
  }
}
