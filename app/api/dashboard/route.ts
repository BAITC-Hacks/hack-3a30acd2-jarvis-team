import { db } from "@/lib/db";
import { publicUser, requireUser } from "@/lib/auth";
import { api } from "@/lib/http";
import { challengeCard, challengeView } from "@/app/api/_shared";
import { teamProfileInclude, teamView } from "@/lib/team-server";

export async function GET() {
  return api(async () => {
    const user = await requireUser();
    if (user.role === "BUSINESS") {
      const rows = await db.challenge.findMany({ where: { ownerId: user.id }, orderBy: { updatedAt: "desc" }, select: { id: true } });
      const challenges = await Promise.all(rows.map((row) => challengeView(row.id, user)));
      return { user: publicUser(user), challenges, applications: [], team: null };
    }
    const team = await db.team.findUnique({ where: { ownerId: user.id }, include: teamProfileInclude });
    const rows = team ? await db.application.findMany({ where: { teamId: team.id }, orderBy: { createdAt: "desc" }, include: { challenge: { include: { _count: { select: { applications: true } } } } } }) : [];
    const applications = rows.map(({ challenge, ...application }) => ({ ...application, challenge: challengeCard(challenge) }));
    return { user: publicUser(user), team: team ? teamView(team) : null, applications, challenges: [] };
  });
}
