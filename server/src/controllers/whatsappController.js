// The company's own WhatsApp number: status, linking QR, connect and disconnect (company admin).
// The QR is never served without a login, and only for the signed-in user's company.
import { getCompanyWhatsAppStatus, hydrateCompanyCache, startCompanyWhatsApp, stopCompanyWhatsApp } from '../whatsapp/connection.js';
import { Audit } from '../models/index.js';
import { actorName } from '../middleware/auth.js';
import { tenantId } from '../tenant.js';

export async function whatsappStatus(req, res) {
  await hydrateCompanyCache(tenantId());
  res.json(getCompanyWhatsAppStatus(tenantId(), true));
}

export async function whatsappConnect(req, res) {
  const status = await startCompanyWhatsApp(tenantId());
  await Audit.add({ actor: actorName(req), action: 'Started WhatsApp linking', details: 'Company WhatsApp' });
  res.json(status);
}

export async function whatsappDisconnect(req, res) {
  const status = await stopCompanyWhatsApp(tenantId());
  await Audit.add({ actor: actorName(req), action: 'Disconnected WhatsApp', details: 'Company WhatsApp' });
  res.json(status);
}
