import type { Brief, BriefField } from "./brief";

export type ReadinessSection = {
  key: BriefField;
  label: string;
  score: number;
  max: number;
  hint: string;
  rule: string;
};

export type ReadinessResult = {
  score: number;
  sections: ReadinessSection[];
  nextStep: string;
};

/** Product settings for the MVP, not official competition requirements. */
export const PUBLICATION_THRESHOLD = 60;
export const READINESS_DISCLAIMER = "Рейтинг оценивает полноту брифа, а не гарантирует качество или реализуемость проекта. Веса и порог публикации — настройки MVP, а не официальные правила конкурса.";

const normalize = (value: string) => value.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
const placeholder = /^(?:не знаю|неизвестно|не определено|не определены|пока неизвестно|пока не знаю|уточняется|уточнить|нет информации|нет ответа|не уверен|не уверена|затрудняюсь|tbd|n\/a|todo|test|тест|[-—?.\s])+(?:[.!\s]*)$/i;

/** Non-empty placeholders must not improve the score, regardless of length. */
export function hasUsefulContent(value: string): boolean {
  const text = normalize(value);
  if (!text || placeholder.test(text)) return false;
  const withoutUnknown = text.replace(/не знаю|пока неизвестно|неизвестно|уточняется|уточнить|не определен[аоы]?|нет информации|нет ответа|\b(?:tbd|todo|test|n\/a)\b/g, " ");
  return /[а-яa-z]{3}/i.test(withoutUnknown);
}

const processPattern = /магазин|продукт|товар|заказ|продаж|клиент|покупател|склад|достав|маршрут|урок|обуч|студент|курс|производ|станок|оборудован|сотрудник|оператор|документ|заявк|запис|очеред|пациент|энерг|вода|полив|ферм|урожа|растен|турист|гост|сервис|данн|сайт|поддержк|логист|отчет|аренд|финанс|расход|учет|процесс/i;
const painPattern = /проблем|теря|потер|списан|трат|долг|медлен|ручн|ошиб|сложн|неудоб|избыточ|просто[ийяев]|дефицит|не усп|не понима|нет |не можем|не вид|высок|низк|сниз|сократ|уменьш|увелич|улучш|оптимиз|повыс|ускор|автоматиз|прогноз|нехват|перерасход|перегруз/i;
const actionPattern = /сниз|сократ|уменьш|увелич|улучш|оптимиз|повыс|ускор|автоматиз|прогноз|созда|разработ|внедр|получ|постро|определ|выяв|сравн|рекоменд|прототип|модел|дашборд|отчет|сервис|систем|инструмент|приложен|бот|макет|анализ/i;
const artifactPattern = /прототип|модел|дашборд|отчет|сервис|систем|инструмент|приложен|бот|макет|алгоритм|рекомендац|исследован|анализ|прогноз|план/i;
const metricPattern = /%|процент|точност|ошиб|mae|mape|rmse|f1|auc|конверси|выручк|расход|затрат|списан|потер|врем|минут|час|секунд|скорост|дол[яи]|количеств|число|числа|заказ|заявк|потреблен|эконом|урожайн|задерж|удовлетвор|оценк|стоимост|метрик|показател|запас|нагруз|nps|recall|precision/i;
const verificationPattern = /сравн|базов|базойн|контрольн|тест|провер|валидац|выборк|пилот|эксперимент|замер|измер|отчет|недел|месяц|ежеднев|за день|за час|по итог|до и после|с \d[^.]*до \d/i;
const sourcePattern = /csv|excel|xlsx|sql|api|crm|1с|баз[аыуе]|выгруз|таблиц|истори|журнал|лог[иов]|анкет|опрос|интервью|датчик|снимк|фото|видео|запис|документ|продаж|заказ|остатк|списан|показани|набор|dataset|отчет/i;
const availabilityPattern = /доступ|предостав|передад|выгруз|обезлич|открыт|разреш|недел|месяц|год|\d+\s*(?:строк|запис|чек|товар|заказ|дн|сут|gb|mb|гб|мб)/i;
const absencePattern = /данных\s+(?:пока\s+)?нет|нет\s+(?:исходных\s+|доступных\s+)?данных|данные\s+(?:пока\s+)?(?:отсутствуют|не собраны|не собирались)|данных\s+не\s+(?:собирали|собрано|собираем)/i;
const collectionPattern = /собер|собрать|сбор|опрос|интервью|измер|замер|запиш|выгруз|получ|размет/i;
const datePattern = /(?:\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\s*(?:январ|феврал|март|апрел|мая|июн|июл|август|сентябр|октябр|ноябр|декабр))/i;
const durationPattern = /(?:\d+(?:[.,]\d+)?|одн[аоу]|дв[аеу]|три|четыре|пять|шесть|семь|восемь|девять|десять)\s*(?:рабоч\S*\s+)?(?:дн[яей]|день|недел|месяц|час|суток)/i;

function points(has: boolean, full: boolean, max: number, partial: number): number {
  return has ? (full ? max : partial) : 0;
}

export function readiness(brief: Brief): ReadinessResult {
  const problem = normalize(brief.problem);
  const outcome = normalize(brief.outcome);
  const criteria = normalize(brief.successCriteria);
  const data = normalize(brief.data);
  const constraints = normalize(brief.constraints);
  const timeline = normalize(brief.timeline);
  const skills = normalize(brief.skills);
  const specificContext = processPattern.test(problem) || (hasUsefulContent(brief.audience) && processPattern.test(brief.audience)) || (hasUsefulContent(brief.currentState) && processPattern.test(brief.currentState));
  const noData = absencePattern.test(data);
  const dataPlan = collectionPattern.test(data) && sourcePattern.test(data) && (datePattern.test(data) || durationPattern.test(data)) && /команд|сотрудник|менеджер|владел|аналитик|мы |соберем|получим|выгрузим|проведем/i.test(data);
  const boundary = /\d|не (?:передав|использ|выход|хран|собир)|без |только |не более|не меньше|запрещ|нельзя|обезлич|локальн|открыт[а-я ]*источник|open.source|ограничений нет|нет (?:технических|бюджетных|особых) ограничений|до .*тенге/i.test(constraints);
  const hasConstraintType = /бюджет|тенге|рубл|доллар|данн|конфиденц|персональн|доступ|интеграц|оборудован|технолог|локальн|бесплат|ограничен|использ|облач|безопас|python|open.source/i.test(constraints);
  const skillFamilies = [
    /python/i, /\bsql\b|баз[аыу] данных/i, /machine learning|\bml\b|машинн|прогнозирован/i,
    /анализ данных|data analys|аналитик|статистик/i, /react|javascript|typescript|frontend|фронтенд/i,
    /backend|бэкенд|node|java\b|golang|разработк/i, /ux|ui|figma|дизайн|исследован/i,
    /nlp|язык|текст/i, /computer vision|компьютерн[а-я ]*зрен|opencv/i,
    /power bi|tableau|визуализац|excel/i, /iot|датчик|инженер/i,
  ].filter((pattern) => pattern.test(skills)).length;

  const sections: ReadinessSection[] = [
    {
      key: "problem", label: "Проблема", max: 20,
      score: points(hasUsefulContent(problem) && (painPattern.test(problem) || specificContext), painPattern.test(problem) && specificContext, 20, 10),
      rule: "20 — названы бизнес-процесс или участники и конкретная трудность; 10 — указан только процесс или трудность; 0 — нет содержательного описания.",
      hint: "Опишите, в каком процессе возникает проблема и что именно бизнес теряет: время, деньги или качество.",
    },
    {
      key: "outcome", label: "Ожидаемый результат", max: 20,
      score: points(hasUsefulContent(outcome) && actionPattern.test(outcome), actionPattern.test(outcome) && (processPattern.test(outcome) || artifactPattern.test(outcome) && /для |по |на основе|с возможност/i.test(outcome)), 20, 10),
      rule: "20 — действие связано с конкретным процессом или назначением артефакта; 10 — направление или артефакт названы без назначения; 0 — результат не определён.",
      hint: "Укажите конкретный результат и его назначение, например прототип прогноза спроса для планирования закупок.",
    },
    {
      key: "successCriteria", label: "Критерии успеха", max: 20,
      score: points(hasUsefulContent(criteria) && metricPattern.test(criteria), /\d/.test(criteria) && metricPattern.test(criteria) && verificationPattern.test(criteria), 20, 10),
      rule: "20 — названы метрика, численная цель и способ или период проверки; 10 — есть метрика, но не хватает цели или проверки; 0 — проверяемой метрики нет.",
      hint: "Добавьте метрику, численную цель и проверку: например снизить списания на 10% в четырёхнедельном пилоте по сравнению с прошлым месяцем.",
    },
    {
      key: "data", label: "Доступные данные", max: 15,
      score: points(hasUsefulContent(data) && (sourcePattern.test(data) || noData), noData ? dataPlan : sourcePattern.test(data) && availabilityPattern.test(data), 15, 7),
      rule: "15 — указан источник или состав данных и доступ, объём или период; также 15 — честное отсутствие данных с планом: кто, что и когда соберёт; 7 — источник или отсутствие без деталей; 0 — сведений нет.",
      hint: "Назовите источник, состав и доступность данных. Если их нет — кто, какие данные и за какой срок соберёт.",
    },
    {
      key: "constraints", label: "Ограничения", max: 10,
      score: points(hasUsefulContent(constraints) && hasConstraintType, hasConstraintType && boundary, 10, 5),
      rule: "10 — есть конкретная граница по бюджету, данным, доступу или технологиям либо явно указано отсутствие ограничений; 5 — названа область ограничения без границы; 0 — сведений нет.",
      hint: "Укажите бюджетную или техническую границу и правила работы с данными; если ограничений нет, напишите это явно.",
    },
    {
      key: "timeline", label: "Сроки", max: 10,
      score: points(hasUsefulContent(timeline) && (datePattern.test(timeline) || durationPattern.test(timeline) || /семестр|квартал|учебный год|дедлайн|срок|этап/i.test(timeline)), datePattern.test(timeline) || durationPattern.test(timeline), 10, 5),
      rule: "10 — конкретная дата или длительность в днях, неделях, месяцах, часах; 5 — только период или этап без длительности; 0 — срок неизвестен или указан как «скоро».",
      hint: "Укажите длительность, например 6 недель после выбора команды, или дату сдачи результата.",
    },
    {
      key: "skills", label: "Навыки", max: 5,
      score: points(hasUsefulContent(skills) && skillFamilies > 0, skillFamilies >= 2, 5, 2),
      rule: "5 — названы минимум две компетенции из словаря MVP (например Python и анализ данных); 2 — одна; 0 — конкретные навыки не указаны.",
      hint: "Выберите минимум две подходящие компетенции, например анализ данных и Python, либо UX/UI и React.",
    },
  ];
  for (const section of sections) {
    if (section.score === section.max) section.hint = "Раздел содержит сведения для полного балла.";
  }

  const next = [...sections].filter((section) => section.score < section.max).sort((a, b) => (b.max - b.score) - (a.max - a.score))[0];
  return {
    score: sections.reduce((sum, section) => sum + section.score, 0),
    sections,
    nextStep: next ? next.hint : "Бриф заполнен. Проверьте точность сведений и опубликуйте задачу, когда будете готовы.",
  };
}
