import { briefLabels, type Brief, type BriefField } from "./brief";
import { hasUsefulContent, PUBLICATION_THRESHOLD, readiness } from "./readiness";

export type PublicationField = { key: BriefField; label: string; hint: string };

const requiredFields: Array<{ key: BriefField; hint: string }> = [
  { key: "title", hint: "Коротко назовите задачу, например «Планировщик доставки цветов»." },
  { key: "problem", hint: "Расскажите, что сейчас не получается и кому это мешает." },
  { key: "outcome", hint: "Опишите, что должно стать лучше после решения задачи." },
  { key: "deliverables", hint: "Укажите, что команда передаст вам: например сайт, прототип, отчёт или инструкцию." },
];

/** Shared by the editor and all routes that can change a published brief. */
export function publicationRequirements(brief: Brief) {
  const missingFields: PublicationField[] = requiredFields
    .filter(({ key }) => brief[key].trim().length < 5 || !hasUsefulContent(brief[key]))
    .map(({ key, hint }) => ({ key, label: briefLabels[key], hint }));
  const score = readiness(brief).score;
  const scoreReady = score >= PUBLICATION_THRESHOLD;
  return {
    ready: missingFields.length === 0 && scoreReady,
    missingFields,
    score,
    minScore: PUBLICATION_THRESHOLD,
    scoreReady,
  };
}

export function publicationMessage(brief: Brief): string {
  const requirements = publicationRequirements(brief);
  if (requirements.missingFields.length) {
    return `Заполните ${requirements.missingFields.map(({ label }) => `«${label}»`).join(", ")}. ${requirements.missingFields[0].hint}`;
  }
  return `Добавьте немного деталей: сейчас ${requirements.score} из ${requirements.minScore} баллов для публикации. ${readiness(brief).nextStep}`;
}
