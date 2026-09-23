import { z } from "zod";

export const MAX_TEAM_PHOTOS = 6;
export const MAX_TEAM_CASES = 8;
export const MAX_TEAM_PHOTO_BYTES = 4_000_000;

function isWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch { return false; }
}

export const teamCaseSchema = z.object({
  title: z.string().trim().min(2, "Укажите название проекта: минимум 2 символа.").max(140, "Название проекта должно быть не длиннее 140 символов."),
  client: z.string().trim().max(160, "Имя клиента должно быть не длиннее 160 символов.").default(""),
  description: z.string().trim().max(2000, "Описание проекта должно быть не длиннее 2000 символов.").default(""),
  result: z.string().trim().max(1500, "Результат проекта должен быть не длиннее 1500 символов.").default(""),
  link: z.string().trim().max(1000, "Ссылка должна быть не длиннее 1000 символов.").refine((value) => !value || isWebUrl(value), "Укажите ссылку на проект, начинающуюся с http:// или https://.").default(""),
}).strict();

export const teamProfileSchema = z.object({
  name: z.string().trim().min(2, "Название команды должно содержать минимум 2 символа.").max(120, "Название команды должно быть не длиннее 120 символов.").optional(),
  university: z.string().trim().max(160, "Название организации должно быть не длиннее 160 символов.").optional(),
  tagline: z.string().trim().max(160, "Краткое описание должно быть не длиннее 160 символов.").optional(),
  description: z.string().trim().max(3000, "Описание команды должно быть не длиннее 3000 символов.").optional(),
  experience: z.string().trim().max(5000, "Описание опыта должно быть не длиннее 5000 символов.").optional(),
  skills: z.string().trim().max(1000, "Список навыков должен быть не длиннее 1000 символов.").optional(),
  portfolio: z.string().trim().max(2000, "Список ссылок должен быть не длиннее 2000 символов.").refine((value) => !value || value.split(/[\n,]+/).filter((part) => part.trim()).every((part) => isWebUrl(part.trim())), "Укажите корректные ссылки http:// или https://, по одной на строку.").optional(),
  members: z.array(z.object({
    id: z.string().max(100).optional(),
    name: z.string().trim().min(1, "Укажите имя участника.").max(100, "Имя участника должно быть не длиннее 100 символов."),
    role: z.string().trim().max(120, "Роль участника должна быть не длиннее 120 символов.").default(""),
  }).strict()).max(20, "Можно добавить не более 20 участников.").optional(),
  cases: z.array(teamCaseSchema).max(MAX_TEAM_CASES, `Можно добавить не более ${MAX_TEAM_CASES} проектов.`).optional(),
}).strict();

export const teamReviewSchema = z.object({
  challengeId: z.string().min(1, "Выберите завершённую задачу.").max(100),
  rating: z.number().int("Выберите целую оценку от 1 до 5.").min(1, "Выберите оценку от 1 до 5.").max(5, "Выберите оценку от 1 до 5."),
  comment: z.string().trim().min(10, "Расскажите о работе команды: минимум 10 символов.").max(2000, "Отзыв должен быть не длиннее 2000 символов."),
}).strict();

export type TeamCase = z.infer<typeof teamCaseSchema>;
export type TeamPhoto = { id: string; url: string; caption: string };
export type TeamReview = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  company: string;
  challengeId: string;
  challengeTitle: string;
};
export type TeamProfile = {
  id: string;
  name: string;
  university: string;
  tagline: string;
  description: string;
  experience: string;
  skills: string;
  portfolio: string;
  members: { id?: string; name: string; role: string }[];
  cases: TeamCase[];
  photos: TeamPhoto[];
  rating: { average: number | null; count: number };
  isDemo?: boolean;
};
export type PublicTeamProfile = TeamProfile & { reviews: TeamReview[]; completedProjects: number };
export type TeamProfileResponse = {
  team: PublicTeamProfile;
  isOwner: boolean;
  reviewableChallenges: { id: string; title: string; review: TeamReview | null }[];
};
