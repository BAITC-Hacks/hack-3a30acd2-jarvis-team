import type { BriefField } from "./brief";

export const editorLabels: Record<BriefField, string> = {
  title: "Название задачи", problem: "Что нужно решить?", outcome: "Какое решение вы хотите получить?",
  deliverables: "Что команда должна передать вам?", successCriteria: "Как вы оцените результат?",
  data: "Какие данные есть?", constraints: "Что нужно учесть?", timeline: "Когда нужен результат?",
  skills: "Какие навыки нужны?", audience: "Кто будет пользоваться решением?", currentState: "Как это работает сейчас?",
};
export const editorHints: Record<BriefField, string> = {
  title: "Коротко и по делу: например, «Планировщик доставки цветов».",
  problem: "Расскажите, что сейчас не получается и кому это мешает.",
  outcome: "Опишите, что должно измениться и как решение поможет в работе.",
  deliverables: "Перечислите то, что получите в конце: например, работающий сайт, исходный код, отчёт и инструкцию.",
  successCriteria: "Укажите показатель, цель и способ проверки. Например: сократить опоздания с 25% до 10% за месяц пилота.",
  data: "Какие таблицы, записи или материалы вы можете предоставить? Если их нет — кто и когда их соберёт?",
  constraints: "Например: только бесплатные сервисы, без персональных данных, работа в браузере.",
  timeline: "Например, 6 недель после выбора команды.",
  skills: "Перечислите через запятую. Например: Python, React, дизайн интерфейсов.",
  audience: "Назовите пользователей: например, диспетчер и курьеры.",
  currentState: "Какими инструментами пользуются сейчас? Например, вручную распределяют заказы в Excel.",
};
export const requiredEditorFields: BriefField[] = ["title", "problem", "outcome", "deliverables"];
export const detailEditorFields: BriefField[] = ["successCriteria", "data", "constraints", "timeline", "skills"];
