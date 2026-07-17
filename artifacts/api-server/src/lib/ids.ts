import { randomBytes } from "crypto";

export function generateId(): string {
  return randomBytes(16).toString("hex");
}

/** Generates a friend token in xx.xx.xx.xx format (4 pairs of 2 digits) */
export function generateFriendToken(): string {
  const digits = () => Math.floor(Math.random() * 100).toString().padStart(2, "0");
  return `${digits()}.${digits()}.${digits()}.${digits()}`;
}

/** Generates an anonymous label like Anon#1234 */
export function generateAnonLabel(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `Anon#${num}`;
}
