// Deterministic WhatsApp booking state machine. Pure: no DB, no network, no LLM.
// Slots are the only source of truth; the LLM is only ever used to answer FAQs (see faq.js).
import dayjs from 'dayjs';
import { extractDate, todayStamp } from '../utils/dateParse.js';
import { conflictAt, freeSlots, hostBookings, nearestFree, officeHours, timeProblem, toMinutes, SLOT_MINUTES } from './availability.js';
import { departmentOf, matchHosts, pickOption } from './hostMatch.js';
import {
  detectLanguage,
  isCancel,
  isGreetingOnly,
  isNewBooking,
  isNo,
  isOffTopic,
  isReschedule,
  isSlotsQuery,
  isStatusRequest,
  isYes,
  looksLikeQuestion,
  mentionsDecision,
  normalizeLang,
} from './lang.js';
import { formatVisitDate, formatVisitTime, hostOptionLines, statusLabel, summaryText, t } from './messages.js';
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
    cancelRef: null,
    cancelOptions: [],
    lastRef: prev.lastRef || null,
    notedKey: prev.notedKey || null,
    history: Array.isArray(prev.history) ? prev.history.slice(-20) : [],
  };
}

const STAGES = ['idle', 'collecting', 'choose_host', 'confirm', 'confirm_cancel', 'choose_cancel'];

// Accepts whatever is stored in the DB. Anything from the old engine starts a clean booking.
export function loadState(data) {
  if (!data || typeof data !== 'object' || data.v !== STATE_VERSION) {
    return freshState({ lang: data?.lang, welcomed: data?.welcomed, lastRef: data?.lastRef, history: data?.history });
  }
  return {
    ...freshState(data),
    stage: STAGES.includes(data.stage) ? data.stage : 'idle',
    slots: { ...emptySlots(), ...(data.slots || {}) },
    asked: data.asked || null,
    retries: Number(data.retries) || 0,
    hostOptions: Array.isArray(data.hostOptions) ? data.hostOptions : [],
    cancelRef: data.cancelRef || null,
    cancelOptions: Array.isArray(data.cancelOptions) ? data.cancelOptions : [],
  };
}

// The visitor's upcoming visits that still hold a slot (can be cancelled or reminded about).
function openVisits(ctx) {
  return (ctx.visits || []).filter((v) => ['pending', 'approved'].includes(v.status) && v.date >= ctx.today);
}

function visitSummary(v, lang) {
  return t(lang, 'visit.summary', {
    ref: v.ref,
    host: v.host,
    date: formatVisitDate(v.date, lang),
    time: formatVisitTime(v.time, lang),
    status: statusLabel(v.status, lang),
  });
}

function slotList(times, lang, emptyKey) {
  return times.length ? times.join(', ') : t(lang, emptyKey);
}

// Checks the chosen time against office hours, the clock, and the host's other visits.
// Clears the time and returns a reply when it cannot be booked; returns null when it is fine.
function slotProblem(state, ctx) {
  const { slots } = state;
  if (!slots.date || !slots.time) return null;
  const hours = ctx.hours || officeHours();
  const problem = timeProblem({ date: slots.date, time: slots.time, today: ctx.today, now: ctx.now, hours });
  if (problem) {
    slots.time = '';
    state.asked = 'time';
    const msg = problem === 'past' ? t(state.lang, 'time.past') : t(state.lang, 'time.closed', hours);
    return join(msg, slots.hostId ? freeHint(state, ctx) : '');
  }
  if (!slots.hostId) return null;
  const clash = conflictAt(ctx.bookings, slots.hostId, slots.date, slots.time);
  if (!clash) return null;
  const free = freeSlots({ bookings: ctx.bookings, hostId: slots.hostId, date: slots.date, today: ctx.today, now: ctx.now, hours });
  const takenAt = slots.time;
  slots.time = '';
  state.asked = 'time';
  if (!free.length) {
    const date = slots.date;
    slots.date = '';
    state.asked = 'date';
    return t(state.lang, 'slot.fullDay', { host: slots.hostName, date: formatVisitDate(date, state.lang) });
  }
  return t(state.lang, 'slot.taken', {
    host: slots.hostName,
    time: clash.time,
    date: formatVisitDate(slots.date, state.lang),
    free: nearestFree(free, takenAt, 6).join(', '),
  });
}

function freeHint(state, ctx) {
  const { slots } = state;
  if (!slots.hostId || !slots.date) return '';
  // Only worth listing when the host already has visits that day; an empty day is simply "any time".
  if (!hostBookings(ctx.bookings, slots.hostId, slots.date).length) return '';
  const free = freeSlots({ bookings: ctx.bookings, hostId: slots.hostId, date: slots.date, today: ctx.today, now: ctx.now, hours: ctx.hours });
  if (!free.length) return '';
  return t(state.lang, 'slot.hint', { host: slots.hostName, date: formatVisitDate(slots.date, state.lang), free: free.join(', ') });
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
// Time slots are validated here, so every path (one-liner, step by step, corrections) is covered.
function advance(state, ctx) {
  state.stage = 'collecting';
  const problem = slotProblem(state, ctx);
  if (problem) return problem;
  const next = missingField(state.slots);
  if (next === 'time' && state.slots.hostId && state.slots.date) {
    const free = freeSlots({ bookings: ctx.bookings, hostId: state.slots.hostId, date: state.slots.date, today: ctx.today, now: ctx.now, hours: ctx.hours });
    if (!free.length) {
      const date = state.slots.date;
      state.slots.date = '';
      state.asked = 'date';
      return t(state.lang, 'slot.fullDay', { host: state.slots.hostName, date: formatVisitDate(date, state.lang) });
    }
    state.asked = 'time';
    state.retries = 0;
    return join(t(state.lang, 'ask.time'), freeHint(state, ctx));
  }
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
  return { reply: advance(state, ctx) };
}

function handleChooseHost(state, raw, ctx) {
  let picked = pickOption(raw, state.hostOptions);
  if (!picked.length) {
    const query = answerForField('host', raw, { today: ctx.today }) || raw;
    picked = matchHosts(query, activeHosts(ctx.hosts));
  }
  if (picked.length === 1) {
    setHost(state, picked[0]);
    return { reply: advance(state, ctx) };
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
  if (changed) return { reply: advance(state, ctx) };
  if (looksLikeQuestion(raw)) {
    return { reply: '', actions: [{ type: 'faq', question: raw, followUp: t(state.lang, 'confirm.reminder') }] };
  }
  return { reply: t(state.lang, 'confirm.reminder') };
}

function draftStarted(state) {
  return ['collecting', 'choose_host', 'confirm'].includes(state.stage) && Object.values(state.slots).some(Boolean);
}

function resetToIdle(state) {
  Object.assign(state, freshState(state), { lang: state.lang, welcomed: true, notedKey: state.notedKey });
}

// "cancel": stops a booking still being collected, otherwise cancels one of the visitor's real visits.
function handleCancelIntent(state, raw, ctx) {
  const ref = raw.match(REF_RE)?.[0]?.toUpperCase() || null;
  if (!ref && draftStarted(state)) {
    resetToIdle(state);
    return { reply: t(state.lang, 'cancel.draft') };
  }
  const open = openVisits(ctx);
  const targets = ref ? open.filter((v) => v.ref.toUpperCase() === ref) : open;
  resetToIdle(state);
  if (!targets.length) return { reply: t(state.lang, 'cancel.none') };
  if (targets.length === 1) {
    state.stage = 'confirm_cancel';
    state.cancelRef = targets[0].ref;
    return { reply: t(state.lang, 'cancel.confirm', { summary: visitSummary(targets[0], state.lang) }) };
  }
  state.stage = 'choose_cancel';
  state.cancelOptions = targets.map((v) => v.ref);
  const list = targets.map((v, i) => `${i + 1}. ${visitSummary(v, state.lang)}`).join('\n');
  return { reply: t(state.lang, 'cancel.choose', { list }) };
}

function handleConfirmCancel(state, raw, ctx) {
  const visit = openVisits(ctx).find((v) => v.ref === state.cancelRef);
  if (!visit) {
    resetToIdle(state);
    return { reply: t(state.lang, 'cancel.none') };
  }
  if (isYes(raw)) return { reply: '', actions: [{ type: 'cancel', ref: visit.ref }] };
  if (isNo(raw)) {
    resetToIdle(state);
    return { reply: t(state.lang, 'cancel.kept', { ref: visit.ref }) };
  }
  return { reply: t(state.lang, 'cancel.confirm', { summary: visitSummary(visit, state.lang) }) };
}

function handleChooseCancel(state, raw, ctx) {
  if (isNo(raw)) {
    resetToIdle(state);
    return { reply: t(state.lang, 'cancel.keptAll') };
  }
  const open = openVisits(ctx).filter((v) => state.cancelOptions.includes(v.ref));
  const num = raw.match(/^(?:no\.?|number|nomoro)?\s*(\d{1,2})[.)]?$/i);
  const ref = raw.match(REF_RE)?.[0]?.toUpperCase();
  const visit = num ? open.find((v) => v.ref === state.cancelOptions[Number(num[1]) - 1]) : open.find((v) => v.ref.toUpperCase() === ref);
  if (!visit) return { reply: t(state.lang, 'cancel.pick') };
  state.stage = 'confirm_cancel';
  state.cancelRef = visit.ref;
  state.cancelOptions = [];
  return { reply: t(state.lang, 'cancel.confirm', { summary: visitSummary(visit, state.lang) }) };
}

function handleStatus(state, ctx) {
  const visits = (ctx.visits || []).slice(0, 5);
  const reply = visits.length
    ? t(state.lang, 'status.list', { list: visits.map((v) => visitSummary(v, state.lang)).join('\n') })
    : t(state.lang, 'status.none');
  return { reply: join(reply, draftStarted(state) ? currentPrompt(state) : '') };
}

// "free slots for Hamza tomorrow": booked and free 30-minute slots for one host on one day.
function handleSlots(state, raw, ctx) {
  const hours = ctx.hours || officeHours();
  const named = matchHosts(raw, activeHosts(ctx.hosts));
  const host =
    named.length === 1
      ? named[0]
      : state.slots.hostId
        ? { id: state.slots.hostId, name: state.slots.hostName }
        : null;
  if (!host) return { reply: join(t(state.lang, 'slots.needHost'), draftStarted(state) ? currentPrompt(state) : '') };
  const asked = extractDate(raw, ctx.today);
  const lastStart = toMinutes(hours.close) - SLOT_MINUTES;
  const fallback = ctx.now && toMinutes(ctx.now) >= lastStart ? dayjs(ctx.today).add(1, 'day').format('YYYY-MM-DD') : ctx.today;
  const date = asked && asked !== 'past' ? asked : state.slots.date || fallback;
  const booked = hostBookings(ctx.bookings, host.id, date).map((b) => b.time);
  const free = freeSlots({ bookings: ctx.bookings, hostId: host.id, date, today: ctx.today, now: ctx.now, hours });
  const reply = t(state.lang, 'slots.report', {
    host: host.name,
    date: formatVisitDate(date, state.lang),
    booked: slotList(booked, state.lang, 'slots.noneBooked'),
    free: slotList(free, state.lang, 'slots.noneFree'),
  });
  return { reply: join(reply, draftStarted(state) ? currentPrompt(state) : '') };
}

// Reminds a returning visitor of their open request once per request/status, not on every greeting.
function existingNote(state, ctx) {
  const open = openVisits(ctx)[0];
  if (!open) return '';
  const key = `${open.ref}:${open.status}`;
  if (state.notedKey === key) return '';
  state.notedKey = key;
  return t(state.lang, 'welcome.existing', { summary: visitSummary(open, state.lang) });
}

// Runs one visitor message through the booking flow.
// Returns { state, reply, actions } where actions are side effects the caller performs (book, cancel, status, faq).
// ctx.visits = the visitor's own recent visits; ctx.bookings = every host's open visits (for 30-minute slots).
export function runTurn(
  prevState,
  input,
  { hosts = [], today = todayStamp(), now = null, orgName = 'Botho Innovations', visits = [], bookings = [], hours = officeHours() } = {}
) {
  const state = JSON.parse(JSON.stringify(loadState(prevState)));
  const raw = String(input || '').trim();
  state.lang = normalizeLang(detectLanguage(raw) || state.lang);
  const ctx = { hosts, today, now, orgName, visits, bookings, hours };
  const result = (out) => ({ state, reply: out.reply || '', actions: out.actions || [] });

  if (!raw) {
    return result({ reply: join(t(state.lang, 'textOnly'), currentPrompt(state) || t(state.lang, 'faq.startBooking')) });
  }

  // The welcome asks for "Names" first, so the next plain reply is treated as the name.
  if (isGreetingOnly(raw) || isNewBooking(raw)) {
    const next = freshState(state);
    Object.assign(state, next, { stage: 'collecting', welcomed: true, lang: state.lang, asked: 'name' });
    const note = isGreetingOnly(raw) ? existingNote(state, ctx) : '';
    return result({ reply: join(t(state.lang, 'welcome'), note) });
  }

  if (state.stage === 'confirm_cancel' && !isCancel(raw)) return result(handleConfirmCancel(state, raw, ctx));
  if (state.stage === 'choose_cancel' && !isCancel(raw)) return result(handleChooseCancel(state, raw, ctx));
  if (isCancel(raw)) return result(handleCancelIntent(state, raw, ctx));
  if (isStatusRequest(raw)) return result(handleStatus(state, ctx));
  if (isSlotsQuery(raw)) return result(handleSlots(state, raw, ctx));
  if (isReschedule(raw) && state.stage !== 'confirm') {
    return result({ reply: join(t(state.lang, 'reschedule.help'), draftStarted(state) ? currentPrompt(state) : '') });
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

// Applies the outcome of a cancellation made by the caller.
export function afterCancel(prevState, outcome) {
  const state = JSON.parse(JSON.stringify(loadState(prevState)));
  resetToIdle(state);
  if (outcome.ok) return { state, reply: t(state.lang, 'cancel.done', { ref: outcome.ref, host: outcome.hostName }) };
  return { state, reply: t(state.lang, 'cancel.failed') };
}

// Applies the outcome of a booking attempt made by the caller.
export function afterBooking(prevState, outcome, { hosts = [], bookings = [], today = todayStamp(), now = null, hours = officeHours() } = {}) {
  const state = JSON.parse(JSON.stringify(loadState(prevState)));
  if (outcome.reason === 'slot_taken') {
    // Someone else took the slot between confirmation and submission.
    const reply = advance(state, { hosts, bookings, today, now, hours });
    return { state, reply };
  }
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
