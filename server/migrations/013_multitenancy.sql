-- Multi-tenant SaaS: companies (tenants), platform-level users and settings, and company_id on
-- every piece of company data. The existing single organisation becomes company 1 and keeps all
-- of its data. Safe on the live database and to re-run: nothing is deleted.

-- 1. Companies (tenants)
CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_companies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  registration_number TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  plan TEXT NOT NULL DEFAULT 'starter',
  feature_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  status_reason TEXT NOT NULL DEFAULT '',
  status_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wvm_companies_status_check') THEN
    ALTER TABLE whatsapp_visitor_management_companies
      ADD CONSTRAINT wvm_companies_status_check CHECK (status IN ('active', 'suspended', 'terminated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wvm_companies_plan_check') THEN
    ALTER TABLE whatsapp_visitor_management_companies
      ADD CONSTRAINT wvm_companies_plan_check CHECK (plan IN ('starter', 'business', 'enterprise'));
  END IF;
END $$;

-- The existing organisation becomes company 1 (enterprise plan), with its old settings.
INSERT INTO whatsapp_visitor_management_companies (id, name, plan, settings)
SELECT 1,
       COALESCE((SELECT NULLIF(org_name, '') FROM whatsapp_visitor_management_settings WHERE id = 1), 'Botho Innovations'),
       'enterprise',
       jsonb_build_object(
         'phone', COALESCE((SELECT phone FROM whatsapp_visitor_management_settings WHERE id = 1), ''),
         'email', COALESCE((SELECT email FROM whatsapp_visitor_management_settings WHERE id = 1), '')
       )
WHERE NOT EXISTS (SELECT 1 FROM whatsapp_visitor_management_companies WHERE id = 1);

SELECT setval(pg_get_serial_sequence('whatsapp_visitor_management_companies', 'id'),
              GREATEST((SELECT MAX(id) FROM whatsapp_visitor_management_companies), 1));

-- 2. company_id on every piece of company data, backfilled to company 1.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['hosts', 'visitors', 'visits', 'conversation_states', 'conversation_log', 'knowledge_base'] LOOP
    EXECUTE format('ALTER TABLE whatsapp_visitor_management_%s ADD COLUMN IF NOT EXISTS company_id INTEGER', t);
    EXECUTE format('UPDATE whatsapp_visitor_management_%s SET company_id = 1 WHERE company_id IS NULL', t);
    EXECUTE format('ALTER TABLE whatsapp_visitor_management_%s ALTER COLUMN company_id SET NOT NULL', t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = format('wvm_%s_company_fk', t)) THEN
      EXECUTE format(
        'ALTER TABLE whatsapp_visitor_management_%s ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES whatsapp_visitor_management_companies(id) ON DELETE CASCADE',
        t, format('wvm_%s_company_fk', t));
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON whatsapp_visitor_management_%s(company_id)', format('idx_wvm_%s_company', t), t);
  END LOOP;
END $$;

-- 3. Platform and company users share the admins table. Platform users have no company.
ALTER TABLE whatsapp_visitor_management_admins ADD COLUMN IF NOT EXISTS company_id INTEGER;
ALTER TABLE whatsapp_visitor_management_admins ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wvm_admins_company_fk') THEN
    ALTER TABLE whatsapp_visitor_management_admins
      ADD CONSTRAINT wvm_admins_company_fk FOREIGN KEY (company_id) REFERENCES whatsapp_visitor_management_companies(id) ON DELETE CASCADE;
  END IF;
END $$;
ALTER TABLE whatsapp_visitor_management_admins DROP CONSTRAINT IF EXISTS wvm_admins_role_check;
-- Roles from the single-company version: admin → company admin, reception → company security.
UPDATE whatsapp_visitor_management_admins SET role = 'company_admin', company_id = 1 WHERE role = 'admin';
UPDATE whatsapp_visitor_management_admins SET role = 'company_security', company_id = 1 WHERE role = 'reception';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wvm_admins_role_scope_check') THEN
    ALTER TABLE whatsapp_visitor_management_admins ADD CONSTRAINT wvm_admins_role_scope_check CHECK (
      (role IN ('super_admin', 'platform_support', 'platform_billing') AND company_id IS NULL)
      OR (role IN ('company_admin', 'company_manager', 'company_hr', 'company_security') AND company_id IS NOT NULL)
    );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_wvm_admins_company ON whatsapp_visitor_management_admins(company_id);

-- 4. Audit log: company_id is NULL for platform-level events. Rows written before this migration
-- all belonged to the single organisation; they are moved to company 1 exactly once (a marker in
-- the platform settings), so later platform events are never reassigned on a re-run.
CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_platform_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO whatsapp_visitor_management_platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE whatsapp_visitor_management_audit_log ADD COLUMN IF NOT EXISTS company_id INTEGER;
DO $$
BEGIN
  IF NOT COALESCE((SELECT (data->>'audit_backfilled')::boolean FROM whatsapp_visitor_management_platform_settings WHERE id = 1), FALSE) THEN
    UPDATE whatsapp_visitor_management_audit_log SET company_id = 1 WHERE company_id IS NULL;
    UPDATE whatsapp_visitor_management_platform_settings
       SET data = data || '{"audit_backfilled": true}'::jsonb WHERE id = 1;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_wvm_audit_company ON whatsapp_visitor_management_audit_log(company_id, created_at DESC);

-- 5. Conversations are per company: the same phone can talk to several companies' numbers.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'whatsapp_visitor_management_conversation_states'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE whatsapp_visitor_management_conversation_states DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
DROP INDEX IF EXISTS idx_wvm_cstate_phone_acct;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wvm_cstate_company_phone
  ON whatsapp_visitor_management_conversation_states(company_id, phone_number);

-- 6. One linked WhatsApp number per company.
ALTER TABLE whatsapp_visitor_management_company_whatsapp ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE whatsapp_visitor_management_company_whatsapp SET company_id = 1 WHERE id = 1 AND company_id IS NULL;
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'whatsapp_visitor_management_company_whatsapp'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE whatsapp_visitor_management_company_whatsapp DROP CONSTRAINT %I', c.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wvm_company_whatsapp_company_fk') THEN
    ALTER TABLE whatsapp_visitor_management_company_whatsapp
      ADD CONSTRAINT wvm_company_whatsapp_company_fk FOREIGN KEY (company_id) REFERENCES whatsapp_visitor_management_companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DELETE FROM whatsapp_visitor_management_company_whatsapp WHERE company_id IS NULL;
CREATE SEQUENCE IF NOT EXISTS wvm_company_whatsapp_id_seq OWNED BY whatsapp_visitor_management_company_whatsapp.id;
SELECT setval('wvm_company_whatsapp_id_seq', GREATEST((SELECT MAX(id) FROM whatsapp_visitor_management_company_whatsapp), 1));
ALTER TABLE whatsapp_visitor_management_company_whatsapp ALTER COLUMN id SET DEFAULT nextval('wvm_company_whatsapp_id_seq');
CREATE UNIQUE INDEX IF NOT EXISTS idx_wvm_company_whatsapp_company ON whatsapp_visitor_management_company_whatsapp(company_id);

-- 7. Visitor profiles, host offices and visit details for the Corporate Office chat flow.
ALTER TABLE whatsapp_visitor_management_hosts ADD COLUMN IF NOT EXISTS office TEXT NOT NULL DEFAULT '';
ALTER TABLE whatsapp_visitor_management_hosts ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE whatsapp_visitor_management_visitors ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE whatsapp_visitor_management_visitors ADD COLUMN IF NOT EXISTS profile_type TEXT NOT NULL DEFAULT '';
ALTER TABLE whatsapp_visitor_management_visits ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'visit';
ALTER TABLE whatsapp_visitor_management_visits ADD COLUMN IF NOT EXISTS appointment_type TEXT NOT NULL DEFAULT '';
ALTER TABLE whatsapp_visitor_management_visits ADD COLUMN IF NOT EXISTS topic TEXT NOT NULL DEFAULT '';
ALTER TABLE whatsapp_visitor_management_visits ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE whatsapp_visitor_management_visits ADD COLUMN IF NOT EXISTS flag_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE whatsapp_visitor_management_visits ADD COLUMN IF NOT EXISTS screening JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE whatsapp_visitor_management_visits ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ;
ALTER TABLE whatsapp_visitor_management_visits ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE whatsapp_visitor_management_visits ADD COLUMN IF NOT EXISTS decided_by TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_wvm_visits_company_date ON whatsapp_visitor_management_visits(company_id, visit_date);

-- 8. Feedback, service requests, human handovers and uploaded documents.
CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_feedback (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES whatsapp_visitor_management_companies(id) ON DELETE CASCADE,
  ref_number TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  visitor_id INTEGER REFERENCES whatsapp_visitor_management_visitors(id) ON DELETE SET NULL,
  visit_id INTEGER REFERENCES whatsapp_visitor_management_visits(id) ON DELETE SET NULL,
  topic TEXT NOT NULL DEFAULT 'general',
  rating INTEGER,
  comment TEXT NOT NULL DEFAULT '',
  is_complaint BOOLEAN NOT NULL DEFAULT FALSE,
  contact_requested BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wvm_feedback_company ON whatsapp_visitor_management_feedback(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_service_requests (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES whatsapp_visitor_management_companies(id) ON DELETE CASCADE,
  ref_number TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  visitor_id INTEGER REFERENCES whatsapp_visitor_management_visitors(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  staff_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wvm_service_company ON whatsapp_visitor_management_service_requests(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_handovers (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES whatsapp_visitor_management_companies(id) ON DELETE CASCADE,
  ref_number TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'open',
  closed_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wvm_handovers_company ON whatsapp_visitor_management_handovers(company_id, status);

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_visitor_documents (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES whatsapp_visitor_management_companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'id_document',
  phone TEXT NOT NULL DEFAULT '',
  visitor_id INTEGER REFERENCES whatsapp_visitor_management_visitors(id) ON DELETE SET NULL,
  visit_id INTEGER REFERENCES whatsapp_visitor_management_visits(id) ON DELETE SET NULL,
  service_request_id INTEGER REFERENCES whatsapp_visitor_management_service_requests(id) ON DELETE SET NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_name TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wvm_documents_company ON whatsapp_visitor_management_visitor_documents(company_id);

-- 9. Platform: announcements, and daily usage meters per company (settings are created above).
CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'info',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT '',
  emailed_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_usage_daily (
  company_id INTEGER NOT NULL REFERENCES whatsapp_visitor_management_companies(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  metric TEXT NOT NULL,
  value BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, day, metric)
);
