import { z } from "zod";

export const briefFields = [
  "title", "problem", "audience", "currentState", "outcome", "successCriteria",
  "data", "constraints", "timeline", "skills", "deliverables",
] as const;

export const briefSchema = z.object({
  title: z.string().max(160, "Название должно быть не длиннее 160 символов"),
  problem: z.string().max(5000),
  audience: z.string().max(5000),
  currentState: z.string().max(5000),
  outcome: z.string().max(5000),
  successCriteria: z.string().max(5000),
  data: z.string().max(5000),
  constraints: z.string().max(5000),
  timeline: z.string().max(5000),
  skills: z.string().max(5000),
  deliverables: z.string().max(5000),
}).strict();

export type Brief = z.infer<typeof briefSchema>;
export type BriefField = keyof Brief;

export const emptyBrief: Brief = {
  title: "", problem: "", audience: "", currentState: "", outcome: "",
  successCriteria: "", data: "", constraints: "", timeline: "", skills: "", deliverables: "",
};

export const briefLabels: Record<BriefField, string> = {
  title: "Название задачи",
  problem: "Проблема",
  audience: "Целевая аудитория",
  currentState: "Текущее положение",
  outcome: "Ожидаемый результат",
  successCriteria: "Критерии успеха",
  data: "Доступные данные",
  constraints: "Ограничения",
  timeline: "Сроки",
  skills: "Необходимые навыки",
  deliverables: "Результаты работы команды",
};
