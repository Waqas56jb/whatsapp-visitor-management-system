-- Hosts and accounts may now use status = 'blocked'
-- (alongside active / inactive / disabled). TEXT columns, no rewrite needed.

COMMENT ON COLUMN whatsapp_visitor_management_hosts.status IS
  'active | inactive | blocked';

COMMENT ON COLUMN whatsapp_visitor_management_accounts.status IS
  'active | disabled | blocked';
