import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { api, ApiError, parseBody } from "@/lib/http";
import { challengeView, ownedChallenge, routeId } from "@/app/api/_shared";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser("BUSINESS");
    const data = await parseBody(request, z.object({ applicationId: z.string().min(1).max(100) }).strict());
    const id = await routeId(context);
    await ownedChallenge(id, user);
    await db.$transaction(async (tx) => {
      const claimed = await tx.challenge.updateMany({ where: { id, ownerId: user.id, status: "OPEN" }, data: { status: "ASSIGNED" } });
      if (!claimed.count) throw new ApiError(409, "Команда уже выбрана или задача закрыта. Обновите страницу.");
      const selected = await tx.application.updateMany({ where: { id: data.applicationId, challengeId: id, status: "PENDING" }, data: { status: "SELECTED" } });
      if (!selected.count) throw new ApiError(404, "Отклик не найден или уже обработан.");
      await tx.application.updateMany({ where: { challengeId: id, id: { not: data.applicationId }, status: "PENDING" }, data: { status: "REJECTED" } });
    });
    return { challenge: await challengeView(id, user) };
  }, request);
}
