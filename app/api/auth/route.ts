import { NextRequest } from "next/server";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser, endSession, publicUser, startSession } from "@/lib/auth";
import { api, ApiError, clientAddress, parseBody, rateLimit } from "@/lib/http";
import { teamProfileInclude, teamView } from "@/lib/team-server";

const email = z.string().trim().toLowerCase().email("Укажите корректный email.").max(254);
const password = z.string().min(8, "Пароль должен содержать не менее 8 символов.").max(72, "Пароль должен содержать не более 72 символов.").refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Пароль должен занимать не более 72 байт UTF-8.");
const authSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("login"), email, password: z.string().min(1).max(72).refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Проверьте пароль.") }).strict(),
  z.object({
    action: z.literal("register"), name: z.string().trim().min(2, "Укажите имя.").max(100), email, password,
    role: z.enum(["BUSINESS", "TEAM"]), company: z.string().trim().max(120).optional(),
    teamName: z.string().trim().max(120).optional(), university: z.string().trim().max(160).optional(),
  }).strict(),
  z.object({ action: z.literal("logout") }).strict(),
]);

export async function GET() {
  return api(async () => {
    const user = await currentUser();
    if (!user) return { user: null, team: null, mode: process.env.OPENAI_API_KEY ? "live" : "demo" };
    const team = user.role === "TEAM" ? await db.team.findUnique({ where: { ownerId: user.id }, include: teamProfileInclude }) : null;
    return { user: publicUser(user), team: team ? teamView(team) : null, mode: process.env.OPENAI_API_KEY ? "live" : "demo" };
  });
}

export async function POST(request: NextRequest) {
  return api(async () => {
    const data = await parseBody(request, authSchema);
    if (data.action === "logout") {
      await endSession();
      return { user: null, team: null };
    }
    if (data.action === "register") {
      await rateLimit("register", clientAddress(request), 30, 15 * 60_000);
      const existing = await db.user.findUnique({ where: { email: data.email }, select: { id: true } });
      if (existing) throw new ApiError(409, "Аккаунт с таким email уже зарегистрирован.");
      const user = await db.user.create({
        data: {
          name: data.name, email: data.email, passwordHash: await hash(data.password, 12), role: data.role,
          company: data.role === "BUSINESS" ? data.company || data.name : null,
          ...(data.role === "TEAM" ? { team: { create: {
            name: data.teamName || `Команда ${data.name}`, university: data.university || "",
            members: { create: { name: data.name, role: "Представитель команды" } },
          } } } : {}),
        },
        include: { team: { include: teamProfileInclude } },
      });
      await startSession(user.id);
      return { user: publicUser(user), team: user.team ? teamView(user.team) : null };
    }
    await rateLimit("login-address", clientAddress(request), 100, 15 * 60_000);
    await rateLimit("login-email", data.email, 10, 15 * 60_000);
    const user = await db.user.findUnique({ where: { email: data.email }, include: { team: { include: teamProfileInclude } } });
    // A valid dummy bcrypt hash keeps absent accounts on the same expensive verification path.
    const valid = await compare(data.password, user?.passwordHash || "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW");
    if (!user || !valid) throw new ApiError(401, "Неверный email или пароль.");
    await startSession(user.id);
    return { user: publicUser(user), team: user.team ? teamView(user.team) : null };
  }, request);
}
