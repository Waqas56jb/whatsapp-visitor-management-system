export function normalizePhone(input) {
  return String(input || '').replace(/\D/g, '');
}

export function displayPhone(input) {
  const digits = normalizePhone(input);
  return digits ? `+${digits}` : '';
}
