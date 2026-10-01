# whatsapp-visitor-management-system

A WhatsApp-based visitor management system for a single organisation: visitors book on the
organisation's WhatsApp number, hosts are notified, staff approve in the admin panel, and visitors
receive a QR + PIN pass that reception validates at the gate.

- `server/` — Node.js + Express API, PostgreSQL (Supabase), Baileys WhatsApp bot. See `server/README.md`.
- `admin/` — React admin panel (roles: super admin, admin, reception) and the visitors' public
  pass page at `/pass/<token>`.
