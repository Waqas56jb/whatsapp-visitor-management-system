const prefix = process.env.TABLE_PREFIX || 'whatsapp_visitor_management_';

export const T = {
  companies: `${prefix}companies`,
  platformSettings: `${prefix}platform_settings`,
  announcements: `${prefix}announcements`,
  usage: `${prefix}usage_daily`,
  admins: `${prefix}admins`,
  hosts: `${prefix}hosts`,
  visitors: `${prefix}visitors`,
  visits: `${prefix}visits`,
  audit: `${prefix}audit_log`,
  conversations: `${prefix}conversation_states`,
  conversationLog: `${prefix}conversation_log`,
  knowledge: `${prefix}knowledge_base`,
  companyWhatsApp: `${prefix}company_whatsapp`,
  feedback: `${prefix}feedback`,
  serviceRequests: `${prefix}service_requests`,
  handovers: `${prefix}handovers`,
  documents: `${prefix}visitor_documents`,
  // Legacy, no longer used by the code (kept in the database): accounts, whatsapp_links, settings.
  settings: `${prefix}settings`,
};
