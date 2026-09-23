from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Business, Task, Team

DB = Annotated[Session, Depends(get_db)]


def fail(status: int, code: str, message: str, details=None):
    raise HTTPException(status_code=status, detail={'code': code, 'message': message, 'details': details or {}})


@dataclass
class Actor:
    role: str
    id: int


def get_actor(db: DB, x_demo_role: Annotated[str | None, Header()] = None,
              x_demo_actor_id: Annotated[str | None, Header()] = None):
    if not settings.demo_mode:
        fail(403, 'demo_disabled', 'Демонстрационный режим отключён.')
    if x_demo_role not in {'business', 'team'} or not x_demo_actor_id or not x_demo_actor_id.isascii() or not x_demo_actor_id.isdigit() or len(x_demo_actor_id) > 9:
        fail(401, 'invalid_profile', 'Выберите демонстрационный профиль.')
    actor_id = int(x_demo_actor_id)
    model = Business if x_demo_role == 'business' else Team
    if not db.get(model, actor_id):
        fail(401, 'invalid_profile', 'Демонстрационный профиль не найден.')
    return Actor(x_demo_role, actor_id)


Identity = Annotated[Actor, Depends(get_actor)]


def require_role(actor: Actor, role: str):
    if actor.role != role:
        fail(403, 'forbidden', 'Это действие недоступно выбранной роли.')


def get_task(db: Session, task_id: int) -> Task:
    task = db.get(Task, task_id)
    if not task:
        fail(404, 'not_found', 'Задача не найдена.')
    return task


def owned_task(db: Session, actor: Actor, task_id: int) -> Task:
    require_role(actor, 'business')
    task = get_task(db, task_id)
    if task.business_id != actor.id:
        fail(403, 'forbidden', 'Изменять задачу может только её владелец.')
    return task


def check_version(task: Task, version: int):
    if task.version != version:
        fail(409, 'version_conflict', 'Карточка уже изменена. Обновите страницу.', {'current_version': task.version})
