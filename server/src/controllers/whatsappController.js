// The organisation's single WhatsApp number: status, linking QR, connect and disconnect.
// super_admin only (see routes); the QR is never served without a login.
import { getCompanyWhatsAppStatus, hydrateCompanyCache, startCompanyWhatsApp, stopCompanyWhatsApp } from '../whatsapp/connection.js';
import { Audit } from '../models/index.js';

function actor(req) {
  return req.user?.name || req.user?.username || 'Super admin';
}

export async function whatsappStatus(req, res) {
  await hydrateCompanyCache();
  res.json(getCompanyWhatsAppStatus(true));
}

export async function whatsappConnect(req, res) {
  const status = await startCompanyWhatsApp();
  await Audit.add({ actor: actor(req), action: 'Started WhatsApp linking', details: 'Company WhatsApp' });
  res.json(status);
}

export async function whatsappDisconnect(req, res) {
  const status = await stopCompanyWhatsApp();
  await Audit.add({ actor: actor(req), action: 'Disconnected WhatsApp', details: 'Company WhatsApp' });
  res.json(status);
}
