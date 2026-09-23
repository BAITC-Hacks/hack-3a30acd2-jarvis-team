import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { api, ApiError, parseBody } from "@/lib/http";
import { teamProfileSchema } from "@/lib/team-profile";
import { teamProfileInclude, teamView } from "@/lib/team-server";

export async function GET() {
  return api(async () => {
    const user = await requireUser("TEAM");
    const row = await db.team.findUnique({ where: { ownerId: user.id }, include: teamProfileInclude });
    return { team: row ? teamView(row) : null };
  });
}

export async function PATCH(request: NextRequest) {
  return api(async () => {
    const user = await requireUser("TEAM");
    const data = await parseBody(request, teamProfileSchema);
    const existing = await db.team.findUnique({ where: { ownerId: user.id }, select: { id: true } });
    if (!existing) throw new ApiError(404, "Профиль команды не найден.");
    const { members, cases, ...profile } = data;
    const row = await db.team.update({
      where: { id: existing.id },
      data: {
        ...profile,
        ...(cases !== undefined ? { casesJson: JSON.stringify(cases) } : {}),
        ...(members !== undefined ? { members: { deleteMany: {}, create: members.map(({ name, role }) => ({ name, role })) } } : {}),
      },
      include: teamProfileInclude,
    });
    return { team: teamView(row) };
  }, request);
}
