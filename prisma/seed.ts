import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { emptyBrief, type Brief } from '../lib/brief';
import { readiness } from '../lib/readiness';

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'SanaDemo2026!';

type Example = { id: string; owner: number; industry: string; draft: string; brief: Partial<Brief>; status?: 'OPEN' | 'DRAFT' };

const companies = ['Dala Market', 'Qadam Lab', 'Oryndy Group', 'Merei Digital'];
const examples: Example[] = [
  {
    id: 'demo-waste', owner: 0, industry: 'Ритейл',
    draft: 'У нас сеть небольших продуктовых магазинов. Хотим уменьшить списание продуктов, но не понимаем, с чего начать.',
    brief: {
      title: 'Предсказать спрос. Сократить списания.',
      problem: 'В 12 продуктовых магазинах списывают непроданные молочные продукты: за последний месяц списания составили 8% закупок. Заказы формируют вручную.',
      audience: 'Менеджеры закупок и управляющие 12 магазинов Dala Market.',
      currentState: 'Заказы составляются в Excel на основе продаж прошлой недели; сезонность и праздники не учитываются.',
      outcome: 'Прототип прогноза спроса на 7 дней и рекомендации заказа для каждой категории молочных продуктов.',
      successCriteria: 'В пилоте на тестовой выборке за 4 недели снизить списания на 15% относительно текущего способа, не увеличив число дней отсутствия товара.',
      data: 'Обезличенная CSV-выгрузка продаж, остатков и списаний за 12 месяцев по 12 магазинам; доступ предоставляет владелец после выбора команды.',
      constraints: 'Без персональных данных и интеграции с кассами. Работать локально; бюджет облачных сервисов — 0 тенге.',
      timeline: '6 недель: 1 — изучение данных, 3 — модель, 2 — пилот и отчёт.',
      skills: 'Python, SQL, Data Science',
      deliverables: 'Воспроизводимый ноутбук, CSV с прогнозом, интерактивный дашборд и инструкция запуска.',
    },
  },
  {
    id: 'demo-delivery', owner: 1, industry: 'Логистика',
    draft: 'Курьеры часто опаздывают, потому что диспетчер распределяет заказы вручную. Нужен удобный планировщик маршрутов.',
    brief: {
      title: 'Маршруты доставки без лишних километров',
      problem: 'Диспетчер Qadam Lab вручную распределяет 150 заказов в день между 8 курьерами. Из-за пересечений маршрутов доставка задерживается.',
      audience: 'Диспетчер и 8 курьеров городской доставки.',
      currentState: 'Адреса поступают в таблицу, маршруты собирают вручную перед каждой сменой.',
      outcome: 'Веб-прототип распределения заказов с картой маршрутов и временными окнами доставки.',
      successCriteria: 'На исторической тестовой выборке сократить суммарный пробег на 10% относительно маршрутов диспетчера; проверять опоздания по временным окнам.',
      data: 'Обезличенный CSV с координатами, временными окнами и маршрутами за 3 месяца. Доступ к выгрузке предоставляет диспетчер.',
      constraints: 'Не использовать ФИО и телефоны клиентов; прототип только для одного города.',
      timeline: '5 недель, еженедельная демонстрация диспетчеру.',
      skills: 'Python, React, SQL',
      deliverables: 'Веб-приложение, алгоритм распределения, сравнение с исходными маршрутами и инструкция.',
    },
  },
  {
    id: 'demo-learning', owner: 2, industry: 'Образование',
    draft: 'Студенты бросают онлайн-курс, а кураторы узнают об этом слишком поздно. Хотим вовремя замечать риск.',
    brief: {
      title: 'Помочь студентам дойти до конца курса',
      problem: 'В учебном проекте Oryndy Group куратор проверяет активность 300 студентов вручную; снижение вовлечённости замечают после пропуска двух заданий.',
      audience: 'Кураторы онлайн-курсов и методисты.',
      currentState: 'Активность и сдача заданий выгружаются в отдельные таблицы раз в неделю.',
      outcome: 'Панель активности с объяснимыми признаками риска и списком студентов для личного контакта куратора.',
      successCriteria: 'На тестовой выборке находить не менее 70% случаев пропуска двух заданий; сравнение с ручным списком кураторов за месяц.',
      data: 'Обезличенные CSV с событиями входа и сдачей заданий за 2 семестра; доступ после выбора команды.',
      constraints: 'Только помощь куратору, без автоматических решений об отчислении; исключить персональные данные.',
      timeline: '4 недели.',
      skills: 'Python, UX, SQL',
      deliverables: 'Дашборд, описание правил риска, отчёт о проверке и руководство куратора.',
    },
  },
  {
    id: 'demo-farm', owner: 3, industry: 'Агротехнологии',
    draft: 'Фермеры записывают полив в блокноте. Хотим свести показания датчиков и график полива в одном месте.',
    brief: {
      title: 'Умный журнал полива для фермеров',
      problem: 'В пилотном хозяйстве Merei Digital показания влажности и факты полива хранятся раздельно. Агроном не видит участки с устойчивым дефицитом влаги.',
      audience: 'Агроном и операторы полива на 6 демонстрационных участках.',
      currentState: 'Измерения датчиков доступны отдельно; журнал полива ведут на бумаге.',
      outcome: 'Прототип журнала полива с графиками влажности и понятными уведомлениями агроному.',
      successCriteria: 'В пилоте сократить время подготовки недельного отчёта с 2 часов до 20 минут; измерение по журналу работы агронома.',
      data: 'CSV с почасовыми измерениями влажности за 3 месяца, доступна обезличенная выгрузка. Бумажный журнал нужно оцифровать вместе с агрономом.',
      constraints: 'Без автоматического управления оборудованием; все решения подтверждает агроном.',
      timeline: '6 недель.',
      skills: 'React, Python, UX',
      deliverables: 'Рабочий интерфейс журнала, импорт CSV, графики и описание процесса сбора данных.',
    },
  },
  {
    id: 'demo-museum', owner: 2, industry: 'Туризм',
    draft: 'Делаем городской аудиогид. Посетителям трудно выбрать маршрут под свободное время и интересы.',
    brief: {
      title: 'Городской маршрут под ваш ритм',
      problem: 'Гости проекта Oryndy Group тратят время на ручной выбор из 40 точек аудиогида: им не хватает информации о длине прогулки и подходящей теме.',
      audience: 'Самостоятельные туристы с 1–3 часами свободного времени.',
      currentState: 'Есть каталог точек с описаниями, но маршрут пользователь составляет самостоятельно.',
      outcome: 'Мобильный веб-прототип для подбора прогулки по интересам и доступному времени туриста.',
      successCriteria: 'Проверить удобство с посетителями и собрать обратную связь о маршрутах.',
      data: 'Открытый каталог в CSV и JSON: 40 точек с координатами и описаниями; доступен для локального импорта.',
      constraints: 'Без точной геолокации и персональных данных; пользователь сам выбирает стартовую точку.',
      timeline: '4 недели.',
      skills: 'React, UX',
      deliverables: 'Адаптивный прототип, три сценария прогулки и отчёт пользовательского тестирования.',
    },
  },
  {
    id: 'demo-clinic', owner: 3, industry: 'Здравоохранение',
    draft: 'Администратор клиники тратит много времени на запись. Нужен простой экран свободных слотов.',
    brief: {
      title: 'Запись на приём без таблиц и звонков',
      problem: 'Администратор демонстрационной клиники Merei Digital сопоставляет расписания 5 кабинетов вручную; это создаёт повторные записи на один слот.',
      audience: 'Администраторы регистратуры; медицинские решения не входят в задачу.',
      currentState: 'Расписание каждого кабинета находится в отдельной таблице.',
      outcome: 'Прототип единого расписания с поиском свободного времени и защитой от двойного бронирования.',
      successCriteria: 'На тестовой выборке из 50 сценариев — 0 двойных бронирований; сравнение времени записи с текущей таблицей.',
      data: 'Реальных данных нет. План: совместно с администратором подготовить 50 синтетических записей и проверить их до разработки.',
      constraints: '',
      timeline: '5 недель.',
      skills: 'TypeScript, React, SQL',
      deliverables: 'Веб-приложение на синтетических данных, набор тестовых сценариев и инструкция администратора.',
    },
  },
  {
    id: 'demo-recycle', owner: 1, industry: 'Экология',
    draft: 'Контейнеры для вторсырья вывозят по расписанию, даже когда они пустые. Хотим собирать сигналы о заполнении.',
    brief: {
      title: 'Вывозить вторсырьё тогда, когда нужно',
      problem: 'На 25 точках проекта Qadam Lab контейнеры вывозят дважды в неделю независимо от заполнения; водители делают лишние рейсы.',
      audience: 'Операторы сбора вторсырья и ответственные за точки.',
      currentState: 'Уровень заполнения иногда передают в мессенджере, история наблюдений не сохраняется.',
      outcome: 'Прототип формы заполнения контейнера и панели приоритетов вывоза.',
      successCriteria: 'На пилотных 5 точках сократить число рейсов к пустым контейнерам на 20% за месяц относительно исходного расписания.',
      data: 'Реальных данных пока нет. План сбора: ответственные на 5 точках в течение 2 недель заносят заполнение в общую CSV-таблицу.',
      constraints: 'Форма должна работать на телефоне; не собирать сведения о жителях.',
      timeline: '4 недели.',
      skills: 'React, UX, SQL',
      deliverables: 'Мобильная форма, панель оператора, план пилота и отчёт об ограничениях собранных данных.',
    },
  },
  {
    id: 'demo-invoices', owner: 0, industry: 'Финансы',
    draft: 'Бухгалтер вручную сверяет счета поставщиков и строки накладных. Хотим выделять расхождения автоматически.',
    brief: {
      title: 'Найти расхождения в счетах за минуты',
      problem: 'Бухгалтер Dala Market вручную сверяет 200 счетов поставщиков в месяц; разное написание товаров затрудняет поиск расхождений в цене и количестве.',
      audience: 'Бухгалтер и менеджер закупок.',
      currentState: 'Счета и накладные загружают в разные таблицы и сопоставляют вручную.',
      outcome: 'Прототип сверки двух таблиц с объяснением найденных расхождений для бухгалтера.',
      successCriteria: 'Сравнить качество сопоставления с результатом ручной сверки бухгалтера.',
      data: 'Обезличенные CSV с 200 счетами и накладными за месяц, доступна выгрузка без банковских реквизитов.',
      constraints: 'Не проводить платежи и не изменять бухгалтерские документы; только отчёт для проверки человеком.',
      timeline: '5 недель.',
      skills: 'Python, SQL',
      deliverables: 'Скрипт сверки, CSV-отчёт с объяснениями и инструкция повторного запуска.',
    },
  },
  {
    id: 'demo-draft-stock', owner: 0, industry: 'Ритейл', status: 'DRAFT',
    draft: 'Хотим понимать, каких товаров не хватает на полке, пока покупатель не ушёл в другой магазин.',
    brief: {
      title: 'Замечать пустые полки вовремя',
      problem: 'Управляющие Dala Market замечают отсутствие товара во время обхода магазина, а не в момент продажи последней единицы.',
      audience: 'Управляющие магазинов.',
      outcome: 'Список товаров, остатки которых требуют проверки сотрудником.',
      skills: 'SQL, Python',
    },
  },
  {
    id: 'demo-draft-feedback', owner: 0, industry: 'Ритейл', status: 'DRAFT',
    draft: 'Отзывы покупателей приходят из разных каналов. Хотим понимать, что исправлять в магазинах в первую очередь.',
    brief: {
      title: 'Собрать обратную связь в одну картину',
      problem: 'Менеджер вручную читает отзывы из трёх каналов и не успевает объединить повторяющиеся жалобы по магазинам.',
      audience: 'Менеджер клиентского сервиса Dala Market.',
      currentState: 'Раз в месяц отзывы копируют в таблицу.',
      outcome: 'Панель тем обратной связи с примерами и динамикой по магазинам.',
      data: 'Обезличенный CSV с 500 отзывами за 3 месяца; доступ предоставляет менеджер после ручного удаления имён.',
      timeline: '4 недели.',
      skills: 'Python, NLP, React',
      deliverables: 'Прототип панели и описание правил категоризации.',
    },
  },
];

const teamExamples = [
  { name: 'Vector', university: 'Демонстрационный технический университет', description: 'Команда студентов, которым нравятся понятные продукты и работа с данными.', skills: 'Python, React, SQL, UX', names: ['Алия — продукт и исследования', 'Тимур — анализ данных', 'Дана — интерфейсы'] },
  { name: 'Qadam Data', university: 'Демонстрационный университет цифровых технологий', description: 'Разрабатываем прототипы аналитики, проверяем гипотезы на данных.', skills: 'Python, Data Science, SQL', names: ['Арман — машинное обучение', 'Мадина — аналитика'] },
  { name: 'Jasyl Code', university: 'Демонстрационный политехнический институт', description: 'Создаём полезные веб-сервисы для городских и экологических проектов.', skills: 'TypeScript, React, UX', names: ['Сауле — frontend', 'Ерлан — backend', 'Амина — дизайн'] },
  { name: 'Orken', university: 'Демонстрационная школа инженерии', description: 'Соединяем исследование пользователей, визуализацию и разработку.', skills: 'React, Python, UX', names: ['Азамат — разработка', 'Айша — исследования'] },
];

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
    throw new Error('Демо-seed отключён в production. Запускайте его явно только для локальной демонстрации.');
  }
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const inaccessibleHash = await bcrypt.hash(randomBytes(40).toString('hex'), 12);

  for (const [index, company] of companies.entries()) {
    await prisma.user.upsert({
      where: { id: `demo-business-${index}` },
      create: { id: `demo-business-${index}`, name: index === 0 ? 'Айгерим, Dala Market' : `Представитель ${company}`, email: index === 0 ? 'business@demo.local' : `company${index}@demo.invalid`, passwordHash: index === 0 ? passwordHash : inaccessibleHash, role: 'BUSINESS', company, isDemo: true },
      update: { name: index === 0 ? 'Айгерим, Dala Market' : `Представитель ${company}`, company, isDemo: true, ...(index === 0 ? { passwordHash } : {}) },
    });
  }

  for (const [index, team] of teamExamples.entries()) {
    const ownerId = `demo-student-${index}`;
    await prisma.user.upsert({
      where: { id: ownerId },
      create: { id: ownerId, name: team.names[0].split(' — ')[0], email: index === 0 ? 'team@demo.local' : `team${index}@demo.invalid`, passwordHash: index === 0 ? passwordHash : inaccessibleHash, role: 'TEAM', isDemo: true },
      update: { isDemo: true, ...(index === 0 ? { passwordHash } : {}) },
    });
    await prisma.team.upsert({
      where: { id: `demo-team-${index}` },
      create: { id: `demo-team-${index}`, ownerId, name: team.name, university: team.university, description: team.description, skills: team.skills, portfolio: '', isDemo: true },
      update: { name: team.name, university: team.university, description: team.description, skills: team.skills, isDemo: true },
    });
    for (const [memberIndex, member] of team.names.entries()) {
      const [name, role] = member.split(' — ');
      await prisma.member.upsert({ where: { id: `demo-member-${index}-${memberIndex}` }, create: { id: `demo-member-${index}-${memberIndex}`, teamId: `demo-team-${index}`, name, role }, update: { name, role } });
    }
  }

  const scores: { title: string; status: string; score: number }[] = [];
  for (const [index, item] of examples.entries()) {
    const brief: Brief = { ...emptyBrief, ...item.brief };
    const score = readiness(brief).score;
    const status = item.status ?? 'OPEN';
    if (status === 'OPEN' && score < 60) throw new Error(`Демо-задача ${item.id} не готова к публикации: ${score}`);
    const data = {
      ownerId: `demo-business-${item.owner}`, company: companies[item.owner], industry: item.industry,
      draft: item.draft, briefJson: JSON.stringify(brief), answersJson: '{}', questionsJson: '[]',
      lockedFieldsJson: '[]', assumptionsJson: '[]', recommendationsJson: '[]',
      score, status, isDemo: true,
    };
    await prisma.challenge.upsert({ where: { id: item.id }, create: { id: item.id, ...data, createdAt: new Date(Date.UTC(2026, 8, 15 + index, 9)) }, update: data });
    scores.push({ title: brief.title, status, score });
  }

  const applications = [
    { id: 'demo-application-1', challengeId: 'demo-waste', teamId: 'demo-team-0', proposal: 'Начнём с анализа сезонности и пропусков в данных. Сравним простой прогноз с базовой моделью и покажем рекомендации закупок в дашборде.', experience: 'Учебный проект по прогнозированию спроса на синтетических данных, Python и SQL.', timeline: '6 недель, промежуточная демонстрация каждую пятницу.' },
    { id: 'demo-application-2', challengeId: 'demo-waste', teamId: 'demo-team-1', proposal: 'Подготовим воспроизводимый процесс очистки данных и проверим прогноз на отложенном периоде. Вместе с менеджером выберем категории для пилота.', experience: 'Курсовой проект по временным рядам и визуализации остатков.', timeline: '5 недель на прототип и 1 неделя на передачу.' },
    { id: 'demo-application-3', challengeId: 'demo-recycle', teamId: 'demo-team-2', proposal: 'Сначала проверим мобильную форму на ответственных точек, затем добавим панель приоритетов. Подготовим инструкцию сбора наблюдений.', experience: 'Студенческий веб-проект с адаптивными формами и картой.', timeline: '4 недели.' },
    { id: 'demo-application-4', challengeId: 'demo-museum', teamId: 'demo-team-3', proposal: 'Проведём короткие интервью, соберём три маршрута и проверим понятность выбора на пользователях. Создадим мобильный прототип.', experience: 'Учебный проект городского путеводителя и исследование интерфейсов.', timeline: '4 недели.' },
  ];
  for (const application of applications) {
    await prisma.application.upsert({ where: { id: application.id }, create: { ...application, status: 'PENDING' }, update: { ...application, status: 'PENDING' } });
  }

  console.table(scores);
  console.info('Локальные демоданные созданы: 4 вымышленные компании, 4 команды, 10 задач.');
  console.info('Бизнес: business@demo.local | Команда: team@demo.local | Пароль: SanaDemo2026!');
  console.info('Повторный запуск обновляет только записи с фиксированными demo-идентификаторами.');
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Ошибка seed'); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
