from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from starlette.exceptions import HTTPException

from app.api.routes import router
from app.config import settings
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title='TaskUp AI', version='1.0.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[s.strip() for s in settings.cors_origins.split(',') if s.strip()],
                   allow_methods=['GET', 'POST', 'PATCH'],
                   allow_headers=['Content-Type', 'X-Demo-Role', 'X-Demo-Actor-Id'])
app.include_router(router)


def error_response(status, code, message, details=None):
    return JSONResponse(status_code=status, content={'error': {'code': code, 'message': message, 'details': details or {}}})


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict) and 'code' in detail:
        return JSONResponse(status_code=exc.status_code, content={'error': detail})
    return error_response(exc.status_code, 'http_error', 'Запрос не может быть выполнен.')


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Do not echo arbitrary user values or Pydantic exception contexts.
    fields = [{'field': '.'.join(str(p) for p in e['loc']), 'type': e['type']} for e in exc.errors()]
    return error_response(422, 'validation_error', 'Проверьте заполнение полей и формат ссылки.', {'fields': fields})


@app.exception_handler(StaleDataError)
async def stale_error(request: Request, exc: StaleDataError):
    return error_response(409, 'version_conflict', 'Данные уже изменены другим запросом. Обновите страницу.')


@app.exception_handler(IntegrityError)
async def integrity_error(request: Request, exc: IntegrityError):
    return error_response(409, 'conflict', 'Такая запись уже существует или связанный ресурс изменён.')


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    return error_response(500, 'internal_error', 'Не удалось выполнить действие. Повторите попытку.')
