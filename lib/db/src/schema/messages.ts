import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const generalMessagesTable = pgTable("general_messages", {
  id: text("id").primaryKey(),
  senderId: text("sender_id").notNull().references(() => usersTable.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const generalMessageSeenTable = pgTable(
  "general_message_seen",
  {
    messageId: text("message_id").notNull().references(() => generalMessagesTable.id),
    userId: text("user_id").notNull().references(() => usersTable.id),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId] })],
);

export const friendshipsTable = pgTable("friendships", {
  id: text("id").primaryKey(),
  user1Id: text("user1_id").notNull().references(() => usersTable.id),
  user2Id: text("user2_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const directMessagesTable = pgTable("direct_messages", {
  id: text("id").primaryKey(),
  friendshipId: text("friendship_id").notNull().references(() => friendshipsTable.id),
  senderId: text("sender_id").notNull().references(() => usersTable.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  seenAt: timestamp("seen_at", { withTimezone: true }),
});

export type GeneralMessage = typeof generalMessagesTable.$inferSelect;
export type DirectMessage = typeof directMessagesTable.$inferSelect;
export type Friendship = typeof friendshipsTable.$inferSelect;
