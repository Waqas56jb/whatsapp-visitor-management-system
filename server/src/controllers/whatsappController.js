import fs from 'fs';
import { getQrFilePath, getWhatsAppStatus } from '../whatsapp/connection.js';

export function whatsappStatus(req, res) {
  res.json(getWhatsAppStatus());
}

export function whatsappQr(req, res) {
  const file = getQrFilePath();
  const status = getWhatsAppStatus();
  if (!status.qrAvailable || !fs.existsSync(file)) {
    return res.status(404).json({
      error: status.connected
        ? 'WhatsApp is already linked. No QR is needed.'
        : 'QR code is not ready yet. Watch the server terminal or try again in a few seconds.',
    });
  }
  res.sendFile(file);
}
