import { chromium } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = new URL(process.argv[2] || process.env.APP_URL || 'http://127.0.0.1:3000').origin;
const output = resolve('artifacts/screenshots');
await mkdir(output, { recursive: true });
const installedChrome = process.platform === 'win32' && existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe');
const channel = process.env.PLAYWRIGHT_CHANNEL || (!existsSync(chromium.executablePath()) && installedChrome ? 'chrome' : undefined);
const prisma = new PrismaClient();
const testEmail = `visual-${randomUUID()}@example.test`;
const viewports = [{ width: 1440, height: 1000 }, { width: 1024, height: 900 }, { width: 390, height: 844 }];
const reports = [];
let browser;
let createdUserId;

const draft = 'У нас небольшая служба доставки цветов. Диспетчер распределяет заказы вручную, и курьеры часто опаздывают. Хотим лучше планировать маршруты, но не понимаем, с чего начать.';
const brief = {
  title: 'Планировщик доставки цветов',
  problem: 'Диспетчер вручную распределяет заказы. Перед праздниками курьеры не успевают доставлять цветы вовремя.',
  outcome: 'Веб-прототип планировщика маршрутов для диспетчера с предупреждением об опозданиях.',
  deliverables: 'Работающий прототип, исходный код и понятная инструкция для диспетчера.',
  successCriteria: 'Снизить долю опозданий с 25% до 10% за месяц пилота по сравнению с прошлым месяцем.',
  data: 'История заказов и доставок за 3 месяца в Excel. Предоставим команде обезличенную выгрузку.',
  constraints: 'Только бесплатные инструменты. Не передавать персональные данные сторонним сервисам.',
  timeline: '6 недель после выбора команды.',
  skills: 'Python, анализ данных, React',
  audience: 'Диспетчер и курьеры цветочной доставки.',
  currentState: 'Заказы ведём в таблице, маршруты составляем вручную.',
};

async function okay(response) {
  if (!response.ok()) throw new Error(`Request failed (${response.status()}): ${await response.text()}`);
  return response.json();
}
function collectErrors(page) {
  const errors = { pageErrors: [], consoleErrors: [] };
  page.on('pageerror', error => errors.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.consoleErrors.push(message.text()); });
  return errors;
}
async function capture(page, name, viewport) {
  await page.setViewportSize(viewport);
  await page.evaluate(() => document.fonts.ready);
  // Let responsive layout finish on both frames before measurement or capture.
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.evaluate(() => window.scrollTo(0, 0));
  const layout = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const overflow = [...document.querySelectorAll('body *')].flatMap(element => {
      const rect = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      if (!rect.width || !rect.height || styles.visibility === 'hidden' || styles.display === 'none') return [];
      // Ignore intentionally closed off-canvas navigation.
      if (rect.right <= 0 || rect.left >= viewportWidth) return [];
      return rect.right > viewportWidth + 1 || rect.left < -1 ? [{
        tag: element.tagName, className: String(element.className).slice(0, 140),
        left: Math.round(rect.left), right: Math.round(rect.right),
      }] : [];
    }).slice(0, 20);
    return { viewportWidth, documentWidth, horizontalOverflow: documentWidth > viewportWidth + 1, overflow };
  });
  const filename = `${name}-${viewport.width}`;
  await page.screenshot({ path: resolve(output, `${filename}.png`), animations: 'disabled' });
  await page.screenshot({ path: resolve(output, `${filename}-full.png`), fullPage: true, animations: 'disabled' });
  return { name, viewport, ...layout, screenshot: `artifacts/screenshots/${filename}.png`, fullScreenshot: `artifacts/screenshots/${filename}-full.png` };
}
async function captureWidths(page, name, errors) {
  for (const viewport of viewports) {
    reports.push({ ...await capture(page, name, viewport), pageErrors: [...errors.pageErrors], consoleErrors: [...errors.consoleErrors] });
  }
}

try {
  browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
  const guest = await browser.newContext({ baseURL: origin, viewport: viewports[0], reducedMotion: 'reduce' });
  const catalog = await guest.newPage();
  const catalogErrors = collectErrors(catalog);
  await catalog.goto('/', { waitUntil: 'networkidle', timeout: 90_000 });
  await catalog.locator('#catalog-title').waitFor({ state: 'visible', timeout: 60_000 });
  await catalog.locator('.challenge-grid[aria-busy="true"]').waitFor({ state: 'hidden', timeout: 60_000 });
  await captureWidths(catalog, 'catalog', catalogErrors);
  const login = await guest.newPage();
  const loginErrors = collectErrors(login);
  await login.goto('/login', { waitUntil: 'networkidle', timeout: 90_000 });
  await login.getByRole('heading', { level: 1, name: 'Войти в аккаунт' }).waitFor({ state: 'visible' });
  await captureWidths(login, 'login', loginErrors);
  const how = await guest.newPage();
  const howErrors = collectErrors(how);
  await how.goto('/how-it-works', { waitUntil: 'networkidle', timeout: 90_000 });
  await how.getByRole('heading', { level: 1, name: 'Как это работает' }).waitFor({ state: 'visible' });
  await captureWidths(how, 'how', howErrors);
  await guest.close();

  // This run owns a new account and draft. Existing demo content is never edited.
  const business = await browser.newContext({ baseURL: origin, viewport: viewports[0], reducedMotion: 'reduce' });
  const registered = await okay(await business.request.post('/api/auth', {
    headers: { Origin: origin },
    data: { action: 'register', role: 'BUSINESS', name: 'Визуальная проверка', email: testEmail, password: 'VisualQa2026!Local', company: 'Цветочная мастерская · пример' },
  }));
  createdUserId = registered.user.id;
  const editor = await business.newPage();
  const editorErrors = collectErrors(editor);
  await editor.goto('/challenges/new', { waitUntil: 'networkidle', timeout: 90_000 });
  await editor.locator('#source-draft').waitFor({ state: 'visible' });
  await captureWidths(editor, 'new', editorErrors);
  await editor.locator('#source-draft').fill(draft);
  await editor.getByLabel('Отрасль', { exact: true }).selectOption('Логистика');
  await editor.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await editor.waitForURL(url => /\/challenges\/[^/]+\/edit$/.test(url.pathname) && url.searchParams.get('step') === 'questions', { timeout: 60_000 });
  await editor.locator('#question-answer').waitFor({ state: 'visible', timeout: 60_000 });
  const id = new URL(editor.url()).pathname.split('/')[2];
  const { challenge } = await okay(await business.request.get(`/api/challenges/${id}`));
  await captureWidths(editor, 'question', editorErrors);

  // Use the server question order, including mandatory fields in its first batch.
  for (const [index, question] of challenge.questions.entries()) {
    await editor.locator('#question-title').filter({ hasText: question.question }).waitFor({ state: 'visible' });
    await editor.locator('#question-answer').fill(brief[question.field]);
    await editor.getByRole('button', { name: index === challenge.questions.length - 1 ? 'Собрать описание' : 'Далее', exact: true }).click();
  }
  await editor.getByRole('heading', { level: 1, name: 'Проверьте описание задачи' }).waitFor({ state: 'visible', timeout: 60_000 });
  for (const field of ['title', 'problem', 'outcome', 'deliverables', 'successCriteria', 'data', 'constraints', 'timeline', 'skills']) {
    await editor.locator(`#brief-${field}`).fill(brief[field]);
  }
  await editor.locator('.extra-context > summary').click();
  for (const field of ['audience', 'currentState']) await editor.locator(`#brief-${field}`).fill(brief[field]);
  await editor.locator('.extra-context > summary').click();
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await editor.locator('.save-status').filter({ hasText: /^Сохранено$/ }).waitFor({ state: 'visible' });
  await captureWidths(editor, 'review', editorErrors);

  await editor.getByRole('button', { name: 'Опубликовать задачу', exact: true }).click();
  await editor.waitForURL(url => url.pathname === `/challenges/${id}` && url.searchParams.get('published') === '1', { timeout: 60_000 });
  await editor.getByRole('heading', { level: 1, name: brief.title, exact: true }).waitFor({ state: 'visible' });
  await captureWidths(editor, 'detail', editorErrors);

  // Direct navigation works at mobile widths without depending on a collapsed menu.
  await editor.goto('/dashboard', { waitUntil: 'networkidle', timeout: 90_000 });
  await editor.getByRole('heading', { level: 1, name: 'Мои задачи', exact: true }).waitFor({ state: 'visible' });
  await editor.locator('.dashboard-row').filter({ has: editor.getByRole('heading', { name: brief.title, exact: true }) }).waitFor({ state: 'visible' });
  await captureWidths(editor, 'dashboard', editorErrors);
  await business.close();
} finally {
  try { await browser?.close(); }
  finally {
    try {
      if (createdUserId) await prisma.user.deleteMany({ where: { id: createdUserId, email: testEmail } });
    } finally { await prisma.$disconnect(); }
  }
  await writeFile(resolve(output, 'report.json'), JSON.stringify(reports, null, 2));
}

console.log(JSON.stringify(reports, null, 2));
if (reports.some(entry => entry.horizontalOverflow || entry.pageErrors.length || entry.consoleErrors.length)) process.exitCode = 1;
