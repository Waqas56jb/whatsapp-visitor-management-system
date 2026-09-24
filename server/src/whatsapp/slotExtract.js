import { parseFlexibleDate, parseFlexibleTime } from '../utils/dateParse.js';

const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';

export function emptySlots() {
  return {
    name: '',
    company: '',
    purpose: '',
    date: '',
    time: '',
    hostName: '',
    hostId: null,
    hostDept: '',
  };
}

export function mergeSlots(prev = {}, next = {}) {
  const out = { ...emptySlots(), ...prev };
  for (const key of Object.keys(emptySlots())) {
    const value = next[key];
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

export function slotsReady(slots) {
  return Boolean(slots?.name && slots?.purpose && slots?.date && slots?.time && (slots.hostId || slots.hostName));
}

export function missingSlot(slots) {
  if (!slots?.name) return 'name';
  if (!slots?.company) return 'company';
  if (!slots?.purpose) return 'purpose';
  if (!slots?.hostId && !slots?.hostName) return 'host';
  if (!slots?.date) return 'date';
  if (!slots?.time) return 'time';
  return null;
}

export function isConfirm(text) {
  const value = String(text || '').trim().toLowerCase();
  return /^(yes|yeah|yep|yup|ok|okay|sure|please|proceed|confirm|book|do it)\b/.test(value) || /book my|please book|go ahead|that is correct|that's correct|confirmed/.test(value);
}

export function isOffTopic(text) {
  return /\b(c\+\+|javascript|python|html|css|react|write (me )?code|source code|calculator program|leetcode)\b/i.test(
    String(text || '')
  );
}

export function extractDateFromText(text) {
  const raw = String(text || '');
  const direct = parseFlexibleDate(raw);
  if (direct && direct !== 'past') return direct;
  const match = raw.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})\\s+(20\\d{2})`, 'i'));
  if (match) {
    const parsed = parseFlexibleDate(`${match[1]} ${match[2]} ${match[3]}`);
    if (parsed && parsed !== 'past') return parsed;
  }
  const iso = raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  return null;
}

export function extractTimeFromText(text) {
  const raw = String(text || '');
  const direct = parseFlexibleTime(raw);
  if (direct) return direct;
  const match = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (match) return parseFlexibleTime(match[0]);
  return null;
}

function looksLikeVisitHost(text) {
  return /\b(visit(?:ing)?|meet(?:ing)? with|see|host|appointment with|book(?:ing)? with)\b/i.test(text);
}

export function extractSlotsFromText(text, hosts = []) {
  const raw = String(text || '').trim();
  const next = {};
  const date = extractDateFromText(raw);
  const time = extractTimeFromText(raw);
  if (date) next.date = date;
  if (time) next.time = time;

  const nameMatch = raw.match(/(?:my name is|i am|i'm|im)\s+([A-Za-z][A-Za-z .'-]{1,60}?)(?:\s+i\b|\s+from\b|,|$)/i);
  if (nameMatch) next.name = nameMatch[1].replace(/\s+/g, ' ').trim();

  const companyMatch = raw.match(/(?:from|company(?:\s+is)?)\s+([A-Za-z0-9][A-Za-z0-9 .&'-]{1,60}?)(?:\s+i\b|\s+want\b|,|$)/i);
  if (companyMatch && !/department|host|visit/i.test(companyMatch[1])) {
    next.company = companyMatch[1].replace(/\s+/g, ' ').trim();
  }

  const purposeMatch = raw.match(/(?:purpose(?:\s+is)?|consult(?:ing)?|for)\s+([A-Za-z][A-Za-z0-9 .,'-]{2,80})/i);
  if (purposeMatch && !/visit|host/i.test(purposeMatch[1])) next.purpose = purposeMatch[1].trim();

  const lower = raw.toLowerCase();
  const scored = [];
  for (const host of hosts) {
    const name = String(host.name || '').toLowerCase();
    const dept = String(host.department || '').toLowerCase();
    if (name && lower.includes(name)) scored.push({ host, score: 10 });
    else if (dept && (lower.includes(dept) || dept.split(/\s+/).some((part) => part.length > 3 && lower.includes(part)))) {
      scored.push({ host, score: 4 });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  if (scored[0] && (scored[0].score >= 10 || looksLikeVisitHost(raw))) {
    const top = scored.filter((item) => item.score === scored[0].score).map((item) => item.host);
    if (top.length === 1) {
      next.hostName = top[0].name;
      next.hostId = top[0].id;
      next.hostDept = top[0].department || '';
    } else if (top.length > 1 && scored[0].score >= 10) {
      next.hostName = top[0].name;
      next.hostId = top[0].id;
      next.hostDept = top[0].department || '';
    }
  }

  return next;
}

export function askFor(missing) {
  const prompts = {
    name: 'May I have your full name?',
    company: 'Which company are you visiting from?',
    purpose: 'What is the purpose of your visit?',
    host: 'Who would you like to visit? Please share the host name or department.',
    date: 'Which date would you like to visit?',
    time: 'What time works for you?',
  };
  return prompts[missing] || 'Please share the remaining visit details.';
}

export function summaryLines(slots) {
  return [
    `Name: ${slots.name || 'not yet provided'}`,
    `Company: ${slots.company || 'not yet provided'}`,
    `Purpose: ${slots.purpose || 'not yet provided'}`,
    `Date: ${slots.date || 'not yet provided'}`,
    `Time: ${slots.time || 'not yet provided'}`,
    `Host: ${slots.hostName || 'not yet provided'}${slots.hostDept ? ` (${slots.hostDept})` : ''}`,
  ].join('\n');
}

export function cleanReply(text) {
  return String(text || '')
    .replace(/\*\*/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/`/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
