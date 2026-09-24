import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export const ORG_TIMEZONE = process.env.ORG_TIMEZONE || 'Africa/Gaborone';

const MONTHS = {
  january: 1, jan: 1, ferikgong: 1, janeware: 1, janyuwari: 1,
  february: 2, feb: 2, tlhakole: 2, feberware: 2,
  march: 3, mar: 3, mopitlwe: 3, matshe: 3,
  april: 4, apr: 4, moranang: 4, aporele: 4,
  may: 5, motsheganong: 5, mei: 5,
  june: 6, jun: 6, seetebosigo: 6, jone: 6,
  july: 7, jul: 7, phukwi: 7, julae: 7,
  august: 8, aug: 8, phatwe: 8, agosetose: 8,
  september: 9, sep: 9, sept: 9, lwetse: 9, setemere: 9,
  october: 10, oct: 10, diphalane: 10, okotobore: 10,
  november: 11, nov: 11, ngwanatsele: 11, nofemere: 11,
  december: 12, dec: 12, sedimonthole: 12, sedimothole: 12, desemere: 12,
};

const WEEKDAYS = {
  sunday: 0, sun: 0, tshipi: 0,
  monday: 1, mon: 1, mosupologo: 1,
  tuesday: 2, tue: 2, tues: 2, labobedi: 2,
  wednesday: 3, wed: 3, laboraro: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, labone: 4,
  friday: 5, fri: 5, labotlhano: 5,
  saturday: 6, sat: 6, lamatlhatso: 6,
};

const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const WEEKDAY_RE = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');

export function todayStamp(now = new Date()) {
  return dayjs(now).tz(ORG_TIMEZONE).format('YYYY-MM-DD');
}

export function nowTime(now = new Date()) {
  return dayjs(now).tz(ORG_TIMEZONE).format('HH:mm');
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function build(year, month, day) {
  if (!month || !day || month > 12 || day > 31) return null;
  const d = dayjs(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, 'YYYY-MM-DD');
  if (!d.isValid() || d.date() !== day || d.month() + 1 !== month) return null;
  return d;
}

function resolve(day, month, year, today) {
  const base = dayjs(today);
  if (year) {
    const full = year < 100 ? 2000 + year : year;
    const d = build(full, month, day);
    if (!d) return null;
    return d.isBefore(base, 'day') ? 'past' : d.format('YYYY-MM-DD');
  }
  let d = build(base.year(), month, day);
  if (!d) return null;
  if (d.isBefore(base, 'day')) d = build(base.year() + 1, month, day);
  return d ? d.format('YYYY-MM-DD') : null;
}

// Finds a visit date anywhere in free text. Returns 'YYYY-MM-DD', 'past', or null.
export function extractDate(text, today = todayStamp()) {
  const raw = normalize(text);
  if (!raw) return null;
  const base = dayjs(today);

  if (/\b(day after tomorrow|kamoso o mongwe|ka moso o mongwe)\b/.test(raw)) return base.add(2, 'day').format('YYYY-MM-DD');
  if (/\b(tomorrow|tomorow|tommorow|tommorrow|tmrw|tmr|kamoso|ka moso)\b/.test(raw)) return base.add(1, 'day').format('YYYY-MM-DD');
  if (/\b(today|gompieno|gompeno|tonight)\b/.test(raw)) return base.format('YYYY-MM-DD');

  let m = raw.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return resolve(Number(m[3]), Number(m[2]), Number(m[1]), today);

  m = raw.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (m) return resolve(Number(m[1]), Number(m[2]), Number(m[3]), today);

  m = raw.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (m) return resolve(Number(m[1]), Number(m[2]), null, today);

  m = raw.match(new RegExp(`\\b(\\d{1,2})\\s*(?:of\\s+|la\\s+)?(${MONTH_RE})\\b\\.?(?:,?\\s*(20\\d{2}))?`));
  if (m) return resolve(Number(m[1]), MONTHS[m[2]], m[3] ? Number(m[3]) : null, today);

  m = raw.match(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})\\b(?!\\s*(?::|am|pm|a\\.m|p\\.m))(?:,?\\s*(20\\d{2}))?`));
  if (m) return resolve(Number(m[2]), MONTHS[m[1]], m[3] ? Number(m[3]) : null, today);

  m = raw.match(new RegExp(`\\b(${WEEKDAY_RE})\\b`));
  if (m) {
    const target = WEEKDAYS[m[1]];
    const ahead = (target - base.day() + 7) % 7 || 7;
    return base.add(ahead, 'day').format('YYYY-MM-DD');
  }
  return null;
}

function hhmm(hours, minutes) {
  if (hours > 23 || minutes > 59 || hours < 0) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Office visits: a bare "3" means 15:00, a bare "10" means 10:00.
function businessHour(h) {
  if (h >= 1 && h <= 6) return h + 12;
  return h;
}

const PM_WORDS = 'pm|p\\.m\\.?|afternoon|evening|motshegare|mo tshokologong|tshokologo|mo maitseboeng|maitseboeng';
const AM_WORDS = 'am|a\\.m\\.?|morning|mo mosong|mosong';

// Finds a visit time anywhere in free text. Returns 'HH:mm' or null.
export function extractTime(text, { bare = false } = {}) {
  const raw = normalize(text);
  if (!raw) return null;

  if (/\b(noon|midday|12 noon)\b/.test(raw)) return '12:00';

  let m = raw.match(new RegExp(`\\b(\\d{1,2})(?:[:.h](\\d{2}))?\\s*(?:o'?clock\\s*)?(?:in the\\s+)?(${PM_WORDS}|${AM_WORDS})(?![a-z])`));
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2] || 0);
    const isPm = new RegExp(`^(${PM_WORDS})$`).test(m[3]);
    if (h > 12 || h === 0) return hhmm(h, min);
    if (isPm && h < 12) h += 12;
    if (!isPm && h === 12) h = 0;
    return hhmm(h, min);
  }

  m = raw.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/);
  if (m) return hhmm(Number(m[1]), Number(m[2]));

  m = raw.match(new RegExp(`\\b(?:at|ka|around|about)\\s+(\\d{1,2})\\b(?![\\d:/.-])(?!\\s*(?:${MONTH_RE}|of\\b|la\\b))`));
  if (m) return hhmm(businessHour(Number(m[1])), 0);

  if (bare) {
    m = raw.match(/^(\d{1,2})$/);
    if (m && Number(m[1]) <= 23) return hhmm(businessHour(Number(m[1])), 0);
  }
  return null;
}

// Backwards-compatible single-value parsers used by the admin/public forms.
export function parseFlexibleDate(input) {
  return extractDate(input);
}

export function parseFlexibleTime(input) {
  return extractTime(input, { bare: true });
}
