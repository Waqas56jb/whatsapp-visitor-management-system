import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(customParseFormat);

const DATE_FORMATS = [
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'DD-MM-YYYY',
  'DD/MM/YYYY',
  'D-M-YYYY',
  'D/M/YYYY',
  'D MMM YYYY',
  'D MMMM YYYY',
  'DD MMM YYYY',
  'DD MMMM YYYY',
  'D MMM',
  'D MMMM',
  'DD MMM',
  'DD MMMM',
  'MMM D',
  'MMMM D',
  'MMM D YYYY',
  'MMMM D YYYY',
];

function stamp(d) {
  return d.format('YYYY-MM-DD');
}

export function parseFlexibleDate(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const today = dayjs().startOf('day');

  if (lower === 'today') return stamp(today);
  if (lower === 'tomorrow') return stamp(today.add(1, 'day'));

  for (const fmt of DATE_FORMATS) {
    const parsed = dayjs(raw, fmt, true);
    if (!parsed.isValid()) continue;
    let value = parsed;
    if (!fmt.includes('Y')) {
      value = parsed.year(today.year());
      if (value.isBefore(today, 'day')) value = value.add(1, 'year');
    }
    if (value.isBefore(today, 'day')) return 'past';
    return stamp(value);
  }
  return null;
}

export function parseFlexibleTime(input) {
  const raw = String(input || '').trim();
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || '0');
  const mer = (match[3] || '').toLowerCase().replace(/\./g, '');
  if (minutes > 59) return null;
  if (mer.startsWith('p') && hours < 12) hours += 12;
  if (mer.startsWith('a') && hours === 12) hours = 0;
  if (!mer && hours > 23) return null;
  if (hours > 23) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
