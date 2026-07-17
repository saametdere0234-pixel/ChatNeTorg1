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

  const [user] = await db.insert(usersTable).values({ id, username, passwordHash, friendToken, anonLabel }).returning();

  const token = signToken({ userId: user.id, username: user.username });
  res.status(201).json({ token, user: { id: user.id, username: user.username, friendToken: user.friendToken } });
});

// POST /api/auth/login — accepts 8-digit friend token (id) + password
router.post("/login", async (req, res) => {
  const { id, password } = req.body;
  if (!id || !password || typeof id !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.friendToken, id.trim())).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({ userId: user.id, username: user.username });
  res.json({ token, user: { id: user.id, username: user.username, friendToken: user.friendToken } });
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
  }).returning();

  const token = signToken({ userId: user.id, username: user.username });
  res.status(201).json({ token, user: { id: user.id, username: user.username, friendToken: user.friendToken } });
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json({ id: user.id, username: user.username, friendToken: user.friendToken });
});

export default router;
