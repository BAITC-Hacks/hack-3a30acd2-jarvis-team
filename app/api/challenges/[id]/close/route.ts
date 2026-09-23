import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { api, ApiError, parseBody } from "@/lib/http";
import { challengeView, ownedChallenge, routeId } from "@/app/api/_shared";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser("BUSINESS");
    await parseBody(request, z.object({}).strict());
    const id = await routeId(context);
    await ownedChallenge(id, user);
    await db.$transaction(async (tx) => {
      const updated = await tx.challenge.updateMany({ where: { id, ownerId: user.id, status: { not: "CLOSED" } }, data: { status: "CLOSED" } });
      if (!updated.count) throw new ApiError(409, "Задача уже закрыта.");
      await tx.application.updateMany({ where: { challengeId: id, status: "PENDING" }, data: { status: "REJECTED" } });
    });
    return { challenge: await challengeView(id, user) };
  }, request);
}
