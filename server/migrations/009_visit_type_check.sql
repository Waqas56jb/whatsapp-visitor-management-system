-- Every visit is either 'official' or 'social'.
-- Safe to run on the live database and to re-run: existing values are normalised first, and the
-- constraint is only added when it does not exist yet.

-- 'Social' / ' social ' (any casing or spacing) is kept as social; anything else becomes official.
UPDATE whatsapp_visitor_management_visits
   SET visit_type = 'social'
 WHERE LOWER(TRIM(visit_type)) = 'social' AND visit_type <> 'social';

UPDATE whatsapp_visitor_management_visits
   SET visit_type = 'official'
 WHERE visit_type IS NULL OR visit_type NOT IN ('official', 'social');

ALTER TABLE whatsapp_visitor_management_visits
  ALTER COLUMN visit_type SET DEFAULT 'official';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'wvm_visits_visit_type_check'
       AND conrelid = 'whatsapp_visitor_management_visits'::regclass
  ) THEN
    -- NOT VALID + VALIDATE keeps the table lock short on a live database.
    ALTER TABLE whatsapp_visitor_management_visits
      ADD CONSTRAINT wvm_visits_visit_type_check CHECK (visit_type IN ('official', 'social')) NOT VALID;
    ALTER TABLE whatsapp_visitor_management_visits
      VALIDATE CONSTRAINT wvm_visits_visit_type_check;
  END IF;
END $$;
