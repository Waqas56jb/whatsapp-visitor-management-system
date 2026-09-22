-- Restore backup PIN for gate validation. Safe to re-run.

ALTER TABLE whatsapp_visitor_management_visits
  ADD COLUMN IF NOT EXISTS pin TEXT;

CREATE INDEX IF NOT EXISTS idx_wvm_visits_pin
  ON whatsapp_visitor_management_visits(pin);
