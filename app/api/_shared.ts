import type { Challenge, User } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { briefSchema, emptyBrief, type Brief } from "@/lib/brief";
import { readiness } from "@/lib/readiness";
import { publicationMessage, publicationRequirements } from "@/lib/publication";
import { teamProfileInclude, teamView } from "@/lib/team-server";

export function readJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export function storedBrief(row: Pick<Challenge, "briefJson">): Brief {
  const value = briefSchema.safeParse({ ...emptyBrief, ...readJson(row.briefJson, {}) });
  return value.success ? value.data : { ...emptyBrief };
}

export function challengeCard(row: Challenge & { _count?: { applications: number } }) {
  const brief = storedBrief(row);
  const report = readiness(brief);
  return {
    id: row.id, ownerId: row.ownerId, company: row.company, industry: row.industry,
    brief, score: report.score, readiness: report, status: row.status,
    isDemo: row.isDemo, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    applicationCount: row._count?.applications ?? 0,
  };
}

export async function ownedChallenge(id: string, user: User) {
  const challenge = await db.challenge.findUnique({ where: { id } });
  if (!challenge) throw new ApiError(404, "Задача не найдена.");
  if (challenge.ownerId !== user.id) throw new ApiError(403, "Вы можете изменять только свои задачи.");
  return challenge;
}

export function requirePublishable(brief: Brief, prefix = "") {
  const requirements = publicationRequirements(brief);
  if (!requirements.ready) {
    throw new ApiError(400, `${prefix}${publicationMessage(brief)}`, { code: "publication_incomplete", ...requirements });
  }
  return requirements;
}

export function assertChallengeVersion(row: Pick<Challenge, "updatedAt">, expectedUpdatedAt?: string) {
  if (expectedUpdatedAt !== undefined && new Date(expectedUpdatedAt).getTime() !== row.updatedAt.getTime()) {
    throw new ApiError(409, "Задача уже изменилась. Скопируйте свои правки перед обновлением страницы: они ещё не сохранены.", { code: "conflict", updatedAt: row.updatedAt.toISOString() });
  }
}

export async function challengeView(id: string, user?: User | null) {
  const challenge = await db.challenge.findUnique({ where: { id }, include: { _count: { select: { applications: true } } } });
  if (!challenge || (challenge.status === "DRAFT" && challenge.ownerId !== user?.id)) throw new ApiError(404, "Задача не найдена.");
  const card = challengeCard(challenge);
  if (challenge.ownerId === user?.id) {
    const applications = await db.application.findMany({
      where: { challengeId: id }, orderBy: { createdAt: "desc" },
      include: { team: { include: teamProfileInclude } },
    });
    return {
      ...card, draft: challenge.draft, mode: process.env.OPENAI_API_KEY ? "live" : "demo",
      answers: readJson<Record<string, string>>(challenge.answersJson, {}),
      questions: readJson(challenge.questionsJson, []), lockedFields: readJson<string[]>(challenge.lockedFieldsJson, []),
      assumptions: readJson<string[]>(challenge.assumptionsJson, []), recommendations: readJson<string[]>(challenge.recommendationsJson, []),
      applications: applications.map(({ team, ...application }) => ({ ...application, team: teamView(team) })), myApplication: null,
    };
  }
  const myApplication = user?.role === "TEAM" ? await db.application.findFirst({ where: { challengeId: id, team: { ownerId: user.id } } }) : null;
  return { ...card, myApplication };
}

export const routeId = async (context: { params: Promise<{ id: string }> }) => (await context.params).id;
