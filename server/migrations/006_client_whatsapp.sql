-- Per-client WhatsApp link + knowledge base. Safe to re-run.

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

CREATE INDEX IF NOT EXISTS idx_wvm_kb_account
  ON whatsapp_visitor_management_knowledge_base(account_id);

ALTER TABLE whatsapp_visitor_management_conversation_states
  ADD COLUMN IF NOT EXISTS account_id INTEGER NOT NULL DEFAULT 0;

ALTER TABLE whatsapp_visitor_management_conversation_states
  DROP CONSTRAINT IF EXISTS whatsapp_visitor_management_conversation_states_phone_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wvm_cstate_phone_acct
  ON whatsapp_visitor_management_conversation_states(phone_number, account_id);

ALTER TABLE whatsapp_visitor_management_conversation_log
  ADD COLUMN IF NOT EXISTS account_id INTEGER;
