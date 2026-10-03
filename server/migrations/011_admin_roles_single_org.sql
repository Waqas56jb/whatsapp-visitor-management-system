-- Single-organisation admin panel: roles and status on admins, and organisation-wide training.
-- Safe on the live database and to re-run: no rows are deleted, no table is dropped.

-- 1. Admin roles: super_admin | admin | reception, and status: active | blocked.
ALTER TABLE whatsapp_visitor_management_admins
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin';

ALTER TABLE whatsapp_visitor_management_admins
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- The admins that exist before roles are introduced become super_admin. Once any super_admin
-- exists this does nothing, so re-running never promotes admins created later.
UPDATE whatsapp_visitor_management_admins
   SET role = 'super_admin'
 WHERE NOT EXISTS (SELECT 1 FROM whatsapp_visitor_management_admins WHERE role = 'super_admin')
   AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wvm_admins_role_scope_check');

DO $$
BEGIN
  -- Skipped once the multi-company roles (013) are in place.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('wvm_admins_role_check', 'wvm_admins_role_scope_check')) THEN
    ALTER TABLE whatsapp_visitor_management_admins
      ADD CONSTRAINT wvm_admins_role_check CHECK (role IN ('super_admin', 'admin', 'reception')) NOT VALID;
    ALTER TABLE whatsapp_visitor_management_admins VALIDATE CONSTRAINT wvm_admins_role_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wvm_admins_status_check') THEN
    ALTER TABLE whatsapp_visitor_management_admins
      ADD CONSTRAINT wvm_admins_status_check CHECK (status IN ('active', 'blocked')) NOT VALID;
    ALTER TABLE whatsapp_visitor_management_admins VALIDATE CONSTRAINT wvm_admins_status_check;
  END IF;
END $$;

-- 2. Knowledge base belongs to the organisation, not to a portal account. account_id becomes
-- optional and its ON DELETE CASCADE foreign key is dropped, so deleting an account can never
-- delete training. Existing rows keep their values.
ALTER TABLE whatsapp_visitor_management_knowledge_base
  ALTER COLUMN account_id DROP NOT NULL;

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'whatsapp_visitor_management_knowledge_base'::regclass
       AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE whatsapp_visitor_management_knowledge_base DROP CONSTRAINT %I', fk.conname);
  END LOOP;
END $$;
