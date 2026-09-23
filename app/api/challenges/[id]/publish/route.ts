import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { api, ApiError, parseBody } from "@/lib/http";
import { assertChallengeVersion, challengeView, ownedChallenge, requirePublishable, routeId, storedBrief } from "@/app/api/_shared";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser("BUSINESS");
    const data = await parseBody(request, z.object({ expectedUpdatedAt: z.string().datetime().optional() }).strict());
    const id = await routeId(context);
    const original = await ownedChallenge(id, user);
    assertChallengeVersion(original, data.expectedUpdatedAt);
    if (original.status !== "DRAFT") throw new ApiError(409, "Опубликовать можно только черновик.");
    const brief = storedBrief(original);
    const { score } = requirePublishable(brief);
    const saved = await db.challenge.updateMany({
      where: { id, ownerId: user.id, status: "DRAFT", updatedAt: original.updatedAt },
      data: { status: "OPEN", score },
    });
    if (!saved.count) throw new ApiError(409, "Задача уже изменилась. Обновите страницу и проверьте описание перед публикацией.", { code: "conflict" });
    return { challenge: await challengeView(id, user) };
  }, request);
}
