-- Host approval by WhatsApp reply: each visit remembers the WhatsApp message id of the request
-- sent to its host, so a reply that quotes that message applies to that visit.
-- Safe on the live database and to re-run: one nullable column and an index, no data change.

ALTER TABLE whatsapp_visitor_management_visits
  ADD COLUMN IF NOT EXISTS host_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_wvm_visits_host_message_id
  ON whatsapp_visitor_management_visits(host_message_id);
