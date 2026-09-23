from app.models import Milestone, Proposal, Task
from app.services.scoring import calculate_score


def private_task(task: Task):
    result = {key: getattr(task, key) for key in (
        'id', 'business_id', 'industry', 'raw_description', 'questions', 'answers',
        'draft_card', 'confirmed_card', 'is_published', 'version', 'ai_info', 'evidence',
        'confirmed_at', 'published_at', 'created_at', 'updated_at')}
    result.update(score=task.score_breakdown or calculate_score(None),
                  preview_score=calculate_score(task.draft_card),
                  business_name=task.business.name,
                  has_unconfirmed_changes=(task.draft_card != task.confirmed_card or task.industry != task.confirmed_industry),
                  proposal_count=len(task.proposals))
    return result


def public_task(task: Task):
    return {'id': task.id, 'business_id': task.business_id, 'business_name': task.business.name,
            'industry': task.confirmed_industry, 'card': task.confirmed_card,
            'score': task.score_breakdown, 'published_at': task.published_at,
            'proposal_count': len(task.proposals)}


def milestone_out(milestone: Milestone):
    return {key: getattr(milestone, key) for key in (
        'id', 'proposal_id', 'stage_code', 'result_description', 'result_url',
        'status', 'points_awarded', 'submitted_at', 'confirmed_at')}


def proposal_out(proposal: Proposal):
    result = {key: getattr(proposal, key) for key in (
        'id', 'task_id', 'team_id', 'idea', 'plan', 'estimated_duration',
        'prototype_url', 'status', 'created_at', 'updated_at')}
    result.update(team_name=proposal.team.name, team_skills=proposal.team.skills,
                  team_technologies=proposal.team.technologies,
                  task_title=(proposal.task.confirmed_card or {}).get('title'),
                  milestones=[milestone_out(m) for m in proposal.milestones])
    return result
