import { test, expect, request, chromium, type Page, type BrowserContext, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { briefFields, type Brief } from "../../lib/brief";
import { editorLabels } from "../../lib/editor-copy";
import type { Challenge } from "../../lib/client";

// Prefer Playwright Chromium; installed Windows Chrome is a local fallback.
const channel = process.env.PLAYWRIGHT_CHANNEL || (existsSync(chromium.executablePath()) ? undefined
  : process.platform === "win32" && existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe") ? "chrome" : undefined);
test.use({ channel });
test.setTimeout(120_000);

const prisma = new PrismaClient();
const run = `ui-${randomUUID().slice(0, 12)}`;
const password = "LocalBrowser2026!";
const ownerEmail = `${run}-owner@example.test`;
const teamEmail = `${run}-team@example.test`;
const teamName = `Команда ${run}`;
const userIds: string[] = [];
const draft = "У нас сеть небольших продуктовых магазинов. Хотим уменьшить списание продуктов, но не понимаем, с чего начать.";
const finalBrief: Brief = {
  title: `${run}: прогноз закупок для магазинов`,
  problem: "Управляющие магазинов вручную заказывают продукты и теряют деньги из-за списаний.",
  audience: "Управляющие магазинов и менеджеры закупок.",
  currentState: "Закупки планируют в Excel по продажам предыдущей недели.",
  outcome: "Прототип прогноза спроса для планирования закупок товаров.",
  successCriteria: "Снизить списания на 15% в пилоте по сравнению с предыдущим месяцем.",
  data: "Обезличенная CSV-выгрузка продаж и остатков за 6 месяцев, доступ предоставит владелец задачи.",
  constraints: "Без передачи персональных данных, только бесплатные инструменты.",
  timeline: "6 недель после выбора команды.",
  skills: "Python, SQL, анализ данных",
  deliverables: "Исходный код прототипа, отчёт проверки и инструкция запуска.",
};

async function okay(response: APIResponse) {
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Электронная почта", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: email === ownerEmail ? "Мои задачи" : "Моя команда", exact: true })).toBeVisible();
}
async function getChallenge(page: Page, id: string): Promise<Challenge> {
  return (await okay(await page.request.get(`/api/challenges/${id}`))).challenge;
}
async function createDraft(page: Page, brief: Brief = finalBrief): Promise<Challenge> {
  const headers = { Origin: new URL(page.url()).origin };
  const created = await okay(await page.request.post("/api/challenges", { headers, data: { draft, company: `Магазины ${run}`, industry: "Ритейл" } }));
  return (await okay(await page.request.patch(`/api/challenges/${created.challenge.id}`, { headers, data: { brief, expectedUpdatedAt: created.challenge.updatedAt } }))).challenge;
}
async function openReview(page: Page, id: string) {
  await page.goto(`/challenges/${id}/edit?step=review`);
  await expect(page.getByRole("heading", { level: 1, name: "Проверьте описание задачи" })).toBeVisible();
  await expect(page.locator("#brief-title")).toBeVisible();
}
async function saveReview(page: Page) {
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("Сохранено");
}

test.beforeAll(async ({ baseURL }) => {
  const client = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
  try {
    for (const role of ["BUSINESS", "TEAM"] as const) {
      const result = await okay(await client.post("/api/auth", { data: {
        action: "register", role, password,
        name: role === "BUSINESS" ? "Владелец браузерного теста" : "Представитель браузерной команды",
        email: role === "BUSINESS" ? ownerEmail : teamEmail,
        ...(role === "BUSINESS" ? { company: `Магазины ${run}` } : { teamName, university: "Тестовый университет" }),
      } }));
      userIds.push(result.user.id);
    }
  } finally { await client.dispose(); }
});
test.afterAll(async () => {
  // Only accounts created by this run; their drafts/applications use FK cascades.
  try { await prisma.user.deleteMany({ where: { id: { in: userIds } } }); }
  finally { await prisma.$disconnect(); }
});

test("real browser: simple wizard → publication → application → selected team", async ({ page, browser, baseURL }) => {
  let teamContext: BrowserContext | undefined;
  let id = "";
  let first!: Challenge;
  try {
    await test.step("business describes the problem and gets one question at a time", async () => {
      await login(page, ownerEmail);
      await page.getByRole("link", { name: "Создать задачу", exact: true }).first().click();
      await expect(page).toHaveURL(/\/challenges\/new$/);
      await page.locator("#source-draft").fill(draft);
      await page.getByRole("button", { name: "Продолжить", exact: true }).click();
      await expect(page).toHaveURL(/\/challenges\/[^/]+\/edit\?step=questions$/);
      await expect(page.getByRole("heading", { level: 1, name: "Давайте уточним детали" })).toBeVisible();
      id = new URL(page.url()).pathname.split("/")[2];
      first = await getChallenge(page, id);
      expect(first.questions.length).toBeGreaterThanOrEqual(3);
      expect(first.questions.length).toBeLessThanOrEqual(5);
      expect(first.questions.some(question => question.field === "deliverables")).toBe(true);
      await expect(page.locator(".question-card textarea:visible")).toHaveCount(1);
      await expect(page.getByText("Демонстрационный режим", { exact: true })).toBeVisible();
    });
    await test.step("answers persist between steps and become an editable description", async () => {
      for (const [index, question] of first.questions.entries()) {
        await expect(page.locator("#question-title")).toHaveText(question.question);
        await page.locator("#question-answer").fill(finalBrief[question.field]);
        await page.getByRole("button", { name: index === first.questions.length - 1 ? "Собрать описание" : "Далее", exact: true }).click();
      }
      await expect(page.getByRole("heading", { level: 1, name: "Проверьте описание задачи" })).toBeVisible();
      const updated = await getChallenge(page, id);
      expect(updated.score).toBeGreaterThan(first.score);
      for (const question of first.questions) {
        expect(updated.answers[question.field]).toBe(finalBrief[question.field]);
        await expect(page.locator(`#brief-${question.field}`)).toHaveValue(finalBrief[question.field]);
      }
      await expect(page.locator(".readiness-number")).toHaveText(`${updated.score} / 100`);
      await page.locator(".extra-context > summary").click();
      for (const field of briefFields) await page.locator(`#brief-${field}`).fill(finalBrief[field]);
      await saveReview(page);
      await expect(page.locator(".review-field").filter({ has: page.locator("#brief-title") }).locator(".field-protection > summary")).toBeVisible();
      // An additional analysis must preserve manual text exactly.
      await page.getByRole("button", { name: "Помочь с деталями", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Давайте уточним детали" })).toBeVisible();
      expect((await getChallenge(page, id)).brief).toEqual(finalBrief);
      await page.getByRole("navigation", { name: "Создание задачи" }).getByRole("button", { name: /Проверьте и опубликуйте/ }).click();
      await expect(page.locator("#brief-title")).toHaveValue(finalBrief.title);
    });
    await test.step("saved details survive reload and the user explicitly publishes", async () => {
      await page.reload();
      await expect(page.locator("#brief-title")).toHaveValue(finalBrief.title);
      await expect(page.locator("#brief-data")).toHaveValue(finalBrief.data);
      await expect(page.locator("#brief-deliverables")).toHaveValue(finalBrief.deliverables);
      await expect(page.locator(".save-status")).toHaveText("Сохранено");
      await expect(page.locator(".readiness-number")).toHaveText("100 / 100");
      await page.getByRole("button", { name: "Опубликовать задачу", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/challenges/${id}\\?published=1$`));
      await expect(page.getByRole("heading", { level: 1, name: finalBrief.title })).toBeVisible();
      await expect(page.getByText("Открыт набор", { exact: true })).toBeVisible();
    });
    teamContext = await browser.newContext({ baseURL });
    const teamPage = await teamContext.newPage();
    await test.step("another team session finds the challenge and applies", async () => {
      await login(teamPage, teamEmail);
      await teamPage.getByRole("link", { name: "Найти задачу", exact: true }).first().click();
      await teamPage.getByRole("textbox", { name: "Поиск задач", exact: true }).fill(finalBrief.title);
      await teamPage.getByRole("button", { name: "Найти", exact: true }).click();
      await expect.poll(() => new URL(teamPage.url()).searchParams.get("q")).toBe(finalBrief.title);
      const card = teamPage.locator(".challenge-card").filter({ has: teamPage.getByRole("heading", { name: finalBrief.title, exact: true }) });
      await expect(card).toHaveCount(1);
      await card.click();
      await expect(teamPage).toHaveURL(new RegExp(`/challenges/${id}$`));
      await teamPage.locator('[name="proposal"]').fill("Подготовим базовую модель прогноза, сравним её с текущим подходом и покажем дашборд управляющему.");
      await teamPage.locator('[name="experience"]').fill("Создали учебный проект прогнозирования спроса на Python и SQL.");
      await teamPage.locator('[name="timeline"]').fill("6 недель с еженедельной демонстрацией.");
      await teamPage.getByRole("button", { name: "Отправить отклик", exact: true }).click();
      await expect(teamPage.getByRole("status").filter({ hasText: "Отклик отправлен" })).toBeVisible();
      await expect(teamPage.getByText("На рассмотрении", { exact: true })).toBeVisible();
    });
    await test.step("owner selects the team and both dashboards show the result", async () => {
      await page.reload();
      const application = page.locator(".application-card").filter({ has: page.getByRole("heading", { name: teamName, exact: true }) });
      await expect(application).toBeVisible();
      await application.getByRole("button", { name: "Выбрать команду", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "Команда выбрана" })).toBeVisible();
      await expect(application.getByText("Выбрана", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Выбрать команду", exact: true })).toHaveCount(0);
      await teamPage.goto("/dashboard");
      const submitted = teamPage.locator(".dashboard-row").filter({ has: teamPage.getByRole("heading", { name: finalBrief.title, exact: true }) });
      await expect(submitted.getByText("Выбрана", { exact: true })).toBeVisible();
      await page.goto("/dashboard");
      await expect(page.locator(".dashboard-row").filter({ has: page.getByRole("heading", { name: finalBrief.title, exact: true }) }).getByText("Команда выбрана", { exact: true })).toBeVisible();
    });
  } finally { await teamContext?.close(); }
});

test("publication points to the exact missing team deliverable and focuses its field", async ({ page }) => {
  await login(page, ownerEmail);
  const challenge = await createDraft(page, { ...finalBrief, title: `${run}: неполное описание`, deliverables: "" });
  await openReview(page, challenge.id);
  const checklist = page.getByRole("region", { name: "Проверка перед публикацией" });
  await expect(checklist.locator("li")).toHaveCount(1);
  await expect(checklist.locator("li")).toHaveText(editorLabels.deliverables);
  await expect(page.locator(".readiness-number")).toHaveText("100 / 100");
  await page.getByRole("button", { name: "Опубликовать задачу", exact: true }).click();
  await expect(page.locator('.error-banner[role="alert"]')).toContainText(`Заполните поле «${editorLabels.deliverables}»`);
  await expect(page.locator("#brief-deliverables")).toBeFocused();
  await expect(page.locator("#brief-deliverables")).toHaveAttribute("aria-invalid", "true");
  expect((await getChallenge(page, challenge.id)).status).toBe("DRAFT");
  await page.locator("#brief-deliverables").fill(finalBrief.deliverables);
  await saveReview(page);
  await expect(checklist.getByRole("heading", { name: "Можно публиковать", exact: true })).toBeVisible();
});

test("navigation and logout wait for saving and retain the latest typed text", async ({ page }) => {
  await login(page, ownerEmail);
  const challenge = await createDraft(page, { ...finalBrief, title: `${run}: перед переходом` });
  await openReview(page, challenge.id);
  const title = `${run}: текст сохранён при переходе`;
  let releaseSave!: () => void;
  let markStarted!: () => void;
  const saveStarted = new Promise<void>(resolve => { markStarted = resolve; });
  const savingAllowed = new Promise<void>(resolve => { releaseSave = resolve; });
  const endpoint = `**/api/challenges/${challenge.id}`;
  await page.route(endpoint, async route => {
    if (route.request().method() === "PATCH") { markStarted(); await savingAllowed; }
    await route.continue();
  });
  try {
    await page.locator("#brief-title").fill(title);
    await page.locator(".editor-top .back-link").click();
    await saveStarted;
    expect(new URL(page.url()).pathname).toBe(`/challenges/${challenge.id}/edit`);
    releaseSave();
    await expect(page).toHaveURL(/\/dashboard$/);
    expect((await getChallenge(page, challenge.id)).brief.title).toBe(title);
    await openReview(page, challenge.id);
    await expect(page.locator("#brief-title")).toHaveValue(title);
  } finally { releaseSave(); await page.unroute(endpoint); }
  const logoutTitle = `${run}: текст сохранён перед выходом`;
  let allowLogoutSave!: () => void;
  let notifyLogoutSave!: () => void;
  const logoutSaveStarted = new Promise<void>(resolve => { notifyLogoutSave = resolve; });
  const logoutSaveAllowed = new Promise<void>(resolve => { allowLogoutSave = resolve; });
  await page.route(endpoint, async route => {
    if (route.request().method() === "PATCH") { notifyLogoutSave(); await logoutSaveAllowed; }
    await route.continue();
  });
  try {
    await page.locator("#brief-title").fill(logoutTitle);
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
    await logoutSaveStarted;
    expect(new URL(page.url()).pathname).toBe(`/challenges/${challenge.id}/edit`);
    expect((await okay(await page.request.get("/api/auth"))).user.email).toBe(ownerEmail);
    allowLogoutSave();
    await expect(page).toHaveURL(/\/$/);
    await login(page, ownerEmail);
    expect((await getChallenge(page, challenge.id)).brief.title).toBe(logoutTitle);
  } finally { allowLogoutSave(); await page.unroute(endpoint); }
});

test("two tabs never overwrite a newer version and preserve local text as a separate draft", async ({ page }) => {
  await login(page, ownerEmail);
  const challenge = await createDraft(page, { ...finalBrief, title: `${run}: общая версия` });
  await openReview(page, challenge.id);
  const otherTab = await page.context().newPage();
  try {
    await openReview(otherTab, challenge.id);
    const serverTitle = `${run}: сохранено во второй вкладке`;
    await otherTab.locator("#brief-title").fill(serverTitle);
    await saveReview(otherTab);
    expect((await getChallenge(page, challenge.id)).brief.title).toBe(serverTitle);
    const localTitle = `${run}: мои несохранённые изменения`;
    const conflictResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/challenges/${challenge.id}` && response.request().method() === "PATCH" && response.status() === 409);
    await page.locator("#brief-title").fill(localTitle);
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    expect((await (await conflictResponse).json()).code).toBe("conflict");
    await expect(page.locator('.error-banner[role="alert"]')).toContainText("Задача уже изменилась");
    await expect(page.locator("#brief-title")).toHaveValue(localTitle);
    expect((await getChallenge(page, challenge.id)).brief.title).toBe(serverTitle);
    await expect(page.getByRole("button", { name: "Опубликовать задачу", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Сохранить отдельным черновиком", exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).not.toBe(`/challenges/${challenge.id}/edit`);
    await expect(page.locator("#brief-title")).toHaveValue(localTitle);
    const copyId = new URL(page.url()).pathname.split("/")[2];
    expect((await getChallenge(page, copyId)).brief.title).toBe(localTitle);
    expect((await getChallenge(page, challenge.id)).brief.title).toBe(serverTitle);
  } finally { await otherTab.close(); }
});
