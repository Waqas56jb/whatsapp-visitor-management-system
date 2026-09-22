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

WhatsApp Cloud API (required for the booking bot):

- `WHATSAPP_TOKEN` — permanent system-user token from Meta
- `WHATSAPP_PHONE_NUMBER_ID` — WhatsApp > API Setup > Phone number ID
- `WHATSAPP_VERIFY_TOKEN` — any secret string you invent; Meta will send it back during webhook verification
- `WHATSAPP_BUSINESS_ACCOUNT_ID` — WhatsApp Business Account ID (WABA)
- `ORG_LOCATION` — location text printed on the visitor approval message (optional)

Copy the WhatsApp keys from `.env.example` into `.env` and fill them in. Do not commit `.env`.

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
- `GET /api/whatsapp/webhook` — Meta verification challenge
- `POST /api/whatsapp/webhook` — incoming WhatsApp messages
- `POST /api/passes/validate` `{ token }` or `{ pin }` — security-gate check (rate-limited)

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

Gate validation examples:

```json
POST /api/passes/validate
{ "token": "a8f3..." }

{ "ok": true, "visitor": { "name": "Michael Ntsima", "company": "University of Botswana" }, "visit": { "ref": "VMS-2026-001245", "host": "Boikarabelo Ramaretlwa", "status": "used" } }
```

```json
{ "ok": false, "reason": "expired", "error": "This pass has expired" }
```

Reasons: `not_found`, `not_approved`, `already_used`, `expired`, `missing`.

## WhatsApp Cloud API

This is the core booking path. A visitor books entirely in WhatsApp chat. The host approves or rejects from WhatsApp (or from the portal). On approval the visitor receives a PIN plus a QR image.

### 1. Create a Meta Developer app

1. Go to [developers.facebook.com](https://developers.facebook.com/) and create an app (type **Business**).
2. Add the **WhatsApp** product.
3. In **WhatsApp > API Setup**, copy:
   - **Temporary access token** (or create a permanent System User token in Meta Business Settings — required for production)
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`
   - **WhatsApp Business Account ID** → `WHATSAPP_BUSINESS_ACCOUNT_ID`
4. Add a test recipient number (your phone) under **To**.
5. Pick any verify string, e.g. `botho-vms-verify`, and set it as `WHATSAPP_VERIFY_TOKEN` in `server/.env`.

### 2. Expose the local webhook (ngrok)

WhatsApp must reach your machine over HTTPS:

```bash
ngrok http 5000
```

In Meta **WhatsApp > Configuration > Webhook**:

- Callback URL: `https://YOUR-NGROK-SUBDOMAIN.ngrok-free.app/api/whatsapp/webhook`
- Verify token: the same value as `WHATSAPP_VERIFY_TOKEN`
- Subscribe to the **messages** field

The server answers `GET /api/whatsapp/webhook` with the `hub.challenge` Meta sends. If verification fails, the token in Meta does not match `.env`.

### 3. Prove credentials with a test send

The destination number must include the country code, with no `+` or spaces. That number must have messaged your business WhatsApp in the last 24 hours (session window) unless you use an approved template.

```bash
cd server
npm run whatsapp:test -- 26771000001
```

or:

```bash
node testSend.js 26771000001
node src/whatsapp/testSend.js 26771000001
```

### 4. Test the full booking flow

1. `npm run migrate` then `npm run dev` in `/server`.
2. Start ngrok and confirm the webhook is verified in Meta.
3. Put a **real** WhatsApp number on the host you will approve as (Admin panel → Hosts, or update the seeded host `Boikarabelo Ramaretlwa`). Seed phones are placeholders and cannot receive messages.
4. From a visitor phone, send `hi` to the business number.
5. Tap **Request Visit** → Social or Official → answer name, company (official only), host, purpose, date, time.
6. Bot creates a pending visit (`VMS-2026-XXXXXX`) and texts the visitor a confirmation.
7. The host receives visit details with **Approve** / **Reject** buttons.
8. Approve → visitor gets an approval text (host, date, time, location, PIN) and then the QR image.
9. Reject → visitor gets a decline text.
10. At the gate, validate the pass:

```bash
POST http://localhost:5000/api/passes/validate
{ "pin": "984321" }
```

or send `{ "token": "<qr token>" }` after scanning the QR.

Reply `menu` or `cancel` at any time to restart. Conversation progress is stored in `whatsapp_visitor_management_conversation_states` so a visitor can pause between answers.

Approving from the admin or host portal also sends the same WhatsApp PIN + QR if the visit has a `visitor_phone`.

