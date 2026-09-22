-- WhatsApp booking extras. Safe to re-run. No DROP / TRUNCATE.

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_conversation_states (
  id SERIAL PRIMARY KEY,
  phone_number TEXT NOT NULL UNIQUE,
  current_step TEXT NOT NULL DEFAULT 'menu',
  collected_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE whatsapp_visitor_management_visits
  ADD COLUMN IF NOT EXISTS visit_type TEXT NOT NULL DEFAULT 'official';

ALTER TABLE whatsapp_visitor_management_visits
  ADD COLUMN IF NOT EXISTS visitor_phone TEXT;

ALTER TABLE whatsapp_visitor_management_visits
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

ALTER TABLE whatsapp_visitor_management_visitors
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE INDEX IF NOT EXISTS idx_wvm_visits_qr_token ON whatsapp_visitor_management_visits(qr_token);
CREATE INDEX IF NOT EXISTS idx_wvm_visits_visitor_phone ON whatsapp_visitor_management_visits(visitor_phone);
CREATE INDEX IF NOT EXISTS idx_wvm_hosts_phone ON whatsapp_visitor_management_hosts(phone);
CREATE INDEX IF NOT EXISTS idx_wvm_conversation_phone ON whatsapp_visitor_management_conversation_states(phone_number);
