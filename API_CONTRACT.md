# TaskUp AI · API v1

Локальный сервер: `http://127.0.0.1:8000`. JSON UTF-8, `/docs` — OpenAPI.
Демо-заголовки приватных запросов: `X-Demo-Role: business|team`, `X-Demo-Actor-Id: 1`.
Профили выбираются через `GET /api/demo/profiles`. Это имитация входа.

## Карточка

TaskCard содержит все ключи: `title`, `context`, `need`, `users`, `data`,
`constraints`, `expected_result`, `contact`, `interaction_format`, `data_source`,
`deadline`, `feedback_process` (string|null), `success_criteria` (массив
`{criterion: string|null, expected_value: string|null, verification_method: string|null}`).
Неизвестные значения — null и []. Никаких баллов или решений команд внутри карточки.
Отрасль `industry` — метаданные задачи.

## Версии

Создание: `{industry: "Образование", raw_description: "Хотим навести порядок с оплатами"}`.
Все изменения задачи требуют `version` из последнего серверного ответа.
PATCH draft: `{version: 1, draft_card?: TaskCard, raw_description?: string, industry?: string,
answers?: [{question_id: "q_users", field: "users", value: "Два администратора"}]}`.
ID вопросов стабилен: `q_<field>`. Значение ответа — string или массив критериев.
Ответ «Пока не знаю» нормализуется в неизвестное. Сервер проверяет привязку ID к полю.

`analyze`, `compose`, `confirm`, `publish`: `{version: 2}`.
Каждая успешная мутация увеличивает version; устаревшая версия даёт 409.
`score-preview`: `{card: TaskCard}`; не изменяет БД.
`confirm` атомарно копирует draft_card в confirmed_card и считает рейтинг.
`publish` требует совпадения текущей и подтверждённой карточек и название;
минимальный рейтинг не требуется. Повторный publish идемпотентен по состоянию.
Правки черновика не меняют публичные данные, включая публичную отрасль.

## Маршруты

| Метод | URL | Доступ / результат |
|---|---|---|
| GET | /api/health | состояние сервера |
| GET | /api/demo/profiles | businesses[], teams[] |
| GET, POST | /api/business/tasks | свои задачи / создание |
| GET | /api/business/tasks/{id} | владелец, полная рабочая версия |
| PATCH | /api/business/tasks/{id}/draft | владелец, сохранение |
| POST | /api/business/tasks/{id}/analyze | владелец, анализ и 3–5 вопросов |
| POST | /api/business/tasks/{id}/compose | владелец, карточка с evidence |
| POST | /api/business/tasks/{id}/score-preview | владелец, предварительный рейтинг |
| POST | /api/business/tasks/{id}/confirm | владелец, подтверждение |
| POST | /api/business/tasks/{id}/publish | владелец, публикация |
| GET | /api/tasks | общий каталог; industry, readiness_level, sort=score_desc\|published_desc |
| GET | /api/tasks/{id} | только опубликованная подтверждённая версия |
| POST | /api/tasks/{id}/proposals | команда, создание предложения |
| GET | /api/business/tasks/{id}/proposals | владелец, все предложения |
| PATCH | /api/proposals/{id}/status | владелец задачи, `{status: "accepted"\|"rejected"}` |
| GET | /api/team/proposals | команда, `{proposals: [], total_points: 0}` |
| POST | /api/proposals/{id}/milestones | выбранная команда, один этап prototype |
| POST | /api/milestones/{id}/confirm | владелец, идемпотентные +10 баллов |

Списки задач возвращаются массивом. PublicTask: `id`, `business_id`, `business_name`,
`industry`, `card`, `score`, `published_at`, `proposal_count`.
Рабочая задача: `id`, `business_id`, `industry`, `raw_description`, `questions`, `answers`,
`draft_card`, `confirmed_card`, `is_published`, `version`, `score`, `preview_score`,
`ai_info`, `evidence`, `has_unconfirmed_changes`, `proposal_count`, даты.
Score: `total_score`, `readiness_level`, `breakdown` (criterion, awarded, maximum,
basis, missing_fields), `improvement_suggestions` (action, available_points, fields),
`next_level`, `points_to_next_level`. Confirm добавляет `score_delta`.
AI info: `{mode: "rule_based"|"llm", message: "…"}`.
Evidence: `{field: [{source_id: "description"|"answer:q_users", quote: "точная цитата"}]}`.

Предложение: `{idea: "Сделаем реестр", plan: "Интервью, прототип, проверка",
estimated_duration: "2 недели", prototype_url: null}`.
Ответ: `{id, task_id, task_title, team_id, team_name, idea, plan, estimated_duration,
prototype_url, status, milestones: [], created_at, updated_at}`.
Разрешён один отклик команды на задачу, но число разных команд не ограничено.
Решения независимы: принятие одного предложения не меняет другие.
После отправки этапа решение зафиксировано, чтобы не отозвать выполняемую работу.

Этап: `{stage_code: "prototype", result_description: "Создан реестр и проверен сценарий",
result_url: "https://example.org/demo"}`. URL необязателен, только http/https.
Ответ: `{id, proposal_id, stage_code, result_description, result_url, status:
"submitted"|"confirmed", points_awarded, submitted_at, confirmed_at}`.
Повторная отправка того же этапа — 409; повторное подтверждение возвращает те же +10.

## Ошибки

Единая оболочка: `{"error":{"code":"version_conflict","message":"Карточка уже изменена. Обновите страницу.","details":{"current_version":3}}}`.
400 — неверное состояние; 401 — нет/неверен профиль; 403 — роль/владелец;
404 — ресурс не найден; 409 — конфликт версии/дубликат; 422 — валидация;
500 — безопасная общая ошибка. Секреты, исходный ввод и трассировки не возвращаются.
