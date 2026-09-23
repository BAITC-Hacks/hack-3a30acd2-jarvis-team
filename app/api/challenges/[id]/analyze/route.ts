import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { api, ApiError, parseBody, rateLimit } from "@/lib/http";
import { AIError, analyzeBrief } from "@/lib/ai";
import { briefSchema, type Brief } from "@/lib/brief";
import { readiness } from "@/lib/readiness";
import { assertChallengeVersion, challengeView, ownedChallenge, readJson, requirePublishable, routeId, storedBrief } from "@/app/api/_shared";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser("BUSINESS");
    const data = await parseBody(request, z.object({ expectedUpdatedAt: z.string().datetime().optional() }).strict());
    const id = await routeId(context);
    const original = await ownedChallenge(id, user);
    assertChallengeVersion(original, data.expectedUpdatedAt);
    if (original.status !== "DRAFT" && original.status !== "OPEN") throw new ApiError(409, "Бриф задачи с выбранной командой или закрытой задачи уже зафиксирован.");
    if (original.draft.trim().length < 10) throw new ApiError(400, "Добавьте описание проблемы перед анализом.");
    await rateLimit("analyze", user.id, 15, 15 * 60_000);
    const brief = storedBrief(original);
    const lockedFields = readJson<string[]>(original.lockedFieldsJson, []);
    let result;
    try {
      result = await analyzeBrief({
        draft: original.draft, brief, answers: readJson<Record<string, string>>(original.answersJson, {}), lockedFields,
      });
    } catch (error) {
      if (error instanceof AIError) throw new ApiError(error.status, error.message);
      throw new ApiError(502, "ИИ сейчас недоступен или вернул некорректный ответ. Черновик сохранён. Повторите запрос или заполните бриф вручную.");
    }
    const next = briefSchema.parse(result.brief);
    for (const field of lockedFields) {
      if (field in brief) next[field as keyof Brief] = brief[field as keyof Brief];
    }
    const score = readiness(next).score;
    if (original.status === "OPEN") requirePublishable(next, "Опубликованная версия сохранена. ");
    const saved = await db.challenge.updateMany({
      where: { id, ownerId: user.id, status: original.status, updatedAt: original.updatedAt },
      data: {
        briefJson: JSON.stringify(next), questionsJson: JSON.stringify(result.questions),
        assumptionsJson: JSON.stringify(result.assumptions), recommendationsJson: JSON.stringify(result.recommendations), score,
      },
    });
    if (!saved.count) throw new ApiError(409, "За время анализа задача изменилась. Обновите страницу, чтобы увидеть сохранённую версию, и повторите анализ.", { code: "conflict" });
    return { challenge: await challengeView(id, user), mode: result.mode };
  }, request);
}
