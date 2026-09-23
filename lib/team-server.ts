import type { Prisma, User } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { teamCaseSchema, type TeamCase, type TeamPhoto, type TeamProfile, type TeamProfileResponse, type TeamReview } from "@/lib/team-profile";

export const teamProfileInclude = {
  members: { orderBy: { id: "asc" as const } },
  photos: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: { id: true, caption: true },
  },
  reviews: {
    where: { challenge: { status: "CLOSED" } },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    select: {
      id: true, teamId: true, rating: true, comment: true, createdAt: true, updatedAt: true,
      challenge: {
        select: {
          id: true, briefJson: true, company: true,
          owner: { select: { name: true } },
          applications: { where: { status: "SELECTED" }, select: { teamId: true } },
        },
      },
    },
  },
} satisfies Prisma.TeamInclude;

type StoredTeamProfile = Prisma.TeamGetPayload<{ include: typeof teamProfileInclude }>;

function casesFromJson(value: string): TeamCase[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 8).flatMap((item) => {
      const checked = teamCaseSchema.safeParse(item);
      return checked.success ? [checked.data] : [];
    });
  } catch { return []; }
}

function challengeTitle(briefJson: string) {
  try {
    const value: unknown = JSON.parse(briefJson);
    if (value && typeof value === "object" && "title" in value && typeof value.title === "string" && value.title.trim()) return value.title;
  } catch { /* Old or incomplete briefs can still appear in completed projects. */ }
  return "Задача без названия";
}

export function photoView(photo: { id: string; caption: string }): TeamPhoto {
  return { id: photo.id, url: `/api/team/photos/${photo.id}`, caption: photo.caption };
}

function reviewsView(row: StoredTeamProfile): TeamReview[] {
  return row.reviews
    .filter((review) => review.challenge.applications.some((application) => application.teamId === row.id))
    .map((review) => ({
      id: review.id, rating: review.rating, comment: review.comment,
      createdAt: review.createdAt.toISOString(), updatedAt: review.updatedAt.toISOString(),
      authorName: review.challenge.owner.name, company: review.challenge.company,
      challengeId: review.challenge.id, challengeTitle: challengeTitle(review.challenge.briefJson),
    }));
}

export function teamView(row: StoredTeamProfile): TeamProfile {
  const reviews = reviewsView(row);
  return {
    id: row.id, name: row.name, university: row.university,
    tagline: row.tagline, description: row.description, experience: row.experience,
    skills: row.skills, portfolio: row.portfolio, isDemo: row.isDemo,
    members: row.members.map(({ id, name, role }) => ({ id, name, role })),
    cases: casesFromJson(row.casesJson), photos: row.photos.map(photoView),
    rating: {
      average: reviews.length ? Math.round(reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length * 10) / 10 : null,
      count: reviews.length,
    },
  };
}

export async function publicTeamProfile(id: string, user?: User | null): Promise<TeamProfileResponse> {
  const row = await db.team.findUnique({ where: { id }, include: teamProfileInclude });
  if (!row) throw new ApiError(404, "Команда не найдена.");
  const reviews = reviewsView(row);
  const [completedProjects, reviewable] = await Promise.all([
    db.application.count({ where: { teamId: id, status: "SELECTED", challenge: { status: "CLOSED" } } }),
    user?.role === "BUSINESS" && user.id !== row.ownerId
      ? db.challenge.findMany({
        where: { ownerId: user.id, status: "CLOSED", applications: { some: { teamId: id, status: "SELECTED" } } },
        orderBy: { updatedAt: "desc" }, select: { id: true, briefJson: true },
      })
      : Promise.resolve([]),
  ]);
  return {
    team: { ...teamView(row), reviews, completedProjects },
    isOwner: row.ownerId === user?.id,
    reviewableChallenges: reviewable.map((challenge) => ({
      id: challenge.id, title: challengeTitle(challenge.briefJson),
      review: reviews.find((review) => review.challengeId === challenge.id) || null,
    })),
  };
}
