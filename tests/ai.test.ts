import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBrief } from "../lib/brief";
import { readiness } from "../lib/readiness";
import { publicationRequirements } from "../lib/publication";

const { parse, constructorOptions } = vi.hoisted(() => ({
  parse: vi.fn(),
  constructorOptions: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(options: unknown) { constructorOptions(options); }
    responses = { parse };
  },
}));

import { AIError, AI_TIMEOUT_MS, analyzeBrief, type AnalyzeBriefInput } from "../lib/ai";

const draft = "У нас сеть небольших продуктовых магазинов. Хотим уменьшить списание продуктов, но не понимаем, с чего начать.";
const input = (): AnalyzeBriefInput => ({ draft, brief: { ...emptyBrief }, answers: {}, lockedFields: [] });
const liveOutput = (overrides: Record<string, unknown> = {}) => ({
  status: "completed",
  output: [],
  output_parsed: { brief: { ...emptyBrief, problem: draft }, questions: [], assumptions: [], recommendations: [] },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("OPENAI_MODEL", "test-model");
});
afterEach(() => vi.unstubAllEnvs());

describe("deterministic demo analysis", () => {
  it("works with no API key, gives 3–5 context questions, and invents no facts", async () => {
    const result = await analyzeBrief(input());
    expect(result.mode).toBe("demo");
    expect(parse).not.toHaveBeenCalled();
    expect(result.questions.length).toBeGreaterThanOrEqual(3);
    expect(result.questions.length).toBeLessThanOrEqual(5);
    expect(result.questions.find((question) => question.field === "data")?.question).toContain("списаний");
    expect(result.brief.problem).toBe(draft);
    expect(result.brief.outcome).toBe("Хотим уменьшить списание продуктов, но не понимаем, с чего начать.");
    expect(result.brief.data).toBe("");
    expect(result.brief.successCriteria).toBe("");
    expect(result.brief.skills).toBe("");
    expect(result.brief.deliverables).toBe("");
    expect(result.questions.some((question) => question.field === "deliverables")).toBe(true);
    expect(result.assumptions).toEqual([]);
    expect(await analyzeBrief(input())).toEqual(result);
  });

  it("changes questions with the business context", async () => {
    const result = await analyzeBrief({ ...input(), draft: "Курьеры опаздывают на доставку. Нужен планировщик маршрутов для диспетчера." });
    expect(result.questions.find((question) => question.field === "data")?.question).toContain("маршрутов");
    expect(result.questions.find((question) => question.field === "successCriteria")?.question).toContain("опозданий");
    expect(result.brief.outcome).toBe("Нужен планировщик маршрутов для диспетчера.");
  });

  it("allows the flower-delivery example to publish after answering its first five questions", async () => {
    const value = { ...input(), draft: "У нас небольшая служба доставки цветов. Перед праздниками заказов становится много, диспетчер распределяет их между курьерами вручную, и часть доставок опаздывает. Хотим лучше планировать маршруты и заранее предупреждать клиентов о задержках, но не понимаем, с чего начать." };
    const first = await analyzeBrief(value);
    const availableAnswers: Record<string, string> = {
      deliverables: "Работающий веб-прототип планировщика маршрутов, исходный код и инструкция для диспетчера.",
      outcome: "Разработать планировщик маршрутов для доставки, чтобы диспетчер распределял заказы между курьерами.",
      successCriteria: "Снизить долю опозданий с 25% до 10% за месяц пилота по сравнению с прошлым месяцем.",
      data: "CSV-история заказов, маршрутов и времени доставки за 3 месяца. Предоставим обезличенную выгрузку.",
      timeline: "6 недель после выбора команды.",
    };
    const answers = Object.fromEntries(first.questions.map(({ field }) => [field, availableAnswers[field]]));
    expect(Object.values(answers).every(Boolean)).toBe(true);
    const second = await analyzeBrief({ ...value, brief: first.brief, answers });
    expect(publicationRequirements(second.brief).ready).toBe(true);
    expect(second.brief.deliverables).toBe(availableAnswers.deliverables);
    expect(second.questions.some(({ field }) => Object.keys(answers).includes(field))).toBe(false);
  });

  it("merges answers, improves readiness, and only asks about remaining gaps", async () => {
    const first = await analyzeBrief(input());
    const result = await analyzeBrief({
      ...input(), brief: first.brief,
      answers: {
        successCriteria: "Снизить списания на 15% в пилоте по сравнению с прошлым месяцем",
        data: "CSV-выгрузка продаж и остатков за 6 месяцев, доступна команде",
        timeline: "6 недель",
        constraints: "Без передачи персональных данных",
      },
    });
    expect(readiness(result.brief).score).toBeGreaterThan(readiness(first.brief).score);
    expect(result.brief.timeline).toBe("6 недель");
    expect(result.questions.some((question) => ["successCriteria", "data", "timeline", "constraints"].includes(question.field))).toBe(false);
    expect(result.questions.some((question) => question.field === "skills")).toBe(true);
  });

  it("preserves locked fields including deliberately empty values and never mutates input", async () => {
    const value = { ...input(), brief: { ...emptyBrief, outcome: "Ручная формулировка" }, answers: { outcome: "Заменить" }, lockedFields: ["outcome", "title"] };
    const original = structuredClone(value);
    const result = await analyzeBrief(value);
    expect(result.brief.outcome).toBe("Ручная формулировка");
    expect(result.brief.title).toBe("");
    expect(value).toEqual(original);
  });

  it("does not ask for answers it cannot merge into a locked field", async () => {
    const result = await analyzeBrief({ ...input(), brief: { ...emptyBrief, data: "Данные уточняются" }, lockedFields: ["data", "timeline"] });
    expect(result.questions.some((question) => question.field === "data" || question.field === "timeline")).toBe(false);
    expect(result.recommendations.some((recommendation) => recommendation.includes("Доступные данные") && recommendation.includes("снимите замок"))).toBe(true);
  });

  it("rejects oversized input and unknown answer fields before calling the provider", async () => {
    await expect(analyzeBrief({ ...input(), draft: "а".repeat(12_001) })).rejects.toMatchObject({ code: "invalid_input", status: 400 });
    await expect(analyzeBrief({ ...input(), answers: { admin: "true" } })).rejects.toBeInstanceOf(AIError);
    await expect(analyzeBrief({ ...input(), answers: { title: "я".repeat(161) } })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(analyzeBrief({ ...input(), draft: ".................." })).rejects.toMatchObject({ code: "invalid_input" });
    expect(parse).not.toHaveBeenCalled();
  });

  it("enforces aggregate size as well as per-field size", async () => {
    const long = "текст ".repeat(800);
    await expect(analyzeBrief({ ...input(), brief: { ...emptyBrief, problem: long, audience: long, currentState: long, outcome: long, data: long, constraints: long, deliverables: long } })).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("server OpenAI adapter", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", "test-key-not-real"));

  it("uses the configured model, timeout, strict structured schema, and disables storage", async () => {
    parse.mockResolvedValue(liveOutput());
    const result = await analyzeBrief(input());
    expect(result.mode).toBe("live");
    expect(constructorOptions).toHaveBeenCalledWith({ apiKey: "test-key-not-real", timeout: AI_TIMEOUT_MS, maxRetries: 0 });
    expect(parse.mock.calls[0][0]).toMatchObject({ model: "test-model", store: false, text: { format: { type: "json_schema", strict: true } } });
    expect(parse.mock.calls[0][0].instructions).toContain("недоверенные данные");
    expect(parse.mock.calls[0][0].input[0].content).toBe(JSON.stringify(input()));
  });

  it("uses the documented default model when OPENAI_MODEL is unset", async () => {
    vi.stubEnv("OPENAI_MODEL", "");
    parse.mockResolvedValue(liveOutput());
    await analyzeBrief(input());
    expect(parse.mock.calls[0][0].model).toBe("gpt-4.1-mini");
  });

  it("enforces locks and explicit answers even when the model ignores instructions", async () => {
    parse.mockResolvedValue(liveOutput({ output_parsed: {
      brief: { ...emptyBrief, outcome: "Изменено моделью", timeline: "20 недель", data: "" },
      questions: [], assumptions: [], recommendations: [],
    } }));
    const result = await analyzeBrief({
      ...input(), brief: { ...emptyBrief, outcome: "Ручная формулировка", data: "CSV-история продаж" },
      answers: { timeline: "6 недель" }, lockedFields: ["outcome", "title"],
    });
    expect(result.brief.outcome).toBe("Ручная формулировка");
    expect(result.brief.title).toBe("");
    expect(result.brief.timeline).toBe("6 недель");
    expect(result.brief.data).toBe("CSV-история продаж");
  });

  it("filters duplicate questions and questions about complete fields", async () => {
    parse.mockResolvedValue(liveOutput({ output_parsed: {
      brief: { ...emptyBrief, timeline: "6 недель" },
      questions: [
        { id: "q1", field: "timeline", question: "Какой срок проекта?" },
        { id: "q2", field: "data", question: "Какие данные доступны?" },
        { id: "q3", field: "data", question: "Где лежат данные?" },
      ], assumptions: [], recommendations: [],
    } }));
    const result = await analyzeBrief(input());
    expect(result.questions.filter((question) => question.field === "data")).toEqual([{ id: "data", field: "data", question: "Какие данные доступны?" }]);
    expect(result.questions.some((question) => question.field === "timeline")).toBe(false);
    expect(result.questions.some((question) => question.field === "deliverables")).toBe(true);
    expect(result.questions.length).toBeLessThanOrEqual(5);
  });

  it("removes live model questions about protected fields and explains how to update them", async () => {
    parse.mockResolvedValue(liveOutput({ output_parsed: {
      brief: { ...emptyBrief }, questions: [{ id: "q1", field: "data", question: "Какие данные доступны?" }],
      assumptions: [], recommendations: [],
    } }));
    const result = await analyzeBrief({ ...input(), lockedFields: ["data"] });
    expect(result.questions.some((question) => question.field === "data")).toBe(false);
    expect(result.recommendations[0]).toContain("защищено ручной правкой");
  });

  it("reports provider failures safely without silently switching to demo or losing input", async () => {
    parse.mockRejectedValue(new Error("secret-key and private draft in upstream error"));
    const value = input();
    const original = structuredClone(value);
    await expect(analyzeBrief(value)).rejects.toMatchObject({ code: "unavailable", status: 503 });
    expect(value).toEqual(original);
    try { await analyzeBrief(value); } catch (error) {
      expect((error as Error).message).not.toContain("secret-key");
      expect((error as Error).message).not.toContain("private draft");
    }
  });

  it("distinguishes a timeout so the editor can offer retry", async () => {
    const error = new Error("upstream timed out");
    error.name = "APIConnectionTimeoutError";
    parse.mockRejectedValue(error);
    await expect(analyzeBrief(input())).rejects.toMatchObject({ code: "timeout", status: 504 });
  });

  it("rejects invalid output, incomplete output, and model refusal", async () => {
    parse.mockResolvedValueOnce(liveOutput({ output_parsed: { brief: { title: "Missing fields" } } }));
    await expect(analyzeBrief(input())).rejects.toMatchObject({ code: "invalid_response" });
    parse.mockResolvedValueOnce(liveOutput({ status: "incomplete" }));
    await expect(analyzeBrief(input())).rejects.toMatchObject({ code: "invalid_response" });
    parse.mockResolvedValueOnce(liveOutput({ output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }] }));
    await expect(analyzeBrief(input())).rejects.toMatchObject({ code: "refused", status: 422 });
  });
});
