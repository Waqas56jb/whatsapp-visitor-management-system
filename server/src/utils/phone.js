export function normalizePhone(input) {
  return String(input || '').replace(/\D/g, '');
}

export function displayPhone(input) {
  const digits = normalizePhone(input);
  return digits ? `+${digits}` : '';
}

export function phoneFromJid(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

export function toJid(phoneOrJid) {
  const value = String(phoneOrJid || '').trim();
  if (value.includes('@')) return value;
  const digits = normalizePhone(value);
  return digits ? `${digits}@s.whatsapp.net` : '';
}

