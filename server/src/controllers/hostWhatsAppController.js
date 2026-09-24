import { getCompanyWhatsAppStatus, hydrateCompanyCache, startCompanyWhatsApp, stopCompanyWhatsApp } from '../whatsapp/connection.js';

export async function hostWhatsAppStatus(req, res) {
  await hydrateCompanyCache();
  res.json(getCompanyWhatsAppStatus(true));
}

export async function hostWhatsAppConnect(req, res) {
  const status = await startCompanyWhatsApp();
  res.json(status);
}

export async function hostWhatsAppDisconnect(req, res) {
  const status = await stopCompanyWhatsApp();
  res.json(status);
}
