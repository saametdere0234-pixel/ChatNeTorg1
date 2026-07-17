import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, signToken } from "../lib/auth.js";
import { generateId, generateFriendToken, generateAnonLabel } from "../lib/ids.js";
import { RegisterBody } from "@workspace/api-zod";

const router = Router();

async function uniqueFriendToken(): Promise<string> {
  let token = generateFriendToken();
  let exists = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.friendToken, token)).limit(1);
  while (exists.length > 0) {
    token = generateFriendToken();
    exists = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.friendToken, token)).limit(1);
  }
  return token;
}

function toAuthUser(user: { id: string; username: string; friendToken: string; anonLabel: string; isGuest: boolean; quietMode: boolean }) {
  return {
    id: user.id,
    displayName: user.isGuest ? user.anonLabel : user.username,
    friendToken: user.isGuest ? null : user.friendToken,
    isGuest: user.isGuest,
    quietMode: user.quietMode,
  };
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const { username, password } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const id = generateId();
  const friendToken = await uniqueFriendToken();
  const anonLabel = generateAnonLabel();

  const [user] = await db.insert(usersTable).values({ id, username, passwordHash, friendToken, anonLabel, isGuest: false, quietMode: false }).returning();

  const token = signToken({ userId: user.id, username: user.username });
  res.status(201).json({ token, user: toAuthUser(user) });
});

// POST /api/auth/login — accepts username + password
router.post("/login", async (req, res) => {
  const { id, password } = req.body;
  if (!id || !password || typeof id !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, id.trim())).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  // Guests cannot log in with a password
  if (user.isGuest) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({ userId: user.id, username: user.username });
  res.json({ token, user: toAuthUser(user) });
});

// POST /api/auth/guest — creates an ephemeral anonymous session with a chosen display name
router.post("/guest", async (req, res) => {
  const { displayName } = req.body;
  if (!displayName || typeof displayName !== "string" || displayName.trim().length < 1) {
    res.status(400).json({ error: "Display name required" });
    return;
  }
  const name = displayName.trim().slice(0, 30);

  const id = generateId();
  const internalUsername = `guest_${id.slice(0, 12)}`;
  const randomPassword = id + Math.random().toString(36);
  const passwordHash = await bcrypt.hash(randomPassword, 10);
  const friendToken = await uniqueFriendToken();

  const [user] = await db.insert(usersTable).values({
    id,
    username: internalUsername,
    passwordHash,
    friendToken,
    anonLabel: name,
    isGuest: true,
    quietMode: false,
  }).returning();

  const token = signToken({ userId: user.id, username: user.username });
  // Guests get no friendToken in the response
  res.status(201).json({ token, user: toAuthUser(user) });
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json(toAuthUser(user));
});

// PATCH /api/auth/me — update display name and/or quiet mode
router.patch("/me", requireAuth, async (req, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const { displayName, quietMode } = req.body as { displayName?: string; quietMode?: boolean };
  const updates: Partial<typeof user> = {};

  if (displayName !== undefined) {
    const name = String(displayName).trim().slice(0, 30);
    if (name.length === 0) {
      res.status(400).json({ error: "Display name cannot be empty" });
      return;
    }
    if (user.isGuest) {
      // Guests: update anonLabel
      updates.anonLabel = name;
    } else {
      // Registered users: update username (uniqueness check)
      if (!/^[a-zA-Z0-9_]+$/.test(name)) {
        res.status(400).json({ error: "Username may only contain letters, numbers, and underscores" });
        return;
      }
      const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, name)).limit(1);
      if (existing.length > 0 && existing[0].id !== user.id) {
        res.status(409).json({ error: "Username already taken" });
        return;
      }
      updates.username = name;
    }
  }

  if (quietMode !== undefined && typeof quietMode === "boolean") {
    updates.quietMode = quietMode;
  }

  if (Object.keys(updates).length === 0) {
    res.json(toAuthUser(user));
    return;
  }

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, user.id)).returning();
  res.json(toAuthUser(updated));
});

export default router;
