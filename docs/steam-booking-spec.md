# Steam Booking — финальная спека (revision 1, 2026-05-21)

> Сводный документ. Заменяет три файла: `banya-booking-spec-part1.md`, `banya-booking-spec-part1-1.md`, `banya-booking-spec-part2.md`.
>
> Исходные ТЗ — функциональные намёки. Внутренняя организация переработана под реальную архитектуру Atmos Planning (FastAPI + SQLAlchemy + Vite/React), а не под исходно предложенный Next.js + Prisma. Решения отмечены **[ARCH]**, спорные места — **[OPEN]**.

---

## 0. Что строим (TL;DR)

Гостевой booking для услуг wellness-центра на локации Atmos Uluwatu (первый rollout). Поддерживаются несколько типов услуг: **`steam`** (баня, групповые сессии, фестивальный режим — `repeats_until` задан) и **`massage`** (1-on-1, всегда-on — `repeats_until=null`). Архитектура generic: новые типы (sauna/ice bath/yoga) добавляются ALTER в CHECK constraint + 1 поле в settings.

Гость сканирует физический QR в локации → выбирает свободные слоты (любого типа) → вводит email → получает email с персональным QR → показывает у входа хостесе. Capacity не возвращается при no-show.

Модуль расширяет Atmos Planning (общая БД, общий backend), но **гостевой UI живёт на отдельном субдомене** и не пересекается с staff-фронтами.

**Имя таблиц.** Все таблицы префикс `steam_*` — historical naming (модуль начинался как steam-only). Renaming в проде не стоит cosmetic выгод; в коде и spec'е документируется как «booking module, исторически назван steam_*».

---

## 1. Стэк (фиксируем)

**Backend** — расширение существующего `backend/` (FastAPI + SQLAlchemy + Postgres 15). Все новые модели — UUID PK (изолированы от int-PK existing моделей; см. **[ARCH-1]**). Миграции — **поднимаем Alembic нормально** для нового модуля (см. **[ARCH-2]**).

**Email** — Resend через `httpx` (без официального SDK — лишняя зависимость для одного POST'а). Шаблоны — Jinja2 + premailer для inline-CSS, лежат в `backend/app/emails/steam/`. **Не используем React Email** — это потребовало бы Node-инфраструктуру в Python-проекте (см. **[ARCH-3]**).

**QR** — Python `qrcode[pil]`, отдаём PNG-байты прямо из endpoint'а либо инлайн в email (`<img src="data:image/png;base64,…">`).

**Cron** — всё через существующий контейнер `ai_monitor` с паттерном `X-Internal-Token`. Не заводим системный cron на хосте, не заводим Vercel/Hetzner-cron, не пишем APScheduler в backend. Меньше точек отказа (см. **[ARCH-4]**).

**Admin UI** — раздел "Steam" в существующем `lovable_frontend/` (Vite + React Router + shadcn). Никакого Next.js admin.

**Guest UI** — отдельный новый Vite-проект `steam_guest_frontend/` в этом же монорепо. Контейнер `atmos_steam_guest` на новом порту, отдельный Caddy-блок на отдельном субдомене (см. **[ARCH-5]**).

**FingerprintJS Open Source** — стандартная JS-библиотека на гостевом фронте, посылает `device_id` в backend. Backend хранит его inline в `steam_bookings` (одна колонка), без отдельной таблицы `steam_devices` (см. **[ARCH-6]**).

---

## 2. Модель данных

Все таблицы — префикс `steam_*`. UUID PK через `gen_random_uuid()` (pgcrypto). Timestamp'ы — `timestamptz`.

### 2.1. `steam_settings` — синглтон-конфиг

Одна строка (id=1), типизированные колонки. **Не key/value** — типы валидируются на уровне БД, миграции добавляют новые поля прозрачно.

| Поле | Тип | Default | Описание |
|------|-----|---------|----------|
| `id` | int PK | 1 | singleton, CHECK (id=1) |
| `max_bookings_per_guest` | int | 2 | |
| `booking_window_minutes` | int | 20 | время на доставку email (см. §4.3) |
| `qr_valid_before_slot_minutes` | int | 10 | окно валидности QR |
| `materialization_horizon_weeks` | int | 8 | |
| `festival_name` | text | "Atmos Steam Club" | |
| `location_name` | text | "Main Banya" | |
| `resend_from_email` | text | null | напр. `steam@atmos.club` |
| `resend_reply_to` | text | null | |
| `public_url` | text | null | напр. `https://book.atmos.club` — для построения ссылок в email |
| `updated_at` | timestamptz | now() | |

Resend API-ключ и webhook-secret **в `.env`**, а не в БД (это credentials, не настройки).

### 2.2. `steam_slot_templates`

| Поле | Тип | |
|------|-----|---|
| `id` | uuid PK | |
| `name` | text null | для админки |
| `days_of_week` | int[] | ISO 1=Mon … 7=Sun |
| `start_time` | time | без даты |
| `duration_minutes` | int | |
| `capacity` | int | |
| `starts_on` | date | |
| `repeats_until` | date null | null = бессрочно |
| `status` | text | `active` / `paused` |
| `created_at`, `updated_at` | timestamptz | |

### 2.3. `steam_slots`

| Поле | Тип | |
|------|-----|---|
| `id` | uuid PK | |
| `starts_at` | timestamptz | |
| `ends_at` | timestamptz | |
| `capacity` | int | |
| `booked_count` | int default 0 | denormalized counter, обновляется в той же транзакции что и booking |
| `template_id` | uuid null FK → steam_slot_templates | null = standalone |
| `is_override` | bool default false | менеджер правил вручную |
| `status` | text | `open` / `closed` (надгробие) |
| `created_at`, `updated_at` | timestamptz | |

Индексы: `(starts_at)`, `(template_id, starts_at)` для materialization-проверки дубликатов, partial `WHERE status='open' AND starts_at > now()` для горячего GET.

### 2.4. `steam_bookings`

| Поле | Тип | |
|------|-----|---|
| `id` | uuid PK | |
| `code` | text UNIQUE | human-readable, формат `ATM-XXXXX` (5 base32-символов без 0/O/I/L) |
| `slot_id` | uuid FK → steam_slots | |
| `guest_email` | text | хранится в нижнем регистре |
| `guest_name` | text null | опционально, на будущее |
| `device_fingerprint` | text null | от FingerprintJS, NULL если блокировщик |
| `status` | text | `pending` / `confirmed` / `cancelled` / `expired` / `used` |
| `qr_token` | uuid UNIQUE | то, что закодировано в QR (см. §4.4) |
| `cancel_token` | uuid UNIQUE | для cancel-ссылки в email |
| `ip` | inet null | для аналитики и rate-limit |
| `user_agent` | text null | |
| `created_at` | timestamptz | |
| `confirmed_at` | timestamptz null | момент email.delivered или fallback |
| `cancelled_at` | timestamptz null | |
| `entered_at` | timestamptz null | момент успешного скана |

Индексы: `(guest_email)`, `(device_fingerprint)`, `(slot_id, status)`, `(qr_token)`, `(cancel_token)`.

### 2.5. `steam_staff`

Хостесы — это отдельная сущность, **не** строка в `users`. Аргумент: их жизненный цикл (magic link, 24h session, одноразовая активация) сильно отличается от admin/supervisor. Не смешиваем.

| Поле | Тип | |
|------|-----|---|
| `id` | uuid PK | |
| `name` | text | |
| `activation_token` | text UNIQUE null | одноразовый, для magic link |
| `session_token` | text UNIQUE null | действует 24ч после активации |
| `session_expires_at` | timestamptz null | |
| `last_seen_at` | timestamptz null | |
| `status` | text | `active` / `inactive` |
| `created_at` | timestamptz | |

### 2.6. `steam_events` (аналитика)

| Поле | Тип | |
|------|-----|---|
| `id` | uuid PK | |
| `event_type` | text | |
| `properties` | jsonb | |
| `device_fingerprint` | text null | |
| `booking_id` | uuid null | |
| `slot_id` | uuid null | |
| `staff_id` | uuid null | |
| `ip` | inet null | |
| `user_agent` | text null | |
| `created_at` | timestamptz | |

Индексы: `(event_type, created_at)`, `(booking_id)`.

### 2.7. Что НЕ заводим (vs набросок)

- **`steam_devices`** — отдельной таблицы нет. `device_fingerprint` хранится колонкой в `steam_bookings`. Лимит считается из `steam_bookings` по `(email OR fingerprint)`. Если в будущем понадобится блокировать конкретный fingerprint — добавим тогда. На MVP — лишняя сложность.
- **`steam_blocked_emails`** — на MVP не нужно. Если bounce/complaint — пишем в `steam_events` с reason, менеджер видит в логе. Реальная блокировка добавляется второй итерацией.

---

## 3. Файловая структура

```
atmos_planning/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── ... (существующие)
│   │   │   └── steam/
│   │   │       ├── __init__.py        # router = APIRouter(prefix="/steam")
│   │   │       ├── slots.py           # GET /slots (public)
│   │   │       ├── bookings.py        # POST /bookings, GET /bookings/by-code/{code}, POST /bookings/cancel, POST /bookings/resend
│   │   │       ├── staff.py           # GET /staff/activate/{token}, POST /staff/verify
│   │   │       ├── admin.py           # CRUD templates/slots/bookings/staff/settings (require_admin)
│   │   │       ├── webhooks.py        # POST /webhooks/resend
│   │   │       └── internal.py        # POST /internal/materialize, /expire-bookings, /cleanup-sessions (require_internal)
│   │   ├── models/
│   │   │   ├── all.py                 # существующее, НЕ трогаем
│   │   │   └── steam.py               # новые UUID-таблицы
│   │   ├── schemas/
│   │   │   └── steam.py               # Pydantic
│   │   ├── services/
│   │   │   ├── steam_email.py         # Resend через httpx + Jinja2
│   │   │   ├── steam_materializer.py  # чистая функция materialize(template_id, horizon)
│   │   │   ├── steam_qr.py            # qrcode → PNG bytes / base64
│   │   │   ├── steam_tokens.py        # генерация code (ATM-XXXXX), qr_token, cancel_token
│   │   │   ├── steam_rate_limit.py    # in-memory bucket
│   │   │   └── steam_cache.py         # in-memory LRU для /slots с TTL=5s
│   │   └── emails/
│   │       └── steam/
│   │           ├── _base.html         # общий wrapper
│   │           ├── booking_confirmation.html
│   │           ├── cancellation.html
│   │           ├── slot_changed.html
│   │           ├── resend_bookings.html
│   │           └── staff_magic_link.html
│   └── alembic/
│       └── versions/
│           ├── 0001_baseline.py       # stamp существующей схемы (не пересоздавать)
│           ├── 0002_steam_module.py   # все таблицы из §2 одной ревизией
│           └── 0003_steam_seed.py     # seed steam_settings (id=1)
│
├── lovable_frontend/                  # admin SPA
│   └── src/
│       ├── components/layout/AppSidebar.tsx   # + раздел Steam (collapsible)
│       ├── pages/
│       │   ├── ... (существующие)
│       │   └── steam/
│       │       ├── ScheduleTemplates.tsx
│       │       ├── ScheduleCalendar.tsx
│       │       ├── Bookings.tsx
│       │       ├── Staff.tsx
│       │       └── Settings.tsx
│       └── lib/api/steam.ts           # обёртки над fetch
│
├── steam_guest_frontend/              # НОВЫЙ Vite-проект
│   ├── package.json
│   ├── vite.config.ts
│   ├── nginx.conf
│   ├── Dockerfile
│   └── src/
│       ├── pages/
│       │   ├── Landing.tsx            # / — slot picker
│       │   ├── Success.tsx            # /success/[code]
│       │   ├── Cancel.tsx             # /cancel/[token]
│       │   └── staff/
│       │       ├── Activate.tsx       # /staff/activate/[token]
│       │       └── Scan.tsx           # /staff/scan
│       ├── components/
│       │   ├── SlotPicker.tsx
│       │   ├── SlotCard.tsx
│       │   ├── EmailForm.tsx
│       │   ├── QrDisplay.tsx
│       │   └── Scanner.tsx            # @yudiel/react-qr-scanner или html5-qrcode
│       └── lib/fingerprint.ts         # @fingerprintjs/fingerprintjs (open source)
│
├── ai_monitor/
│   └── main.py                        # + 3 новых тика (см. §6)
│
└── docker-compose.yml                 # + сервис atmos_steam_guest
```

---

## 4. Жизненный цикл бронирования

### 4.1. Создание (POST /api/steam/bookings)

Атомарная транзакция:

```sql
BEGIN;
-- блокируем все запрошенные слоты
SELECT id, capacity, booked_count FROM steam_slots WHERE id = ANY(:slot_ids) FOR UPDATE;
-- проверка capacity и status='open' для каждого
-- проверка лимита: COUNT(*) FROM steam_bookings WHERE
--   (LOWER(guest_email) = :email OR device_fingerprint = :fp)
--   AND status IN ('pending','confirmed','used')
--   FOR UPDATE
-- если ок: INSERT в steam_bookings (status='pending'), UPDATE booked_count += 1
COMMIT;
```

Возвращаем гостю `code` и redirect на `/success/[code]`. Triggerим отправку email из background-task FastAPI (не блокируем response).

### 4.2. Email отправка (Resend)

`steam_email.send_booking_confirmation(booking_id)`:
1. POST `https://api.resend.com/emails` через `httpx`.
2. Если HTTP 2xx — записываем `steam_events: email_sent` с `resend_id`.
3. Если 4xx/5xx — booking → `expired`, освобождаем `booked_count`, в UI у гостя — ошибка «Couldn't send email, please try again».

### 4.3. Подтверждение (delivery webhook)

`POST /api/steam/webhooks/resend` — Resend шлёт `email.delivered`, `email.bounced`, `email.complained`. Верификация подписи через `RESEND_WEBHOOK_SECRET`.

- `email.delivered` + booking в `pending` → `confirmed`, `confirmed_at = now()`.
- `email.bounced` или `email.complained` → `expired`, `booked_count -= 1`, событие `email_bounced/complained` в `steam_events`.

**Fallback**: тик `expire-bookings` (1/мин) переводит в `confirmed` все pending, где `created_at + booking_window_minutes < now() AND status='pending'`. То есть `booking_window_minutes` — это окно ожидания delivery-webhook'а, **не** окно для клика гостя.

### 4.4. Использование

QR содержит **только** `qr_token` (uuid). Не email, не время, не slot_id — это «право входа», не tracker.

Endpoint `POST /api/steam/staff/verify` принимает `{qr_token, staff_session_token}`:
- `booking.status='cancelled'` → `cancelled`
- `booking.status='expired'` → `expired` (фактически same as not_found UX-wise, но event пишем точнее)
- `booking.status='used'` → `already_used` с `entered_at`
- `now() > slot.starts_at` → `wrong_time: too_late`
- `now() < slot.starts_at - qr_valid_before_slot_minutes` → `wrong_time: too_early`
- иначе → `valid`, UPDATE booking SET status='used', entered_at=now()

### 4.5. Отмена

Гость кликает `[Cancel this booking]` в email → `/cancel/[cancel_token]` → подтверждение → POST `/api/steam/bookings/cancel`. UPDATE status='cancelled', `booked_count -= 1`.

Admin тоже может отменять через UI — тот же эндпоинт под `require_admin`.

### 4.6. Истечение

- `pending` → `expired`: `created_at + booking_window_minutes < now()`. Tick раз в минуту через ai_monitor.
- `confirmed` → `expired`: `slot.starts_at < now() AND status='confirmed'` (no-show). Tick тот же.
- `used` остаётся `used` навсегда.

---

## 5. API endpoints

Префикс `/api/steam`. Все таймстампы в ISO 8601 UTC. Пагинация — простой `limit`/`offset`.

### 5.1. Публичные (без auth, с rate-limit)

| Method | Path | Описание |
|---|---|---|
| GET | `/slots?from=&to=` | Открытые слоты в окне, с `booked_count`/`capacity` |
| POST | `/bookings` | Body: `{slot_ids[], email, fingerprint?, name?}`. Создаёт pending |
| GET | `/bookings/by-code/{code}` | Для success-страницы; возвращает slot info + QR-png-url |
| POST | `/bookings/cancel` | Body: `{cancel_token}` |
| POST | `/bookings/resend` | Body: `{email}`. Отправляет письмо со всеми активными бронями (rate-limit 1/мин) |
| GET | `/qr/{qr_token}.png` | Рендер PNG (no-cache headers, потому что токен по сути secret) |

### 5.2. Staff (session token в header `X-Staff-Token`)

| Method | Path | Описание |
|---|---|---|
| GET | `/staff/activate/{token}` | Активирует magic link; возвращает session_token (24ч) |
| POST | `/staff/verify` | Body: `{qr_token}`. Возвращает result enum (см. §4.4) + slot info |

### 5.3. Admin (`Authorization: Bearer <JWT>`, role check)

Под `require_admin`. Также используется новый role `steam_manager` (см. §7).

| Method | Path | |
|---|---|---|
| GET/POST/PATCH/DELETE | `/admin/templates[/{id}]` | |
| POST | `/admin/templates/{id}/preview` | Body: `{days_of_week,start_time,starts_on,repeats_until}` → первые 5 дат |
| POST | `/admin/templates/{id}/pause` | |
| GET/POST/PATCH/DELETE | `/admin/slots[/{id}]` | |
| POST | `/admin/slots/{id}/close` | Превращает в надгробие (`status=closed, is_override=true`) |
| GET | `/admin/bookings?status=&from=&to=&email=&export=csv` | |
| POST | `/admin/bookings/{id}/cancel` | |
| GET/POST/PATCH/DELETE | `/admin/staff[/{id}]` | POST возвращает magic-link URL (показать менеджеру) |
| POST | `/admin/staff/{id}/reissue` | Новый activation_token |
| GET/PATCH | `/admin/settings` | Single-row update |

### 5.4. Internal (`X-Internal-Token`, для ai_monitor)

| Method | Path | Частота |
|---|---|---|
| POST | `/internal/materialize` | 1/сутки (03:00 Asia/Makassar) |
| POST | `/internal/expire-bookings` | 1/мин |
| POST | `/internal/cleanup-sessions` | 1/час |

### 5.5. Webhook

| Method | Path | |
|---|---|---|
| POST | `/webhooks/resend` | Verifies `Svix-*` headers via `RESEND_WEBHOOK_SECRET` |

---

## 6. Materialization (recurring schedule)

`materialize(template_id, horizon_end_date) -> {created: int, skipped: int}`:

1. Загружаем template; если `status != 'active'` — return.
2. Если `repeats_until` прошло — UPDATE template SET status='paused', return.
3. Для каждой даты от `max(starts_on, today)` до `min(horizon_end, repeats_until or horizon_end)`:
   - Если weekday ∈ `days_of_week`:
     - Проверяем, есть ли уже `steam_slot` с этим `template_id` на эту дату (по `starts_at::date`).
     - Если нет — INSERT.
     - Если есть и `is_override=true` или `status='closed'` — skip (override и tombstones не трогаем).

При `PATCH /admin/templates/{id}` с режимами:
- `apply_mode='unbooked_only'` (default): обновляются только будущие слоты без активных bookings.
- `apply_mode='notify_all'`: будущие слоты с активными bookings тоже обновляются + рассылка `slot_changed.html` всем затронутым гостям (через background task).

При `POST /admin/templates/{id}/pause`:
- UPDATE template status='paused'.
- DELETE будущих `steam_slots` где `template_id=:id AND booked_count=0 AND is_override=false AND starts_at > now()`.

---

## 7. Permissions

Не вводим полноценную permission-систему ради 5 пунктов. Расширяем существующий `users.role` enum:

- `admin` / `system_admin` — полный доступ ко всему (включая Steam).
- `steam_manager` — **новая роль**, может всё в /admin/steam/*, но не имеет доступа к существующим Task/Zone/User.
- `supervisor` — без доступа к Steam.

Backend dependency `require_steam_admin = require_role({"admin","system_admin","steam_manager"})`. Просто, никакой ACL-машинерии.

В `lovable_frontend/`: раздел Steam в сайдбаре виден, если `user.role in {admin, system_admin, steam_manager}`.

Гостевые endpoints — без auth, только rate-limit (см. §9).

Staff (хостесы) — **не** в `users`, у них своя таблица и своя session-схема. Не пересекаются с admin auth.

---

## 8. Cron через ai_monitor

Расширяем `ai_monitor/main.py`. Все три задачи дёргают `backend:8000/api/steam/internal/*` с `X-Internal-Token`.

```python
# ai_monitor/main.py (расширение)
async def loop():
    while True:
        # каждые 60 сек — uplift expire
        await call_internal("/api/steam/internal/expire-bookings")

        # каждый час
        if minute_mark % 60 == 0:
            await call_internal("/api/steam/internal/cleanup-sessions")

        # раз в сутки в 03:00 локальной (Asia/Makassar)
        if now.hour == 3 and now.minute == 0:
            await call_internal("/api/steam/internal/materialize")

        # existing tasks (generate-daily, etc.) — без изменений
        ...
        await asyncio.sleep(60)
```

`POLL_INTERVAL` остаётся 60 сек. Это даёт окно «бронь висит pending до минуты дольше указанного booking_window» — приемлемо.

**Альтернатива, которую отвергли**: APScheduler внутри FastAPI lifespan. Аргумент против: при ребуте backend'а тик пропускается; ai_monitor более отказоустойчив (отдельный контейнер с `restart: unless-stopped`).

**Альтернатива, которую отвергли**: системный cron на хосте + curl. Аргумент против: cron-таблицу пришлось бы синкать через deploy.sh, плюс рассинхрон с TZ контейнера.

---

## 9. Нагрузка и устойчивость

### 9.1. Кэш

`GET /api/steam/slots` — кэшируем in-memory (`functools.lru_cache` + ручной TTL=5s) по ключу `(from, to)`. Invalidation:
- Любой `INSERT/UPDATE/DELETE` в `steam_slots` или `steam_bookings` — clear cache.
- Грубо, но 5-секундный TTL и так маскирует.

Если в будущем будет multi-instance backend — переедем на Redis (контейнер уже есть, простаивает).

### 9.2. Rate limit

In-memory token bucket в `services/steam_rate_limit.py`:

| Endpoint | Лимит |
|---|---|
| POST /bookings | 5/мин per IP, 10/час per fingerprint |
| POST /bookings/resend | 1/мин per email |
| GET /slots | 60/мин per IP |
| POST /staff/verify | без лимита |
| POST /webhooks/resend | без лимита (verified signature) |

При превышении — `429 Too Many Requests`, body `{error: "rate_limited", retry_after_seconds}`.

### 9.3. Race conditions

`SELECT … FOR UPDATE` в одной транзакции, см. §4.1. Лимит per-guest проверяется в той же транзакции через тот же FOR UPDATE.

### 9.4. Пик нагрузки

Один Postgres + один FastAPI worker должны держать ~100 RPS на `/bookings`, если транзакция atomic. Перед фестивалем — прогон `k6 run` на staging с 200 RPS / 2 мин.

При необходимости — `gunicorn -k uvicorn.workers.UvicornWorker -w 4` для backend (сейчас один воркер).

---

## 10. Email — контент и реализация

### 10.1. Реализация

`backend/app/services/steam_email.py`:

```python
def send(template_name: str, to: str, context: dict) -> str:
    """Returns resend message id, raises on HTTP error."""
    html = jinja_env.get_template(f"steam/{template_name}.html").render(**context)
    html = premailer.transform(html)  # inline CSS
    resp = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
        json={
            "from": settings.resend_from_email,
            "to": to,
            "subject": context["subject"],
            "html": html,
            "reply_to": settings.resend_reply_to,
        },
        timeout=10.0,
    )
    resp.raise_for_status()
    return resp.json()["id"]
```

QR-код инлайнится в HTML как `<img src="data:image/png;base64,…">` (Resend ок с ~10kb inline images).

### 10.2. Контент — сохраняем как в наброске

Subject'ы и тексты — без изменений из части 2 §G. Перечислены файлами в `backend/app/emails/steam/`:

- `booking_confirmation.html` — Subject `Your steam session is confirmed — {weekday}, {date} {time}`
- `cancellation.html` — Subject `Booking cancelled`
- `slot_changed.html` — Subject `Your steam session time has changed`
- `resend_bookings.html` — Subject `Your active steam bookings`
- `staff_magic_link.html` — Subject `Your Atmos Steam staff access` (опциональный канал; alternative — менеджер показывает ссылку физически)

Multi-booking confirmation: если в одной транзакции забронировано N слотов — одно письмо со списком и одним QR на каждый booking (внутри одного email).

---

## 11. UI

### 11.1. Гостевой фронт (`steam_guest_frontend/`)

4 экрана + 2 staff. Все тексты — как в части 2 §F (английский, без изменений).

| Route | Компонент | Состояния |
|---|---|---|
| `/` | Landing.tsx | Slot picker, sticky CTA, limit indicator, "already booked" banner |
| `/success/[code]` | Success.tsx | QR + code + slot details |
| `/cancel/[token]` | Cancel.tsx | Confirm/back |
| `/staff/activate/[token]` | Activate.tsx | Single-use magic link → redirect to /staff/scan |
| `/staff/scan` | Scan.tsx | Camera viewfinder + manual code input + recent scans list |

Стэк: Vite + React + Tailwind + shadcn (тот же набор что в `lovable_frontend/`, но проект полностью отдельный — нет shared bundle). Scanner — `@yudiel/react-qr-scanner` (работает с native MediaDevices). Fingerprint — `@fingerprintjs/fingerprintjs` (open source variant).

### 11.2. Admin раздел в `lovable_frontend/`

`AppSidebar.tsx` — добавляем collapsible-секцию:

```tsx
{ label: "Steam", icon: Flame, children: [
  { label: "Schedule",  path: "/steam/schedule"  },
  { label: "Bookings",  path: "/steam/bookings"  },
  { label: "Staff",     path: "/steam/staff"     },
  { label: "Settings",  path: "/steam/settings"  },
]}
```

Видна если `user.role ∈ {admin, system_admin, steam_manager}`.

Тексты, цветовая кодировка слотов в календаре, модал «3 future slots already have bookings», экспорт CSV — как в части 2 §F.3. Реализуем поверх существующих shadcn-компонентов + DayPicker.

---

## 12. Инфра / Deploy

### 12.1. `.env` (новые ключи)

```bash
# Resend
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=...

# Internal calls между ai_monitor и backend — уже есть INTERNAL_TOKEN

# Steam guest frontend
STEAM_GUEST_PUBLIC_URL=https://<subdomain-tbd>.atmos.club
```

Все остальные настройки (from/reply-to/public_url/festival_name/location_name) — в БД (`steam_settings`).

### 12.2. `docker-compose.yml` — новый сервис

```yaml
  steam_guest_frontend:
    build: ./steam_guest_frontend
    container_name: atmos_steam_guest
    ports:
      - "4004:80"
    environment:
      VITE_API_BASE: https://api.trypranaextract.com
      TZ: "Asia/Makassar"
    depends_on:
      - backend
    restart: unless-stopped
```

Новый Caddy-блок в `/root/go_lesson_mvp/docker/Caddyfile`:

```
<steam-subdomain> {
  reverse_proxy 89.167.122.76:4004
}
```

Поддомен — **[OPEN]**: пользователь укажет (`book.atmos-uluwatu.com`, `steam.atmos.club` или другое). Это блокер для §12 — без поддомена email-link'и в шаблонах не работают.

### 12.3. Миграции — текущий паттерн (Alembic отложен)

В проекте есть `backend/alembic/env.py`, но **нет** ни `alembic.ini`, ни `script.py.mako`, ни существующих revision'ов. Полноценное поднятие Alembic (autogenerate baseline против prod-БД + проверка diff + stamp + установка alembic.ini в Dockerfile) — отдельная задача (TODO в `activeContext.md`).

**В Фазе 1 идём по существующему паттерну проекта:**
- Новые steam-таблицы создаются автоматически через `Base.metadata.create_all(engine)` в `main.py` (модели импортируются в `app.models.steam`, регистрируются в общей `Base.metadata` через явный import в `main.py`).
- DDL-правки к существующим таблицам (ALTER TABLE / CREATE INDEX) добавляются в `_MIGRATIONS` блок в `main.py` как идемпотентные SQL-строки (`IF NOT EXISTS`-стиль).
- Seed singleton-row для `steam_settings` — через `get_or_create_settings(db)` на старте FastAPI приложения.

Когда соберёмся поднимать Alembic — мигрируем разом и existing tables, и steam_*. До тех пор паттерн один и тот же на весь проект.

### 12.4. Resend setup

- Verify домен (SPF/DKIM/DMARC на DNS).
- Webhook URL: `https://api.trypranaextract.com/api/steam/webhooks/resend`, secret сохраняем в `.env`.

### 12.5. Deploy

Стандартный `./deploy.sh`. После rsync на хост:
1. `docker compose up -d --build atmos_backend atmos_steam_guest atmos_ai_monitor`.
2. `docker exec atmos_backend alembic upgrade head`.
3. Smoke test:
   - `curl https://api.trypranaextract.com/api/steam/slots` → 200.
   - Создать template в admin UI → увидеть 8-недельный horizon в Calendar.
   - Создать тестовую бронь с реального email → пришло письмо → клик cancel → отменилась.
   - Открыть `/staff/scan` с тестовой staff-сессии → отсканировать QR → `valid`.

### 12.6. Backup

Существующий backup-скрипт PostgreSQL покрывает всю БД — steam-таблицы попадают автоматически. Дополнительно: ежемесячно — `pg_dump -t 'steam_*'` для cold archive перед фестивалем.

---

## 13. Аналитика — события

Сохраняем в `steam_events` (см. §2.6). Список как в части 2 §J:

**Guest**: `landing_viewed`, `slot_selected`, `slot_deselected`, `email_submitted`, `booking_created`, `booking_failed`, `booking_cancelled_by_guest`, `resend_requested`.

**Staff**: `staff_link_activated`, `staff_session_expired`, `qr_scan_attempt`, `qr_scan_success`, `qr_scan_rejected`, `manual_code_entry`.

**Admin**: `template_created`/`updated`/`paused`/`deleted`, `slot_overridden`, `booking_cancelled_by_admin`, `staff_created`/`deactivated`, `settings_changed`.

**System**: `email_sent`, `email_delivered`, `email_bounced`, `email_complained`, `fingerprint_unavailable`, `rate_limit_hit`, `materialization_run`.

Dashboard (вкладка Analytics в admin) — **вне MVP**. На MVP только пишем события. Срезы (heatmap, no-show rate, etc.) — отдельной итерацией.

---

## 14. Что в фазах

Этапы независимы, каждый деплоится. Estimates — для одного fullstack-разработчика, знакомого с кодовой базой.

| Фаза | Содержание | Estimate |
|---|---|---|
| **1. Foundation** | Alembic baseline + stamp; миграция `steam_settings`+`steam_slots`+`steam_slot_templates`; модели; seed-row settings; admin CRUD slots/templates + materializer; tick materialize в ai_monitor | 3-4 дня |
| **2. Booking core** | Миграция `steam_bookings`+`steam_events`+`steam_staff`; модели; публичный POST /bookings с FOR UPDATE; cancel; expire tick; rate-limit; cache /slots | 3-4 дня |
| **3. Email + QR** | Resend через httpx; Jinja2 шаблоны; webhook + signature verify; lifecycle `pending→confirmed` через delivery webhook + fallback; QR-генерация; endpoint `/qr/*.png`; multi-booking один email | 2-3 дня |
| **4. Staff scanner** | `steam_staff` lifecycle; magic-link генерация; session 24h; cleanup-sessions tick; `/staff/verify` со всеми reason-codes; events `qr_scan_*` | 2 дня |
| **5. Admin UI в lovable** | Sidebar + 5 страниц (Schedule Templates/Calendar, Bookings, Staff, Settings); CSV export; модал «3 future slots» | 4-5 дней |
| **6. Guest UI отдельный фронт** | `steam_guest_frontend/` Vite-проект; 4 экрана; FingerprintJS; mobile QA iOS Safari + Android Chrome; новый Caddy-блок; Docker-сервис | 4-5 дней |
| **7. Hardening + go-live** | k6 стресс-тест; backup-smoke; финальный чеклист §15; верификация Resend DKIM/SPF; production seed real settings | 1-2 дня |

Итого: **3-4 недели**. Совпадает с оценкой автора набросочного ТЗ.

---

## 15. Чеклист готовности

**Код**
- [ ] Alembic поднят, `versions/` содержит 3+ ревизии, на проде `alembic current` показывает head
- [ ] Все endpoints из §5 работают (smoke через httpie/postman collection)
- [ ] FOR UPDATE проверен (concurrent test: 10 одновременных POST /bookings на слот capacity=1 → 1 success, 9 ошибок)
- [ ] FingerprintJS fallback (отключить JS в браузере) — гость не падает
- [ ] Email-шаблоны проходят preview в Gmail/Apple Mail/Outlook (через `mailtrap.io` или ручная отправка)
- [ ] Mobile QA iOS Safari + Android Chrome

**Инфра**
- [ ] Resend домен верифицирован (SPF/DKIM/DMARC зелёные)
- [ ] Resend webhook принимает события, signature валиден
- [ ] ai_monitor три тика отработали (логи)
- [ ] ENV-переменные на проде: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `STEAM_GUEST_PUBLIC_URL`, `INTERNAL_TOKEN`
- [ ] Поддомен гостевого фронта подключён в Caddyfile, HTTPS работает
- [ ] Бэкап БД после материализации тестового template — restore проверен

**Контент**
- [ ] Менеджер завёл 1+ template для фестиваля
- [ ] Materialization создала слоты на горизонт
- [ ] Settings проверены (festival_name, location_name, лимит, окно, поддомен в public_url)
- [ ] Хостесы получили magic links и хотя бы раз отсканировали тестовый QR

**Бизнес**
- [ ] Физический QR-код для гостей напечатан и размещён в локации
- [ ] Команда знает про вкладку Bookings — сможет вручную помочь гостю
- [ ] Связка «менеджер ↔ хостесы» на месте — на случай блокировки/деактивации

**После фестиваля**
- [ ] CSV-экспорт всех броней сохранён
- [ ] Snapshot `steam_events` для разбора UX
- [ ] Retro

---

## Open questions (решить до старта)

- **[OPEN-1]** Поддомен гостевого фронта (`book.atmos.club`? `steam.atmos.club`? кастомный?) — нужен для email-link'ов.
- **[OPEN-2]** Использовать ли staff_magic_link email? Альтернатива — менеджер показывает ссылку хостесе физически (без email-канала). Я бы делал **без email** на MVP — меньше движущихся частей.
- **[OPEN-3]** Resend FROM-email и reply-to — какой почтовый ящик/домен.
- **[OPEN-4]** Существующая schema → Alembic stamp — нужно подтверждение, что autogenerate baseline совпадает с реальной БД на проде (запустить с `--sql` сначала, проверить diff).

---

## Changelog (что поменялось vs набросок)

| Что в наброске | Что у нас | Причина |
|---|---|---|
| Next.js 14 App Router + Prisma | FastAPI + SQLAlchemy + Alembic | Atmos backend = Python, не Node |
| `prisma/schema.prisma` миграция | Alembic baseline + steam-revision | используем штатный инструмент Python-стэка |
| React Email шаблоны | Jinja2 + premailer | избегаем Node-инфры в Python-проекте |
| `app/steam/page.tsx` гостевой фронт внутри Next.js | Отдельный Vite-проект `steam_guest_frontend/` на субдомене | Atmos admin = Vite, гость живёт отдельно по архитектурному решению пользователя |
| `app/admin/steam/layout.tsx` | Раздел в `lovable_frontend/src/components/layout/AppSidebar.tsx` | admin SPA не Next.js |
| Системный cron + curl | ai_monitor polling + INTERNAL_TOKEN | паттерн уже работает в проекте |
| `steam_devices` отдельная таблица | `device_fingerprint` колонкой в `steam_bookings` | упрощение; добавим если понадобится блокировка |
| `steam_blocked_emails` | Запись в `steam_events` | отложено до второй итерации |
| Permission-система `steam.*` | Расширение role enum (`steam_manager`) | минимальное решение под 5 пунктов |
| Resend SDK | `httpx` POST | одна зависимость вместо целого SDK |
| `SteamSettings` key/value seed | Single-row типизированная таблица | прозрачность миграций, типы на уровне БД |
| Staff magic-link email обязателен | Опционально (по умолчанию — менеджер показывает ссылку) | меньше движущихся частей на MVP |
