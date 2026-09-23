import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z, ZodError } from "zod";
import { db } from "@/lib/db";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
  }
}

export function assertSameOrigin(request: NextRequest) {
  const expected = new URL(process.env.APP_URL || request.url).origin;
  const origin = request.headers.get("origin");
  if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "Запрос отклонён. Откройте приложение в новой вкладке и повторите действие.");
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "Ожидается запрос в формате JSON.");
  }
}

export async function parseBody<T extends z.ZodTypeAny>(request: NextRequest, schema: T, options?: { maxBytes: number; tooLargeMessage?: string }): Promise<z.infer<T>> {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Тело запроса отсутствует.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > (options?.maxBytes ?? 140_000)) {
      await reader.cancel();
      throw new ApiError(413, options?.tooLargeMessage ?? "Слишком большой запрос. Сократите описание.");
    }
    chunks.push(value);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "Некорректный JSON в запросе.");
  }
  return schema.parse(body);
}

export async function rateLimit(scope: string, key: string, limit: number, windowMs: number) {
  const bucket = Math.floor(Date.now() / windowMs);
  const hash = createHash("sha256").update(key).digest("hex");
  const id = `${scope}:${hash}:${bucket}`;
  const row = await db.rateLimit.upsert({
    where: { id },
    create: { id, expiresAt: new Date((bucket + 1) * windowMs) },
    update: { count: { increment: 1 } },
  });
  if (row.count > limit) throw new ApiError(429, "Слишком много попыток. Подождите несколько минут и попробуйте снова.");
}

export function clientAddress(request: NextRequest) {
  // Forwarded addresses are trusted only when explicitly configured behind a trusted proxy.
  return process.env.TRUST_PROXY === "true"
    ? (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local")
    : "local";
}

export async function api(handler: () => Promise<unknown>, request?: NextRequest) {
  try {
    if (request) assertSameOrigin(request);
    const data = await handler();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ ...error.details, error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Проверьте заполненные поля." }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Такая запись уже существует. Повторное действие не требуется." }, { status: 409 });
    }
    // Deliberately do not log private drafts, credentials, or provider errors.
    return NextResponse.json({ error: "Не удалось выполнить действие. Повторите попытку; сохранённые данные не потеряны." }, { status: 500 });
  }
}
