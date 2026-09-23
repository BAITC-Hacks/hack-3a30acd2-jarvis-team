import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser, requireUser } from "@/lib/auth";
import { api, ApiError, parseBody } from "@/lib/http";
import { briefSchema, emptyBrief, type Brief } from "@/lib/brief";
import { readiness } from "@/lib/readiness";
import { assertChallengeVersion, challengeView, ownedChallenge, readJson, requirePublishable, routeId, storedBrief } from "@/app/api/_shared";

const fields = Object.keys(emptyBrief);
const patchSchema = z.object({
  expectedUpdatedAt: z.string().datetime().optional(),
  draft: z.string().trim().max(12000).optional(),
  company: z.string().trim().min(2, "Укажите название компании.").max(120).optional(),
  industry: z.string().trim().min(2, "Выберите отрасль.").max(100).optional(),
  brief: briefSchema.optional(),
  answers: z.record(z.string().max(100), z.string().max(5000))
    .refine((value) => Object.keys(value).every((key) => fields.includes(key)), "Неизвестное поле ответа.")
    .refine((value) => !value.title || value.title.length <= 160, "Название должно быть не длиннее 160 символов.").optional(),
  lockedFields: z.array(z.string().refine((value) => fields.includes(value), "Неизвестное поле брифа.")).max(11).optional(),
}).strict();

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  return api(async () => ({ challenge: await challengeView(await routeId(context), await currentUser()) }));
}

export async function PATCH(request: NextRequest, context: Context) {
  return api(async () => {
    const user = await requireUser("BUSINESS");
    const data = await parseBody(request, patchSchema);
    const id = await routeId(context);
    const original = await ownedChallenge(id, user);
    assertChallengeVersion(original, data.expectedUpdatedAt);
    if (original.status === "CLOSED") throw new ApiError(409, "Закрытую задачу нельзя редактировать.");
    if (original.status === "ASSIGNED") throw new ApiError(409, "Команда уже выбрана. Зафиксированный бриф нельзя изменять.");
    const previous = storedBrief(original);
    const next = data.brief || previous;
    const locks = new Set(data.lockedFields || readJson<string[]>(original.lockedFieldsJson, []));
    if (data.brief) {
      for (const key of fields as (keyof Brief)[]) if (data.brief[key] !== previous[key]) locks.add(key);
    }
    const score = readiness(next).score;
    if (original.status === "OPEN") requirePublishable(next, "Изменения не сохранены. ");
    const updated = await db.challenge.updateMany({
      where: { id, ownerId: user.id, status: original.status, updatedAt: original.updatedAt },
      data: {
        ...(data.draft !== undefined ? { draft: data.draft } : {}),
        ...(data.company !== undefined ? { company: data.company } : {}),
        ...(data.industry !== undefined ? { industry: data.industry } : {}),
        ...(data.answers ? { answersJson: JSON.stringify({ ...readJson(original.answersJson, {}), ...data.answers }) } : {}),
        briefJson: JSON.stringify(next), score, lockedFieldsJson: JSON.stringify([...locks]),
      },
    });
    if (!updated.count) throw new ApiError(409, "Задача уже изменилась. Скопируйте свои правки перед обновлением страницы: они ещё не сохранены.", { code: "conflict" });
    return { challenge: await challengeView(id, user) };
  }, request);
}
