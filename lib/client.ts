import type { Brief } from "./brief";
import type { readiness } from "./readiness";
import type { TeamProfile } from "./team-profile";
export type User = { id: string; name: string; email: string; role: "BUSINESS" | "TEAM"; company?: string; isDemo?: boolean };
export type Team = TeamProfile;
export type Application = { id: string; challengeId: string; proposal: string; experience: string; timeline: string; status: "PENDING" | "SELECTED" | "REJECTED"; team?: Team; challenge?: Challenge; createdAt: string };
export type Question = { id: string; field: keyof Brief; question: string };
export type Challenge = { id: string; ownerId: string; company: string; industry: string; draft: string; brief: Brief; answers: Record<string,string>; questions: Question[]; lockedFields: string[]; assumptions: string[]; recommendations: string[]; score: number; status: "DRAFT" | "OPEN" | "ASSIGNED" | "CLOSED"; isDemo: boolean; createdAt: string; updatedAt: string; applicationCount: number; readiness: ReturnType<typeof readiness>; applications?: Application[]; myApplication?: Application; mode?: "demo" | "live" };
export class ClientError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); this.name = "ClientError"; }
}
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try { res = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } }); }
  catch (error) { if (error instanceof Error && error.name === "AbortError") throw error; throw new Error("Не удалось связаться с сервером. Проверьте соединение и повторите действие."); }
  let data;
  try { data = await res.json(); } catch { throw new Error("Сервер временно недоступен. Попробуйте ещё раз."); }
  if (!res.ok) throw new ClientError(data.error || "Не удалось выполнить запрос. Попробуйте ещё раз.", res.status, data.code);
  return data as T;
}
export const statuses = { DRAFT: "Черновик", OPEN: "Открыт набор", ASSIGNED: "Команда выбрана", CLOSED: "Задача закрыта", PENDING: "На рассмотрении", SELECTED: "Выбрана", REJECTED: "Не выбрана" };
export const industries = ["Ритейл", "Образование", "Логистика", "Агротехнологии", "Здравоохранение", "Экология", "Финансы", "Туризм"];
export function skillsList(value: string) { return value.split(/[,;\n]/).map(s => s.trim()).filter(Boolean); }
