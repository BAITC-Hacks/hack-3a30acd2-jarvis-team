from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import select, update

from app.api.dependencies import DB, Identity, check_version, fail, get_task, owned_task, require_role
from app.api.serializers import milestone_out, private_task, proposal_out, public_task
from app.config import settings
from app.models import Business, Milestone, Proposal, Task, Team, now
from app.schemas import (Answer, CreateTask, DraftUpdate, MilestoneCreate, PreviewRequest,
                         ProposalCreate, ProposalDecision, TaskCard, VersionRequest)
from app.services.ai.service import AIService
from app.services.scoring import calculate_score, meaningful

router = APIRouter(prefix='/api')


@router.get('/health')
def health():
    return {'status': 'ok', 'service': 'TaskUp AI', 'demo_mode': settings.demo_mode}


@router.get('/demo/profiles')
def profiles(db: DB):
    if not settings.demo_mode:
        fail(403, 'demo_disabled', 'Демонстрационный режим отключён.')
    return {
        'businesses': [{k: getattr(b, k) for k in ('id', 'name', 'demo_contact')} for b in db.scalars(select(Business).order_by(Business.id))],
        'teams': [{k: getattr(t, k) for k in ('id', 'name', 'interests', 'skills', 'technologies')} for t in db.scalars(select(Team).order_by(Team.id))],
    }


@router.get('/business/tasks')
def business_tasks(db: DB, actor: Identity):
    require_role(actor, 'business')
    return [private_task(t) for t in db.scalars(select(Task).where(Task.business_id == actor.id).order_by(Task.updated_at.desc(), Task.id.desc()))]


@router.post('/business/tasks', status_code=201)
def create_task(body: CreateTask, db: DB, actor: Identity):
    require_role(actor, 'business')
    task = Task(business_id=actor.id, **body.model_dump(), draft_card=TaskCard().model_dump(), score_breakdown=calculate_score(None))
    db.add(task)
    db.commit()
    return private_task(task)


@router.get('/business/tasks/{task_id}')
def business_task(task_id: int, db: DB, actor: Identity):
    return private_task(owned_task(db, actor, task_id))


@router.patch('/business/tasks/{task_id}/draft')
def update_draft(task_id: int, body: DraftUpdate, db: DB, actor: Identity):
    task = owned_task(db, actor, task_id)
    check_version(task, body.version)
    for field in ('industry', 'raw_description', 'answers', 'draft_card'):
        value = getattr(body, field)
        if value is not None:
            if field == 'draft_card':
                new = value.model_dump()
                task.evidence = {k: v for k, v in task.evidence.items()
                                 if task.draft_card.get(k.split('.')[0]) == new.get(k.split('.')[0])}
                task.draft_card = new
            elif field == 'answers':
                task.answers = [a.model_dump() for a in value]
                task.evidence = {}
            else:
                setattr(task, field, value)
                if field == 'raw_description':
                    task.evidence = {}
    task.updated_at = now()
    db.commit()
    return private_task(task)


def ai_action(task_id: int, body: VersionRequest, db: DB, actor: Identity, action: str):
    task = owned_task(db, actor, task_id)
    check_version(task, body.version)
    result, info = AIService(settings).run(action, task.raw_description, task.industry,
                                         [Answer.model_validate(a) for a in task.answers])
    task.ai_info = info
    if action == 'analyze_draft':
        task.questions = [q.model_dump() for q in result.questions]
    else:
        task.draft_card = result.card.model_dump()
        task.evidence = {k: [v.model_dump() for v in refs] for k, refs in result.evidence.items()}
    task.updated_at = now()
    db.commit()
    return {**private_task(task), 'analysis': result.model_dump() if action == 'analyze_draft' else None}


@router.post('/business/tasks/{task_id}/analyze')
def analyze(task_id: int, body: VersionRequest, db: DB, actor: Identity):
    return ai_action(task_id, body, db, actor, 'analyze_draft')


@router.post('/business/tasks/{task_id}/compose')
def compose(task_id: int, body: VersionRequest, db: DB, actor: Identity):
    return ai_action(task_id, body, db, actor, 'compose_card')


@router.post('/business/tasks/{task_id}/score-preview')
def preview(task_id: int, body: PreviewRequest, db: DB, actor: Identity):
    owned_task(db, actor, task_id)
    return calculate_score(body.card)


@router.post('/business/tasks/{task_id}/confirm')
def confirm(task_id: int, body: VersionRequest, db: DB, actor: Identity):
    task = owned_task(db, actor, task_id)
    check_version(task, body.version)
    # Snapshot and score are written by a single version-checked transaction.
    card = TaskCard.model_validate(task.draft_card).model_dump()
    if task.is_published and not meaningful(card['title']):
        fail(400, 'title_required', 'У опубликованной карточки должно быть название.')
    score = calculate_score(card)
    delta = score['total_score'] - task.readiness_score
    task.confirmed_card = card
    task.confirmed_industry = task.industry
    task.readiness_score = score['total_score']
    task.score_breakdown = score
    task.confirmed_at = now()
    task.updated_at = now()
    db.commit()
    return {**private_task(task), 'score_delta': delta}


@router.post('/business/tasks/{task_id}/publish')
def publish(task_id: int, body: VersionRequest, db: DB, actor: Identity):
    task = owned_task(db, actor, task_id)
    check_version(task, body.version)
    if task.confirmed_card is None or task.draft_card != task.confirmed_card or task.industry != task.confirmed_industry:
        fail(400, 'confirmation_required', 'Сначала подтвердите текущую карточку.')
    if not meaningful(task.confirmed_card.get('title')):
        fail(400, 'title_required', 'Добавьте и подтвердите название задачи.')
    task.is_published = True
    task.published_at = task.published_at or now()
    task.updated_at = now()
    db.commit()
    return private_task(task)


@router.get('/tasks')
def catalog(db: DB, industry: str | None = Query(default=None, max_length=80),
            readiness_level: Literal['Черновик', 'Рабочая', 'Готовая', 'Приоритетная'] | None = None,
            sort: Literal['score_desc', 'published_desc'] = 'score_desc'):
    query = select(Task).where(Task.is_published.is_(True), Task.confirmed_card.is_not(None))
    if industry:
        query = query.where(Task.confirmed_industry == industry)
    ranges = {'Черновик': (0, 39), 'Рабочая': (40, 69), 'Готовая': (70, 89), 'Приоритетная': (90, 100)}
    if readiness_level:
        query = query.where(Task.readiness_score.between(*ranges[readiness_level]))
    if sort == 'score_desc':
        query = query.order_by(Task.readiness_score.desc(), Task.published_at.asc(), Task.id.asc())
    else:
        query = query.order_by(Task.published_at.desc(), Task.id.asc())
    return [public_task(t) for t in db.scalars(query)]


def published_task(db, task_id):
    task = get_task(db, task_id)
    if not task.is_published or task.confirmed_card is None:
        fail(404, 'not_found', 'Опубликованная задача не найдена.')
    return task


@router.get('/tasks/{task_id}')
def task_detail(task_id: int, db: DB):
    return public_task(published_task(db, task_id))


@router.post('/tasks/{task_id}/proposals', status_code=201)
def create_proposal(task_id: int, body: ProposalCreate, db: DB, actor: Identity):
    require_role(actor, 'team')
    published_task(db, task_id)
    if db.scalar(select(Proposal).where(Proposal.task_id == task_id, Proposal.team_id == actor.id)):
        fail(409, 'duplicate_proposal', 'Ваша команда уже отправила предложение на эту задачу.')
    proposal = Proposal(task_id=task_id, team_id=actor.id, **body.model_dump())
    db.add(proposal)
    db.commit()
    return proposal_out(proposal)


@router.get('/business/tasks/{task_id}/proposals')
def business_proposals(task_id: int, db: DB, actor: Identity):
    owned_task(db, actor, task_id)
    return [proposal_out(p) for p in db.scalars(select(Proposal).where(Proposal.task_id == task_id).order_by(Proposal.id))]


def get_proposal(db, proposal_id):
    proposal = db.get(Proposal, proposal_id)
    if not proposal:
        fail(404, 'not_found', 'Предложение не найдено.')
    return proposal


@router.patch('/proposals/{proposal_id}/status')
def decide(proposal_id: int, body: ProposalDecision, db: DB, actor: Identity):
    require_role(actor, 'business')
    proposal = get_proposal(db, proposal_id)
    owned_task(db, actor, proposal.task_id)
    if proposal.milestones and proposal.status != body.status:
        fail(409, 'stage_in_progress', 'По предложению уже отправлен результат; решение зафиксировано.')
    proposal.status = body.status
    proposal.updated_at = now()
    db.commit()
    return proposal_out(proposal)


@router.get('/team/proposals')
def team_proposals(db: DB, actor: Identity):
    require_role(actor, 'team')
    proposals = list(db.scalars(select(Proposal).where(Proposal.team_id == actor.id).order_by(Proposal.id.desc())))
    points = sum(m.points_awarded for p in proposals for m in p.milestones if m.status == 'confirmed')
    return {'proposals': [proposal_out(p) for p in proposals], 'total_points': points}


@router.post('/proposals/{proposal_id}/milestones', status_code=201)
def submit_milestone(proposal_id: int, body: MilestoneCreate, db: DB, actor: Identity):
    require_role(actor, 'team')
    proposal = get_proposal(db, proposal_id)
    if proposal.team_id != actor.id:
        fail(403, 'forbidden', 'Предложение принадлежит другой команде.')
    if proposal.status != 'accepted':
        fail(400, 'not_accepted', 'Этап может отправить только выбранная команда.')
    if proposal.milestones:
        fail(409, 'duplicate_stage', 'Демонстрационный этап уже отправлен.')
    proposal.updated_at = now()  # version lock also protects against a concurrent rejection
    milestone = Milestone(proposal_id=proposal_id, **body.model_dump())
    db.add(milestone)
    db.commit()
    return milestone_out(milestone)


@router.post('/milestones/{milestone_id}/confirm')
def confirm_milestone(milestone_id: int, db: DB, actor: Identity):
    require_role(actor, 'business')
    milestone = db.get(Milestone, milestone_id)
    if not milestone:
        fail(404, 'not_found', 'Этап не найден.')
    owned_task(db, actor, milestone.proposal.task_id)
    if milestone.proposal.status != 'accepted':
        fail(400, 'not_accepted', 'Команда не выбрана для этой задачи.')
    # Set a single row to 10, never increment a balance. Concurrent/repeated requests cannot duplicate points.
    db.execute(update(Milestone).where(Milestone.id == milestone_id, Milestone.status == 'submitted')
               .values(status='confirmed', points_awarded=10, confirmed_at=now()))
    db.commit()
    db.refresh(milestone)
    return milestone_out(milestone)
