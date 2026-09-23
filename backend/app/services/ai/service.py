import httpx

from app.config import Settings
from app.schemas import Analysis, Answer, Composition, TaskCard
from app.services.ai.fallback import RuleBasedFallback, source_map
from app.services.ai.provider import AIProvider, OpenAICompatibleProvider
from app.services.scoring import meaningful


def grounded(result: Composition, description: str, answers: list[Answer]):
    """Drop unsupported leaves; one quote cannot validate an entire criteria array."""
    sources = source_map(description, answers)
    card = result.card.model_dump()
    evidence = {}
    removed = []
    unknown = {a.field for a in answers if a.value is None or
               isinstance(a.value, str) and not meaningful(a.value, a.field)}
    allowed_paths = set(card) - {'success_criteria'}
    allowed_paths.update(f'success_criteria.{i}.{key}' for i, row in enumerate(card['success_criteria']) for key in row)
    if set(result.evidence) - allowed_paths:
        raise ValueError('Unexpected evidence field')

    def verified(path, value):
        field = path.split('.')[0]
        if not meaningful(value, field) or field in unknown:
            return None
        refs = result.evidence.get(path, [])
        valid = [ref for ref in refs if ref.source_id in sources and ref.quote in sources[ref.source_id]
                 and meaningful(ref.quote, field)]
        if not valid:
            removed.append(path)
            return None
        evidence[path] = valid
        return value

    for field, value in card.items():
        if field == 'success_criteria':
            for i, row in enumerate(value):
                for key, text in row.items():
                    row[key] = verified(f'{field}.{i}.{key}', text)
        else:
            card[field] = verified(field, value)
    result.card = TaskCard.model_validate(card)
    result.evidence = evidence
    if isinstance(result, Analysis):
        result.missing_fields = [f for f, v in card.items() if not v]
    return result, removed


class AIService:
    def __init__(self, settings: Settings, provider: AIProvider | None = None):
        self.settings = settings
        self.provider = provider or OpenAICompatibleProvider(settings)
        self.fallback = RuleBasedFallback()

    def run(self, action: str, description: str, industry: str, answers: list[Answer]):
        args = (description, industry, answers) if action == 'analyze_draft' else (description, answers)
        mode = 'rule_based'
        reason = 'Локальный резервный режим: внешняя модель не настроена. Используются шаблоны и ваши ответы.'
        if self.settings.llm_provider == 'openai_compatible' and self.settings.llm_api_key and self.settings.llm_model:
            try:
                output = getattr(self.provider, action)(*args)
                schema = Analysis if action == 'analyze_draft' else Composition
                output = schema.model_validate(output.model_dump(), strict=True)
                output, removed = grounded(output, description, answers)
                message = 'Внешний AI. Проверьте факты и цитаты перед подтверждением.'
                if removed:
                    message += ' Поля без проверяемых цитат удалены: ' + ', '.join(removed) + '.'
                return output, {'mode': 'llm', 'message': message}
            except httpx.TimeoutException:
                reason = 'Внешний AI не ответил вовремя. Включён локальный резервный режим.'
            except httpx.HTTPError:
                reason = 'Внешний AI недоступен. Включён локальный резервный режим.'
            except (ValueError, KeyError, IndexError, TypeError, AttributeError):
                reason = 'Ответ внешнего AI не прошёл проверку. Включён локальный резервный режим.'
        output = getattr(self.fallback, action)(*args)
        output, _ = grounded(output, description, answers)
        return output, {'mode': mode, 'message': reason}
