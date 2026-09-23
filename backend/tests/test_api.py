from sqlalchemy import func, select
from sqlalchemy.orm.exc import StaleDataError
import pytest

from app.models import Business, Milestone, Proposal, Task, Team
from app.schemas import TaskCard
from app.seed import read_fixture, seed_database
from app.services.scoring import calculate_score
from conftest import headers


def ok(response, status=200):
    assert response.status_code == status, response.text
    return response.json()


def change(client, task, action, **body):
    method = client.patch if action == 'draft' else client.post
    return ok(method(f"/api/business/tasks/{task['id']}/{action}", headers=headers(), json={'version': task['version'], **body}))


def new_task(client):
    return ok(client.post('/api/business/tasks', headers=headers(), json={'industry': 'Образование', 'raw_description': 'Мы небольшой учебный центр. Сейчас отмечаем оплату курсов вручную. Хотим навести порядок с оплатами.'}), 201)


def proposal_body():
    return {'idea': 'Создадим реестр оплат', 'plan': 'Импортировать CSV, добавить поиск, проверить результаты', 'estimated_duration': '2 недели', 'prototype_url': None}


def test_end_to_end(client):
    task = new_task(client)
    task = change(client, task, 'analyze')
    assert len(task['questions']) >= 3
    assert task['ai_info']['mode'] == 'rule_based'
    answers = [{'field': 'title', 'question_id': 'q_title', 'value': 'Учёт оплат'},
               {'field': 'users', 'question_id': 'q_users', 'value': 'Два администратора'},
               {'field': 'data', 'question_id': 'q_data', 'value': 'Пока не знаю'}]
    task = change(client, task, 'draft', answers=answers)
    task = change(client, task, 'compose')
    assert task['draft_card']['users'] == 'Два администратора'
    assert task['draft_card']['data'] is None
    assert task['score']['total_score'] == 0
    task = change(client, task, 'confirm')
    assert task['score']['total_score'] == 30
    task = change(client, task, 'publish')
    public = ok(client.get(f"/api/tasks/{task['id']}"))
    assert public['score']['readiness_level'] == 'Черновик'
    assert 'draft_card' not in public and 'raw_description' not in public and 'answers' not in public
    p = ok(client.post(f"/api/tasks/{task['id']}/proposals", headers=headers('team'), json=proposal_body()), 201)
    assert ok(client.get('/api/team/proposals', headers=headers('team')))['total_points'] == 0
    assert client.post(f"/api/proposals/{p['id']}/milestones", headers=headers('team'), json={'result_description': 'Создали реестр оплат'}).status_code == 400
    p = ok(client.patch(f"/api/proposals/{p['id']}/status", headers=headers(), json={'status': 'accepted'}))
    assert ok(client.get('/api/team/proposals', headers=headers('team')))['total_points'] == 0
    m = ok(client.post(f"/api/proposals/{p['id']}/milestones", headers=headers('team'), json={'result_description': 'Создали реестр оплат и проверили импорт', 'result_url': 'https://example.org/demo'}), 201)
    assert m['points_awarded'] == 0
    assert ok(client.get('/api/team/proposals', headers=headers('team')))['total_points'] == 0
    assert client.post(f"/api/milestones/{m['id']}/confirm", headers=headers('team')).status_code == 403
    assert client.post(f"/api/milestones/{m['id']}/confirm", headers=headers('business', 2)).status_code == 403
    first = ok(client.post(f"/api/milestones/{m['id']}/confirm", headers=headers()))
    second = ok(client.post(f"/api/milestones/{m['id']}/confirm", headers=headers()))
    assert first == second
    assert first['points_awarded'] == 10
    assert ok(client.get('/api/team/proposals', headers=headers('team')))['total_points'] == 10
    assert client.post(f"/api/proposals/{p['id']}/milestones", headers=headers('team'), json={'result_description': 'Повторная отправка прототипа'}).status_code == 409
    assert client.patch(f"/api/proposals/{p['id']}/status", headers=headers(), json={'status': 'rejected'}).status_code == 409
    assert ok(client.get(f"/api/tasks/{task['id']}"))['score']['total_score'] == 30


def test_public_snapshot_and_version_conflict(client):
    task = ok(client.get('/api/business/tasks/1', headers=headers()))
    before = ok(client.get('/api/tasks/1'))
    old_version = task['version']
    task = change(client, task, 'draft', draft_card={**task['draft_card'], 'data': None}, industry='Другое')
    assert ok(client.get('/api/tasks/1')) == before
    assert task['preview_score']['total_score'] == 90
    assert client.post('/api/business/tasks/1/confirm', headers=headers(), json={'version': old_version}).status_code == 409
    assert client.post('/api/business/tasks/1/publish', headers=headers(), json={'version': task['version']}).status_code == 400
    task = change(client, task, 'confirm')
    assert task['score_delta'] == -10
    after = ok(client.get('/api/tasks/1'))
    assert after['score']['total_score'] == 90 and after['industry'] == 'Другое'
    assert after['card']['data'] is None


def test_publication_needs_title_confirmation_but_no_minimum(client):
    task = new_task(client)
    assert client.get(f"/api/tasks/{task['id']}").status_code == 404
    assert client.post(f"/api/business/tasks/{task['id']}/publish", headers=headers(), json={'version': task['version']}).status_code == 400
    task = change(client, task, 'confirm')
    assert client.post(f"/api/business/tasks/{task['id']}/publish", headers=headers(), json={'version': task['version']}).status_code == 400
    task = change(client, task, 'draft', draft_card={'title': 'Новая задача'})
    task = change(client, task, 'confirm')
    task = change(client, task, 'publish')
    assert task['score']['total_score'] == 0
    ok(client.post(f"/api/tasks/{task['id']}/proposals", headers=headers('team'), json=proposal_body()), 201)


def test_catalog_filters_sort_and_low_score(client):
    catalog = ok(client.get('/api/tasks'))
    assert [t['score']['total_score'] for t in catalog] == [100, 85, 65, 45, 20]
    assert {t['score']['readiness_level'] for t in catalog} == {'Черновик', 'Рабочая', 'Готовая', 'Приоритетная'}
    filtered = ok(client.get('/api/tasks', params={'industry': 'Образование', 'readiness_level': 'Рабочая'}))
    assert [t['id'] for t in filtered] == [5]
    latest = ok(client.get('/api/tasks', params={'sort': 'published_desc'}))
    assert [t['id'] for t in latest] == [5, 4, 3, 2, 1]
    ok(client.post('/api/tasks/4/proposals', headers=headers('team'), json=proposal_body()), 201)
    assert client.get('/api/tasks?sort=unsupported').status_code == 422


def test_equal_scores_stable_order(client):
    task = ok(client.get('/api/business/tasks/5', headers=headers()))
    task = change(client, task, 'draft', draft_card=read_fixture('cards')[0]['card'])
    change(client, task, 'confirm')
    assert [t['id'] for t in ok(client.get('/api/tasks'))][:2] == [1, 5]


def test_multiple_teams_and_no_limit(client, db):
    for i in (1, 2):
        ok(client.patch(f'/api/proposals/{i}/status', headers=headers(), json={'status': 'accepted'}))
    proposals = ok(client.get('/api/business/tasks/1/proposals', headers=headers()))
    assert [p['status'] for p in proposals] == ['accepted', 'accepted']
    with db() as session:
        session.add(Team(id=6, name='Шестая демо-команда', interests=[], skills=[], technologies=[]))
        session.commit()
    for i in range(1, 7):
        ok(client.post('/api/tasks/4/proposals', headers=headers('team', i), json=proposal_body()), 201)
    proposals = ok(client.get('/api/business/tasks/4/proposals', headers=headers('business', 2)))
    assert len(proposals) == 6
    assert client.post('/api/tasks/4/proposals', headers=headers('team'), json=proposal_body()).status_code == 409


@pytest.mark.parametrize('path,method,body,actor', [
    ('/api/proposals/1/status', 'patch', {'status': 'accepted'}, headers('team')),
    ('/api/business/tasks/1/draft', 'patch', {'version': 1, 'draft_card': {}}, headers('business', 2)),
    ('/api/business/tasks/1/confirm', 'post', {'version': 1}, headers('team')),
    ('/api/business/tasks/1/compose', 'post', {'version': 1}, headers('business', 2)),
    ('/api/business/tasks/1/proposals', 'get', None, headers('business', 2)),
    ('/api/tasks/1/proposals', 'post', proposal_body(), headers()),
])
def test_permissions(client, path, method, body, actor):
    response = client.request(method, path, headers=actor, **({'json': body} if body is not None else {}))
    assert response.status_code == 403
    assert set(response.json()['error']) == {'code', 'message', 'details'}


def test_validation_profiles_urls_and_secret_fields(client):
    assert client.get('/api/business/tasks').status_code == 401
    assert client.get('/api/business/tasks', headers=headers('business', 900)).status_code == 401
    assert client.get('/api/business/tasks', headers={'X-Demo-Role': 'admin', 'X-Demo-Actor-Id': '1'}).status_code == 401
    assert client.get('/api/tasks/999').status_code == 404
    for url in ('javascript:alert(1)', 'file:///secret.txt', 'ftp://example.org/file'):
        response = client.post('/api/tasks/4/proposals', headers=headers('team'), json={**proposal_body(), 'prototype_url': url})
        assert response.status_code == 422
        assert url not in response.text
    response = client.patch('/api/business/tasks/1/draft', headers=headers(), json={'version': 1, 'draft_card': {'score': 100}})
    assert response.status_code == 422
    assert client.post('/api/business/tasks', headers=headers(), json={'industry': ' ', 'raw_description': ' '}).status_code == 422
    assert client.post('/api/tasks/4/proposals', headers=headers('team'), json={**proposal_body(), 'idea': '   '}).status_code == 422


def test_seed_idempotent_and_complete(db):
    with db() as session:
        seed_database(session)
        for model, count in ((Task, 5), (Team, 5), (Proposal, 5), (Business, 3)):
            assert session.scalar(select(func.count()).select_from(model)) == count
        for task in session.scalars(select(Task)):
            assert set(task.draft_card) == set(TaskCard.model_fields)
            assert task.raw_description
            assert task.readiness_score == calculate_score(task.confirmed_card)['total_score']


def test_optimistic_lock_is_database_enforced(db):
    with db() as first, db() as second:
        a, b = first.get(Task, 1), second.get(Task, 1)
        a.industry = 'Первое изменение'
        first.commit()
        b.industry = 'Второе изменение'
        with pytest.raises(StaleDataError):
            second.commit()
