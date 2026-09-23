import { describe, expect, it } from "vitest";
import { emptyBrief, type Brief } from "../lib/brief";
import { readiness, type ReadinessResult } from "../lib/readiness";

const completeBrief: Brief = {
  title: "Сокращение списаний в магазинах",
  problem: "Магазины теряют продукты из-за списаний: закупки сейчас планируют вручную.",
  audience: "Управляющие магазинов",
  currentState: "Заказы формируют в Excel на основе прошлого месяца.",
  outcome: "Прототип прогноза спроса для планирования закупок товаров.",
  successCriteria: "Снизить списания на 15% в пилоте по сравнению с предыдущим месяцем.",
  data: "Обезличенная CSV-выгрузка продаж и остатков за 6 месяцев; доступ после выбора команды.",
  constraints: "Без передачи персональных данных; использовать бесплатные инструменты.",
  timeline: "6 недель после выбора команды",
  skills: "Python, SQL, анализ данных",
  deliverables: "Исходный код прототипа, отчёт и инструкция запуска",
};

const section = (result: ReadinessResult, key: keyof Brief) => result.sections.find((item) => item.key === key)!;

describe("explainable readiness", () => {
  it("uses the requested weights and gives an empty brief zero", () => {
    const result = readiness(emptyBrief);
    expect(result.score).toBe(0);
    expect(result.sections.map((item) => item.max)).toEqual([20, 20, 20, 15, 10, 10, 5]);
    expect(result.sections.every((item) => item.rule && item.hint)).toBe(true);
    expect(result.nextStep).toContain("процессе");
  });

  it("gives a grounded, measurable brief all 100 points", () => {
    const result = readiness(completeBrief);
    expect(result.score).toBe(100);
    expect(result.sections.every((item) => item.score === item.max)).toBe(true);
  });

  it("is deterministic and does not mutate input", () => {
    const value = { ...completeBrief };
    expect(readiness(value)).toEqual(readiness(value));
    expect(value).toEqual(completeBrief);
  });

  it("does not reward unknown answers or repeated filler", () => {
    const value = Object.fromEntries(Object.keys(emptyBrief).map((key) => [key, "не знаю, не знаю, не знаю"]));
    expect(readiness(value as Brief).score).toBe(0);
    expect(readiness({ ...emptyBrief, successCriteria: "Очень хороший прекрасный замечательный результат ".repeat(50) }).score).toBe(0);
  });

  it("requires a numerical target AND verification to give full criteria points", () => {
    expect(section(readiness({ ...emptyBrief, successCriteria: "Уменьшить списания" }), "successCriteria").score).toBe(10);
    expect(section(readiness({ ...emptyBrief, successCriteria: "Уменьшить списания на 15%" }), "successCriteria").score).toBe(10);
    expect(section(readiness({ ...emptyBrief, successCriteria: "Снизить списания на 15% в пилоте" }), "successCriteria").score).toBe(20);
  });

  it("recognizes honest absence of data with an actionable acquisition plan", () => {
    expect(section(readiness({ ...emptyBrief, data: "Данных пока нет" }), "data").score).toBe(7);
    expect(section(readiness({ ...emptyBrief, data: "Данных нет. Команда соберёт анкеты клиентов за 2 недели." }), "data").score).toBe(15);
    expect(section(readiness({ ...emptyBrief, data: "Данных нет. Когда-нибудь соберём." }), "data").score).toBe(7);
  });

  it("recognizes dates and durations, but not urgency as a deadline", () => {
    expect(section(readiness({ ...emptyBrief, timeline: "Скоро" }), "timeline").score).toBe(0);
    expect(section(readiness({ ...emptyBrief, timeline: "В следующем семестре" }), "timeline").score).toBe(5);
    expect(section(readiness({ ...emptyBrief, timeline: "До 20 октября 2026" }), "timeline").score).toBe(10);
    expect(section(readiness({ ...emptyBrief, timeline: "За шесть недель" }), "timeline").score).toBe(10);
  });

  it("distinguishes an unspecified constraint and one concrete skill from complete sections", () => {
    const partial = readiness({ ...emptyBrief, constraints: "Есть ограничения по бюджету", skills: "Python" });
    expect(section(partial, "constraints").score).toBe(5);
    expect(section(partial, "skills").score).toBe(2);
    const full = readiness({ ...emptyBrief, constraints: "Бюджет до 100000 тенге", skills: "Python, SQL" });
    expect(section(full, "constraints").score).toBe(10);
    expect(section(full, "skills").score).toBe(5);
  });

  it("prioritizes the largest remaining information gap", () => {
    const result = readiness({ ...completeBrief, successCriteria: "", skills: "Python" });
    expect(result.score).toBe(77);
    expect(result.nextStep).toContain("метрику");
  });
});
