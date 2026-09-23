import { test, expect, request, type APIRequestContext, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Brief } from "../../lib/brief";
import type { TeamProfileResponse } from "../../lib/team-profile";

const prisma = new PrismaClient();
const run = `team-api-${randomUUID().slice(0, 12)}`;
const users: string[] = [];
const contexts: APIRequestContext[] = [];
let origin: string;
let owner: APIRequestContext;
let stranger: APIRequestContext;
let team: APIRequestContext;
let otherTeam: APIRequestContext;
let anonymous: APIRequestContext;
let teamId: string;
let otherTeamId: string;

async function okay(response: APIResponse) {
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function register(role: "BUSINESS" | "TEAM", suffix: string) {
  const client = await request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
  contexts.push(client);
  const result = await okay(await client.post("/api/auth", { data: {
    action: "register", role, name: `Проверка профиля ${suffix}`, email: `${run}-${suffix}@example.test`, password: "TeamProfiles2026!",
    ...(role === "TEAM" ? { teamName: `Команда ${run}-${suffix}` } : { company: `Компания ${run}-${suffix}` }),
  } }));
  users.push(result.user.id);
  return { client, result };
}

function brief(title: string): Brief {
  return {
    title,
    problem: "Курьеры магазина цветов опаздывают в 25% случаев, диспетчер каждый день вручную планирует 50 заказов.",
    audience: "Диспетчер и курьеры магазина цветов.",
    currentState: "Диспетчер распределяет адреса в таблице без учёта временных окон и пробок.",
    outcome: "Прототип планировщика маршрутов с прогнозом опозданий.",
    successCriteria: "За месяц снизить долю опозданий с 25% до 10% по сравнению с предыдущим месяцем.",
    data: "Обезличенный CSV с заказами и временем доставки за 6 месяцев. Компания предоставит доступ.",
    constraints: "Без персональных данных и платных внешних сервисов.",
    timeline: "6 недель, первая демонстрация через 2 недели.",
    skills: "Python, анализ данных, React",
    deliverables: "Исходный код прототипа, инструкция запуска и отчёт проверки на исторических заказах.",
  };
}

async function challenge(client: APIRequestContext = owner) {
  const created = await okay(await client.post("/api/challenges", { data: {
    draft: "Магазину цветов нужно уменьшить опоздания курьеров с помощью планирования маршрутов.", company: `Цветы ${run}`, industry: "Логистика",
  } }));
  const id = created.challenge.id as string;
  await okay(await client.patch(`/api/challenges/${id}`, { data: { brief: brief(`${run}: доставка цветов`) } }));
  await okay(await client.post(`/api/challenges/${id}/publish`, { data: {} }));
  return id;
}

async function application(client: APIRequestContext, id: string) {
  return okay(await client.post(`/api/challenges/${id}/applications`, { data: {
    proposal: "Сделаем планировщик маршрутов и сравним результат с ручным распределением адресов.",
    experience: "Помогли учебному магазину построить прогноз времени доставки.", timeline: "6 недель",
  } }));
}

async function selectedChallenge(client: APIRequestContext = owner) {
  const id = await challenge(client);
  const applied = await application(team, id);
  await okay(await client.post(`/api/challenges/${id}/select`, { data: { applicationId: applied.application.id } }));
  return id;
}

test.beforeAll(async ({ baseURL }) => {
  origin = baseURL!;
  owner = (await register("BUSINESS", "owner")).client;
  stranger = (await register("BUSINESS", "stranger")).client;
  const first = await register("TEAM", "team");
  team = first.client;
  teamId = first.result.team.id;
  const second = await register("TEAM", "otherteam");
  otherTeam = second.client;
  otherTeamId = second.result.team.id;
  anonymous = await request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
  contexts.push(anonymous);
});

test.afterAll(async () => {
  try { await prisma.user.deleteMany({ where: { id: { in: users } } }); }
  finally {
    await prisma.$disconnect();
    await Promise.all(contexts.map((context) => context.dispose()));
  }
});

test("team profile keeps experience and projects, exposes only public fields, and rejects forged ratings", async () => {
  const cases = [{
    title: "Маршруты цветочного магазина", client: "Цветы у дома",
    description: "Собрали прототип для распределения заказов между курьерами.", result: "Опоздания снизились с 25% до 12% в учебном пилоте.", link: "https://example.test/flower-delivery",
  }];
  await okay(await team.patch("/api/team", { data: {
    tagline: "Помогаем небольшим компаниям анализировать данные", experience: "Создали три учебных проекта для местных компаний.",
    description: "Команда разработчиков и аналитиков.", skills: "Python, React, SQL", cases,
    members: [{ name: "Алия", role: "Аналитик" }, { name: "Тимур", role: "Разработчик" }],
  } }));
  // Old clients can continue sending partial updates without deleting new sections.
  await okay(await team.patch("/api/team", { data: { university: "Местный университет" } }));
  const result: TeamProfileResponse = await okay(await anonymous.get(`/api/teams/${teamId}`));
  expect(result.team.cases).toEqual(cases);
  expect(result.team.experience).toContain("три учебных проекта");
  expect(result.team.members).toHaveLength(2);
  expect(result.team.rating).toEqual({ average: null, count: 0 });
  expect(result.team.completedProjects).toBe(0);
  expect(result.isOwner).toBe(false);
  expect(result.reviewableChallenges).toEqual([]);
  const serialized = JSON.stringify(result);
  for (const field of ["ownerId", "passwordHash", "tokenHash", "casesJson", "briefJson", "answersJson", "@example.test"]) expect(serialized).not.toContain(field);
  expect((await okay(await team.get(`/api/teams/${teamId}`))).isOwner).toBe(true);
  expect((await okay(await team.get("/api/dashboard"))).team.cases).toEqual(cases);
  expect((await okay(await team.get("/api/auth"))).team.cases).toEqual(cases);
  expect((await team.patch("/api/team", { data: { rating: { average: 5, count: 99 } } })).status()).toBe(400);
  expect((await team.patch("/api/team", { data: { cases: [{ ...cases[0], link: "javascript:alert(1)" }] } })).status()).toBe(400);
  expect((await team.patch("/api/team", { data: { cases: Array.from({ length: 9 }, () => cases[0]) } })).status()).toBe(400);
  expect((await owner.patch("/api/team", { data: { tagline: "Чужая правка" } })).status()).toBe(403);
  expect((await anonymous.patch("/api/team", { data: { tagline: "Анонимная правка" } })).status()).toBe(401);
  expect((await team.patch("/api/team", { headers: { Origin: "https://foreign.example.test" }, data: { tagline: "Подмена" } })).status()).toBe(403);
  await prisma.team.update({ where: { id: teamId }, data: { casesJson: "{old-invalid-data" } });
  expect((await okay(await anonymous.get(`/api/teams/${teamId}`))).team.cases).toEqual([]);
  await okay(await team.patch("/api/team", { data: { cases } }));
});

test("team photos are decoded, resized and public; invalid files and foreign deletion are rejected", async () => {
  const source = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#9acacd" } }).withMetadata({ density: 144 }).png().toBuffer();
  const dataUrl = `data:image/png;base64,${source.toString("base64")}`;
  const uploaded = await okay(await team.post("/api/team/photos", { data: { dataUrl, caption: "Команда за работой" } }));
  expect(uploaded.photo.caption).toBe("Команда за работой");
  expect(uploaded.photo.url).toBe(`/api/team/photos/${uploaded.photo.id}`);
  const image = await anonymous.get(uploaded.photo.url);
  expect(image.ok()).toBeTruthy();
  expect(image.headers()["content-type"]).toBe("image/webp");
  expect(image.headers()["x-content-type-options"]).toBe("nosniff");
  const decoded = await sharp(await image.body()).metadata();
  expect(decoded.format).toBe("webp");
  expect(decoded.width).toBe(1800);
  expect(decoded.height).toBe(1350);
  expect(decoded.exif).toBeUndefined();
  expect(decoded.icc).toBeUndefined();
  expect((await okay(await anonymous.get(`/api/teams/${teamId}`))).team.photos).toContainEqual(uploaded.photo);
  expect((await otherTeam.delete(uploaded.photo.url, { data: {} })).status()).toBe(403);
  expect((await anonymous.delete(uploaded.photo.url, { data: {} })).status()).toBe(401);
  expect((await team.delete(uploaded.photo.url, { headers: { Origin: "https://foreign.example.test" }, data: {} })).status()).toBe(403);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64");
  expect((await team.post("/api/team/photos", { data: { dataUrl: `data:image/svg+xml;base64,${svg}` } })).status()).toBe(400);
  expect((await team.post("/api/team/photos", { data: { dataUrl: `data:image/png;base64,${svg}` } })).status()).toBe(400);
  expect((await team.post("/api/team/photos", { data: { dataUrl: "data:image/jpeg;base64,bm90LWFuLWltYWdl" } })).status()).toBe(400);
  expect((await team.post("/api/team/photos", { data: { dataUrl: `data:image/png;base64,${Buffer.alloc(4_000_001).toString("base64")}` } })).status()).toBe(413);
  const tooManyPixels = await sharp({ create: { width: 5000, height: 4000, channels: 3, background: "#ffffff" } }).png().toBuffer();
  expect((await team.post("/api/team/photos", { data: { dataUrl: `data:image/png;base64,${tooManyPixels.toString("base64")}` } })).status()).toBe(400);
  expect((await owner.post("/api/team/photos", { data: { dataUrl } })).status()).toBe(403);
  expect((await team.post("/api/team/photos", { headers: { Origin: "https://foreign.example.test" }, data: { dataUrl } })).status()).toBe(403);
  for (let index = 0; index < 4; index++) await okay(await team.post("/api/team/photos", { data: { dataUrl, caption: `Фото ${index + 2}` } }));
  const simultaneous = await Promise.all([
    team.post("/api/team/photos", { data: { dataUrl, caption: "Шестое фото" } }),
    team.post("/api/team/photos", { data: { dataUrl, caption: "Лишнее фото" } }),
  ]);
  expect(simultaneous.filter((response) => response.ok())).toHaveLength(1);
  expect(simultaneous.filter((response) => response.status() === 409)).toHaveLength(1);
  expect((await team.post("/api/team/photos", { data: { dataUrl } })).status()).toBe(409);
  expect(await prisma.teamPhoto.count({ where: { teamId } })).toBe(6);
  await okay(await team.delete(uploaded.photo.url, { data: {} }));
  expect((await anonymous.get(uploaded.photo.url)).status()).toBe(404);
  expect((await okay(await anonymous.get(`/api/teams/${teamId}`))).team.photos).toHaveLength(5);
  await okay(await team.post("/api/team/photos", { data: { dataUrl, caption: "Заменили удалённое фото" } }));
  expect(await prisma.teamPhoto.count({ where: { teamId } })).toBe(6);
});

test("only the customer of a completed selected project can review; editing updates one derived rating", async () => {
  const id = await selectedChallenge();
  const path = `/api/teams/${teamId}/reviews`;
  const review = { challengeId: id, rating: 5, comment: "Команда завершила прототип вовремя и оставила понятную инструкцию." };
  expect((await owner.post(path, { data: review })).status()).toBe(409);
  await okay(await owner.post(`/api/challenges/${id}/close`, { data: {} }));
  const before: TeamProfileResponse = await okay(await owner.get(`/api/teams/${teamId}`));
  expect(before.reviewableChallenges).toContainEqual({ id, title: `${run}: доставка цветов`, review: null });
  expect((await stranger.post(path, { data: review })).status()).toBe(403);
  expect((await team.post(path, { data: review })).status()).toBe(403);
  expect((await anonymous.post(path, { data: review })).status()).toBe(401);
  expect((await owner.post(`/api/teams/${otherTeamId}/reviews`, { data: review })).status()).toBe(409);
  expect((await owner.post(path, { headers: { Origin: "https://foreign.example.test" }, data: review })).status()).toBe(403);
  for (const rating of [0, 6, 2.5]) expect((await owner.post(path, { data: { ...review, rating } })).status()).toBe(400);
  expect((await owner.post(path, { data: { ...review, rating: "5" } })).status()).toBe(400);
  expect((await owner.post(path, { data: { ...review, comment: "Да" } })).status()).toBe(400);
  expect((await owner.post(path, { data: { ...review, authorName: "Поддельный заказчик" } })).status()).toBe(400);
  const first: TeamProfileResponse = await okay(await owner.post(path, { data: review }));
  expect(first.team.rating).toEqual({ average: 5, count: 1 });
  expect(first.team.completedProjects).toBe(1);
  expect(first.team.reviews[0]).toMatchObject({ rating: 5, comment: review.comment, authorName: "Проверка профиля owner", company: `Цветы ${run}`, challengeId: id });
  const updated: TeamProfileResponse = await okay(await owner.post(path, { data: { ...review, rating: 4, comment: "Хороший результат, небольшие правки помогли сделать инструкцию понятнее." } }));
  expect(updated.team.reviews).toHaveLength(1);
  expect(updated.team.reviews[0].id).toBe(first.team.reviews[0].id);
  expect(updated.team.rating).toEqual({ average: 4, count: 1 });
  expect(await prisma.teamReview.count({ where: { challengeId: id } })).toBe(1);
  const secondId = await selectedChallenge(stranger);
  await okay(await stranger.post(`/api/challenges/${secondId}/close`, { data: {} }));
  await okay(await stranger.post(path, { data: { ...review, challengeId: secondId, rating: 5 } }));
  const visible: TeamProfileResponse = await okay(await anonymous.get(`/api/teams/${teamId}`));
  expect(visible.team.rating).toEqual({ average: 4.5, count: 2 });
  expect(visible.team.completedProjects).toBe(2);
  expect(visible.reviewableChallenges).toEqual([]);
  expect(JSON.stringify(visible)).not.toContain("@example.test");
  const ownerChallenge = await okay(await owner.get(`/api/challenges/${id}`));
  expect(ownerChallenge.challenge.applications[0].team.rating).toEqual({ average: 4.5, count: 2 });
  expect(ownerChallenge.challenge.applications[0].team.owner).toBeUndefined();
});

test("closing a project without selecting its applicant does not grant review eligibility", async () => {
  const id = await challenge();
  await application(team, id);
  await okay(await owner.post(`/api/challenges/${id}/close`, { data: {} }));
  expect((await owner.post(`/api/teams/${teamId}/reviews`, { data: { challengeId: id, rating: 5, comment: "Нельзя оценить команду, которую не выбрали." } })).status()).toBe(409);
  const profile: TeamProfileResponse = await okay(await owner.get(`/api/teams/${teamId}`));
  expect(profile.reviewableChallenges.some((item) => item.id === id)).toBe(false);
  expect(profile.team.reviews.some((item) => item.challengeId === id)).toBe(false);
});
