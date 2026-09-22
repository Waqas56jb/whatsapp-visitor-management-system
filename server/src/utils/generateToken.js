import crypto from 'crypto';
import QRCode from 'qrcode';

export function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function generateQrToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function generateRef() {
  return 'VMS-2026-' + Math.floor(100000 + Math.random() * 900000);
}

export async function generateQrImage(token) {
  return QRCode.toDataURL(String(token || ''), { margin: 1, width: 240, errorCorrectionLevel: 'M' });
}

export async function generateQrBuffer(token) {
  return QRCode.toBuffer(String(token || ''), {
    type: 'png',
    margin: 1,
    width: 512,
    errorCorrectionLevel: 'M',
  });
}
