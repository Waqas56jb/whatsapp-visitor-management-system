// Pure field extraction from a visitor message. No DB, no LLM.
import { extractDate, extractTime, todayStamp } from '../utils/dateParse.js';
import { isGreetingOnly, isNo, isYes, looksLikeQuestion } from './lang.js';

export const FIELD_ORDER = ['name', 'company', 'purpose', 'host', 'date', 'time'];

export function emptySlots() {
  return { name: '', company: '', purpose: '', hostId: null, hostName: '', hostDept: '', date: '', time: '' };
}

export function missingField(slots) {
  if (!slots.name) return 'name';
  if (!slots.company) return 'company';
  if (!slots.purpose) return 'purpose';
  if (!slots.hostId) return 'host';
  if (!slots.date) return 'date';
  if (!slots.time) return 'time';
  return null;
}

const NAME_WORD = "[A-Za-z][A-Za-z'.\\-]*";

const NAME_CUT = new Set([
  'from', 'and', 'i', "i'm", 'im', 'want', 'to', 'at', 'on', 'for', 'with', 'of', 'the', 'a', 'an', 'here', 'coming',
  'visiting', 'ke', 'ka', 'kwa', 'mme', 'le', 'representing', 'calling', 'writing', 'working', 'company', 'my', 'will',
  'would', 'am', 'is', 'and', 'but', 'please', 'tsweetswee', 'tomorrow', 'today', 'purpose', 'visit',
]);

const NOT_NAME = new Set([
  'coming', 'here', 'from', 'visiting', 'going', 'looking', 'interested', 'not', 'available', 'fine', 'good', 'ok',
  'okay', 'well', 'planning', 'booking', 'trying', 'hoping', 'calling', 'writing', 'requesting', 'just', 'also',
  'back', 'done', 'ready', 'sorry', 'new', 'sure', 'a', 'an', 'the', 'very', 'glad', 'happy', 'at', 'in', 'on', 'to',
  'with', 'supposed', 'meant', 'due', 'late', 'early', 'bringing', 'delivering', 'applying', 'yes', 'no', 'hi',
  'hello', 'hey', 'dumela', 'thanks', 'thank', 'waiting', 'still', 'there', 'fine', 'afraid', 'unable', 'able',
]);

function titleCase(value) {
  return value
    .split(/\s+/)
    .map((w) => (w === w.toLowerCase() || w === w.toUpperCase() ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

export function cleanName(raw) {
  const words = String(raw || '')
    .replace(/[^A-Za-z'.\-\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out = [];
  for (const w of words) {
    if (NAME_CUT.has(w.toLowerCase())) break;
    out.push(w.replace(/^[.'-]+|[.'-]+$/g, ''));
  }
  const kept = out.filter(Boolean).slice(0, 4);
  if (!kept.length || NOT_NAME.has(kept[0].toLowerCase())) return '';
  const name = titleCase(kept.join(' '));
  return name.length >= 2 ? name : '';
}

function capitalize(value) {
  const v = String(value || '').trim();
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : '';
}

function cleanValue(value, max = 80) {
  return String(value || '')
    .replace(/^[\s,.:;\-–—]+|[\s,.:;\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, max)
    .trim();
}

function prep(raw) {
  return String(raw || '')
    .replace(/[‘’`]/g, "'")
    .replace(/\b(?:yo|t0|too)\b(?=\s+(?:visit|see|meet|book|consult|come|discuss|attend|deliver|drop|pick|talk))/gi, 'to')
    .replace(/\b(?:wanna|wana)\b/gi, 'want to')
    .replace(/\bgonna\b/gi, 'going to')
    .replace(/\bim\b/gi, "I'm")
    .replace(/\b(?:comapny|compnay|copmany|comany|compny|campany)\b/gi, 'company')
    .replace(/\b(?:pirpose|purpse|purpos|porpose|perpose|purose)\b/gi, 'purpose')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function stripGreeting(text) {
  return text
    .replace(
      /^(?:hi+|hello+|hey+|dumela(?:ng)?|good (?:morning|afternoon|evening))(?:\s+(?:there|rra|mma|team|all|sir|madam))?[\s,!.]+/i,
      ''
    )
    .trim();
}

const LABELS = [
  ['name', /^(?:full\s*names?|names?|visitor(?:'s)?\s*names?|visitor|leina|maina)$/i],
  ['company', /^(?:company(?:\s*name)?|organi[sz]ation|org|employer|kompone)$/i],
  ['purpose', /^(?:purpose(?:\s*of\s*visit)?|reason|maikaelelo)$/i],
  ['host', /^(?:host(?:\s*name)?|visiting|to\s*see|person\s*to\s*see|department|dept|lefapha|o\s*etela|motho)$/i],
  ['date', /^(?:date|visit\s*date|day|letlha(?:\s*la\s*ketelo)?)$/i],
  ['time', /^(?:time|visit\s*time|arrival\s*time|nako)$/i],
];

function labeledFields(text) {
  const out = {};
  for (const segment of text.split(/[\n;]+|,(?=\s*[A-Za-z ]{2,25}\s*[:=])/)) {
    const m = segment.match(/^\s*([A-Za-z' ]{2,25}?)\s*[:=]\s*(.+)$/);
    if (!m) continue;
    const entry = LABELS.find(([, re]) => re.test(m[1].trim()));
    if (entry) out[entry[0]] = m[2].trim();
  }
  return out;
}

const PATTERN_WORDS = /\b(from|visit|visiting|see|meet|meeting with|my name|i am|i'm|purpose|want to|would like|representing|ke tswa|ke nna|leina)\b/i;

function isDateTimePart(part, today) {
  const words = part.split(/\s+/).length;
  return words <= 5 && !PATTERN_WORDS.test(part) && Boolean(extractDate(part, today) || extractTime(part));
}

function extractName(text) {
  const intro = text.match(
    new RegExp(
      `\\b(?:my full name is|my names are|my name is|name is|i am|i'm|this is|it's|leina la me ke|maina a me ke|ke nna)\\s+(${NAME_WORD}(?:\\s+${NAME_WORD}){0,4})`,
      'i'
    )
  );
  if (intro) {
    const name = cleanName(intro[1]);
    if (name) return name;
  }
  const from = text.match(new RegExp(`^(${NAME_WORD}(?:\\s+${NAME_WORD}){0,3})\\s+(?:from|representing|visiting|here to see|to see)\\s+\\S`, 'i'));
  if (from) return cleanName(from[1]);
  return '';
}

const COMPANY_STOP =
  "(?=\\s*(?:$|[.,;!?\\n]|\\s(?:and|i|i'm|we|to|want|wants|would|on|at|for|here|coming|visiting|visit|who|that|mme|ke|go|le|company|purpose|reason|date|time|host|my)\\b|\\s\\d))";

function extractCompany(text) {
  const m = text.match(
    new RegExp(
      `\\b(?:i'm from|i am from|we are from|from|representing|on behalf of|i work (?:at|for)|company(?: name)? is|ke tswa kwa|ke tswa ko|kompone ya me ke)\\s+(?:the\\s+)?([A-Za-z0-9][A-Za-z0-9&'.\\- ]{0,60}?)${COMPANY_STOP}`,
      'i'
    )
  );
  if (!m) return '';
  const value = cleanValue(m[1]);
  if (!value || extractTime(value) || extractDate(value) || /^(home|here|there|work)$/i.test(value)) return '';
  return tidyCase(value);
}

// "culinova" → "Culinova"; deliberate casing like "MyOrange" or "BPC" is kept.
function tidyCase(value) {
  return value === value.toLowerCase() ? value.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : value;
}

// Field answers that are really booking vocabulary, not a value ("visit", "date", "yes"...).
const BOOKING_WORDS = new Set([
  'visit', 'visiting', 'visitor', 'host', 'date', 'time', 'day', 'company', 'name', 'purpose', 'reason', 'department',
  'booking', 'book', 'appointment', 'details', 'ok', 'okay', 'please', 'help', 'menu', 'hello', 'hi', 'the', 'is',
  'on', 'at', 'to', 'from', 'see', 'want', 'ketelo', 'letlha', 'nako', 'leina', 'kompone', 'maikaelelo',
]);

export function isBookingWordsOnly(text) {
  const words = String(text || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => BOOKING_WORDS.has(w));
}

const PURPOSE_TAIL =
  "(?=$|[.;!?\\n,]|\\s(?:and\\s+)?(?:i\\s+)?(?:want|would like)\\b|\\s(?:on|ka)\\s+(?:\\d|the\\s+\\d|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)|\\sat\\s+\\d|\\s(?:tomorrow|today|kamoso|gompieno)\\b|\\swith\\s+(?:mr|mrs|ms|dr|rra|mma)\\b)";

const PURPOSE_NOUNS =
  'meeting|interview|delivery|consultation|appointment|presentation|pitch|demo|training|discussion|maintenance|inspection|audit|review|collection|installation|workshop|seminar|briefing|negotiation|contract|proposal|tender|partnership';

function extractPurpose(text) {
  const explicit = text.match(
    /\b(?:purpose(?: of (?:my|the) visit)?(?: is|:)?|reason(?: is|:)?|maikaelelo(?: a me)?(?: ke)?)\s+(.+?)(?=$|[.;!?\n]|\s(?:visit\s+)?(?:date|time|day)\b|\s(?:on|at|ka)\s+\d|\s(?:tomorrow|today|kamoso|gompieno)\b|\s(?:host|visiting|to see|to visit|to meet)\b|\s(?:i\s+)?want to (?:see|visit|meet)\b)/i
  );
  if (explicit) return capitalize(cleanValue(explicit[1], 160));

  const intent = text.match(
    new RegExp(
      `\\b(?:i want to|i'd like to|i would like to|i need to|i'm coming to|i am coming to|coming to|here to|in order to|ke batla go|ke tla go)\\s+(?!(?:visit|see|meet|book|come|make|request|schedule|set up|arrange|etela|bona|kopana)\\b)(.+?)${PURPOSE_TAIL}`,
      'i'
    )
  );
  if (intent) return capitalize(cleanValue(intent[1], 160));

  const noun = text.match(
    new RegExp(
      `\\b(?:for|regarding|about|re)\\s+(?:a|an|the|our|my)?\\s*((?:[A-Za-z\\-]+\\s+){0,2}(?:${PURPOSE_NOUNS})\\b[^.,;!?\\n]{0,40}?)(?=$|[.,;!?\\n]|\\s(?:on|at|with|tomorrow|today)\\b|\\s\\d)`,
      'i'
    )
  );
  if (noun) return capitalize(cleanValue(noun[1], 160));
  return '';
}

const HOST_EXCLUDE =
  '(?!(?:on|at|in|the office|the company|you|your|us|them|him|her|it|tomorrow|today|next|this|a|an|for|to|someone|somebody|reception|date|time|day|is|purpose|reason|company|from|details|request|booking)\\b)';
const HOST_TAIL =
  '(?=\\s*(?:$|[.,;!?\\n]|\\s(?:on|at|for|to|tomorrow|today|from|and|about|regarding|department|dept|office|in|ka|ko|mo|kamoso|gompieno|next|this)\\b|\\s\\d))';

function extractHostQuery(text, orgName = '') {
  const verb = text.match(
    new RegExp(
      `\\b(?:visit|visiting|see|seeing|meet|meeting with|meet with|appointment with|meeting|host(?: is|:)?|go etela|go bona|kopana le|ke etela)\\s+${HOST_EXCLUDE}(?:mr\\.?\\s+|mrs\\.?\\s+|ms\\.?\\s+|dr\\.?\\s+|rra\\s+|mma\\s+|the\\s+)?([A-Za-z][A-Za-z'/&.\\-]*(?:\\s+[A-Za-z][A-Za-z'/&.\\-]*){0,4}?)${HOST_TAIL}`,
      'i'
    )
  );
  const dept = text.match(/\b(?:the\s+)?([A-Za-z][A-Za-z/&-]*(?:\s+[A-Za-z][A-Za-z/&-]*)?)\s+(?:department|dept)\b/i)
    || text.match(/\blefapha la\s+([A-Za-z][A-Za-z/&-]*(?:\s+[A-Za-z][A-Za-z/&-]*)?)/i);
  const raw = cleanValue(verb?.[1] || dept?.[1] || '', 60);
  if (!raw || isBookingWordsOnly(raw)) return '';
  const org = String(orgName || '').toLowerCase();
  const lower = raw.toLowerCase();
  if (org && (lower === org || org.startsWith(lower) && lower.split(' ').length > 1)) return '';
  if (/^(botho innovations|the company|your company|the office)$/i.test(raw)) return '';
  return raw;
}

// Extracts every field it can find. `date` may be 'past'. `host` is a raw query to match against the directory.
export function extractFields(input, { today = todayStamp(), orgName = '', startField = 'name', known = {} } = {}) {
  const text = stripGreeting(prep(input));
  const out = {};
  if (!text) return out;

  const labeled = labeledFields(text);
  if (Object.keys(labeled).length) {
    if (labeled.name) out.name = cleanName(labeled.name) || cleanValue(labeled.name);
    if (labeled.company) out.company = cleanValue(labeled.company);
    if (labeled.purpose) out.purpose = capitalize(cleanValue(labeled.purpose, 160));
    if (labeled.host) out.host = cleanValue(labeled.host, 60);
    if (labeled.date) out.date = extractDate(labeled.date, today) || undefined;
    if (labeled.time) out.time = extractTime(labeled.time, { bare: true }) || undefined;
    for (const key of Object.keys(out)) if (!out[key]) delete out[key];
    return out;
  }

  const date = extractDate(text, today);
  const time = extractTime(text);
  if (date) out.date = date;
  if (time) out.time = time;

  const name = extractName(text);
  const company = extractCompany(text);
  const purpose = extractPurpose(text);
  const host = extractHostQuery(text, orgName);
  if (name) out.name = name;
  if (company) out.company = company;
  if (purpose) out.purpose = purpose;
  if (host) out.host = host;

  const parts = text.split(/\s*[,\n;]+\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const dateTimeParts = parts.filter((p) => isDateTimePart(p, today));
    const freeParts = parts.filter((p) => !isDateTimePart(p, today) && !PATTERN_WORDS.test(p) && p.split(/\s+/).length <= 8);
    const usePositional =
      freeParts.length >= 2 && (dateTimeParts.length > 0 || freeParts.length >= 3 || ['name', 'company'].includes(startField));
    if (usePositional) {
      const order = ['name', 'company', 'purpose', 'host'];
      const from = Math.max(0, order.indexOf(startField));
      const slotsLeft = order.slice(from).filter((f) => !out[f] && !known[f]);
      freeParts.forEach((part, i) => {
        const field = slotsLeft[i];
        if (!field) return;
        if (field === 'name') {
          const value = cleanName(part);
          if (value) out.name = value;
        } else if (field === 'purpose') {
          out.purpose = capitalize(cleanValue(part, 160));
        } else {
          out[field] = cleanValue(part);
        }
      });
    }
  }
  return out;
}

// Interprets a short reply as the answer to the field we just asked for.
export function answerForField(field, input, { today = todayStamp() } = {}) {
  const raw = stripGreeting(prep(input));
  if (!raw || isYes(raw) || isNo(raw) || isGreetingOnly(raw) || looksLikeQuestion(raw) || isBookingWordsOnly(raw)) return null;
  if (field === 'name') {
    const stripped = raw.replace(/^(?:my (?:full )?names? (?:is|are)|i am|i'm|it's|this is|name:?|leina la me ke|maina a me ke|ke nna)\s+/i, '');
    if (!/^[A-Za-z][A-Za-z'.\-\s]{0,60}$/.test(stripped) || stripped.split(/\s+/).length > 5) return null;
    return cleanName(stripped) || null;
  }
  if (field === 'company') {
    const stripped = raw.replace(/^(?:i'm from|i am from|from|i work (?:at|for)|company(?: name)?(?: is|:)?|ke tswa kwa|ke tswa ko|kompone ya me ke)\s+/i, '');
    if (/^(none|no company|n\/a|na|personal|private|self|self employed|ga ke na|ga ke na kompone)$/i.test(stripped)) return 'Personal';
    const value = cleanValue(stripped);
    return value.length >= 2 ? tidyCase(value) : null;
  }
  if (field === 'purpose') {
    const stripped = raw.replace(/^(?:the )?(?:purpose(?: of (?:my|the) visit)?(?: is|:)?|it's for|for|maikaelelo(?: a me)?(?: ke)?)\s+(?:a |an )?/i, '');
    const value = capitalize(cleanValue(stripped, 160));
    return value.length >= 2 ? value : null;
  }
  if (field === 'date') return extractDate(raw, today);
  if (field === 'time') return extractTime(raw, { bare: true });
  if (field === 'host') {
    return cleanValue(
      raw.replace(/^(?:i (?:want|would like) to (?:visit|see|meet)|i'm visiting|i am visiting|visiting|to see|host(?: is|:)?|ke batla go bona|ke etela)\s+/i, ''),
      60
    ) || null;
  }
  return null;
}
