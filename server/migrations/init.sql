-- Botho Innovations WhatsApp VMS
-- Prefixed tables so they never collide with other projects on this database.
-- Safe to re-run: CREATE TABLE IF NOT EXISTS only. No DROP. No TRUNCATE.

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_admins (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_accounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Host',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_hosts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  account_id INTEGER REFERENCES whatsapp_visitor_management_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_visitors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '—',
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_visits (
  id SERIAL PRIMARY KEY,
  ref_number TEXT NOT NULL UNIQUE,
  visitor_id INTEGER NOT NULL REFERENCES whatsapp_visitor_management_visitors(id) ON DELETE CASCADE,
  host_id INTEGER NOT NULL REFERENCES whatsapp_visitor_management_hosts(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL DEFAULT '—',
  visit_date DATE NOT NULL,
  visit_time TEXT NOT NULL DEFAULT '—',
  status TEXT NOT NULL DEFAULT 'pending',
  visit_type TEXT NOT NULL DEFAULT 'official',
  visitor_phone TEXT,
  pin TEXT,
  qr_token TEXT,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_conversation_states (
  id SERIAL PRIMARY KEY,
  phone_number TEXT NOT NULL UNIQUE,
  current_step TEXT NOT NULL DEFAULT 'menu',
  collected_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_audit_log (
  id SERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  org_name TEXT NOT NULL DEFAULT 'Botho Innovations',
  phone TEXT NOT NULL DEFAULT '+27 00 000 0000',
  email TEXT NOT NULL DEFAULT 'support@bothoinnovations.com',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wvm_visits_status ON whatsapp_visitor_management_visits(status);
CREATE INDEX IF NOT EXISTS idx_wvm_visits_host ON whatsapp_visitor_management_visits(host_id);
CREATE INDEX IF NOT EXISTS idx_wvm_visits_visitor ON whatsapp_visitor_management_visits(visitor_id);
CREATE INDEX IF NOT EXISTS idx_wvm_visits_qr_token ON whatsapp_visitor_management_visits(qr_token);
CREATE INDEX IF NOT EXISTS idx_wvm_visits_pin ON whatsapp_visitor_management_visits(pin);
CREATE INDEX IF NOT EXISTS idx_wvm_visits_visitor_phone ON whatsapp_visitor_management_visits(visitor_phone);
CREATE INDEX IF NOT EXISTS idx_wvm_hosts_account ON whatsapp_visitor_management_hosts(account_id);
CREATE INDEX IF NOT EXISTS idx_wvm_hosts_phone ON whatsapp_visitor_management_hosts(phone);
CREATE INDEX IF NOT EXISTS idx_wvm_audit_created ON whatsapp_visitor_management_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wvm_conversation_phone ON whatsapp_visitor_management_conversation_states(phone_number);

INSERT INTO whatsapp_visitor_management_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
