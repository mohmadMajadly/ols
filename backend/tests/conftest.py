"""Pytest fixtures.

Tests run inside the backend container against the same PostgreSQL
server used by docker-compose, but against a separate, disposable
database ("ols_test") that this file creates before the test session
and drops afterwards. Alembic migrations (not create_all) build the
schema in that database.

IMPORTANT: the DATABASE_URL environment variable is rewritten to point
at the test database *before* anything under `app` is imported, so
that the app's settings/engine singleton picks up the test URL.
"""

import os
import subprocess
import sys

from sqlalchemy.engine import make_url

_raw_url = make_url(os.environ["DATABASE_URL"])
TEST_DB_NAME = "ols_test"
# NOTE: str(url) masks the password as "***" (safe-for-logging repr).
# render_as_string(hide_password=False) is required to get a real,
# usable connection string here.
TEST_DATABASE_URL = _raw_url.set(database=TEST_DB_NAME).render_as_string(hide_password=False)
_MAINTENANCE_URL = _raw_url.set(database="postgres").render_as_string(hide_password=False)

# Rewrite before importing anything from `app`.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "AdminPass123!")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "60")
os.environ.setdefault("COOKIE_SECURE", "false")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _drop_test_db() -> None:
    admin_engine = create_engine(_MAINTENANCE_URL, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        conn.execute(
            text(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = :dbname AND pid <> pg_backend_pid()"
            ),
            {"dbname": TEST_DB_NAME},
        )
        conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}"'))
    admin_engine.dispose()


def _create_test_db() -> None:
    admin_engine = create_engine(_MAINTENANCE_URL, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
    admin_engine.dispose()


def _run_migrations() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_ROOT,
        env={**os.environ, "DATABASE_URL": TEST_DATABASE_URL},
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"alembic upgrade head failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )


@pytest.fixture(scope="session", autouse=True)
def _test_database():
    _drop_test_db()
    _create_test_db()
    _run_migrations()
    yield
    _drop_test_db()


# Imported after DATABASE_URL has been rewritten above.
from app.api.deps import get_db  # noqa: E402
from app.core.limiter import limiter  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture()
def client(db_session):
    def _get_db_override():
        yield db_session

    app.dependency_overrides[get_db] = _get_db_override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def make_webm_audio(tmp_path):
    """مصنع يولّد صوت webm/opus حقيقي عبر ffmpeg (lavfi sine) - يُستخدم
    لاختبار دمج WP4a (chunks -> segment -> ffmpeg remux/concat) بمدخلات
    صالحة فعلاً بدل بايتات وهمية، لأن finalize الآن يستدعي ffmpeg دوماً."""

    def _make(duration_s: float, frequency: int = 440) -> bytes:
        out_path = tmp_path / f"gen_{frequency}_{duration_s}.webm"
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                f"sine=frequency={frequency}:duration={duration_s}",
                "-c:a",
                "libopus",
                str(out_path),
            ],
            capture_output=True,
            timeout=30,
        )
        assert result.returncode == 0, result.stderr.decode("utf-8", errors="replace")
        return out_path.read_bytes()

    return _make
