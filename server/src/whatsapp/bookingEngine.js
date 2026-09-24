// Deterministic WhatsApp booking state machine. Pure: no DB, no network, no LLM.
// Slots are the only source of truth; the LLM is only ever used to answer FAQs (see faq.js).
import { todayStamp } from '../utils/dateParse.js';
import { departmentOf, matchHosts, pickOption } from './hostMatch.js';
import {
  detectLanguage,
  isCancel,
  isGreetingOnly,
  isNewBooking,
  isNo,
  isOffTopic,
  isYes,
  looksLikeQuestion,
  mentionsDecision,
  normalizeLang,
} from './lang.js';
import { hostOptionLines, summaryText, t } from './messages.js';
import { answerForField, emptySlots, extractFields, isBookingWordsOnly, missingField } from './slotExtract.js';

const STATE_VERSION = 2;
const MAX_OPTIONS = 20;
const REF_RE = /\bVMS-\d{4}-\d{3,}\b/i;
const THANKS_RE = /^(thanks|thank you|thank u|thx|ty|ok thanks|okay thanks|cool|great|noted|alright|perfect|ke a leboga|re a leboga|ke itumetse|ke leboga)[.! ]*$/i;
const PATTERNY = /\b(from|visit|visiting|see|meet|my name|i am|i'm|im|want to|would like|ke nna|ke tswa)\b/i;

export function freshState(prev = {}) {
  return {
    v: STATE_VERSION,
    lang: normalizeLang(prev.lang),
    welcomed: Boolean(prev.welcomed),
    stage: 'idle',
    slots: emptySlots(),
    asked: null,
    retries: 0,
    hostOptions: [],
    lastRef: prev.lastRef || null,
    history: Array.isArray(prev.history) ? prev.history.slice(-20) : [],
  };
}

// Accepts whatever is stored in the DB. Anything from the old engine starts a clean booking.
export function loadState(data) {
  if (!data || typeof data !== 'object' || data.v !== STATE_VERSION) {
    return freshState({ lang: data?.lang, welcomed: data?.welcomed, lastRef: data?.lastRef, history: data?.history });
  }
  return {
    ...freshState(data),
    stage: ['idle', 'collecting', 'choose_host', 'confirm'].includes(data.stage) ? data.stage : 'idle',
    slots: { ...emptySlots(), ...(data.slots || {}) },
    asked: data.asked || null,
    retries: Number(data.retries) || 0,
    hostOptions: Array.isArray(data.hostOptions) ? data.hostOptions : [],
  };
}

function compactHost(h) {
  return { id: h.id, name: h.name, department: departmentOf(h) };
}

function setHost(state, host) {
  state.slots.hostId = host.id;
  state.slots.hostName = host.name;
  state.slots.hostDept = departmentOf(host);
  state.hostOptions = [];
}

function join(...parts) {
  return parts.filter(Boolean).join('\n\n');
}

function listPrompt(state, key, vars = {}) {
  return `${t(state.lang, key, vars)}\n${hostOptionLines(state.hostOptions)}`;
}

function activeHosts(hosts) {
  return hosts.filter((h) => h && h.name && (h.status === undefined || h.status === 'active'));
}

// What the visitor is currently expected to answer, used after FAQ answers and refusals.
export function currentPrompt(state) {
  if (state.stage === 'confirm') return t(state.lang, 'confirm.reminder');
  if (state.stage === 'choose_host') return listPrompt(state, 'host.pick');
  if (state.stage === 'collecting') {
    const field = missingField(state.slots);
    if (field) return t(state.lang, `ask.${field}`);
  }
  return '';
}

function openHostList(state, hosts, query) {
  const all = activeHosts(hosts).slice(0, MAX_OPTIONS).map(compactHost);
  if (!all.length) {
    state.stage = 'idle';
    return t(state.lang, 'host.directoryEmpty');
  }
  state.stage = 'choose_host';
  state.asked = 'host';
  state.hostOptions = all;
  return listPrompt(state, 'host.none', { query });
}

function resolveHost(state, hosts, query, { explicit }) {
  const matches = matchHosts(query, activeHosts(hosts));
  if (matches.length === 1) {
    setHost(state, matches[0]);
    return null;
  }
  if (matches.length > 1) {
    state.stage = 'choose_host';
    state.asked = 'host';
    state.hostOptions = matches.slice(0, MAX_OPTIONS).map(compactHost);
    return listPrompt(state, 'host.many', { query });
  }
  return explicit ? openHostList(state, hosts, query) : null;
}

// Moves to the next missing field, or to confirmation once everything is filled.
function advance(state) {
  state.stage = 'collecting';
  const next = missingField(state.slots);
  if (next) {
    state.asked = next;
    state.retries = 0;
    return t(state.lang, `ask.${next}`);
  }
  state.stage = 'confirm';
  state.asked = null;
  state.retries = 0;
  return t(state.lang, 'confirm', { summary: summaryText(state.slots, state.lang) });
}

const FILLER = /\b(?:i'?m|i am|im|my|name|is|company|from|the|comapny)\b/g;

function core(value) {
  return String(value || '').toLowerCase().replace(/[^a-z\s']/g, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
}

// "Culinova company" or "I'm Waqas Naveed" re-sent later just restates a detail we already have.
function repeatsFilledSlot(slots, value) {
  const v = core(value);
  return Boolean(v) && ['name', 'company', 'purpose', 'hostName'].some((f) => slots[f] && core(slots[f]) === v);
}

function filledMap(slots) {
  return {
    name: Boolean(slots.name),
    company: Boolean(slots.company),
    purpose: Boolean(slots.purpose),
    host: Boolean(slots.hostId),
  };
}

function handleCollect(state, raw, ctx) {
  const wasIdle = state.stage === 'idle';
  state.stage = 'collecting';
  const asked = wasIdle ? null : state.asked;
  const startField = asked || missingField(state.slots) || 'name';
  const found = extractFields(raw, { today: ctx.today, orgName: ctx.orgName, startField, known: filledMap(state.slots) });
  const anyFound = Object.keys(found).length > 0;

  // Questions are answered, not stored — unless they clearly carry booking details
  // ("Can I visit Hamza tomorrow at 10am?").
  if (looksLikeQuestion(raw) && Object.keys(found).length < 2) {
    const started = Object.values(state.slots).some(Boolean);
    if (wasIdle) state.stage = 'idle';
    state.welcomed = true;
    return {
      reply: '',
      actions: [{ type: 'faq', question: raw, followUp: started ? currentPrompt(state) : '' }],
    };
  }

  let hostQuery = found.host || '';
  let explicitHost = Boolean(found.host);

  // A message that only restates details we already have ("Im waqas Naveed" again) is not an answer to the pending question.
  const restatesKnown = ['name', 'company', 'purpose'].some((f) => found[f] && state.slots[f]);
  if (asked && asked !== 'host' && !found[asked] && !restatesKnown && (!anyFound || (asked !== 'name' && !PATTERNY.test(raw)))) {
    const answer = answerForField(asked, raw, { today: ctx.today });
    // Re-sending an earlier answer (e.g. the name again) is not an answer to the new question.
    if (answer && !repeatsFilledSlot(state.slots, answer)) found[asked] = answer;
  }
  if (asked === 'host' && !hostQuery && (!anyFound || !PATTERNY.test(raw))) {
    hostQuery = answerForField('host', raw, { today: ctx.today }) || '';
    explicitHost = Boolean(hostQuery);
  }

  const before = JSON.stringify(state.slots);
  for (const field of ['name', 'company', 'purpose', 'time']) {
    if (found[field] && !state.slots[field]) state.slots[field] = found[field];
  }
  let pastDate = false;
  if (found.date === 'past') pastDate = !state.slots.date;
  else if (found.date && !state.slots.date) state.slots.date = found.date;

  let hostReply = null;
  if (!state.slots.hostId && hostQuery) hostReply = resolveHost(state, ctx.hosts, hostQuery, { explicit: explicitHost });
  const progressed = JSON.stringify(state.slots) !== before;

  if (hostReply) return { reply: hostReply };
  if (pastDate) {
    state.asked = 'date';
    return { reply: t(state.lang, 'date.past') };
  }

  if (!progressed) {
    if (looksLikeQuestion(raw)) {
      const followUp = wasIdle ? t(state.lang, 'faq.startBooking') : currentPrompt(state);
      if (wasIdle) {
        state.stage = 'idle';
        state.welcomed = true;
      }
      return { reply: '', actions: [{ type: 'faq', question: raw, followUp }] };
    }
    if (wasIdle) {
      state.welcomed = true;
      state.asked = 'name';
      return { reply: t(state.lang, 'welcome') };
    }
    const field = missingField(state.slots) || 'name';
    if (asked === field) {
      state.retries += 1;
      if (field === 'host') {
        const reply = openHostList(state, ctx.hosts, raw);
        return { reply: isBookingWordsOnly(raw) && state.stage === 'choose_host' ? listPrompt(state, 'host.pick') : reply };
      }
      return { reply: t(state.lang, `retry.${field}`) };
    }
    state.asked = field;
    return { reply: t(state.lang, `ask.${field}`) };
  }

  state.welcomed = true;
  return { reply: advance(state) };
}

function handleChooseHost(state, raw, ctx) {
  let picked = pickOption(raw, state.hostOptions);
  if (!picked.length) {
    const query = answerForField('host', raw, { today: ctx.today }) || raw;
    picked = matchHosts(query, activeHosts(ctx.hosts));
  }
  if (picked.length === 1) {
    setHost(state, picked[0]);
    return { reply: advance(state) };
  }
  if (picked.length > 1) {
    state.hostOptions = picked.slice(0, MAX_OPTIONS).map(compactHost);
    return { reply: listPrompt(state, 'host.many', { query: raw }) };
  }
  if (looksLikeQuestion(raw)) {
    return { reply: '', actions: [{ type: 'faq', question: raw, followUp: listPrompt(state, 'host.pick') }] };
  }
  state.retries += 1;
  return { reply: listPrompt(state, 'host.none.again') };
}

const CORRECTION_FIELDS = {
  name: 'name', names: 'name', leina: 'name', maina: 'name',
  company: 'company', kompone: 'company',
  purpose: 'purpose', reason: 'purpose', maikaelelo: 'purpose',
  host: 'host', department: 'host', lefapha: 'host',
  date: 'date', day: 'date', letlha: 'date',
  time: 'time', nako: 'time',
};

function handleConfirm(state, raw, ctx) {
  if (isYes(raw)) return { reply: '', actions: [{ type: 'book' }] };
  if (isNo(raw)) return { reply: t(state.lang, 'confirm.change') };

  const updates = {};
  let hostQuery = '';
  const correction = raw.match(
    /^(?:please\s+)?(?:change|update|set|make|fetola)?\s*(?:the\s+|my\s+)?(names?|leina|maina|company|kompone|purpose|reason|maikaelelo|host|department|lefapha|date|day|letlha|time|nako)\s*(?:to|is|should be|:|=|go)?\s+(.+)$/i
  );
  if (correction) {
    const field = CORRECTION_FIELDS[correction[1].toLowerCase()];
    const value = correction[2].trim();
    if (field === 'host') hostQuery = answerForField('host', value, { today: ctx.today }) || value;
    else {
      const answer = answerForField(field, value, { today: ctx.today });
      if (answer) updates[field] = answer;
    }
  } else {
    const found = extractFields(raw, { today: ctx.today, orgName: ctx.orgName, startField: 'name', known: filledMap(state.slots) });
    for (const field of ['name', 'company', 'purpose', 'date', 'time']) if (found[field]) updates[field] = found[field];
    if (found.host) hostQuery = found.host;
  }

  if (updates.date === 'past') {
    return { reply: join(t(state.lang, 'date.past'), t(state.lang, 'confirm.reminder')) };
  }
  let changed = false;
  for (const [field, value] of Object.entries(updates)) {
    if (value && state.slots[field] !== value) {
      state.slots[field] = value;
      changed = true;
    }
  }
  if (hostQuery) {
    const previous = { ...state.slots };
    state.slots.hostId = null;
    const reply = resolveHost(state, ctx.hosts, hostQuery, { explicit: true });
    if (reply) {
      if (state.stage !== 'choose_host') Object.assign(state.slots, previous);
      return { reply };
    }
    changed = true;
  }
  if (changed) return { reply: advance(state) };
  if (looksLikeQuestion(raw)) {
    return { reply: '', actions: [{ type: 'faq', question: raw, followUp: t(state.lang, 'confirm.reminder') }] };
  }
  return { reply: t(state.lang, 'confirm.reminder') };
}

// Runs one visitor message through the booking flow.
// Returns { state, reply, actions } where actions are side effects the caller performs (book, status, faq).
export function runTurn(prevState, input, { hosts = [], today = todayStamp(), orgName = 'Botho Innovations' } = {}) {
  const state = JSON.parse(JSON.stringify(loadState(prevState)));
  const raw = String(input || '').trim();
  state.lang = normalizeLang(detectLanguage(raw) || state.lang);
  const ctx = { hosts, today, orgName };
  const result = (out) => ({ state, reply: out.reply || '', actions: out.actions || [] });

  if (!raw) {
    return result({ reply: join(t(state.lang, 'textOnly'), currentPrompt(state) || t(state.lang, 'faq.startBooking')) });
  }

  // The welcome asks for "Names" first, so the next plain reply is treated as the name.
  if (isGreetingOnly(raw) || isNewBooking(raw)) {
    const next = freshState(state);
    Object.assign(state, next, { stage: 'collecting', welcomed: true, lang: state.lang, asked: 'name' });
    return result({ reply: t(state.lang, 'welcome') });
  }
  if (isCancel(raw)) {
    Object.assign(state, freshState(state), { lang: state.lang, welcomed: true });
    return result({ reply: t(state.lang, 'cancelled') });
  }
  if (mentionsDecision(raw)) {
    return result({ reply: join(t(state.lang, 'approveDenied'), currentPrompt(state)) });
  }
  if (isOffTopic(raw)) {
    return result({ reply: join(t(state.lang, 'offTopic'), currentPrompt(state) || t(state.lang, 'faq.startBooking')) });
  }

  const ref = raw.match(REF_RE);
  if (ref && raw.replace(REF_RE, '').replace(/\b(status|check|my|visit|reference|ref|of|for|the|what is|is|maemo|a|ya)\b/gi, '').replace(/[^a-z]/gi, '').length < 3) {
    return result({ actions: [{ type: 'status', ref: ref[0].toUpperCase(), followUp: currentPrompt(state) }] });
  }

  if (THANKS_RE.test(raw) || (state.stage === 'idle' && isYes(raw))) {
    const key = state.stage === 'idle' ? 'thanks.idle' : 'thanks.busy';
    return result({ reply: join(t(state.lang, key), state.stage === 'idle' ? '' : currentPrompt(state)) });
  }

  if (state.stage === 'confirm') return result(handleConfirm(state, raw, ctx));
  if (state.stage === 'choose_host') return result(handleChooseHost(state, raw, ctx));
  return result(handleCollect(state, raw, ctx));
}

// Applies the outcome of a booking attempt made by the caller.
export function afterBooking(prevState, outcome, { hosts = [] } = {}) {
  const state = JSON.parse(JSON.stringify(loadState(prevState)));
  if (outcome.ok) {
    Object.assign(state, freshState(state), { welcomed: true, lastRef: outcome.ref, lang: state.lang });
    return {
      state,
      reply: t(state.lang, 'submitted', { ref: outcome.ref, host: outcome.hostName, date: outcome.date, time: outcome.time }),
    };
  }
  if (outcome.reason === 'host_missing') {
    state.slots.hostId = null;
    state.slots.hostName = '';
    state.slots.hostDept = '';
    const all = activeHosts(hosts).slice(0, MAX_OPTIONS).map(compactHost);
    if (!all.length) {
      Object.assign(state, freshState(state), { welcomed: true, lang: state.lang });
      return { state, reply: t(state.lang, 'host.directoryEmpty') };
    }
    state.stage = 'choose_host';
    state.asked = 'host';
    state.hostOptions = all;
    return { state, reply: listPrompt(state, 'book.hostGone') };
  }
  return { state, reply: t(state.lang, 'book.failed') };
}
