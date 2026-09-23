import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { api, ApiError, parseBody, rateLimit } from "@/lib/http";
import { challengeView, routeId } from "@/app/api/_shared";

const schema = z.object({
  proposal: z.string().trim().min(20, "Опишите предложение минимум в 20 символах.").max(4000),
  experience: z.string().trim().min(10, "Кратко опишите релевантный опыт.").max(3000),
  timeline: z.string().trim().min(2, "Укажите предполагаемый срок.").max(200),
}).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser("TEAM");
    const data = await parseBody(request, schema);
    const id = await routeId(context);
    const team = await db.team.findUnique({ where: { ownerId: user.id } });
    if (!team) throw new ApiError(400, "Сначала заполните профиль команды.");
    await rateLimit("apply", user.id, 20, 60 * 60_000);
    const application = await db.$transaction(async (tx) => {
      // Acquire the SQLite writer lock while checking OPEN, before inserting an application.
      const available = await tx.challenge.updateMany({ where: { id, status: "OPEN", ownerId: { not: user.id } }, data: { updatedAt: new Date() } });
      if (!available.count) throw new ApiError(409, "Приём откликов на эту задачу завершён или задача недоступна.");
      const duplicate = await tx.application.findUnique({ where: { challengeId_teamId: { challengeId: id, teamId: team.id } } });
      if (duplicate) throw new ApiError(409, "Ваша команда уже отправила отклик на эту задачу.");
      return tx.application.create({ data: { ...data, challengeId: id, teamId: team.id } });
    });
    return { application, challenge: await challengeView(id, user) };
  }, request);
}
