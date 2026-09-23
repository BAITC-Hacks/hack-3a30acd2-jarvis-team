import pytest

from app.schemas import TaskCard
from app.seed import read_fixture
from app.services.scoring import calculate_score, level


def full_card():
    return read_fixture('cards')[0]['card']


def test_empty_zero_full_hundred():
    assert calculate_score(TaskCard())['total_score'] == 0
    assert calculate_score(full_card())['total_score'] == 100


@pytest.mark.parametrize('value', ['  НЕ   ЗНАЮ ', 'не указано', 'TBD', 'Потом', 'Пока не знаю', 'уточняется', '...', 'unknown'])
def test_placeholders_zero(value):
    card = {k: value for k in TaskCard.model_fields if k != 'success_criteria'}
    card['success_criteria'] = [{'criterion': value, 'expected_value': value, 'verification_method': value}]
    assert calculate_score(card)['total_score'] == 0


@pytest.mark.parametrize('value', ['данных нет', 'Нет данных', 'материалов нет', 'данные отсутствуют'])
def test_absent_data_not_materials(value):
    assert calculate_score({'data': value, 'data_source': value})['total_score'] == 0


@pytest.mark.parametrize('score,expected', [(39, 'Черновик'), (40, 'Рабочая'), (69, 'Рабочая'), (70, 'Готовая'), (89, 'Готовая'), (90, 'Приоритетная')])
def test_boundaries(score, expected):
    assert level(score) == expected


def test_removal_pair_and_bounded_suggestions():
    card = full_card()
    card['feedback_process'] = None
    result = calculate_score(card)
    assert result['total_score'] == 95
    assert result['improvement_suggestions'][0]['available_points'] == 5
    card['success_criteria'][0]['verification_method'] = None
    assert calculate_score(card)['total_score'] == 80
    assert calculate_score({'deadline': 'жёсткого срока нет'})['total_score'] == 5


def test_no_length_or_popularity_heuristics():
    assert calculate_score({'need': 'Учёт'})['total_score'] == 10
    assert calculate_score({'need': 'Учёт ' * 100})['total_score'] == 10
