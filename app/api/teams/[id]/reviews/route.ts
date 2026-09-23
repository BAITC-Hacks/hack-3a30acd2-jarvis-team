import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { api, ApiError, parseBody, rateLimit } from "@/lib/http";
import { teamReviewSchema } from "@/lib/team-profile";
import { publicTeamProfile } from "@/lib/team-server";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser("BUSINESS");
    const id = (await context.params).id;
    const data = await parseBody(request, teamReviewSchema);
    await rateLimit("team-review", user.id, 30, 15 * 60 * 1000);
    const exists = await db.team.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new ApiError(404, "Команда не найдена.");
    await db.$transaction(async (tx) => {
      // Serialize writes before checking eligibility, including two edits of the same review.
      const team = await tx.team.update({ where: { id }, data: { updatedAt: new Date() }, select: { ownerId: true } });
      if (team.ownerId === user.id) throw new ApiError(403, "Нельзя оценивать свою команду.");
      const challenge = await tx.challenge.findUnique({
        where: { id: data.challengeId },
        select: { ownerId: true, status: true, applications: { where: { teamId: id, status: "SELECTED" }, select: { id: true } } },
      });
      if (!challenge || challenge.ownerId !== user.id) throw new ApiError(403, "Отзыв может оставить только заказчик этой задачи.");
      if (challenge.status !== "CLOSED" || challenge.applications.length !== 1) {
        throw new ApiError(409, "Оценить команду можно после завершения задачи, в которой вы её выбрали.");
      }
      await tx.teamReview.upsert({
        where: { challengeId: data.challengeId },
        create: { teamId: id, challengeId: data.challengeId, rating: data.rating, comment: data.comment },
        update: { teamId: id, rating: data.rating, comment: data.comment },
      });
    });
    return publicTeamProfile(id, user);
  }, request);
}
