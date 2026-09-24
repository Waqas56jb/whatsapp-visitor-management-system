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

export function isGreetingOnly(text) {
  return /^(hi|hii|hello|hey|salam|salaam|good morning|good afternoon|good evening|assalam|hi there)$/i.test(
    String(text || '').trim()
  );
}

export function isNewBooking(text) {
  return /\b(another booking|new booking|new visit|another visit|start over|reset|fresh booking)\b/i.test(
    String(text || '')
  );
}

export function fillEmptySlots(base = {}, extra = {}) {
  const out = mergeSlots({}, base);
  for (const key of Object.keys(emptySlots())) {
    if (!out[key] && extra[key]) out[key] = extra[key];
  }
  return out;
}

export function looksLikeQuestion(text) {
  const value = String(text || '').trim();
  return (
    /\?$/.test(value) ||
    /^(what|where|when|who|how|can i|do you|did|is |are |status|check)\b/i.test(value) ||
    /\b(status|reference|vms-\d{4}-\d+)\b/i.test(value)
  );
}

export function isOffTopic(text) {
  return /\b(c\+\+|javascript|python|html|css|react|write (me )?code|source code|calculator program|leetcode)\b/i.test(
    String(text || '')
  );
}

export function extractDateFromText(text) {
  const raw = String(text || '');
  if (raw.length <= 40) {
    const direct = parseFlexibleDate(raw);
    if (direct && direct !== 'past') return direct;
  }
  const withYear = raw.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})\\s+(20\\d{2})`, 'i'));
  if (withYear) {
    const parsed = parseFlexibleDate(`${withYear[1]} ${withYear[2]} ${withYear[3]}`);
    if (parsed && parsed !== 'past') return parsed;
  }
  const withoutYear = raw.match(new RegExp(`(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})\\b`, 'i'));
  if (withoutYear) {
    const parsed = parseFlexibleDate(`${withoutYear[1]} ${withoutYear[2]}`);
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

function extractHostMention(text) {
  const match = String(text || '').match(
    /\b(?:visit(?:ing)?|meet(?:ing)?(?:\s+with)?|see|host(?:\s+is)?|appointment with|book(?:ing)? with)\s+(?!on\b|at\b|the\b|a\b|an\b|to\b)([A-Za-z][A-Za-z .'-]{1,40})/i
  );
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function matchHostFromMention(mention, hosts = []) {
  const lower = String(mention || '').toLowerCase();
  if (!lower) return null;
  const scored = [];
  for (const host of hosts) {
    const name = String(host.name || '').toLowerCase();
    if (!name) continue;
    if (lower.includes(name) || name.includes(lower)) scored.push({ host, score: 10 });
    else if (name.split(/\s+/).some((part) => part.length > 2 && lower.split(/[^a-z0-9]+/).includes(part))) {
      scored.push({ host, score: 7 });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((item) => item.score === scored[0]?.score).map((item) => item.host);
  return top.length === 1 ? top[0] : null;
}

export function extractSlotsFromText(text, hosts = []) {
  const raw = String(text || '').trim();
  const next = {};
  const date = extractDateFromText(raw);
  const time = extractTimeFromText(raw);
  if (date) next.date = date;
  if (time) next.time = time;

  const nameFrom = raw.match(/^([A-Za-z][A-Za-z .'-]{1,50}?)\s+from\s+/i);
  const nameSaid = raw.match(/(?:my name is|i am|i'm|im)\s+([A-Za-z][A-Za-z .'-]{1,60}?)(?:\s+i\b|\s+from\b|,|$)/i);
  if (nameSaid) next.name = nameSaid[1].replace(/\s+/g, ' ').trim();
  else if (nameFrom) next.name = nameFrom[1].replace(/\s+/g, ' ').trim();

  const companyMatch = raw.match(
    /(?:from|company(?:\s+is)?)\s+([A-Za-z0-9][A-Za-z0-9 .&'-]{1,60}?)(?:\s*[.,]|\s+i\b|\s+i want\b|\s+want\b|$)/i
  );
  if (companyMatch && !/department|host|visit/i.test(companyMatch[1])) {
    next.company = companyMatch[1].replace(/[.,]+$/, '').replace(/\s+/g, ' ').trim();
  }

  const purposeMatch = raw.match(
    /(?:purpose(?:\s+is)?|consult(?:ing)?|for)\s+([A-Za-z][A-Za-z0-9 .,'-]{2,80}?)(?=\s+(?:want|wanna|to visit|on\s+\d|at\s+\d)|[.!?]|$)/i
  );
  if (purposeMatch) {
    const purpose = purposeMatch[1].replace(/[.,]+$/, '').trim();
    if (purpose && !/^(visit|host)$/i.test(purpose)) next.purpose = purpose;
  }

  const mention = extractHostMention(raw);
  const host = matchHostFromMention(mention, hosts);
  if (host) {
    next.hostName = host.name;
    next.hostId = host.id;
    next.hostDept = host.department || '';
  }

  return next;
}

export function applyPlainAnswer(slots, text, hosts = []) {
  const extracted = extractSlotsFromText(text, hosts);
  const next = mergeSlots(slots, extracted);
  const missing = missingSlot(slots);
  const raw = String(text || '').trim();
  if (!missing || isConfirm(raw) || isGreetingOnly(raw) || isNewBooking(raw) || looksLikeQuestion(raw)) return next;
  if (missing === 'name' && !extracted.name && /^[A-Za-z][A-Za-z .'-]{1,60}$/.test(raw) && raw.split(/\s+/).length <= 5) {
    next.name = raw.replace(/\s+/g, ' ');
  }
  if (missing === 'company' && !extracted.company && raw.length > 1 && raw.length < 80) {
    next.company = raw.replace(/\s+/g, ' ');
  }
  if (missing === 'purpose' && !extracted.purpose && raw.length > 2 && raw.length < 160) {
    next.purpose = raw;
  }
  if (missing === 'date' && !extracted.date) {
    const date = extractDateFromText(raw);
    if (date) next.date = date;
  }
  if (missing === 'time' && !extracted.time) {
    const time = extractTimeFromText(raw);
    if (time) next.time = time;
  }
  if (missing === 'host' && !extracted.hostId) {
    const mentioned = matchHostFromMention(raw, hosts);
    if (mentioned) {
      next.hostName = mentioned.name;
      next.hostId = mentioned.id;
      next.hostDept = mentioned.department || '';
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
