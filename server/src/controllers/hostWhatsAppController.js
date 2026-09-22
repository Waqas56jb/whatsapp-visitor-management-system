import { getClientWhatsAppStatus, startClientWhatsApp, stopClientWhatsApp } from '../whatsapp/connection.js';

export async function hostWhatsAppStatus(req, res) {
  const accountId = req.user?.accountId;
  if (!accountId) return res.status(400).json({ error: 'Account not linked' });
  res.json(getClientWhatsAppStatus(accountId, true));
}

export async function hostWhatsAppConnect(req, res) {
  const accountId = req.user?.accountId;
  const hostId = req.user?.hostId;
  if (!accountId) return res.status(400).json({ error: 'Account not linked' });
  await startClientWhatsApp(accountId, hostId);
  res.json(getClientWhatsAppStatus(accountId, true));
}

export async function hostWhatsAppDisconnect(req, res) {
  const accountId = req.user?.accountId;
  if (!accountId) return res.status(400).json({ error: 'Account not linked' });
  await stopClientWhatsApp(accountId);
  res.json({ connected: false, connecting: false, qrAvailable: false, qrDataUrl: null, user: null });
}
