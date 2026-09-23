"""Execute the offline provider and save its actual input/output for documentation."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from app.config import Settings
from app.schemas import Answer
from app.services.ai.service import AIService

request = {
    'description': 'Мы учебный центр. Хотим навести порядок с оплатами.',
    'answers': [
        {'question_id': 'q_users', 'field': 'users', 'value': 'Два администратора'},
        {'question_id': 'q_data', 'field': 'data', 'value': 'Пока не знаю'},
    ],
}
result, info = AIService(Settings(_env_file=None, llm_provider='rule_based')).run(
    'compose_card', request['description'], 'Образование', [Answer.model_validate(a) for a in request['answers']])
(ROOT / 'docs' / 'AI_EXAMPLE.json').write_text(
    json.dumps({'input': request, 'output': {**info, **result.model_dump()}}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Saved actual UTF-8 fallback input/output.')
