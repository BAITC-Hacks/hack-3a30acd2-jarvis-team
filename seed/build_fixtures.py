"""Regenerate the synthetic, versioned JSON fixtures; no database access."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIELDS = ['title', 'context', 'need', 'users', 'data', 'constraints', 'expected_result',
          'contact', 'interaction_format', 'data_source', 'deadline', 'feedback_process']
businesses = [
    {'id': 1, 'name': 'Учебный центр «Орбита»', 'demo_contact': 'orbit@example.org'},
    {'id': 2, 'name': 'Мастерская «Форма»', 'demo_contact': 'forma@example.org'},
    {'id': 3, 'name': 'Ферма «Зелёный контур»', 'demo_contact': 'farm@example.org'},
]
descriptions = [
    {'id': 1, 'business_id': 1, 'industry': 'Образование', 'raw_description': 'Мы небольшой учебный центр «Орбита». Сейчас отмечаем оплату курсов вручную и иногда теряем сведения. Хотим навести порядок с оплатами.'},
    {'id': 2, 'business_id': 2, 'industry': 'Производство', 'raw_description': 'Мы мастерская «Форма». Заказы записываем в таблице. Хотим видеть загрузку мастерской и сроки выполнения.'},
    {'id': 3, 'business_id': 3, 'industry': 'Агро', 'raw_description': 'Мы ферма «Зелёный контур». Хотим учитывать полив в теплице. Есть записи наблюдений за месяц.'},
    {'id': 4, 'business_id': 2, 'industry': 'Ритейл', 'raw_description': 'Мы открываем небольшой демонстрационный магазин. Хотим упростить инвентаризацию, детали пока обсуждаем.'},
    {'id': 5, 'business_id': 1, 'industry': 'Образование', 'raw_description': 'Мы учебный центр «Орбита». Хотим собирать обратную связь после занятий. Сейчас используем бумажные анкеты.'},
]
cards = [
    dict(title='Порядок в оплатах учебного центра', context='Оплаты курсов отмечаются вручную в таблице.',
         need='Вести единый реестр оплат без потерь записей.', users='Два администратора учебного центра.',
         data='Синтетический CSV: 100 оплат, курс, дата, сумма, статус.', data_source='Представитель передаст обезличенный CSV при старте.',
         expected_result='Веб-прототип реестра с поиском и статусом оплаты.',
         success_criteria=[{'criterion': 'Сохранность записей при импорте', 'expected_value': '100 из 100 строк доступны в реестре', 'verification_method': 'Сверить количество и суммы с контрольным CSV'}],
         deadline='Три недели с момента начала.', constraints='Только синтетические данные; без подключения банков.',
         contact='orbit@example.org (вымышленный контакт)', interaction_format='Онлайн-встреча раз в неделю.',
         feedback_process='Представитель проверяет промежуточный результат по пятницам.'),
    dict(title='Загрузка мастерской в одном окне', context='Заказы находятся в разрозненных таблицах.', need='Показывать загрузку станков по заказам.',
         users='Мастер смены и менеджер заказов.', data='Таблица с 40 вымышленными заказами и операциями.', data_source='Учебный CSV от владельца мастерской.',
         expected_result='Экран загрузки с фильтром по станку.', deadline='Две недели.', constraints='Локальный прототип без интеграции с оборудованием.',
         contact='forma@example.org (вымышленный контакт)', interaction_format='Еженедельный созвон.', feedback_process='Мастер проверяет макет перед реализацией.'),
    dict(title='Журнал полива для небольшой теплицы', context='Наблюдения о поливе записываются на бумаге.', need='Собирать записи полива в одном журнале.',
         users='Агроном учебной фермы.', data='30 вымышленных записей наблюдений.', data_source='CSV, подготовленный представителем фермы.',
         expected_result='Прототип электронного журнала с фильтром по дате.'),
    dict(title='Быстрая инвентаризация магазина', context='Небольшой демонстрационный магазин перед открытием.', need='Упростить подсчёт остатков.'),
    dict(title='Обратная связь после занятий', context='Отзывы собираются на бумажных анкетах.', need='Собирать отзывы после занятия.',
         users='Участники учебных курсов и администратор.', expected_result='Прототип формы отзыва и экрана сводки.'),
]
teams = [
    {'id': 1, 'name': 'Команда «Импульс»', 'interests': ['Образование', 'Ритейл'], 'skills': ['Веб-разработка', 'UX'], 'technologies': ['React', 'Python']},
    {'id': 2, 'name': 'Команда «Вектор»', 'interests': ['Образование', 'Производство'], 'skills': ['Аналитика', 'Backend'], 'technologies': ['FastAPI', 'SQL']},
    {'id': 3, 'name': 'Команда «Росток»', 'interests': ['Агро'], 'skills': ['Данные', 'Прототипирование'], 'technologies': ['Python', 'Pandas']},
    {'id': 4, 'name': 'Команда «Пиксель»', 'interests': ['Ритейл', 'Дизайн'], 'skills': ['UX', 'Frontend'], 'technologies': ['TypeScript', 'Figma']},
    {'id': 5, 'name': 'Команда «Маяк»', 'interests': ['Образование'], 'skills': ['Исследования', 'Веб-разработка'], 'technologies': ['React', 'SQLite']},
]
proposals = [
    {'id': i, 'task_id': task_id, 'team_id': team_id,
     'idea': idea, 'plan': 'Уточнить сценарий, собрать прототип, проверить на синтетических данных.',
     'estimated_duration': duration, 'prototype_url': f'https://example.org/taskup-demo/{i}', 'status': 'pending'}
    for i, task_id, team_id, idea, duration in [
        (1, 1, 1, 'Реестр оплат с CSV-импортом и быстрым поиском.', '3 недели'),
        (2, 1, 2, 'Начнём с проверки качества CSV и отчёта по неоплаченным курсам.', '2 недели'),
        (3, 2, 4, 'Экран загрузки мастерской с понятной шкалой времени.', '2 недели'),
        (4, 3, 3, 'Простой журнал полива с поиском по датам.', '10 дней'),
        (5, 5, 5, 'Форма отзывов и сводка для преподавателя.', '2 недели'),
    ]
]
for name, data in [('businesses', businesses), ('descriptions', descriptions),
                   ('cards', [{'task_id': i + 1, 'card': {**dict.fromkeys(FIELDS), 'success_criteria': [], **card}} for i, card in enumerate(cards)]),
                   ('teams', teams), ('proposals', proposals)]:
    (ROOT / f'{name}.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Generated 5 synthetic fixture sets. All example.org links are demonstration placeholders.')
