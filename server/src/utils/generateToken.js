import crypto from 'crypto';
import QRCode from 'qrcode';

export function generateQrToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function generatePin() {
  return String(crypto.randomInt(100000, 1000000));
}

export function generateRef() {
  return `VMS-${new Date().getFullYear()}-${crypto.randomInt(100000, 1000000)}`;
}

export function passPayload(token) {
  const raw = String(token || '').trim();
  // PUBLIC_PASS_URL = the admin app's address; the visitor's pass page is its public /pass/ route.
  const base = String(process.env.PUBLIC_PASS_URL || process.env.ADMIN_ORIGIN || '').replace(/\/$/, '');
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
