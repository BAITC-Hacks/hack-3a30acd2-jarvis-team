import json
import re

from app.schemas import Analysis, Answer, Composition, Evidence, Question, TaskCard
from app.services.scoring import LABELS, meaningful

QUESTION_TEXT = {
    'title': 'Как коротко назвать задачу, чтобы команда сразу поняла её тему?',
    'context': 'Как сейчас устроен процесс и в какой ситуации возникает проблема?',
    'need': 'Какую конкретную проблему нужно решить и что хотите изменить?',
    'users': 'Кто будет пользоваться решением и какие действия им нужны?',
    'data': 'Какие данные или материалы уже есть? Опишите их формат и состав.',
    'data_source': 'Откуда команда получит эти материалы и как будет предоставлен доступ?',
    'expected_result': 'Что именно команда должна передать в конце: какой проверяемый результат?',
    'success_criteria': 'Как вы проверите успех? Укажите критерий, ожидаемое значение и способ проверки.',
    'constraints': 'Какие есть технические, организационные или бюджетные ограничения?',
    'deadline': 'К какому сроку нужен результат? Если жёсткого срока нет, явно укажите это.',
    'contact': 'Какой рабочий контакт можно указать для связи с представителем бизнеса?',
    'interaction_format': 'В каком формате бизнес готов общаться с командой?',
    'feedback_process': 'Кто и как часто будет проверять результаты и давать обратную связь?',
}
PRIORITY = ['title', 'users', 'data', 'expected_result', 'success_criteria', 'data_source',
            'deadline', 'constraints', 'contact', 'interaction_format', 'feedback_process', 'context', 'need']


def source_map(description: str, answers: list[Answer]) -> dict[str, str]:
    sources = {'description': description}
    for answer in answers:
        value = answer.model_dump()['value']
        sources[f'answer:{answer.question_id}'] = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return sources


class RuleBasedFallback:
    """Conservative extraction: explicit labels, known sentence patterns, field-bound answers."""

    def compose_card(self, description: str, answers: list[Answer]) -> Composition:
        card = TaskCard().model_dump()
        evidence = {}

        def assign(field, value, source='description'):
            if isinstance(value, str) and meaningful(value, field):
                card[field] = value
                evidence[field] = [Evidence(source_id=source, quote=value)]

        # Explicitly labelled lines are copied, never inferred from industry or profile.
        for field, label in LABELS.items():
            if field == 'success_criteria':
                continue
            match = re.search(rf'^(?:{re.escape(label)}|{field})\s*:\s*(.+)$', description, re.I | re.M)
            if match:
                value = match.group(1).strip()
                if len(value) <= (200 if field == 'title' else 3000):
                    assign(field, value)
        for sentence in re.split(r'(?<=[.!?])\s+', description):
            if len(sentence) > 3000:
                continue
            if not card['context'] and re.match(r'^(Мы |Сейчас )', sentence, re.I):
                assign('context', sentence)
            if not card['need'] and re.match(r'^(Хотим |Нам нужно |Нам необходимо )', sentence, re.I):
                assign('need', sentence)
        for answer in answers:
            field, value = answer.field, answer.model_dump()['value']
            card[field] = [] if field == 'success_criteria' else None
            evidence = {k: v for k, v in evidence.items() if k.split('.')[0] != field}
            source = f'answer:{answer.question_id}'
            if field == 'success_criteria':
                if isinstance(value, list):
                    card[field] = value
                    for i, row in enumerate(value):
                        for key, text in row.items():
                            if meaningful(text):
                                evidence[f'{field}.{i}.{key}'] = [Evidence(source_id=source, quote=text)]
                            else:
                                card[field][i][key] = None
                elif isinstance(value, str) and meaningful(value):
                    # A free-text criterion is not silently turned into a measurable target.
                    card[field] = [{'criterion': value, 'expected_value': None, 'verification_method': None}]
                    evidence[f'{field}.0.criterion'] = [Evidence(source_id=source, quote=value)]
            else:
                assign(field, value, source)
        return Composition(card=TaskCard.model_validate(card), evidence=evidence)

    def analyze_draft(self, description: str, industry: str, answers: list[Answer]) -> Analysis:
        composition = self.compose_card(description, answers)
        values = composition.card.model_dump()
        missing = [f for f, v in values.items() if not v]
        answered = {a.field for a in answers}
        fields = [f for f in PRIORITY if f in missing and f not in answered][:5]
        if len(fields) < 3:
            fields += [f for f in PRIORITY if f not in fields][:3 - len(fields)]
        questions = []
        for field in fields:
            text = QUESTION_TEXT[field]
            if values[field]:
                text = f'Подтвердите или уточните поле «{LABELS[field]}»: {str(values[field])[:150]}'
            elif field == 'users' and industry == 'Образование':
                text = 'Кто будет пользоваться решением в учебном центре: администраторы, преподаватели или ученики? Какие действия им нужны?'
            questions.append(Question(id=f'q_{field}', field=field, text=text))
        return Analysis(**composition.model_dump(), missing_fields=missing, questions=questions)
