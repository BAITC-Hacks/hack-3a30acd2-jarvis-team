import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import delete

from app.database import SessionLocal, init_db
from app.models import Business, Milestone, Proposal, Task, Team
from app.schemas import TaskCard
from app.services.scoring import calculate_score

FIXTURES = Path(__file__).resolve().parents[2] / 'seed'


def read_fixture(name):
    return json.loads((FIXTURES / f'{name}.json').read_text(encoding='utf-8'))


def seed_database(db):
    for model, name in [(Business, 'businesses'), (Team, 'teams')]:
        for row in read_fixture(name):
            if db.get(model, row['id']) is None:
                db.add(model(**row))
    db.flush()
    cards = {row['task_id']: TaskCard.model_validate(row['card']).model_dump() for row in read_fixture('cards')}
    for row in read_fixture('descriptions'):
        if db.get(Task, row['id']) is not None:
            continue
        card = cards[row['id']]
        score = calculate_score(card)
        timestamp = datetime(2026, 9, 1, tzinfo=timezone.utc) + timedelta(hours=row['id'])
        db.add(Task(**row, draft_card=card, confirmed_card=card, confirmed_industry=row['industry'],
                    is_published=True, readiness_score=score['total_score'], score_breakdown=score,
                    confirmed_at=timestamp, published_at=timestamp, created_at=timestamp, updated_at=timestamp))
    db.flush()
    for row in read_fixture('proposals'):
        if db.get(Proposal, row['id']) is None:
            db.add(Proposal(**row))
    db.commit()


def main():
    parser = argparse.ArgumentParser(description='Load synthetic TaskUp AI demo fixtures.')
    parser.add_argument('--reset', action='store_true', help='Delete ALL data in the configured demo database before seeding')
    parser.add_argument('--yes', action='store_true', help='Explicitly authorize the reset')
    args = parser.parse_args()
    if args.reset and not args.yes:
        parser.error('Reset deletes all demo work. Use --reset --yes explicitly.')
    init_db()
    with SessionLocal() as db:
        if args.reset:
            for model in (Milestone, Proposal, Task, Team, Business):
                db.execute(delete(model))
            db.commit()
        seed_database(db)
    print('Synthetic seed ready. Re-running without --reset preserves existing work.')


if __name__ == '__main__':
    main()
