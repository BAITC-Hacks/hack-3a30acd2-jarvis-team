import { test, expect, request, chromium, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const channel = process.env.PLAYWRIGHT_CHANNEL || (existsSync(chromium.executablePath()) ? undefined : process.platform === "win32" ? "chrome" : undefined);
test.use({ channel });
test.setTimeout(120_000);

async function okay(response: APIResponse) {
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("team edits a photo portfolio; business opens it from an application and reviews closed work", async ({ browser, baseURL }) => {
  const prisma = new PrismaClient();
  const run = randomUUID().slice(0, 12);
  const ids: string[] = [];
  const owner = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
  const team = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
  const teamContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const ownerContext = await browser.newContext({ baseURL });
  const errors: string[] = [];
  const name = `Команда профиля ${run}`;
  try {
    for (const [client, role] of [[owner, "BUSINESS"], [team, "TEAM"]] as const) {
      const result = await okay(await client.post("/api/auth", { data: {
        action: "register", role, email: `profile-ui-${run}-${role.toLowerCase()}@example.test`, password: "ProfileUi2026!test",
        name: role === "BUSINESS" ? "Заказчик профиля" : "Мария", company: "Цветочная мастерская", teamName: name,
      } }));
      ids.push(result.user.id);
    }
    await teamContext.addCookies((await team.storageState()).cookies);
    await ownerContext.addCookies((await owner.storageState()).cookies);
    const page = await teamContext.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/dashboard?tab=profile");
    await expect(page.getByRole("heading", { name: "Расскажите о своей команде" })).toBeVisible();
    await page.locator('[name="tagline"]').fill("Создаём понятные сайты и сервисы для малого бизнеса");
    await page.locator('textarea[name="description"]').fill("Мы команда разработчиков и дизайнеров. Помогаем небольшим компаниям автоматизировать повторяющуюся работу.");
    await page.locator('[name="experience"]').fill("Два года работаем вместе. Создали каталог для мастерской и систему записи для учебного центра.");
    await page.locator('[name="skills"]').fill("React, Python, UX/UI");
    await page.locator('[name="portfolio"]').fill("https://example.com/portfolio");
    await page.getByRole("button", { name: "Добавить проект", exact: true }).click();
    await page.locator('[name="cases.0.title"]').fill("Онлайн-заказы для цветочной мастерской");
    await page.locator('[name="cases.0.client"]').fill("Цветочная мастерская «Лист»");
    await page.locator('[name="cases.0.description"]').fill("Сделали каталог букетов, форму заказа и кабинет менеджера.");
    await page.locator('[name="cases.0.result"]').fill("Менеджер обрабатывает заказ за 2 минуты вместо 10.");
    await page.locator('[name="cases.0.link"]').fill("https://example.com/flowers");
    const png = await sharp({ create: { width: 960, height: 640, channels: 3, background: "#32594c" } })
      .composite([{ input: Buffer.from('<svg width="960" height="640"><rect x="60" y="60" width="840" height="520" rx="35" fill="#e6efcf"/><text x="120" y="260" font-family="sans-serif" font-size="70" fill="#254337">TEAM / PROJECT</text><text x="120" y="345" font-family="sans-serif" font-size="36" fill="#536647">Photo upload test</text></svg>') }]).png().toBuffer();
    await page.locator("#team-photo-file").setInputFiles({ name: "team-project.png", mimeType: "image/png", buffer: png });
    await expect(page.locator(".profile-photo-preview")).toBeVisible();
    await page.locator(".profile-photo-preview input").fill("Наша команда на демонстрации проекта");
    await page.getByRole("button", { name: "Загрузить фото", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Фото добавлено в профиль." })).toBeVisible();
    await expect(page.locator('[name="tagline"]')).toHaveValue("Создаём понятные сайты и сервисы для малого бизнеса");
    await page.getByRole("button", { name: "Сохранить профиль", exact: true }).click();
    await expect(page.locator(".profile-save-note[role=status]")).toHaveText("Профиль сохранён");
    const profile = (await okay(await team.get("/api/team"))).team;
    expect(profile.cases).toHaveLength(1);
    expect(profile.photos).toHaveLength(1);
    await page.reload();
    await expect(page.locator('[name="experience"]')).toHaveValue("Два года работаем вместе. Создали каталог для мастерской и систему записи для учебного центра.");
    await page.locator('[name="tagline"]').fill("Создаём сайты и автоматизируем работу малого бизнеса");
    // Opening the public profile must flush pending text edits.
    await page.getByRole("link", { name: "Открыть профиль", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.locator(".team-tagline")).toHaveText("Создаём сайты и автоматизируем работу малого бизнеса");
    await expect(page.getByText("Менеджер обрабатывает заказ за 2 минуты вместо 10.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Пока нет отзывов", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Увеличить фотографию команды", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();

    const { challenge } = await okay(await owner.post("/api/challenges", { data: {
      draft: "В цветочной мастерской менеджер вручную обрабатывает заказы. Хотим сократить время и ошибки.", company: "Цветочная мастерская", industry: "Ритейл",
    } }));
    await okay(await owner.patch(`/api/challenges/${challenge.id}`, { data: { brief: {
      title: `Сервис заказов ${run}`, problem: "Менеджер вручную обрабатывает заказы и теряет время из-за ошибок.", audience: "Менеджеры магазина.", currentState: "Заказы в Excel.",
      outcome: "Веб-сервис для обработки заказов менеджером.", successCriteria: "Сократить время обработки на 20% за месяц по сравнению с ручной работой.",
      data: "Обезличенный CSV с заказами за 6 месяцев, доступ предоставит владелец.", constraints: "Только бесплатные сервисы, без персональных данных.",
      timeline: "6 недель.", skills: "React, Python", deliverables: "Работающий сервис, исходный код и инструкция.",
    } } }));
    await okay(await owner.post(`/api/challenges/${challenge.id}/publish`, { data: {} }));
    const { application } = await okay(await team.post(`/api/challenges/${challenge.id}/applications`, { data: {
      proposal: "Разработаем сервис заказов и проверим его с менеджером магазина.", experience: "Два года делаем сайты для небольших компаний.", timeline: "6 недель.",
    } }));
    const businessPage = await ownerContext.newPage();
    businessPage.on("pageerror", error => errors.push(error.message));
    await businessPage.goto(`/challenges/${challenge.id}`);
    await businessPage.getByRole("link", { name: "Посмотреть профиль", exact: true }).click();
    await expect(businessPage.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(businessPage.getByRole("link", { name: "Вернуться к задаче", exact: true })).toBeVisible();
    await expect(businessPage.locator("#write-review")).toHaveCount(0);
    // Closing the selected task makes this customer's review eligible.
    const applications = (await okay(await owner.get(`/api/challenges/${challenge.id}`))).challenge.applications;
    await okay(await owner.post(`/api/challenges/${challenge.id}/select`, { data: { applicationId: application?.id || applications[0].id } }));
    await okay(await owner.post(`/api/challenges/${challenge.id}/close`, { data: {} }));
    await businessPage.goto(`/challenges/${challenge.id}`);
    await businessPage.getByRole("link", { name: "Оценить работу команды", exact: true }).click();
    await expect(businessPage.locator("#write-review")).toBeVisible();
    await businessPage.getByRole("radio", { name: "4 из 5", exact: true }).check();
    await businessPage.locator("#team-review-comment").fill("Команда сделала удобный сервис и помогла запустить его. Документацию можно было передать раньше.");
    await businessPage.getByRole("button", { name: "Опубликовать отзыв", exact: true }).click();
    await expect(businessPage.getByRole("status").filter({ hasText: "Отзыв сохранён" })).toBeVisible();
    await expect(businessPage.locator(".team-review")).toHaveCount(1);
    await expect(businessPage.locator(".team-review .review-stars")).toHaveAttribute("aria-label", "Оценка 4 из 5");
    await businessPage.getByRole("radio", { name: "5 из 5", exact: true }).check();
    await businessPage.getByRole("button", { name: "Сохранить отзыв", exact: true }).click();
    await expect(businessPage.locator(".team-review .review-stars")).toHaveAttribute("aria-label", "Оценка 5 из 5");
    await expect(businessPage.locator(".team-review")).toHaveCount(1);
    await page.reload();
    await expect(page.locator(".team-profile-hero .team-rating")).toContainText("5 / 5");
    await expect(page.locator("#write-review")).toHaveCount(0);
    await mkdir("artifacts/screenshots", { recursive: true });
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/screenshots/team-profile-${width}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Мобильная навигация" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("navigation", { name: "Мобильная навигация" })).toBeHidden();
    await page.goto("/dashboard?tab=profile");
    await expect(page.locator(".profile-photo-card")).toHaveCount(1);
    await page.locator(".profile-photo-card img").scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator(".profile-photo-card img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/screenshots/team-editor-${width}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "Удалить фото 1", exact: true }).click();
    await expect(page.locator(".profile-photo-card")).toHaveCount(0);
    expect((await team.get(profile.photos[0].url)).status()).toBe(404);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([teamContext.close(), ownerContext.close(), owner.dispose(), team.dispose()]);
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
