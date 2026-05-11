# Atmos Planning — Agent Guide

> Cross-tool fallback для Cursor / Aider / Codex / Jules / Copilot. Для Claude Code основной entrypoint — `.claude/CLAUDE.md`.

## Overview

Atmos Planning — система управления операционными задачами для отеля/виллы на Бали. Backend FastAPI + Postgres + Redis + MinIO + два фронта (Vite/React админка `lovable_frontend` и Next.js supervisor mobile-веб) + ai_monitor (python loop) + button_bot (Playwright QA). Хостится на Hetzner.

## Stack
- Backend: Python / FastAPI / SQLAlchemy / PostgreSQL 15 / MinIO (S3) / Redis 7 (idle)
- Frontends: Vite+React (admin), Next.js standalone (supervisor mobile)
- Infra: Docker Compose, Caddy (в чужом стэке `go_caddy`), Hetzner cloud

## Setup

```bash
# Локально — обычно работа через SSH; локальный compose не отлажен
ssh -i ~/.ssh/antigravity_key root@89.167.122.76
cd /root/atmos_planning
docker compose ps
```

## Build & deploy

```bash
# С локалки
cd ~/Documents/AI/Claude/atmos_planning
./deploy.sh
```

## Code style

- Python: FastAPI conventions, type hints, async где возможно
- Frontend: React/TS, не trastовать `any`
- Commit messages — на русском или английском, оба ок

## Testing

- button_bot — Playwright самотесты UI (сейчас все 4 сценария таймаутят, см. `.claude/memory-bank/activeContext.md`)
- Backend unit-тестов нет (техдолг)

## Safety considerations

⚠️ **Shared production host** (Hetzner `ubuntu-4gb-hel1-1`, 89.167.122.76) хостит несколько прод-проектов. Read-only by default; никаких `docker stop/rm/restart`, `prune`, `rm -rf` без явного approval. Многие соседние проекты не имеют git remote — потеря необратима.

См. `.claude/memory-bank/accessAndSafety.md` для полных правил.

## For more context

См. `.claude/CLAUDE.md` (Claude Code entrypoint) и 6 файлов Memory Bank в `.claude/memory-bank/`:
- `projectbrief.md` — что/зачем/для кого
- `architecture.md` — компоненты, Caddy маршруты, known broken pieces
- `techContext.md` — стек, env vars, common operations
- `accessAndSafety.md` — endpoints, кредлы, правила
- `activeContext.md` — текущий focus и next steps
- `progress.md` — append-only лог сессий
