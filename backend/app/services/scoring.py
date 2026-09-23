import re

from app.schemas import TaskCard

LABELS = {
    'title': 'Название', 'context': 'Контекст', 'need': 'Потребность', 'users': 'Пользователи',
    'data': 'Данные и материалы', 'data_source': 'Источник данных', 'expected_result': 'Ожидаемый результат',
    'success_criteria': 'Критерии успеха', 'deadline': 'Срок', 'constraints': 'Ограничения',
    'contact': 'Контакт', 'interaction_format': 'Формат взаимодействия', 'feedback_process': 'Обратная связь',
}
PLACEHOLDERS = {
    '', '-', '—', '?', 'нет', 'не знаю', 'пока не знаю', 'не известно', 'неизвестно', 'не указано',
    'не указан', 'не определено', 'не определён', 'не определен', 'не задано', 'уточняется',
    'уточним', 'потом', 'позже', 'пока нет', 'tbd', 'todo', 'n/a', 'na', 'null', 'none', 'unknown',
    'не применимо', 'не заполнено', 'будет позже', 'нет информации', 'нет данных',
}


def normalized(value: str | None) -> str:
    return re.sub(r'\s+', ' ', value or '').strip().casefold().strip(' .,!?:;…')


def meaningful(value: str | None, field: str = '') -> bool:
    text = normalized(value)
    if text in PLACEHOLDERS or re.fullmatch(r'(?:пока )?(?:не знаю|неизвестно|не указано|уточняется)(?: пока)?', text):
        return False
    if field in {'data', 'data_source'} and (
        text in {'данных нет', 'материалов нет', 'датасета нет', 'данные отсутствуют', 'источника нет', 'нет материалов'}
        or re.match(r'^(?:данных|материалов|датасета|источника) (?:пока )?нет\b', text)
    ):
        return False
    return True


def level(score: int) -> str:
    return 'Черновик' if score < 40 else 'Рабочая' if score < 70 else 'Готовая' if score < 90 else 'Приоритетная'


RUBRIC = [
    ('Контекст', 10, ['context']), ('Потребность', 10, ['need']),
    ('Данные и материалы', 10, ['data']), ('Источник данных', 10, ['data_source']),
    ('Ожидаемый результат', 15, ['expected_result']), ('Критерии успеха', 15, ['success_criteria']),
    ('Срок', 5, ['deadline']), ('Ограничения', 5, ['constraints']), ('Пользователи', 10, ['users']),
    ('Контакт', 5, ['contact']), ('Взаимодействие и обратная связь', 5, ['interaction_format', 'feedback_process']),
]


def calculate_score(card: TaskCard | dict | None) -> dict:
    card = TaskCard.model_validate(card or {}).model_dump()
    breakdown, suggestions = [], []
    for criterion, maximum, fields in RUBRIC:
        missing = []
        for field in fields:
            if field == 'success_criteria':
                valid = any(all(meaningful(item.get(k)) for k in ('criterion', 'expected_value', 'verification_method'))
                            for item in card[field])
            else:
                valid = meaningful(card[field], field)
            if not valid:
                missing.append(field)
        awarded = 0 if missing else maximum
        breakdown.append({'criterion': criterion, 'awarded': awarded, 'maximum': maximum,
                          'basis': 'Сведения заполнены по рубрике.' if awarded else 'Не хватает: ' + ', '.join(LABELS[f] for f in missing),
                          'missing_fields': missing})
        if missing:
            action = ('Добавьте критерий, ожидаемое значение и способ проверки.' if 'success_criteria' in missing
                      else 'Укажите: ' + ', '.join(LABELS[f].lower() for f in missing) + '.')
            suggestions.append({'action': action, 'available_points': maximum, 'fields': missing})
    total = sum(row['awarded'] for row in breakdown)
    threshold = next((n for n in (40, 70, 90) if total < n), None)
    return {'total_score': total, 'readiness_level': level(total), 'breakdown': breakdown,
            'improvement_suggestions': suggestions, 'next_level': level(threshold) if threshold else None,
            'points_to_next_level': threshold - total if threshold else 0}
