import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";

const COOKIE = "g_session";

function secret(): string {
  const s = process.env.G_SESSION_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!s) throw new Error("Set G_SESSION_SECRET (or GOOGLE_CLIENT_SECRET) in .env");
  return s;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

/** Mint the session cookie after a successful OAuth callback. */
export function sessionCookie(accountId: string): string {
  const mac = sign(accountId);
  return `${Buffer.from(accountId).toString("base64url")}.${mac}`;
}

export function verifySession(raw: string | undefined): string | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const id = Buffer.from(raw.slice(0, dot), "base64url").toString();
  const mac = raw.slice(dot + 1);
  const expected = sign(id);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

export class Unauthenticated extends Error {}

export class ReauthRequired extends Error {
  constructor(message = "Your Google connection expired. Reconnect to keep importing.") {
    super(message);
  }
}

/**
 * Every /api/google/* route goes through this. Without it the routes are an
 * open door onto a teacher's roster and an unlimited LLM bill.
 */
export async function requireTeacher() {
  const jar = await cookies();
  const id = verifySession(jar.get(COOKIE)?.value);
  if (!id) throw new Unauthenticated("Not signed in.");
  const account = await prisma.googleAccount.findUnique({ where: { id } });
  if (!account) throw new Unauthenticated("Not signed in.");
  return account;
}

/** The signed-in teacher, or null. Unlike requireTeacher this never throws. */
export async function getTeacher() {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const id = verifySession(raw);
  if (!id) return null;
  return prisma.googleAccount.findUnique({ where: { id } });
}

export const SESSION_COOKIE = COOKIE;