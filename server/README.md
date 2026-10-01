# WhatsApp VMS — Server

Node.js + Express API for a single organisation's visitor management system. Tables are prefixed
`whatsapp_visitor_management_` so they never collide with other projects on the same Supabase database.

Visitors book through the organisation's WhatsApp number. Hosts get a WhatsApp heads-up for each
request; visits are approved or rejected in the admin panel (`/admin`). WhatsApp uses **Baileys**
(WhatsApp Web linking via QR). There is no Meta Business API and no official token.

## Warning (read this first)

This uses an **unofficial** WhatsApp connection. Running it on a live/production number can get that
number **banned** — it is against WhatsApp's Terms of Service.

## Install

```bash
cd server
npm install
```

## Environment

Copy `.env.example` to `.env`. Required:

- `DATABASE_URL` — Supabase Postgres URI (`sslmode=require`)
- `JWT_SECRET`
- `PORT` (default `5000`)
- `ADMIN_ORIGIN` — the admin app's address (CORS), e.g. `http://localhost:5174`
- `PUBLIC_PASS_URL` — the admin app's address; the QR sent to visitors opens its public `/pass/<token>` page
- `ORG_LOCATION` — location printed on the visitor approval message (optional)
- `OPENAI_API_KEY`, `OPENAI_MODEL` — WhatsApp assistant answers (optional; rule-based fallbacks without it)

## Migrate + seed

```bash
npm run migrate
npm run seed
```

`npm run migrate` is safe to re-run on the live database. `npm run seed` is for a fresh local database
only: it refuses to run when `NODE_ENV=production` or when an admin already exists, asks for the
super admin's password (at least 10 characters, or `SEED_ADMIN_PASSWORD`), and adds demo hosts and
visits. Demo hosts have no phone number.

## Admin panel roles

| Role | Can use |
|---|---|
| `super_admin` | Everything, including sub-admins, the company WhatsApp number and Settings |
| `admin` | Daily operations: hosts, visit requests, passes, conversations, knowledge base, reports, audit, gate |
| `reception` | The gate validator and today's visits |

Roles are enforced by the server on every request. Every session is re-checked on each request: the
login must exist, be active, and its password must not have changed since the token was issued.

## Link WhatsApp

Sign in as a super admin → **WhatsApp** → **Generate QR**, then on the company phone:
**WhatsApp → Linked devices → Link a device** → scan the QR.

For local setup without the panel, `npm run whatsapp:link` prints the QR in the terminal.

Session files live in `server/auth_info_baileys` (gitignored) and are also backed up to the database.

## Start

```bash
cd server && npm run dev      # http://localhost:5000
cd admin && npm run dev       # http://localhost:5174
```

## Endpoints

Header for protected routes: `Authorization: Bearer <token>`.
Roles: **any** = super_admin, admin, reception · **staff** = super_admin, admin · **super** = super_admin.

| Method | Path | Role |
|---|---|---|
| GET | `/api/health` | public |
| POST | `/api/auth/admin/login` | public (10 attempts / 15 min per IP + username) |
| GET | `/api/passes/info/:token` | public — visitor pass page, full 64-character token only |
| GET | `/api/auth/me` | any |
| POST | `/api/auth/admin/password` | any — change own password |
| POST | `/api/passes/validate` `{ token }` or `{ pin }` | any — gate check-in |
| GET | `/api/passes/info?token=` or `?pin=` | any — gate lookup without check-in |
| GET | `/api/visits/today` | any — today's visits, no PINs or tokens |
| GET | `/api/dashboard/stats`, `/api/visitors`, `/api/visitors/:id` | staff |
| GET/POST | `/api/visits` | staff |
| PATCH | `/api/visits/:id/approve`, `/api/visits/:id/reject` | staff |
| GET | `/api/passes` · POST `/api/passes/:id/revoke` | staff |
| GET | `/api/conversations`, `/api/conversations/:phoneNumber` | staff |
| GET/POST | `/api/hosts` · PATCH `/api/hosts/:id`, `/:id/block`, `/:id/unblock` · DELETE `/api/hosts/:id` | staff |
| GET/POST | `/api/knowledge` · PATCH/DELETE `/api/knowledge/:id` · PUT `/api/knowledge/training` · POST `/api/knowledge/upload`, `/api/knowledge/website` | staff |
| GET | `/api/reports/summary`, `/api/reports/export?type=visits\|visitors\|audit`, `/api/audit`, `/api/settings` | staff |
| PUT | `/api/settings` | super |
| GET | `/api/settings/whatsapp` · POST `/api/settings/whatsapp/connect`, `/disconnect` | super |
| GET/POST | `/api/admins` · PATCH `/api/admins/:id/role`, `/:id/block`, `/:id/unblock` · DELETE `/api/admins/:id` · POST `/api/admins/:id/password` | super |

Gate validation reasons: `not_found`, `not_approved`, `already_used`, `expired`, `missing`.

## Tests

```bash
npm test                              # booking engine, knowledge search, API roles and sessions
node test/manual/transcripts.js       # WhatsApp conversations end to end (in-memory, no OpenAI)
```

`test/db.test.js` checks the migrations on a real, throwaway PostgreSQL and is skipped unless
`TEST_DATABASE_URL` is set (see the file header for a one-line Docker command).
