# WhatsApp VMS — Server

Node.js + Express API for the Botho Innovations visitor management system. Tables are prefixed `whatsapp_visitor_management_` so they never collide with other projects on the same Supabase database.

Visitors book through WhatsApp chat. Hosts approve or reject by replying `APPROVE VMS-2026-XXXXXX` / `REJECT VMS-2026-XXXXXX`. This uses **Baileys** (WhatsApp Web linking via QR). There is no Meta Business API and no official token.

## Warning (read this first)

This uses an **unofficial** WhatsApp connection. Running it on a live/production number can get that number **banned** — it is against WhatsApp's Terms of Service.

Use a **spare / secondary** phone number for testing. Do **not** link the client's main business WhatsApp until they understand this risk.

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
- `CLIENT_ORIGIN=http://localhost:5173`
- `ADMIN_ORIGIN=http://localhost:5174`
- `ORG_LOCATION` — location printed on the visitor approval message (optional)

No WhatsApp tokens are needed. Linking is done by scanning a QR code.

## Migrate + seed

```bash
npm run migrate
npm run seed
```

Demo logins after seed:

- Admin: `admin` / `admin123`
- Host: `boikarabelo` / `host2026`

Put a **real** WhatsApp number on the host you will approve as (Admin → Hosts). Seed phones are placeholders.

## Link WhatsApp (first time)

Do this once, before (or while) running the full server:

```bash
cd server
node testConnection.js
```

or:

```bash
npm run whatsapp:link
```

1. A QR prints in the terminal.
2. The same QR is saved as `server/whatsapp-qr.png` (and at `GET http://localhost:5000/api/whatsapp/qr` when the API is running).
3. On the spare phone: **WhatsApp → Linked Devices → Link a device** → scan the QR.
4. When you see `WhatsApp linked as …`, press Ctrl+C if you used `testConnection.js`, then start the real server.

Session files live in `server/auth_info_baileys`. **Do not delete that folder** or you will have to scan again. It is gitignored.

If WhatsApp logs the session out, the server clears `auth_info_baileys` and shows a fresh QR.

## Start

```bash
cd server
npm run dev
```

API: `http://localhost:5000`  
Health: `GET /api/health`  
WhatsApp status: `GET /api/whatsapp/status`  
Linking QR image: `GET /api/whatsapp/qr`

## Test the full booking flow

1. `npm run migrate` then `npm run dev`. Confirm `GET /api/whatsapp/status` shows `"connected": true`.
2. From a **visitor** phone, message the linked number: `hi`
3. Reply `1` (Request a visit) → `1` or `2` for Social / Official → name → company (official only) → host number from the list → purpose → date (`22 Sep` or `2026-09-22`) → time (`10am` or `10:00`).
4. Bot creates a pending visit and sends a reference (`VMS-2026-XXXXXX`).
5. The **host** WhatsApp (the number stored on that host) receives the request.
6. Host replies: `APPROVE VMS-2026-XXXXXX` or `REJECT VMS-2026-XXXXXX`
7. Visitor receives a decline text, or an approval caption plus the QR image and backup PIN.
8. Gate validation (REST, not WhatsApp):

```bash
POST http://localhost:5000/api/passes/validate
{ "pin": "984321" }
```

or `{ "token": "<value encoded in the QR>" }`.

Reply `menu` or `cancel` at any time to restart. Progress is stored in `whatsapp_visitor_management_conversation_states`.

Approving from the admin or host portal also sends the WhatsApp PIN + QR if the visit has a visitor phone.

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

### Public / WhatsApp
- `GET /api/health`
- `POST /api/visits/public` `{ name, host, company, purpose, date, time }` (rate-limited)
- `GET /api/whatsapp/status` → `{ connected, qrAvailable, user }`
- `GET /api/whatsapp/qr` → PNG of the linking QR (only while waiting to scan)
- `POST /api/passes/validate` `{ token }` or `{ pin }` — security-gate check (rate-limited)

Gate validation reasons: `not_found`, `not_approved`, `already_used`, `expired`, `missing`.
