import { test, expect, request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { readiness } from '../../lib/readiness';
import type { Brief } from '../../lib/brief';

const prisma = new PrismaClient();
const run = `e2e-${randomUUID().slice(0, 12)}`;
const password = 'LocalTest2026!';
const emails: string[] = [];
const contexts: APIRequestContext[] = [];
let owner: APIRequestContext;
let stranger: APIRequestContext;
let team: APIRequestContext;
let otherTeam: APIRequestContext;
let anonymous: APIRequestContext;
let appOrigin: string;

function completeBrief(title: string): Brief {
  return {
    title,
    problem: 'Менеджеры сети из 12 магазинов вручную заказывают молочные продукты и списывают 8% закупок из-за ошибок прогноза спроса.',
    audience: 'Менеджеры закупок и управляющие 12 магазинов.',
    currentState: 'Заказ формируют раз в неделю в Excel на основании продаж предыдущей недели.',
    outcome: 'Прототип прогноза спроса на 7 дней и дашборд рекомендаций закупки для управляющего.',
    successCriteria: 'На тестовой выборке за 4 недели снизить списания на 15% относительно ручного заказа, сравнение по журналу списаний.',
    data: 'Обезличенный CSV с продажами и остатками за 12 месяцев, доступ к выгрузке предоставляет владелец задачи.',
    constraints: 'Без персональных данных; запуск локально, без платных сервисов и подключения к кассам.',
    timeline: '6 недель: 1 на анализ данных, 3 на прототип, 2 на проверку и документацию.',
    skills: 'Python, SQL, React',
    deliverables: 'Исходный код, воспроизводимый ноутбук, дашборд, отчёт проверки и инструкция запуска.',
  };
}

async function okay(response: APIResponse) {
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function register(role: 'BUSINESS' | 'TEAM', suffix: string) {
  const client = await request.newContext({ baseURL: appOrigin, extraHTTPHeaders: { Origin: appOrigin } });
  contexts.push(client);
  const email = `${run}-${suffix}@example.test`;
  emails.push(email);
  await okay(await client.post('/api/auth', { data: { action: 'register', name: `${run} ${suffix}`, email, password, role, ...(role === 'BUSINESS' ? { company: `Компания ${run}` } : { teamName: `Команда ${run}-${suffix}`, university: 'Тестовый университет' }) } }));
  return client;
}

async function createDraft(title: string) {
  const response = await okay(await owner.post('/api/challenges', { data: { draft: 'У нас 12 магазинов. Хотим уменьшить списание молочных продуктов, но не знаем, с чего начать.', company: `Компания ${run}`, industry: 'Ритейл' } }));
  const id = response.challenge.id as string;
  if (title) await okay(await owner.patch(`/api/challenges/${id}`, { data: { brief: completeBrief(title) } }));
  return id;
}

async function publish(id: string) {
  return okay(await owner.post(`/api/challenges/${id}/publish`, { data: {} }));
}

async function apply(client: APIRequestContext, id: string) {
  return client.post(`/api/challenges/${id}/applications`, { data: { proposal: 'Подготовим базовую модель, проверим качество на отложенной выборке и покажем понятный дашборд.', experience: 'Разработали учебный проект прогнозирования спроса на Python и SQL.', timeline: '6 недель, промежуточная демонстрация каждую неделю.' } });
}

test.beforeAll(async ({ baseURL }) => {
  appOrigin = baseURL!;
  owner = await register('BUSINESS', 'owner');
  stranger = await register('BUSINESS', 'stranger');
  team = await register('TEAM', 'team');
  otherTeam = await register('TEAM', 'otherteam');
  anonymous = await request.newContext({ baseURL: appOrigin, extraHTTPHeaders: { Origin: appOrigin } });
  contexts.push(anonymous);
});

test.afterAll(async () => {
  // Only accounts created by this run; application records disappear through FK cascades.
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
  await Promise.all(contexts.map((context) => context.dispose()));
});

test('business draft → questions → saved brief → publication → application → selected team', async () => {
  await test.step('real login and safe session cookie', async () => {
    await okay(await owner.post('/api/auth', { data: { action: 'logout' } }));
    expect((await owner.get('/api/dashboard')).status()).toBe(401);
    await okay(await owner.post('/api/auth', { data: { action: 'login', email: emails[0], password } }));
    const sessionCookie = (await owner.storageState()).cookies.find((cookie) => cookie.name === 'sana_session');
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.sameSite).toBe('Lax');
    const storedUser = await prisma.user.findUniqueOrThrow({ where: { email: emails[0] } });
    expect(storedUser.passwordHash).not.toBe(password);
    expect(storedUser.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  const id = await createDraft('');
  const path = `/api/challenges/${id}`;
  const first = await okay(await owner.post(`${path}/analyze`, { data: {} }));
  expect(first.mode).toBe('demo');
  expect(first.challenge.questions.length).toBeGreaterThanOrEqual(3);
  expect(first.challenge.questions.length).toBeLessThanOrEqual(5);
  const initialScore = first.challenge.score;

  const finalBrief = completeBrief(`${run}: прогноз закупок`);
  const answers: Record<string, string> = {};
  for (const question of first.challenge.questions) {
    const field = question.field as keyof Brief;
    answers[field] = finalBrief[field] ?? 'Работаем на обезличенных CSV-данных за 12 месяцев; проверяем прототип в пилоте за 6 недель.';
  }
  await okay(await owner.patch(path, { data: { answers } }));
  const afterAnswers = await okay(await owner.post(`${path}/analyze`, { data: {} }));
  expect(afterAnswers.challenge.score).toBeGreaterThan(initialScore);

  const manualTitle = `${run}: название от владельца`;
  finalBrief.title = manualTitle;
  await okay(await owner.patch(path, { data: { brief: finalBrief } }));
  const rerun = await okay(await owner.post(`${path}/analyze`, { data: {} }));
  expect(rerun.challenge.brief.title).toBe(manualTitle);
  const reloaded = await okay(await owner.get(path));
  expect(reloaded.challenge.brief).toEqual(finalBrief);
  expect(reloaded.challenge.answers).toEqual(answers);
  expect(reloaded.challenge.score).toBe(readiness(finalBrief).score);
  expect(reloaded.challenge.status).toBe('DRAFT');

  await publish(id);
  const catalogue = await okay(await anonymous.get('/api/challenges', { params: { q: manualTitle } }));
  expect(catalogue.challenges.map((challenge: { id: string }) => challenge.id)).toContain(id);
  const application = await okay(await apply(team, id));
  const ownerDetail = await okay(await owner.get(path));
  const submitted = ownerDetail.challenge.applications.find((item: { team: { owner: { email: string } }; id: string }) => item.id === application.application.id);
  expect(submitted).toBeTruthy();
  await okay(await owner.post(`${path}/select`, { data: { applicationId: submitted.id } }));
  const teamDashboard = await okay(await team.get('/api/dashboard'));
  expect(teamDashboard.applications.find((item: { id: string; status: string }) => item.id === submitted.id)?.status).toBe('SELECTED');
  expect((await okay(await owner.get(path))).challenge.status).toBe('ASSIGNED');
  expect((await apply(otherTeam, id)).ok()).toBe(false);
});

test('draft privacy, role and ownership checks, validation and duplicate applications', async () => {
  const id = await createDraft(`${run}: приватный черновик`);
  const path = `/api/challenges/${id}`;
  const publicList = await okay(await anonymous.get('/api/challenges', { params: { q: run } }));
  expect(publicList.challenges.map((challenge: { id: string }) => challenge.id)).not.toContain(id);
  expect([403, 404]).toContain((await anonymous.get(path)).status());
  expect([403, 404]).toContain((await stranger.get(path)).status());
  expect([403, 404]).toContain((await stranger.patch(path, { data: { brief: completeBrief('Чужое изменение') } })).status());
  expect([403, 404]).toContain((await stranger.post(`${path}/publish`, { data: {} })).status());
  expect([401, 403]).toContain((await team.post('/api/challenges', { data: { draft: 'Нельзя создать задачу от команды', company: 'Чужая', industry: 'Ритейл' } })).status());
  expect((await anonymous.patch(path, { data: { draft: 'Изменено анонимно' } })).status()).toBe(401);
  expect((await owner.patch(path, { data: { status: 'OPEN', ownerId: 'attacker' } })).ok()).toBe(false);
  expect((await owner.patch(path, { data: { brief: { ...completeBrief('Слишком длинное название'), title: 'x'.repeat(161) } } })).ok()).toBe(false);
  await publish(id);
  expect((await apply(owner, id)).status()).toBe(403);
  const application = await okay(await apply(team, id));
  expect((await apply(team, id)).status()).toBe(409);
  expect(await prisma.application.count({ where: { challengeId: id } })).toBe(1);

  const guestDetail = await okay(await anonymous.get(path));
  const otherTeamDetail = await okay(await otherTeam.get(path));
  expect(JSON.stringify(guestDetail)).not.toContain(application.application.proposal);
  expect(JSON.stringify(otherTeamDetail)).not.toContain(application.application.proposal);
  expect(JSON.stringify(guestDetail)).not.toContain(emails[0]);
  expect((await stranger.post(`${path}/select`, { data: { applicationId: application.application.id } })).ok()).toBe(false);
  expect((await team.post(`${path}/close`, { data: {} })).ok()).toBe(false);
});

test('transactional selection has one winner; closed challenges reject applications', async () => {
  const id = await createDraft(`${run}: выбор исполнителя`);
  await publish(id);
  const first = await okay(await apply(team, id));
  const second = await okay(await apply(otherTeam, id));
  const attempts = await Promise.all([
    owner.post(`/api/challenges/${id}/select`, { data: { applicationId: first.application.id } }),
    owner.post(`/api/challenges/${id}/select`, { data: { applicationId: second.application.id } }),
  ]);
  expect(attempts.filter((response) => response.ok())).toHaveLength(1);
  expect(attempts.filter((response) => response.status() === 409)).toHaveLength(1);
  const stored = await prisma.application.findMany({ where: { challengeId: id } });
  expect(stored.filter((application) => application.status === 'SELECTED')).toHaveLength(1);
  expect(stored.filter((application) => application.status === 'REJECTED')).toHaveLength(1);
  expect((await prisma.challenge.findUniqueOrThrow({ where: { id } })).status).toBe('ASSIGNED');

  const closedId = await createDraft(`${run}: закрытая задача`);
  await publish(closedId);
  await okay(await apply(team, closedId));
  await okay(await owner.post(`/api/challenges/${closedId}/close`, { data: {} }));
  expect((await apply(otherTeam, closedId)).ok()).toBe(false);
  expect((await prisma.challenge.findUniqueOrThrow({ where: { id: closedId } })).status).toBe('CLOSED');
  expect((await owner.post(`/api/challenges/${closedId}/publish`, { data: {} })).ok()).toBe(false);
});

test('authentication rejects forged roles, wrong passwords and cross-origin writes', async () => {
  const forged = await anonymous.post('/api/auth', { data: { action: 'register', name: 'Подделка роли', email: `${run}-forged@example.test`, password, role: 'ADMIN' } });
  expect(forged.ok()).toBe(false);
  expect((await anonymous.post('/api/auth', { data: { action: 'login', email: emails[0], password: 'DefinitelyWrong123!' } })).status()).toBe(401);
  expect((await anonymous.post('/api/auth', { headers: { Origin: 'https://foreign.example.test' }, data: { action: 'login', email: emails[0], password } })).status()).toBe(403);
  const id = await createDraft('');
  expect((await owner.patch(`/api/challenges/${id}`, { headers: { Origin: 'https://foreign.example.test' }, data: { draft: 'CSRF-запись не должна сохраниться' } })).status()).toBe(403);
  expect((await prisma.challenge.findUniqueOrThrow({ where: { id } })).draft).not.toContain('CSRF');
  expect((await owner.post(`/api/challenges/${id}/publish`, { data: {} })).ok()).toBe(false);
  const profile = await okay(await team.patch('/api/team', { data: { name: `${run} Updated`, university: 'Новый университет', description: 'Команда тестирования', skills: 'Python, React', portfolio: 'https://example.test/portfolio', members: [{ name: 'Участник', role: 'Разработчик' }] } }));
  expect(profile.team.name).toBe(`${run} Updated`);
  expect((await okay(await team.get('/api/dashboard'))).team.members[0].name).toBe('Участник');
  expect((await owner.patch('/api/team', { data: { name: 'Чужой профиль' } })).status()).toBe(403);
});
