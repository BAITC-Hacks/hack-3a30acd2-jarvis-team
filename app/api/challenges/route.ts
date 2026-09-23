import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { api, parseBody, rateLimit } from "@/lib/http";
import { emptyBrief } from "@/lib/brief";
import { challengeCard, challengeView } from "@/app/api/_shared";

const createSchema = z.object({
  draft: z.string().trim().min(10, "Опишите задачу хотя бы в одном предложении.").max(12000, "Черновик должен быть короче 12 000 символов."),
  company: z.string().trim().min(2, "Укажите название компании.").max(120),
  industry: z.string().trim().min(2, "Выберите отрасль.").max(100),
}).strict();

export async function GET(request: NextRequest) {
  return api(async () => {
    const query = request.nextUrl.searchParams;
    const q = (query.get("q") || "").slice(0, 200).trim().toLowerCase();
    const industry = (query.get("industry") || "").slice(0, 100);
    const skill = (query.get("skill") || "").slice(0, 100).toLowerCase();
    const minScore = Math.max(0, Math.min(100, Number(query.get("readiness")) || 0));
    const rows = await db.challenge.findMany({
      where: { status: "OPEN", ...(industry && industry !== "all" ? { industry } : {}) },
      include: { _count: { select: { applications: true } } }, orderBy: { createdAt: "desc" },
    });
    const challenges = rows.map(challengeCard).filter((item) => {
      const text = `${item.brief.title} ${item.brief.problem} ${item.brief.outcome} ${item.company}`.toLowerCase();
      return (!q || text.includes(q)) && (!skill || skill === "all" || item.brief.skills.toLowerCase().includes(skill)) && item.score >= minScore;
    });
    if (query.get("sort") === "readiness") challenges.sort((a, b) => b.score - a.score);
    return { challenges };
  });
}

export async function POST(request: NextRequest) {
  return api(async () => {
    const user = await requireUser("BUSINESS");
    const data = await parseBody(request, createSchema);
    await rateLimit("create-challenge", user.id, 30, 60 * 60_000);
    const challenge = await db.challenge.create({ data: { ...data, ownerId: user.id, briefJson: JSON.stringify(emptyBrief) } });
    return { challenge: await challengeView(challenge.id, user) };
  }, request);
}
