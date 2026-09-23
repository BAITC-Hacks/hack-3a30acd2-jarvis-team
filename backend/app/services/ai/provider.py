import json
from pathlib import Path
from typing import Protocol

import httpx

from app.config import Settings
from app.schemas import Analysis, Answer, Composition
from app.services.ai.fallback import source_map

PROMPTS = Path(__file__).resolve().parents[3] / 'prompts'


class AIProvider(Protocol):
    def analyze_draft(self, description: str, industry: str, answers: list[Answer]) -> Analysis: ...
    def compose_card(self, description: str, answers: list[Answer]) -> Composition: ...


class OpenAICompatibleProvider:
    """POST Chat Completions with JSON mode, then strict local schema/evidence validation."""

    def __init__(self, settings: Settings):
        self.settings = settings

    def _call(self, prompt: str, data: dict, schema):
        instruction = (PROMPTS / prompt).read_text(encoding='utf-8')
        instruction += '\nJSON schema:\n' + json.dumps(schema.model_json_schema(), ensure_ascii=False)
        with httpx.Client(timeout=self.settings.llm_timeout_seconds, follow_redirects=False) as client:
            response = client.post(
                self.settings.llm_base_url.rstrip('/') + '/chat/completions',
                headers={'Authorization': f'Bearer {self.settings.llm_api_key}'},
                json={'model': self.settings.llm_model,
                      'messages': [{'role': 'system', 'content': instruction},
                                   {'role': 'user', 'content': json.dumps(data, ensure_ascii=False)}],
                      'response_format': {'type': 'json_object'}, 'store': False},
            )
            response.raise_for_status()
            if len(response.content) > 250_000:
                raise ValueError('Oversized AI response')
            choice = response.json()['choices'][0]
            if choice.get('finish_reason') != 'stop' or choice['message'].get('refusal'):
                raise ValueError('Incomplete or refused response')
            return schema.model_validate_json(choice['message']['content'], strict=True)

    def analyze_draft(self, description: str, industry: str, answers: list[Answer]) -> Analysis:
        return self._call('analyze_task.txt', {'sources': source_map(description, answers), 'industry': industry,
                                            'answers': [a.model_dump() for a in answers]}, Analysis)

    def compose_card(self, description: str, answers: list[Answer]) -> Composition:
        return self._call('compose_card.txt', {'sources': source_map(description, answers),
                                            'answers': [a.model_dump() for a in answers]}, Composition)
