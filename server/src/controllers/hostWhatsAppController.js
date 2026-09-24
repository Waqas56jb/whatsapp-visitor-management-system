import { getCompanyWhatsAppStatus, startCompanyWhatsApp, stopCompanyWhatsApp } from '../whatsapp/connection.js';

export async function hostWhatsAppStatus(req, res) {
  res.json(getCompanyWhatsAppStatus(true));
}

export async function hostWhatsAppConnect(req, res) {
  const current = getCompanyWhatsAppStatus(true);
  if (current.connected) return res.json(current);
  const status = await startCompanyWhatsApp();
  res.json(status);
}

export async function hostWhatsAppDisconnect(req, res) {
  const status = await stopCompanyWhatsApp();
  res.json(status);
}
