import crypto from 'crypto';
import QRCode from 'qrcode';

export function generateQrToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function generateRef() {
  return 'VMS-2026-' + Math.floor(100000 + Math.random() * 900000);
}

export function passPayload(token) {
  const raw = String(token || '').trim();
  const base = String(process.env.PUBLIC_PASS_URL || process.env.CLIENT_ORIGIN || '').replace(/\/$/, '');
  return base && raw ? `${base}/pass/${raw}` : raw;
}

export function extractPassToken(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/\/pass\/([a-f0-9]{16,})/i);
  if (match) return match[1];
  return raw;
}

export async function generateQrImage(token) {
  return QRCode.toDataURL(passPayload(token), { margin: 1, width: 240, errorCorrectionLevel: 'M' });
}

export async function generateQrBuffer(token) {
  return QRCode.toBuffer(passPayload(token), {
    type: 'png',
    margin: 1,
    width: 512,
    errorCorrectionLevel: 'M',
  });
}
