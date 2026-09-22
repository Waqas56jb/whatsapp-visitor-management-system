-- Remove backup PIN. Safe to re-run.

DROP INDEX IF EXISTS idx_wvm_visits_pin;

ALTER TABLE whatsapp_visitor_management_visits
  DROP COLUMN IF EXISTS pin;
