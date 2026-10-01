-- When each login's password last changed. A session token stamped with an older value is
-- refused, so a password change or reset signs out every other session of that login.
-- Safe on the live database and to re-run: nullable columns, no rewrite, no data change.
-- NULL means "never changed here", so every existing session stays valid until the first change.

ALTER TABLE whatsapp_visitor_management_admins
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

ALTER TABLE whatsapp_visitor_management_accounts
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
