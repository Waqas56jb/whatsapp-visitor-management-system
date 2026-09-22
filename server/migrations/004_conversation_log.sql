-- Full WhatsApp conversation history. Safe to re-run.

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
