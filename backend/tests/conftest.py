import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.seed import seed_database


@pytest.fixture
def db():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    @event.listens_for(engine, 'connect')
    def fk(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        seed_database(session)
    yield factory
    engine.dispose()


@pytest.fixture
def client(db, monkeypatch):
    monkeypatch.setattr(settings, 'llm_provider', 'rule_based')
    monkeypatch.setattr(settings, 'demo_mode', True)
    def override():
        with db() as session:
            try:
                yield session
            except Exception:
                session.rollback()
                raise
    app.dependency_overrides[get_db] = override
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client
    app.dependency_overrides.clear()


def headers(role='business', actor_id=1):
    return {'X-Demo-Role': role, 'X-Demo-Actor-Id': str(actor_id)}
