# WhatsApp VMS — Server

Node.js + Express API for the Botho Innovations visitor management system. Tables are prefixed `whatsapp_visitor_management_` so they never collide with other projects on the same Supabase database.

## Install

```bash
cd server
npm install
```

## Environment

Copy `.env.example` to `.env` (already filled for this project). Required:

- `DATABASE_URL` — Supabase Postgres URI (`sslmode=require`)
- `JWT_SECRET`
- `PORT` (default `5000`)
- `CLIENT_ORIGIN=http://localhost:5173`
- `ADMIN_ORIGIN=http://localhost:5174`

## Migrate + seed

```bash
npm run migrate
npm run seed
```

`migrate` only runs `CREATE TABLE IF NOT EXISTS` on prefixed tables. It does not drop or truncate anything else.

Demo logins after seed:

- Admin: `admin` / `admin123`
- Host: `boikarabelo` / `host2026`

## Start

```bash
npm run dev
```

API: `http://localhost:5000`  
Health check: `GET http://localhost:5000/api/health`

## Run the full stack

```bash
# terminal 1
cd server && npm run dev

# terminal 2
cd admin && npm run dev          # http://localhost:5174

# terminal 3
cd client && npm run dev         # http://localhost:5173
```

## Endpoints

### Auth
- `POST /api/auth/admin/login` `{ username, password }` → `{ token, admin }`
- `POST /api/auth/client/login` `{ username, password }` → `{ token, host }`

Header for protected routes: `Authorization: Bearer <token>`

### Admin
- `GET /api/dashboard/stats`
- `GET /api/visitors` `GET /api/visitors/:id`
- `GET /api/visits?status=pending&limit=5` `POST /api/visits`
- `PATCH /api/visits/:id/approve` `PATCH /api/visits/:id/reject`
- `GET /api/passes` `POST /api/passes/:id/revoke`
- `GET /api/hosts` `POST /api/hosts` `PATCH /api/hosts/:id`
- `GET /api/accounts` `POST /api/accounts` `PATCH /api/accounts/:id/toggle`
- `GET /api/reports/summary` `GET /api/reports/export?type=visits|visitors|audit`
- `GET /api/audit` `GET /api/settings` `PUT /api/settings`

### Host
- `GET /api/host/dashboard`
- `GET /api/host/visits`
- `PATCH /api/host/visits/:id/approve` `PATCH /api/host/visits/:id/reject`
- `GET /api/host/passes` `GET /api/host/history` `GET /api/host/notifications` `GET /api/host/profile`

### Public
- `GET /api/health`
- `POST /api/visits/public` `{ name, host, company, purpose, date, time }` (rate-limited)

Approve response example:

```json
{
  "id": 1,
  "ref": "VMS-2026-001245",
  "visitor": "Michael Ntsima",
  "host": "Boikarabelo Ramaretlwa",
  "status": "approved",
  "pin": "984321",
  "qrToken": "a8f3...",
  "qrImage": "data:image/png;base64,..."
}
```
