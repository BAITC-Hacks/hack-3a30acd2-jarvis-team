import json

import httpx
import pytest
from pydantic import ValidationError

from app.config import Settings
from app.schemas import Analysis, Answer, Composition, Evidence, TaskCard
from app.services.ai.fallback import RuleBasedFallback
from app.services.ai.provider import OpenAICompatibleProvider
from app.services.ai.service import AIService, grounded


def settings():
    return Settings(_env_file=None, llm_provider='openai_compatible', llm_api_key='test-key-not-real', llm_model='test-model-not-real')


def test_fallback_schema_questions_unknown_evidence():
    provider = RuleBasedFallback()
    description = 'Нераспознанное описание, без явных фактов для схемы.'
    answers = [Answer(field='data', question_id='q_data', value='Пока не знаю'),
               Answer(field='users', question_id='q_users', value='Два администратора')]
    result = provider.analyze_draft(description, 'Образование', answers)
    assert 3 <= len(result.questions) <= 5
    assert 'users' not in [q.field for q in result.questions]
    assert result.card.data is None and result.card.deadline is None and result.card.contact is None
    assert result.card.users == 'Два администратора'
    assert result.card.context is None
    assert result.evidence['users'][0].quote == 'Два администратора'
    Analysis.model_validate(result.model_dump(), strict=True)


def test_placeholder_overrides_previous_description():
    result = RuleBasedFallback().compose_card('Данные и материалы: CSV оплат', [Answer(field='data', question_id='q_data', value='Пока не знаю')])
    assert result.card.data is None


def test_missing_or_invalid_evidence_is_removed():
    result = Composition(card=TaskCard(users='Сто человек', deadline='Завтра', contact='fake@example.org'),
                         evidence={'users': [Evidence(source_id='description', quote='Нет этой цитаты')],
                                   'deadline': [Evidence(source_id='missing_source', quote='Завтра')]})
    safe, removed = grounded(result, 'Мы учебный центр.', [])
    assert safe.card.users is None and safe.card.deadline is None and safe.card.contact is None
    assert len(removed) == 3


def test_criteria_each_leaf_needs_evidence():
    result = Composition(card=TaskCard(success_criteria=[{'criterion': 'Импорт', 'expected_value': '100%', 'verification_method': 'CSV'}]),
                         evidence={'success_criteria.0.criterion': [Evidence(source_id='description', quote='Импорт')]})
    safe, _ = grounded(result, 'Импорт', [])
    assert safe.card.success_criteria[0].criterion == 'Импорт'
    assert safe.card.success_criteria[0].expected_value is None
    assert safe.card.success_criteria[0].verification_method is None


def test_extra_fields_question_count_and_ids_rejected():
    with pytest.raises(ValidationError):
        Composition.model_validate({'card': {'score': 100}, 'evidence': {}, 'confirmed': True})
    with pytest.raises(ValidationError):
        Analysis.model_validate({'card': {}, 'evidence': {}, 'missing_fields': [], 'questions': []})
    with pytest.raises(ValidationError):
        Answer(field='users', question_id='q_contact', value='Кто-то')


@pytest.mark.parametrize('failure', ['timeout', 'http', 'json', 'schema', 'incomplete'])
def test_real_adapter_failure_falls_back(monkeypatch, failure):
    def post(self, url, **kwargs):
        assert url.endswith('/chat/completions')
        assert kwargs['json']['model'] == 'test-model-not-real'
        assert kwargs['json']['response_format'] == {'type': 'json_object'}
        request = httpx.Request('POST', url)
        if failure == 'timeout':
            raise httpx.ReadTimeout('secret internal text', request=request)
        if failure == 'http':
            return httpx.Response(500, text='secret internal text', request=request)
        content = '{broken' if failure == 'json' else json.dumps({'card': {'selected_team_id': 2}, 'evidence': {}})
        return httpx.Response(200, json={'choices': [{'finish_reason': 'length' if failure == 'incomplete' else 'stop', 'message': {'content': content}}]}, request=request)
    monkeypatch.setattr(httpx.Client, 'post', post)
    result, info = AIService(settings()).run('compose_card', 'Мы учебный центр.', 'Образование', [])
    assert info['mode'] == 'rule_based'
    assert 'secret' not in info['message'] and 'test-key' not in info['message']
    assert result.card.context == 'Мы учебный центр.'


def test_adapter_success_http_payload_and_grounding(monkeypatch):
    def post(self, url, **kwargs):
        content = json.dumps({'card': TaskCard(context='Мы учебный центр.').model_dump(),
                              'evidence': {'context': [{'source_id': 'description', 'quote': 'Мы учебный центр.'}]}})
        assert 'industry' not in json.loads(kwargs['json']['messages'][1]['content'])
        return httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': content}}]}, request=httpx.Request('POST', url))
    monkeypatch.setattr(httpx.Client, 'post', post)
    output, info = AIService(settings()).run('compose_card', 'Мы учебный центр.', 'Образование', [])
    assert info['mode'] == 'llm'
    assert output.card.context == 'Мы учебный центр.'


def test_no_key_never_calls_provider():
    class NeverProvider:
        def compose_card(self, *args):
            raise AssertionError('must not call')
    config = settings().model_copy(update={'llm_api_key': ''})
    result, info = AIService(config, NeverProvider()).run('compose_card', 'Неизвестная задача.', 'Агро', [])
    assert info['mode'] == 'rule_based'
    assert result.card == TaskCard()
