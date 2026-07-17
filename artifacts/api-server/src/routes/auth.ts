import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, signToken } from "../lib/auth.js";
import { generateId, generateFriendToken, generateAnonLabel } from "../lib/ids.js";
import { RegisterBody, LoginBody } from "@workspace/api-zod";

const router = Router();

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
  let friendToken = generateFriendToken();
  // Ensure uniqueness of friend token
  let tokenExists = await db.select().from(usersTable).where(eq(usersTable.friendToken, friendToken)).limit(1);
  while (tokenExists.length > 0) {
    friendToken = generateFriendToken();
    tokenExists = await db.select().from(usersTable).where(eq(usersTable.friendToken, friendToken)).limit(1);
  }
  const anonLabel = generateAnonLabel();

  const [user] = await db.insert(usersTable).values({ id, username, passwordHash, friendToken, anonLabel }).returning();

  const token = signToken({ userId: user.id, username: user.username });
  res.status(201).json({ token, user: { id: user.id, username: user.username, friendToken: user.friendToken } });
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { username, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
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
