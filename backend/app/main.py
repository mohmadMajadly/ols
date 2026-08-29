import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.routes import auth, groups, health, notes, quran, rubric, sessions, students, taxonomy, users
from app.core.limiter import limiter
from app.db.init_db import seed_admin, seed_note_taxonomy, seed_rubric_settings
from app.db.session import SessionLocal

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db = SessionLocal()
    try:
        seed_admin(db)
        seed_note_taxonomy(db)
        seed_rubric_settings(db)
    finally:
        db.close()
    yield


def _rate_limit_handler(_request: Request, _exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "محاولات كثيرة جداً، يرجى المحاولة لاحقاً"},
    )


def create_app() -> FastAPI:
    application = FastAPI(title="OLS API", lifespan=lifespan)
    application.state.limiter = limiter
    application.add_exception_handler(RateLimitExceeded, _rate_limit_handler)
    application.add_middleware(SlowAPIMiddleware)

    application.include_router(health.router)
    application.include_router(auth.router)
    application.include_router(users.router)
    application.include_router(groups.router)
    application.include_router(students.router)
    application.include_router(taxonomy.router)
    application.include_router(rubric.router)
    application.include_router(quran.router)
    application.include_router(sessions.router)
    application.include_router(notes.router)
    return application


app = create_app()
