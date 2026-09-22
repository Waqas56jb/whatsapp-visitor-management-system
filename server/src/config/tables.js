const prefix = process.env.TABLE_PREFIX || 'whatsapp_visitor_management_';

export const T = {
  admins: `${prefix}admins`,
  accounts: `${prefix}accounts`,
  hosts: `${prefix}hosts`,
  visitors: `${prefix}visitors`,
  visits: `${prefix}visits`,
  audit: `${prefix}audit_log`,
  settings: `${prefix}settings`,
  conversations: `${prefix}conversation_states`,
  conversationLog: `${prefix}conversation_log`,
};
