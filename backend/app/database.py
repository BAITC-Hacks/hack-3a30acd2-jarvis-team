from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import BACKEND_DIR, settings


class Base(DeclarativeBase):
    pass


def make_engine(url: str):
    result = create_engine(url, connect_args={'check_same_thread': False, 'timeout': 15})

    @event.listens_for(result, 'connect')
    def configure_sqlite(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')
        connection.execute('PRAGMA busy_timeout=15000')

    return result


(BACKEND_DIR / 'data').mkdir(exist_ok=True)
engine = make_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db():
    with SessionLocal() as session:
        try:
            yield session
        except Exception:
            session.rollback()
            raise


def init_db():
    from app import models  # noqa: F401
    Base.metadata.create_all(engine)
