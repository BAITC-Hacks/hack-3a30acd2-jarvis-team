import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/http";

const SESSION_COOKIE = "sana_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function publicUser(user: User) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, company: user.company, isDemo: user.isDemo };
}

export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: true } });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  return session.user;
}

export async function requireUser(role?: "BUSINESS" | "TEAM") {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Войдите в аккаунт, чтобы продолжить.");
  if (role && user.role !== role) throw new ApiError(403, role === "BUSINESS" ? "Это действие доступно представителю бизнеса." : "Это действие доступно студенческой команде.");
  return user;
}

export async function startSession(userId: string) {
  const cookieStore = await cookies();
  const previous = cookieStore.get(SESSION_COOKIE)?.value;
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MS);
  await db.$transaction(async (tx) => {
    if (previous) await tx.session.deleteMany({ where: { tokenHash: tokenHash(previous) } });
    await tx.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
    await tx.session.create({ data: { tokenHash: tokenHash(token), userId, expiresAt } });
  });
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.APP_URL?.startsWith("https://") ?? false,
    path: "/", expires: expiresAt,
  });
}

export async function endSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true, sameSite: "lax", secure: process.env.APP_URL?.startsWith("https://") ?? false,
    path: "/", expires: new Date(0),
  });
}
