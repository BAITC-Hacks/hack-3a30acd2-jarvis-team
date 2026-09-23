import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { briefLabels, emptyBrief, type Brief } from "../lib/brief";
import { publicationRequirements } from "../lib/publication";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), updateMany: vi.fn(), analyzeBrief: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {
  challenge: { findUnique: mocks.findUnique, updateMany: mocks.updateMany },
  application: { findMany: vi.fn().mockResolvedValue([]) },
  rateLimit: { upsert: vi.fn().mockResolvedValue({ count: 1 }) },
} }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "owner", role: "BUSINESS" }),
  currentUser: vi.fn().mockResolvedValue({ id: "owner", role: "BUSINESS" }),
}));
vi.mock("@/lib/ai", () => ({
  analyzeBrief: mocks.analyzeBrief,
  AIError: class AIError extends Error {},
}));

import { PATCH } from "../app/api/challenges/[id]/route";
import { POST as publish } from "../app/api/challenges/[id]/publish/route";
import { POST as analyze } from "../app/api/challenges/[id]/analyze/route";

const completeBrief = (): Brief => ({
  ...emptyBrief,
  title: "Планировщик доставки цветов",
  problem: "Диспетчер вручную распределяет заказы между курьерами и теряет время.",
  outcome: "Разработать планировщик маршрутов для доставки заказов.",
  successCriteria: "Снизить долю опозданий с 25% до 10% за месяц пилота по сравнению с прошлым месяцем.",
  deliverables: "Работающий веб-прототип, исходный код и инструкция для диспетчера.",
});

function storedRow(brief = completeBrief(), status = "DRAFT") {
  return {
    id: "challenge", ownerId: "owner", company: "Цветочная доставка", industry: "Логистика",
    draft: "Диспетчер вручную распределяет заказы. Нужен планировщик маршрутов.",
    briefJson: JSON.stringify(brief), answersJson: "{}", questionsJson: "[]", lockedFieldsJson: "[]",
    assumptionsJson: "[]", recommendationsJson: "[]", score: 60, status, isDemo: false,
    createdAt: new Date("2026-09-01T10:00:00.000Z"), updatedAt: new Date("2026-09-23T10:00:00.000Z"),
    _count: { applications: 0 },
  };
}

const context = () => ({ params: Promise.resolve({ id: "challenge" }) });
function request(body: unknown, method = "POST") {
  return new NextRequest("http://localhost:3000/api/challenges/challenge", {
    method,
    headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "http://localhost:3000");
  mocks.findUnique.mockResolvedValue(storedRow());
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.analyzeBrief.mockResolvedValue({ brief: completeBrief(), questions: [], assumptions: [], recommendations: [], mode: "demo" });
});
afterEach(() => vi.unstubAllEnvs());

describe("publication checklist", () => {
  it("accepts exactly 60 points and refuses a complete brief below the unchanged threshold", () => {
    expect(publicationRequirements(completeBrief())).toMatchObject({ ready: true, score: 60, minScore: 60, scoreReady: true, missingFields: [] });
    expect(publicationRequirements({ ...completeBrief(), successCriteria: "", data: "CSV-история заказов за 3 месяца" }))
      .toMatchObject({ ready: false, score: 55, minScore: 60, scoreReady: false, missingFields: [] });
  });

  it("identifies the exact missing field even when the score is enough", () => {
    const requirements = publicationRequirements({ ...completeBrief(), deliverables: "" });
    expect(requirements).toMatchObject({ ready: false, scoreReady: true, missingFields: [{ key: "deliverables", label: briefLabels.deliverables }] });
    expect(requirements.missingFields).toHaveLength(1);
    expect(requirements.missingFields[0].hint).toContain("команда передаст");
  });

  it("refuses placeholders and punctuation as required content without mutating the brief", () => {
    const brief = { ...completeBrief(), title: "не знаю", deliverables: "......" };
    const original = structuredClone(brief);
    expect(publicationRequirements(brief).missingFields.map(({ key }) => key)).toEqual(["title", "deliverables"]);
    expect(brief).toEqual(original);
  });
});

describe("publication and save routes", () => {
  it("returns an actionable missing field error instead of listing every required field", async () => {
    mocks.findUnique.mockResolvedValue(storedRow({ ...completeBrief(), deliverables: "" }));
    const response = await publish(request({}), context());
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toMatchObject({ code: "publication_incomplete", score: 60, minScore: 60, missingFields: [{ key: "deliverables" }] });
    expect(data.error).toContain(`«${briefLabels.deliverables}»`);
    expect(data.error).not.toContain(`«${briefLabels.title}»`);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("uses the same missing-field rule when editing an already published brief", async () => {
    mocks.findUnique.mockResolvedValue(storedRow(completeBrief(), "OPEN"));
    const response = await PATCH(request({ brief: { ...completeBrief(), deliverables: "не знаю" } }, "PATCH"), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "publication_incomplete", missingFields: [{ key: "deliverables" }] });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("preserves a published version if analysis returns an incomplete brief", async () => {
    mocks.findUnique.mockResolvedValue(storedRow(completeBrief(), "OPEN"));
    mocks.analyzeBrief.mockResolvedValue({ brief: { ...completeBrief(), deliverables: "" }, questions: [], assumptions: [], recommendations: [], mode: "demo" });
    const response = await analyze(request({}), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "publication_incomplete", missingFields: [{ key: "deliverables" }] });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it.each(["save", "analyze", "publish"])("rejects a stale %s before writing or calling AI", async (action) => {
    const body = { expectedUpdatedAt: "2026-09-22T10:00:00.000Z" };
    const response = action === "save"
      ? await PATCH(request({ ...body, draft: "Изменения из устаревшей вкладки" }, "PATCH"), context())
      : await (action === "analyze" ? analyze : publish)(request(body), context());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "conflict", updatedAt: "2026-09-23T10:00:00.000Z" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.analyzeBrief).not.toHaveBeenCalled();
  });

  it("allows clients to save with the current revision and retains the atomic revision guard", async () => {
    const response = await PATCH(request({ expectedUpdatedAt: "2026-09-23T10:00:00.000Z", draft: "Новые подробности о проблеме доставки" }, "PATCH"), context());
    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ updatedAt: new Date("2026-09-23T10:00:00.000Z"), status: "DRAFT" }) }));
  });

  it("keeps backwards compatibility for callers without expectedUpdatedAt", async () => {
    const response = await publish(request({}), context());
    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "OPEN", score: 60 } }));
  });

  it("reports a concurrent write occurring after the revision check as a conflict", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const response = await PATCH(request({ expectedUpdatedAt: "2026-09-23T10:00:00.000Z", draft: "Новые подробности о проблеме доставки" }, "PATCH"), context());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "conflict" });
  });
});
