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
  qr_token TEXT,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_conversation_states (
  id SERIAL PRIMARY KEY,
  phone_number TEXT NOT NULL,
  account_id INTEGER NOT NULL DEFAULT 0,
  current_step TEXT NOT NULL DEFAULT 'menu',
  collected_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (phone_number, account_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_whatsapp_links (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL UNIQUE
    REFERENCES whatsapp_visitor_management_accounts(id) ON DELETE CASCADE,
  host_id INTEGER REFERENCES whatsapp_visitor_management_hosts(id) ON DELETE SET NULL,
  phone TEXT,
  wa_name TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_knowledge_base (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL
    REFERENCES whatsapp_visitor_management_accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'qa',
  title TEXT NOT NULL DEFAULT '',
  question TEXT,
  answer TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_conversation_log (
  id SERIAL PRIMARY KEY,
  phone_number TEXT NOT NULL,
  visit_id INTEGER REFERENCES whatsapp_visitor_management_visits(id) ON DELETE SET NULL,
  direction TEXT NOT NULL,
  message_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wvm_clog_phone
  ON whatsapp_visitor_management_conversation_log(phone_number);
CREATE INDEX IF NOT EXISTS idx_wvm_clog_visit
  ON whatsapp_visitor_management_conversation_log(visit_id);
CREATE INDEX IF NOT EXISTS idx_wvm_clog_created
  ON whatsapp_visitor_management_conversation_log(created_at DESC);

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
CREATE INDEX IF NOT EXISTS idx_wvm_hosts_account ON whatsapp_visitor_management_hosts(account_id);
CREATE INDEX IF NOT EXISTS idx_wvm_audit_created ON whatsapp_visitor_management_audit_log(created_at DESC);

INSERT INTO whatsapp_visitor_management_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
