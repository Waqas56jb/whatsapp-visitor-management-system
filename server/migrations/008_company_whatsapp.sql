CREATE TABLE IF NOT EXISTS whatsapp_visitor_management_company_whatsapp (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'disconnected',
  phone TEXT,
  wa_name TEXT,
  creds JSONB,
  keys JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO whatsapp_visitor_management_company_whatsapp (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
