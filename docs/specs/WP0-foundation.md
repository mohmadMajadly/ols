# WP0 — Foundation: Monorepo, Docker Dev Environment, Auth Core

Spec author: project manager (Fable). Executor: Sonnet sub-agent.
Working directory: `C:\Users\madar\Documents\OLS` (Windows 11 host, PowerShell + Git Bash available).

## Goal

Bootstrap the OLS platform ("منصة إدارة التسميع لمحفظي القرآن"): a monorepo with a fully Dockerized dev environment (host has ONLY Docker 29.x and Git — no Node, no Python), PostgreSQL, a FastAPI backend with production-grade auth/RBAC, and a React frontend shell with a working Arabic RTL login flow.

This app will eventually be deployed on a public internet server for a Quran memorization center (roles: admin/supervisor/teacher/student). Security is first-class from day one.

## Hard constraints

1. **Everything runs inside Docker.** Never run `npm`, `pip`, `python`, `pytest`, `vite` on the host — they don't exist. Use `docker compose run/exec` for every install, test, and codegen step (including creating the Vite project and Alembic migrations).
2. Do not modify `docs/PLAN.md` or anything under `docs/` except adding nothing — your deliverable is code.
3. Arabic RTL UI (`<html dir="rtl" lang="ar">`). All user-facing strings in Arabic.
4. Keep frontend styling MINIMAL and neutral in this WP (clean, unstyled-but-tidy). A dedicated design pass happens later — do NOT invent a visual identity, do NOT add component libraries, do NOT pick brand colors.
5. No paid/external services. No telemetry.

## Repository layout to create

```
OLS/
  .gitignore                # .env, node_modules, __pycache__, .pytest_cache, dist, *.pyc, pgdata, media/
  .env.example              # documented copy of every env var (no real secrets)
  docker-compose.yml
  README.md                 # Arabic: prerequisites, first run, daily commands, test commands
  backend/
    Dockerfile              # python:3.12-slim; dev CMD: uvicorn app.main:app --reload --host 0.0.0.0
    requirements.txt
    alembic.ini
    alembic/                # env.py wired to app settings; versions/
    app/
      __init__.py
      main.py               # create_app, routers, startup: run seed_admin
      core/
        config.py           # pydantic-settings: DATABASE_URL, SECRET_KEY, ADMIN_USERNAME, ADMIN_PASSWORD, ACCESS_TOKEN_EXPIRE_MINUTES, COOKIE_SECURE
        security.py         # Argon2 hash/verify (pwdlib[argon2]), JWT create/decode (pyjwt)
      db/
        base.py session.py init_db.py   # init_db: seed admin from env if no admin exists
      models/user.py
      schemas/user.py schemas/auth.py
      api/
        deps.py             # get_db, get_current_user (from cookie), require_roles(*roles)
        routes/health.py routes/auth.py routes/users.py
    tests/
      conftest.py test_auth.py test_users.py
  frontend/
    Dockerfile              # node:22-alpine; dev CMD: npm run dev -- --host 0.0.0.0
    package.json …          # Vite + React + TypeScript
    src/
      main.tsx App.tsx
      api/client.ts         # fetch wrapper, credentials: 'include', JSON errors
      auth/AuthContext.tsx  # loads /api/auth/me, login(), logout()
      pages/LoginPage.tsx   # Arabic RTL login form
      pages/ShellPage.tsx   # protected layout: app name "OLS", user name+role, logout button, empty main area "قيد الإنشاء"
      routes.tsx            # /login public; / protected (redirect to /login when unauthenticated)
      styles/…              # Tailwind v4 entry with EMPTY placeholder @theme (tokens come in a later design WP)
```

## docker-compose.yml requirements

- `db`: `postgres:16-alpine`; env from `.env`; named volume `pgdata`; healthcheck `pg_isready`; NOT port-mapped to host (internal only).
- `backend`: build `./backend`; bind-mount `./backend` for reload; `depends_on: db: condition: service_healthy`; port `8000:8000`; env from `.env`.
- `frontend`: `node:22-alpine` (or built from `./frontend/Dockerfile`); bind-mount `./frontend`; **named volume over `/app/node_modules`** (critical on Windows bind mounts); port `5173:5173`; command runs `npm install` if needed then dev server.
- Vite dev server proxies `/api` → `http://backend:8000` (so no CORS config needed anywhere).

## Backend specification

**Dependencies** (`requirements.txt`, pinned): fastapi, uvicorn[standard], sqlalchemy>=2.0, alembic, psycopg[binary], pydantic-settings, pwdlib[argon2], pyjwt, slowapi, pytest, pytest-asyncio, httpx.

**User model** (`users` table): `id` UUID PK (server-generated), `username` TEXT unique — store/compare lowercase, `password_hash` TEXT, `full_name` TEXT, `role` native PG enum `user_role` = `admin | supervisor | teacher | student`, `is_active` BOOL default true, `created_at` timestamptz default now. Create via Alembic migration (initial revision), not `create_all`.

**Auth flow**:
- `POST /api/auth/login` `{username, password}` → verify Argon2; on success set JWT (claims: `sub`=user id, `role`, `exp`) in cookie `ols_session`: `httponly`, `samesite=lax`, `secure` from `COOKIE_SECURE` env (false in dev, true in prod). Response: user object (id, username, full_name, role). 401 with generic Arabic message «اسم المستخدم أو كلمة المرور غير صحيحة» for both unknown-user and wrong-password (no user enumeration).
- Rate-limit login with slowapi: 5/minute per IP → 429.
- `POST /api/auth/logout` → clear cookie.
- `GET /api/auth/me` → current user or 401.
- `get_current_user`: read cookie, decode JWT, load user, reject if missing/inactive. `require_roles('admin', ...)` dependency for RBAC.

**Users API** (admin-only via `require_roles('admin')`):
- `GET /api/users` (list, newest first), `POST /api/users` (create: username, password, full_name, role; 409 on duplicate username), `PATCH /api/users/{id}` (full_name, role, is_active, optional new password), no hard delete (deactivate via `is_active=false`).
- Never return `password_hash` in any response (schema-level exclusion).

**Seed**: on startup, if no user with role `admin` exists, create one from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env; log a clear Arabic warning if those env vars are missing. Never re-create or overwrite an existing admin.

**Health**: `GET /api/health` → `{status: "ok", db: true|false}` (executes `SELECT 1`).

**Tests** (run inside the backend container against the compose `db`, separate test database created/dropped by conftest):
- login success sets cookie; wrong password → 401; inactive user → 401; `/me` without cookie → 401 and with cookie → user.
- users CRUD as admin works; same endpoints as a `teacher` user → 403; duplicate username → 409.
- password is stored as Argon2 (starts with `$argon2`), and never appears in any API response.

## Frontend specification

- Scaffold Vite React-TS **inside a container** (`docker compose run --rm frontend sh -c "npm create vite@latest . -- --template react-ts"` or equivalent approach).
- Deps: `react-router-dom`, `@tanstack/react-query`, `tailwindcss` v4 (+ `@tailwindcss/vite`). Nothing else. No UI kit, no icon pack.
- Login page: centered form, labels «اسم المستخدم» / «كلمة المرور», button «دخول», server errors shown in Arabic. On success → `/`.
- Protected shell: verifies session via `/api/auth/me` (react-query); while loading show a minimal centered spinner; unauthenticated → redirect `/login`. Header shows «OLS» + user's `full_name` and Arabic role label (مدير/مشرف/معلم/طالب) + «تسجيل الخروج».
- System Arabic font stack for now (`system-ui`); real typography comes in the design WP.

## Git

- `git init` (branch `main`). If `git config user.email` is unset globally, set repo-local: `user.name "mohmadmajadly7"`, `user.email "mohmadmajadly7@gmail.com"`.
- Meaningful commits per logical step (scaffold, backend auth, frontend shell, compose, tests). Do not commit `.env`, `node_modules`, `pgdata`.

## Acceptance criteria — verify each one yourself and include proof in your report

1. From a clean state: `copy .env.example .env` (fill dev values) then `docker compose up -d --build` succeeds; `docker compose ps` shows db healthy, backend and frontend running.
2. `GET http://localhost:8000/api/health` → `{"status":"ok","db":true}` (curl proof).
3. Full auth round-trip via curl: login with seeded admin (cookie jar) → `/api/auth/me` returns admin → logout → `/me` 401. Wrong password → 401. 6 rapid logins → 429.
4. RBAC proof: create a `teacher` user as admin, login as teacher, `GET /api/users` → 403.
5. `docker compose exec backend pytest` → all green (paste summary).
6. `http://localhost:5173` renders the Arabic RTL login page; logging in shows the shell with the user's name; logout returns to login. Verify at minimum with curl on the Vite server + a note on manual flow; if you can render/screenshot, better.
7. Alembic: `alembic upgrade head` is what created the schema (no `create_all` in app startup).
8. Repo committed with clean `git status` at the end.

## Report format (your final message)

1. What was built (short). 2. Deviations from this spec and why (if any). 3. Proof outputs for each acceptance criterion (trimmed). 4. Known issues / anything left for the manager to review. Report in Arabic.
