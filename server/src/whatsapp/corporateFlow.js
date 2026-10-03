// The Corporate Office chat flow (deterministic; AI is only used to answer free questions).
//
//   new number  → welcome, profile (name, organisation/individual/other, company, email) → menu
//   menu        → 1 Visitor Registration · 2 Make an Appointment · 3 Give Feedback ·
//                 4 Request a Service · 5 Ask a Question   (items the company's plan lacks are hidden)
//   commands    → MENU, HELP, APPOINTMENT, STATUS, CANCEL, BACK, HUMAN/AGENT, SETSWANA/ENGLISH, END
//
// runFlow() takes the saved state and one incoming message and returns the new state, the replies
// and any files to send. Everything that reads or writes data goes through `io` (see
// flowAgent.js), so tests drive the real flow with an in-memory io.
import { extractDate, extractTime } from '../utils/dateParse.js';
import { hoursOn, hoursText } from '../services/companyConfig.js';
import { freeSlots, conflictAt, toMinutes, SLOT_MINUTES } from './availability.js';
import { bestHostMatches, CONFIDENT_SCORE, departmentOf, normalizeText } from './hostMatch.js';
import { detectLanguage, isGreetingOnly, isNo, isYes, looksLikeQuestion, normalizeLang } from './lang.js';
import { formatVisitDate, formatVisitTime } from './messages.js';
import { ft, numberedList, OPTIONS, optionLabel, optionList, SERVICE_STATUS } from './flowMessages.js';

export const STALE_MS = 2 * 60 * 60 * 1000;
const MAX_DAYS_AHEAD = 90;

export function freshFlowState(prev = {}) {
  return { v: 2, lang: prev.lang || null, step: 'idle', data: {}, stack: [], lastAt: 0 };
}

export function loadFlowState(saved) {
  if (!saved || typeof saved !== 'object' || saved.v !== 2) return freshFlowState(saved && typeof saved === 'object' ? saved : {});
  return {
    v: 2,
    lang: saved.lang || null,
    step: saved.step || 'idle',
    data: saved.data && typeof saved.data === 'object' ? saved.data : {},
    stack: Array.isArray(saved.stack) ? saved.stack.slice(-20) : [],
    lastAt: Number(saved.lastAt) || 0,
  };
}

// ------------------------------------------------------------------ input helpers

function clean(text) {
  return String(text || '')
    .replace(/[️⃣]/g, '')
    .replace(/🔟/g, '10')
    .replace(/[*_~]/g, '')
    .trim();
}

function words(text) {
  return normalizeText(text);
}

// A list choice: index (0-based), -1 when a number outside the list, null when not a number.
export function pickIndex(text, count) {
  const m = clean(text).toLowerCase().match(/^(?:no\.?|number|option|nomoro)?\s*(\d{1,2})[.)]?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= count ? n - 1 : -1;
}

// A choice from an option table: by number or by typing the label.
function pickOption(text, group) {
  const options = OPTIONS[group];
  const idx = pickIndex(text, options.length);
  if (idx !== null) return idx >= 0 ? options[idx] : null;
  const w = words(text);
  if (!w) return null;
  return (
    options.find((o) => [o.en, o.tn, o.key].some((label) => words(label) === w)) ||
    options.find((o) => [o.en, o.tn].some((label) => words(label).split(' ')[0] === w.split(' ')[0] && w.length >= 4)) ||
    null
  );
}

function yesNo(text) {
  const idx = pickIndex(text, 2);
  if (idx === 0) return true;
  if (idx === 1) return false;
  if (isYes(text)) return true;
  if (isNo(text)) return false;
  return null;
}

const COMMANDS = [
  ['menu', /^(menu|main menu|home|start|lenaane|lenaneo|dimenu)$/],
  ['help', /^(help|commands|thusa|thuso)$/],
  ['appointment', /^(appointment|appointments|my appointments?|my bookings?|bookings?|my visits?|manage( appointments?)?|dikopano|kopano ya me)$/],
  ['status', /^(status|my status|check status|maemo|status (vms|sr|fb|cmp|ho)-?[a-z0-9-]*)$/],
  ['cancel', /^(cancel|stop|abort|khansela|emisa)$/],
  ['back', /^(back|go back|previous|morago|boela morago)$/],
  ['human', /^(human|agent|staff|person|operator|real person|talk to (a )?(human|person|agent|staff)|motho|modiri)$/],
  ['end', /^(end|bye|goodbye|good bye|exit|quit|sala sentle|tsamaya sentle|sala pila|ke a leboga bye)$/],
  ['thanks', /^(thanks?|thank you|thank you so much|thanks a lot|many thanks|thx|ok thanks|okay thanks|ke a leboga|ke itumetse|re a leboga|ke a leboga thata)$/],
  ['setswana', /^(setswana|tswana|puo ya setswana)$/],
  ['english', /^(english|sekgoa)$/],
];

export function parseCommand(text) {
  const w = words(clean(text));
  if (!w) return null;
  for (const [name, re] of COMMANDS) if (re.test(w)) return name;
  return null;
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

function isEmail(text) {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(text || '').trim());
}

function isSkip(text) {
  return /^(skip|no|none|n\/a|na|nnyaa|tlola|later)$/i.test(clean(text));
}

function validName(text) {
  const value = clean(text).replace(/\s+/g, ' ');
  if (value.length < 2 || value.length > 80) return null;
  if (!/[a-zA-Z]{2,}/.test(value) || /\d{3,}/.test(value) || /[@#$%^&*=<>{}[\]\\|]/.test(value)) return null;
  if (isGreetingOnly(value) || parseCommand(value) || looksLikeQuestion(value)) return null;
  return value
    .split(' ')
    .map((part) => (part === part.toLowerCase() || part === part.toUpperCase() ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
    .join(' ');
}

function freeText(text, max = 1000) {
  const value = clean(text).replace(/\s+/g, ' ');
  return value.length >= 2 ? value.slice(0, max) : null;
}

// ------------------------------------------------------------------ state helpers

function clone(v) {
  return JSON.parse(JSON.stringify(v || {}));
}

function lineIf(label, value) {
  return value ? `\n${label}${value}` : '';
}

function hostLines(host, lang) {
  const dept = departmentOf(host);
  return {
    deptLine: lineIf(lang === 'tn' ? 'Lefapha: ' : 'Department: ', dept),
    officeLine: lineIf(lang === 'tn' ? 'Ofisi: ' : 'Office: ', host.office),
  };
}

function hostLabel(host) {
  const dept = departmentOf(host);
  return `${host.name}${dept ? ` (${dept})` : ''}`;
}

// The menu items this company offers, in the client's order.
export function menuItems(io) {
  const f = io.company.features || {};
  return [
    { key: 'register', on: true },
    { key: 'appointment', on: Boolean(f.appointments) },
    { key: 'feedback', on: Boolean(f.feedback) },
    { key: 'service', on: Boolean(f.service_requests) },
    { key: 'ask', on: true },
  ].filter((i) => i.on);
}

function menuText(s, io) {
  const items = menuItems(io);
  return `${ft(s.lang, 'menu.title')}\n\n${numberedList(items.map((i) => ft(s.lang, `menu.${i.key}`)))}\n\n${ft(s.lang, 'menu.footer')}`;
}

function template(io, key, lang) {
  const tpl = io.company.settings?.templates?.[key]?.[lang];
  return tpl && tpl.trim() ? tpl.trim() : null;
}

function fill(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? '' : String(vars[k])));
}

function healthQuestions(io) {
  const rules = io.company.settings?.rules || {};
  return io.company.features?.visitation_rules && rules.healthScreening ? (rules.healthQuestions || []).filter(Boolean) : [];
}

// ------------------------------------------------------------------ prompts

async function prompt(s, io) {
  const L = s.lang;
  const d = s.data;
  switch (s.step) {
    case 'profile.name':
      return ft(L, 'profile.askName');
    case 'profile.type':
      return ft(L, 'profile.askType');
    case 'profile.company':
      return ft(L, 'profile.askCompany');
    case 'profile.other':
      return ft(L, 'profile.askOther');
    case 'profile.email':
      return ft(L, 'profile.askEmail');
    case 'menu':
    case 'idle':
      return menuText(s, io);
    case 'host':
      return ft(L, d.flow === 'appt' ? 'appt.askWith' : 'reg.askHost');
    case 'hostConfirm': {
      const host = io.hosts.find((h) => Number(h.id) === Number(d.candidate));
      return host ? ft(L, 'reg.hostFound', { host: host.name, ...hostLines(host, L) }) : ft(L, 'reg.askHost');
    }
    case 'hostPick': {
      const list = (d.candidates || []).map((id) => io.hosts.find((h) => Number(h.id) === Number(id))).filter(Boolean);
      return ft(L, d.directory ? 'reg.hostDirectory' : 'reg.hostMany', { list: numberedList(list.map(hostLabel)) });
    }
    case 'purpose':
      return ft(L, 'reg.askPurpose', { list: optionList('purpose', L) });
    case 'purposeOther':
      return ft(L, 'reg.askPurposeOther');
    case 'topic':
      return ft(L, 'appt.askTopic');
    case 'apptType':
      return ft(L, 'appt.askType', { list: optionList('appointmentType', L) });
    case 'date':
      return ft(L, 'reg.askDate');
    case 'time':
      return timePrompt(s, io);
    case 'id':
      return ft(L, 'reg.askId');
    case 'nda':
      return ft(L, 'reg.askNda', { nda: io.company.settings?.rules?.ndaText || '' });
    case 'health': {
      const qs = healthQuestions(io);
      const i = d.healthIndex || 0;
      const head = i === 0 ? `${ft(L, 'reg.healthIntro', { count: qs.length })}\n\n` : '';
      return head + ft(L, 'reg.healthQ', { n: i + 1, question: qs[i] || '' });
    }
    case 'confirm':
      return summary(s, io);
    case 'manage.list':
      return manageListText(s);
    case 'manage.options':
      return manageOptionsText(s, d.booking);
    case 'manage.cancelConfirm':
      return ft(L, 'manage.cancelConfirm', bookingVars(d.booking, L));
    case 'fb.topic':
      return ft(L, 'fb.askTopic', { list: optionList('feedbackTopic', L) });
    case 'fb.comment':
      return ft(L, 'fb.askComment');
    case 'fb.rating':
      return ft(L, 'fb.askRating');
    case 'fb.complaint':
      return ft(L, 'fb.askComplaint');
    case 'fb.contact':
      return ft(L, 'fb.askContact');
    case 'fb.offer':
      return ft(L, 'fb.offerAfterVisit', { company: io.company.name });
    case 'svc.category':
      return ft(L, 'svc.askCategory', { list: optionList('serviceCategory', L) });
    case 'svc.describe':
      return ft(L, 'svc.askDescribe');
    case 'svc.priority':
      return ft(L, 'svc.askPriority', { list: optionList('priority', L) });
    case 'svc.attach':
      return ft(L, 'svc.askAttach');
    case 'svc.file':
      return ft(L, 'svc.askFile');
    case 'svc.confirm':
      return ft(L, 'svc.summary', {
        category: optionLabel('serviceCategory', d.category, L),
        description: d.description,
        priority: optionLabel('priority', d.priority, L),
        fileLine: d.docId ? ft(L, 'svc.fileLine') : '',
      });
    case 'ask.question':
      return ft(L, 'ask.prompt', { company: io.company.name });
    case 'ask.unknown':
      return ft(L, 'ask.unknown');
    case 'ho.dept':
      return ft(L, 'ho.askDept', { list: numberedList(handoverDepartments(io)) });
    case 'handover':
      return ft(L, 'ho.waiting', { ref: d.handoverRef || '' });
    default:
      return menuText(s, io);
  }
}

function handoverDepartments(io) {
  const list = io.company.settings?.departments?.handover;
  return Array.isArray(list) && list.length ? list : ['Reception', 'Sales', 'IT Support', 'Accounts', 'General Enquiries'];
}

function dayHours(io, date) {
  return hoursOn(io.company.settings, date);
}

async function availableSlots(s, io, date, hostId) {
  const hours = dayHours(io, date);
  if (!hours) return [];
  const bookings = (await io.openBookings()).filter((b) => !s.data.ref || b.ref !== s.data.ref);
  return freeSlots({ bookings, hostId, date, today: io.today, now: io.now, hours });
}

function slotList(slots) {
  if (slots.length <= 10) return slots.join(', ');
  return `${slots.slice(0, 10).join(', ')} …`;
}

async function timePrompt(s, io) {
  const d = s.data;
  const hours = dayHours(io, d.date) || { open: '08:00', close: '17:00' };
  const bookings = await io.openBookings();
  const slots = freeSlots({ bookings: bookings.filter((b) => b.ref !== d.ref), hostId: d.hostId, date: d.date, today: io.today, now: io.now, hours });
  return ft(s.lang, 'reg.askTime', {
    date: formatVisitDate(d.date, s.lang),
    open: hours.open,
    close: hours.close,
    slots: slots.length ? ft(s.lang, 'reg.slotsLine', { slots: slotList(slots) }) : '',
  });
}

function summary(s, io) {
  const d = s.data;
  const L = s.lang;
  const host = io.hosts.find((h) => Number(h.id) === Number(d.hostId));
  const vars = {
    name: io.visitor?.name || '',
    company: io.visitor?.company && io.visitor.company !== '—' ? io.visitor.company : '—',
    host: host ? hostLabel(host) : d.hostName,
    date: formatVisitDate(d.date, L),
    time: formatVisitTime(d.time, L),
  };
  if (d.flow === 'appt') {
    return ft(L, 'appt.summary', { ...vars, type: optionLabel('appointmentType', d.appointmentType, L), topic: d.topic });
  }
  return ft(L, 'reg.summary', { ...vars, purpose: d.purposeText || optionLabel('purpose', d.purpose, L) });
}

function statusText(status, L) {
  const map = {
    pending: L === 'tn' ? 'E emetse go amogelwa' : 'Pending approval',
    approved: L === 'tn' ? 'E amogetswe' : 'Confirmed',
    rejected: L === 'tn' ? 'E ganetswe' : 'Declined',
    cancelled: L === 'tn' ? 'E khanseletswe' : 'Cancelled',
    used: L === 'tn' ? 'O tsene' : 'Checked in',
  };
  return map[status] || status;
}

function bookingVars(b, L) {
  if (!b) return {};
  return {
    ref: b.ref,
    kind: ft(L, b.kind === 'appointment' ? 'kind.appointment' : 'kind.visit'),
    kindLower: ft(L, b.kind === 'appointment' ? 'kind.appointment' : 'kind.visit').toLowerCase(),
    host: b.hostName,
    date: formatVisitDate(b.date, L),
    time: formatVisitTime(b.time, L),
    status: statusText(b.status, L),
    purpose: b.purpose || '—',
    deptLine: lineIf(L === 'tn' ? '\nLefapha: ' : '\nDepartment: ', b.hostDepartment).replace(/^\n\n/, '\n'),
    officeLine: lineIf(L === 'tn' ? '\nOfisi: ' : '\nOffice: ', b.hostOffice).replace(/^\n\n/, '\n'),
    pinLine: b.status === 'approved' && b.pin ? `\nPIN: ${b.pin}` : '',
  };
}

function manageListText(s) {
  const list = (s.data.bookings || []).map((b) => {
    const v = bookingVars(b, s.lang);
    return `${v.kind} · ${v.host}\n    ${v.date}, ${v.time} · ${v.status} · ${v.ref}`;
  });
  return ft(s.lang, 'manage.list', { list: numberedList(list) });
}

function manageOptionsText(s, booking) {
  return ft(s.lang, 'manage.options', bookingVars(booking, s.lang));
}

// ------------------------------------------------------------------ the turn

export async function runFlow({ state, text = '', media = null, io }) {
  const s = loadFlowState(state);
  const out = { replies: [], files: [] };
  const say = (msg) => msg && out.replies.push(msg);
  const raw = String(text || '');
  const now = io.clock ? io.clock() : Date.now();
  const stale = s.lastAt && now - s.lastAt > STALE_MS;

  if (!s.lang) s.lang = normalizeLang(detectLanguage(raw) || io.company.settings?.defaultLanguage || io.defaultLanguage || 'en');
  const command = media && !raw ? null : parseCommand(raw);
  if (command === 'setswana' || command === 'english') s.lang = command === 'setswana' ? 'tn' : 'en';
  const L = () => s.lang;

  const go = async (step, { push = true, data } = {}) => {
    if (push) s.stack.push({ step: s.step, data: clone(s.data) });
    if (s.stack.length > 20) s.stack.shift();
    s.step = step;
    if (data) s.data = data;
    say(await prompt(s, io));
  };
  const toMenu = async (lead) => {
    say(lead);
    s.step = 'menu';
    s.data = {};
    s.stack = [];
    say(menuText(s, io));
  };
  const finish = (lead) => {
    say(lead);
    s.step = 'menu';
    s.data = {};
    s.stack = [];
  };
  const done = () => {
    s.lastAt = now;
    return { state: s, ...out };
  };

  // ---- 1. A new number creates its profile first.
  const visitor = io.visitor;
  if (!visitor?.name && !s.step.startsWith('profile.')) {
    const welcome = template(io, 'welcome', L());
    say(welcome ? fill(welcome, { company: io.company.name }) : ft(L(), 'welcome.new', { company: io.company.name }));
    s.step = 'profile.name';
    s.data = {};
    s.stack = [];
    // A first message that is already a name is not taken as one: the visitor has not been asked yet.
    say(ft(L(), 'profile.askName'));
    return done();
  }
  if (s.step.startsWith('profile.')) {
    if (command === 'setswana' || command === 'english') {
      say(ft(L(), 'cmd.lang'));
      say(await prompt(s, io));
      return done();
    }
    await profileStep(s, raw, io, { say, go, toMenu });
    return done();
  }

  // ---- 2. Live chat with staff: the assistant stays quiet until the visitor comes back.
  if (s.step === 'handover') {
    const open = await io.handoverOpen();
    if (open && !['menu', 'cancel', 'end', 'back'].includes(command)) {
      if (!s.data.waitingNoticeSent) {
        s.data.waitingNoticeSent = true;
        say(ft(L(), 'ho.waiting', { ref: s.data.handoverRef }));
      }
      return done();
    }
    if (open) await io.closeHandover();
    if (command === 'end') {
      finish(endText(s, io));
      return done();
    }
    await toMenu(ft(L(), 'ho.resumed'));
    return done();
  }

  // ---- 3. Returning visitor after a long pause (or a fresh conversation).
  if ((s.step === 'idle' || stale) && !command) {
    s.step = 'menu';
    s.data = {};
    s.stack = [];
    if (isGreetingOnly(raw) || !raw.trim() || stale || !s.lastAt) {
      say(ft(L(), 'welcome.back', { first: firstName(visitor.name) }));
      say(menuText(s, io));
      return done();
    }
  }

  // ---- 4. Global commands.
  if (command) {
    if (s.step === 'idle') s.step = 'menu';
    switch (command) {
      case 'menu':
        await toMenu();
        return done();
      case 'help':
        say(ft(L(), 'help.text'));
        if (!['menu', 'idle'].includes(s.step)) say(await prompt(s, io));
        return done();
      case 'setswana':
      case 'english':
        say(ft(L(), 'cmd.lang'));
        say(await prompt(s, io));
        return done();
      case 'cancel':
        if (['menu', 'idle'].includes(s.step)) say(ft(L(), 'cmd.nothingToCancel'));
        else await toMenu(ft(L(), 'cmd.cancelled'));
        return done();
      case 'back': {
        const prev = s.stack.pop();
        if (!prev) {
          say(ft(L(), 'cmd.cantGoBack'));
          if (s.step !== 'menu') say(await prompt(s, io));
          return done();
        }
        s.step = prev.step;
        s.data = prev.data;
        say(await prompt(s, io));
        return done();
      }
      case 'status':
        say(await statusSummary(s, io, raw));
        if (!['menu', 'idle'].includes(s.step)) say(await prompt(s, io));
        return done();
      case 'appointment':
        await startManage(s, io, { say, go });
        return done();
      case 'human':
        if (!io.company.features?.human_handover) {
          say(ft(L(), 'common.unavailable'));
          return done();
        }
        await go('ho.dept', { push: true, data: {} });
        return done();
      case 'end':
        finish(endText(s, io));
        return done();
      case 'thanks':
        if (['menu', 'idle'].includes(s.step)) finish(endText(s, io));
        else say(await prompt(s, io));
        return done();
      default:
        break;
    }
  }

  // ---- 5. A greeting in the middle of a step repeats the question.
  if (isGreetingOnly(raw) && !['menu', 'idle'].includes(s.step)) {
    say(await prompt(s, io));
    return done();
  }

  // ---- 6. The current step.
  const ctx = { say, go, toMenu, finish, now, files: out.files };
  const handler = STEPS[s.step] || STEPS.menu;
  await handler(s, raw, io, ctx, media);
  return done();
}

function endText(s, io) {
  const custom = template(io, 'goodbye', s.lang);
  return custom ? fill(custom, { company: io.company.name }) : ft(s.lang, 'end.text', { company: io.company.name });
}

// ------------------------------------------------------------------ profile

async function profileStep(s, raw, io, { say, go, toMenu }) {
  const L = s.lang;
  const d = s.data;
  switch (s.step) {
    case 'profile.name': {
      const name = validName(raw);
      if (!name) return say(ft(L, 'profile.badName'));
      d.name = name;
      return go('profile.type');
    }
    case 'profile.type': {
      const option = pickOption(raw, 'profileType');
      if (!option) return say(`${ft(L, 'common.pickNumber')}\n\n${ft(L, 'profile.askType')}`);
      d.profileType = option.key;
      if (option.key === 'organisation') return go('profile.company');
      if (option.key === 'other') return go('profile.other');
      d.company = '';
      return go('profile.email');
    }
    case 'profile.company':
    case 'profile.other': {
      const value = freeText(raw, 120);
      if (!value) return say(await prompt(s, io));
      d.company = value;
      return go('profile.email');
    }
    case 'profile.email': {
      if (isSkip(raw)) d.email = '';
      else if (isEmail(raw)) d.email = raw.trim().toLowerCase();
      else return say(ft(L, 'profile.badEmail'));
      const saved = await io.saveProfile({ name: d.name, profile_type: d.profileType, company: d.company || '—', email: d.email });
      io.visitor = saved || { name: d.name, company: d.company };
      return toMenu(ft(L, 'profile.done', { first: firstName(d.name) }));
    }
    default:
      s.step = 'profile.name';
      return say(ft(L, 'profile.askName'));
  }
}

// ------------------------------------------------------------------ steps

const ASK_HOURS = /\b(open(ing)?|close|closing|hours|office hours|working hours|time do you|when are you|diura|bula|tswala)\b/i;
const ASK_LOCATION = /\b(where are you|location|address|directions|located|find you|kae|lefelo)\b/i;
const ASK_CONTACT = /\b(phone number|contact|call you|email address|telephone|nomoro ya mogala)\b/i;

async function answerQuestion(s, raw, io) {
  const L = s.lang;
  const settings = io.company.settings || {};
  if (ASK_HOURS.test(raw)) return { text: ft(L, 'ask.hours', { hours: hoursText(settings) }), known: true };
  if (ASK_LOCATION.test(raw) && (settings.address || settings.location)) {
    return { text: ft(L, 'ask.location', { location: [settings.address, settings.location].filter(Boolean).join(', ') }), known: true };
  }
  if (ASK_CONTACT.test(raw) && (settings.phone || settings.email)) {
    return { text: ft(L, 'ask.contact', { contact: [settings.phone, settings.email].filter(Boolean).join(' / ') }), known: true };
  }
  return io.answer(raw, L);
}

async function startFlow(s, io, ctx, flow) {
  if (!io.hosts.length) {
    ctx.say(ft(s.lang, 'reg.hostNoneAtAll'));
    return;
  }
  if (await io.limitReached('visits_per_month')) {
    ctx.say(ft(s.lang, 'reg.limit'));
    return;
  }
  await ctx.go('host', { data: { flow } });
}

async function startManage(s, io, { say, go }) {
  const bookings = await io.upcoming();
  if (!bookings.length) {
    say(ft(s.lang, 'manage.none'));
    if (!['menu', 'idle'].includes(s.step)) say(await prompt(s, io));
    return;
  }
  await go('manage.list', { data: { bookings } });
}

async function statusSummary(s, io, raw) {
  const L = s.lang;
  const items = await io.statusItems(raw);
  if (!items.visits.length && !items.tickets.length && !items.feedback.length) return ft(L, 'status.none');
  const lines = [
    ...items.visits.map((b) => ft(L, 'status.visitLine', bookingVars(b, L))),
    ...items.tickets.map((t) =>
      ft(L, 'status.ticketLine', {
        ref: t.ref,
        category: optionLabel('serviceCategory', t.category, L),
        status: SERVICE_STATUS[t.status]?.[L] || t.status,
      })
    ),
    ...items.feedback.map((f) => ft(L, 'status.feedbackLine', { ref: f.ref, topic: optionLabel('feedbackTopic', f.topic, L) })),
  ];
  return `${ft(L, 'status.header')}\n${lines.join('\n')}`;
}

// After choosing a host: the next question of the flow.
async function afterHost(s, io, ctx) {
  return ctx.go(s.data.flow === 'appt' ? 'topic' : 'purpose');
}

// After date and time: visitation rules (if any apply), then the summary.
async function afterTime(s, io, ctx) {
  const rules = io.company.settings?.rules || {};
  const enforce = Boolean(io.company.features?.visitation_rules);
  const d = s.data;
  if (d.flow === 'resched') return submitReschedule(s, io, ctx);
  if (enforce && !d.idDocId && !d.idSkipped && (rules.requireId === 'every_visit' || (rules.requireId === 'first_visit' && !(await io.hasIdOnFile())))) {
    return ctx.go('id');
  }
  if (enforce && rules.requireNda && !d.ndaAccepted) return ctx.go('nda');
  if (healthQuestions(io).length && !d.healthDone) {
    d.healthIndex = 0;
    d.health = [];
    return ctx.go('health');
  }
  return ctx.go('confirm');
}

async function submitReschedule(s, io, ctx) {
  const L = s.lang;
  const d = s.data;
  const result = await io.reschedule(d.ref, d.date, d.time);
  if (result.ok) return ctx.finish(ft(L, 'manage.rescheduled', { ref: d.ref, date: formatVisitDate(d.date, L), time: formatVisitTime(d.time, L), host: result.hostName }));
  if (result.reason === 'slot_taken') {
    ctx.say(ft(L, 'reg.slotTaken', { host: result.hostName, date: formatVisitDate(d.date, L), slots: slotList(await availableSlots(s, io, d.date, d.hostId)) }));
    s.step = 'time';
    return;
  }
  return ctx.finish(ft(L, 'manage.cantChange', { status: statusText(result.status || 'closed', L) }));
}

async function chooseHost(s, io, ctx, host) {
  s.data.hostId = host.id;
  s.data.hostName = host.name;
  return afterHost(s, io, ctx);
}

const STEPS = {
  async menu(s, raw, io, ctx) {
    const L = s.lang;
    const items = menuItems(io);
    let idx = pickIndex(raw, items.length);
    if (idx === null) {
      const w = words(raw);
      const byLabel = items.findIndex((i) => [ft('en', `menu.${i.key}`), ft('tn', `menu.${i.key}`)].some((label) => words(label) === w));
      if (byLabel >= 0) idx = byLabel;
      else if (/\b(register|registration|visit|kwadisa|ketelo)\b/.test(w) && w.split(' ').length <= 4) idx = 0;
    }
    if (idx === null || idx < 0) {
      // Free text at the menu is treated as a question.
      if (idx === null && raw.trim().length > 3 && !isGreetingOnly(raw)) {
        s.step = 'ask.question';
        return STEPS['ask.question'](s, raw, io, ctx);
      }
      if (isGreetingOnly(raw)) {
        ctx.say(ft(L, 'welcome.back', { first: firstName(io.visitor?.name) }));
        return ctx.say(menuText(s, io));
      }
      ctx.say(ft(L, 'menu.invalid'));
      return ctx.say(menuText(s, io));
    }
    const key = items[idx].key;
    if (key === 'register') return startFlow(s, io, ctx, 'reg');
    if (key === 'appointment') return startFlow(s, io, ctx, 'appt');
    if (key === 'feedback') return ctx.go('fb.topic', { data: {} });
    if (key === 'service') return ctx.go('svc.category', { data: {} });
    return ctx.go('ask.question', { data: {} });
  },

  async idle(s, raw, io, ctx) {
    return STEPS.menu(s, raw, io, ctx);
  },

  async host(s, raw, io, ctx) {
    const L = s.lang;
    const d = s.data;
    const query = clean(raw);
    if (!query) return ctx.say(await prompt(s, io));
    const { hosts } = bestHostMatches(query, io.hosts);
    if (hosts.length === 1) {
      d.candidate = hosts[0].id;
      d.hostTries = 0;
      return ctx.go('hostConfirm');
    }
    if (hosts.length > 1) {
      d.candidates = hosts.slice(0, 9).map((h) => h.id);
      d.directory = false;
      return ctx.go('hostPick');
    }
    d.hostTries = (d.hostTries || 0) + 1;
    if (d.hostTries >= 2) {
      d.candidates = io.hosts.slice(0, 10).map((h) => h.id);
      d.directory = true;
      return ctx.go('hostPick');
    }
    return ctx.say(ft(L, 'reg.hostNone', { query: query.slice(0, 60) }));
  },

  async hostConfirm(s, raw, io, ctx) {
    const answer = yesNo(raw);
    const host = io.hosts.find((h) => Number(h.id) === Number(s.data.candidate));
    if (answer === true && host) return chooseHost(s, io, ctx, host);
    if (answer === false || !host) {
      s.step = 'host';
      delete s.data.candidate;
      return ctx.say(ft(s.lang, 'reg.hostRetry'));
    }
    // Typed another name instead of yes/no: search again.
    if (clean(raw).length >= 3 && !/^\d+$/.test(clean(raw))) {
      s.step = 'host';
      return STEPS.host(s, raw, io, ctx);
    }
    return ctx.say(await prompt(s, io));
  },

  async hostPick(s, raw, io, ctx) {
    const list = (s.data.candidates || []).map((id) => io.hosts.find((h) => Number(h.id) === Number(id))).filter(Boolean);
    const idx = pickIndex(raw, list.length);
    if (idx !== null && idx >= 0) return chooseHost(s, io, ctx, list[idx]);
    if (idx === null && clean(raw).length >= 2) {
      const { hosts, score } = bestHostMatches(raw, io.hosts);
      if (hosts.length === 1 && score >= CONFIDENT_SCORE) return chooseHost(s, io, ctx, hosts[0]);
      if (hosts.length === 1) {
        s.data.candidate = hosts[0].id;
        s.step = 'hostConfirm';
        return ctx.say(await prompt(s, io));
      }
      if (hosts.length > 1) {
        s.data.candidates = hosts.slice(0, 9).map((h) => h.id);
        s.data.directory = false;
        return ctx.say(await prompt(s, io));
      }
    }
    ctx.say(ft(s.lang, 'common.pickNumber'));
    return ctx.say(await prompt(s, io));
  },

  async purpose(s, raw, io, ctx) {
    const option = pickOption(raw, 'purpose');
    if (!option) {
      // A purpose typed in words ("site inspection") is accepted as it is.
      const typed = pickIndex(raw, OPTIONS.purpose.length) === null ? freeText(raw, 200) : null;
      if (typed && typed.length >= 4) {
        s.data.purpose = 'other';
        s.data.purposeText = typed;
        return ctx.go('date');
      }
      ctx.say(ft(s.lang, 'common.pickNumber'));
      return ctx.say(await prompt(s, io));
    }
    s.data.purpose = option.key;
    delete s.data.purposeText;
    if (option.key === 'other') return ctx.go('purposeOther');
    return ctx.go('date');
  },

  async purposeOther(s, raw, io, ctx) {
    const value = freeText(raw, 200);
    if (!value) return ctx.say(await prompt(s, io));
    s.data.purposeText = value;
    return ctx.go('date');
  },

  async topic(s, raw, io, ctx) {
    const value = freeText(raw, 500);
    if (!value) return ctx.say(await prompt(s, io));
    s.data.topic = value;
    return ctx.go('apptType');
  },

  async apptType(s, raw, io, ctx) {
    const option = pickOption(raw, 'appointmentType');
    if (!option) {
      ctx.say(ft(s.lang, 'common.pickNumber'));
      return ctx.say(await prompt(s, io));
    }
    s.data.appointmentType = option.key;
    return ctx.go('date');
  },

  async date(s, raw, io, ctx) {
    const L = s.lang;
    const date = extractDate(raw, io.today);
    if (!date) return ctx.say(ft(L, 'reg.badDate'));
    if (date === 'past' || date < io.today) return ctx.say(ft(L, 'reg.pastDate'));
    const max = new Date(`${io.today}T00:00:00Z`);
    max.setUTCDate(max.getUTCDate() + MAX_DAYS_AHEAD);
    if (date > max.toISOString().slice(0, 10)) return ctx.say(ft(L, 'reg.badDate'));
    if (!dayHours(io, date)) {
      return ctx.say(ft(L, 'reg.closedDay', { date: formatVisitDate(date, L), hours: hoursText(io.company.settings) }));
    }
    const slots = await availableSlots(s, io, date, s.data.hostId);
    if (!slots.length) {
      const host = io.hosts.find((h) => Number(h.id) === Number(s.data.hostId));
      return ctx.say(ft(L, 'reg.noSlots', { host: host?.name || s.data.hostName || '', date: formatVisitDate(date, L) }));
    }
    s.data.date = date;
    return ctx.go('time');
  },

  async time(s, raw, io, ctx) {
    const L = s.lang;
    const d = s.data;
    const time = extractTime(raw, { bare: true });
    if (!time) return ctx.say(ft(L, 'reg.badTime'));
    const hours = dayHours(io, d.date) || { open: '08:00', close: '17:00' };
    const t = toMinutes(time);
    if (t < toMinutes(hours.open) || t > toMinutes(hours.close) - SLOT_MINUTES) {
      return ctx.say(ft(L, 'reg.closedTime', hours));
    }
    if (d.date === io.today && t <= toMinutes(io.now)) return ctx.say(ft(L, 'reg.pastTime'));
    const bookings = (await io.openBookings()).filter((b) => b.ref !== d.ref);
    if (conflictAt(bookings, d.hostId, d.date, time)) {
      const slots = freeSlots({ bookings, hostId: d.hostId, date: d.date, today: io.today, now: io.now, hours });
      const host = io.hosts.find((h) => Number(h.id) === Number(d.hostId));
      return ctx.say(ft(L, 'reg.slotTaken', { host: host?.name || d.hostName || '', date: formatVisitDate(d.date, L), slots: slotList(slots) }));
    }
    d.time = time;
    return afterTime(s, io, ctx);
  },

  async id(s, raw, io, ctx, media) {
    const L = s.lang;
    if (!media || !['image', 'document'].includes(media.kind)) return ctx.say(ft(L, 'reg.needIdFile'));
    const saved = await io.saveDocument('id_document', media);
    if (saved.ok) {
      s.data.idDocId = saved.id;
      ctx.say(ft(L, 'reg.idSaved'));
    } else {
      // Storage limit reached: continue, and let reception check the ID at the gate.
      s.data.idSkipped = true;
      s.data.idProblem = saved.reason || 'not stored';
    }
    return afterTime(s, io, ctx);
  },

  async nda(s, raw, io, ctx) {
    const w = words(raw);
    if (/^(i agree|agree|i accept|accept|ke a dumela|ke dumela|ke amogela)$/.test(w)) {
      s.data.ndaAccepted = true;
      return afterTime(s, io, ctx);
    }
    return ctx.say(ft(s.lang, 'reg.needAgree'));
  },

  async health(s, raw, io, ctx) {
    const answer = yesNo(raw);
    const qs = healthQuestions(io);
    const i = s.data.healthIndex || 0;
    if (answer === null) return ctx.say(await prompt(s, io));
    s.data.health = [...(s.data.health || []), { question: qs[i], answer: answer ? 'yes' : 'no' }];
    if (i + 1 < qs.length) {
      s.data.healthIndex = i + 1;
      return ctx.say(await prompt(s, io));
    }
    s.data.healthDone = true;
    return afterTime(s, io, ctx);
  },

  async confirm(s, raw, io, ctx) {
    const L = s.lang;
    const idx = pickIndex(raw, 3);
    const yes = idx === 0 || (idx === null && isYes(raw));
    const change = idx === 1 || (idx === null && isNo(raw));
    if (idx === 2) return ctx.toMenu(ft(L, 'cmd.cancelled'));
    if (change) {
      const flow = s.data.flow;
      s.stack = [];
      return ctx.go('host', { push: false, data: { flow } });
    }
    if (!yes) return ctx.say(await prompt(s, io));

    const d = s.data;
    const flags = [];
    const yesAnswers = (d.health || []).filter((h) => h.answer === 'yes');
    if (yesAnswers.length) flags.push(`Health screening: answered yes to "${yesAnswers.map((h) => h.question).join('", "')}"`);
    if (d.idProblem) flags.push(`ID document not stored (${d.idProblem}) — check ID at the gate`);
    const result = await io.createVisit({
      kind: d.flow === 'appt' ? 'appointment' : 'visit',
      hostId: d.hostId,
      purpose: d.flow === 'appt' ? `${optionLabel('appointmentType', d.appointmentType, 'en')}: ${d.topic}` : d.purposeText || optionLabel('purpose', d.purpose, 'en'),
      appointmentType: d.appointmentType || '',
      topic: d.topic || '',
      date: d.date,
      time: d.time,
      flagged: flags.length > 0,
      flagReason: flags.join('; '),
      screening: {
        nda: d.ndaAccepted ? { accepted: true, at: new Date(ctx.now).toISOString() } : undefined,
        health: d.health && d.health.length ? d.health : undefined,
        idDocument: d.idDocId || undefined,
      },
      idDocId: d.idDocId || null,
    });
    if (!result.ok) {
      if (result.reason === 'slot_taken') {
        const slots = await availableSlots(s, io, d.date, d.hostId);
        ctx.say(ft(L, 'reg.slotTaken', { host: d.hostName, date: formatVisitDate(d.date, L), slots: slotList(slots) }));
        s.step = 'time';
        return;
      }
      if (result.reason === 'limit') return ctx.toMenu(ft(L, 'reg.limit'));
      return ctx.say(ft(L, 'common.error'));
    }
    const key = d.flow === 'appt' ? 'appt.sent' : 'reg.sent';
    return ctx.finish(ft(L, key, { host: result.hostName, ref: result.ref }) + (flags.length && yesAnswers.length ? ft(L, 'reg.flaggedNote') : ''));
  },

  async 'manage.list'(s, raw, io, ctx) {
    const list = s.data.bookings || [];
    const idx = pickIndex(raw, list.length);
    if (idx === null || idx < 0) {
      ctx.say(ft(s.lang, 'common.pickNumber'));
      return ctx.say(await prompt(s, io));
    }
    return ctx.go('manage.options', { data: { bookings: list, booking: list[idx] } });
  },

  async 'manage.options'(s, raw, io, ctx) {
    const L = s.lang;
    const b = s.data.booking;
    const idx = pickIndex(raw, 5);
    if (idx === 0) {
      return ctx.go('date', { data: { flow: 'resched', ref: b.ref, hostId: b.hostId, hostName: b.hostName, booking: b } });
    }
    if (idx === 1) return ctx.go('manage.cancelConfirm');
    if (idx === 2) {
      const fresh = (await io.bookingDetails(b.ref)) || b;
      ctx.say(ft(L, 'manage.details', bookingVars(fresh, L)));
      return ctx.say(manageOptionsText(s, fresh));
    }
    if (idx === 3) {
      const file = await io.calendarFile(b.ref, L);
      if (file) {
        ctx.files.push(file);
        ctx.say(ft(L, 'manage.calendarSent'));
      } else ctx.say(ft(L, 'common.error'));
      return;
    }
    if (idx === 4) return ctx.toMenu();
    ctx.say(ft(L, 'common.pickNumber'));
    return ctx.say(manageOptionsText(s, b));
  },

  async 'manage.cancelConfirm'(s, raw, io, ctx) {
    const L = s.lang;
    const answer = yesNo(raw);
    const b = s.data.booking;
    if (answer === null) return ctx.say(await prompt(s, io));
    if (!answer) return ctx.finish(ft(L, 'manage.kept'));
    const result = await io.cancel(b.ref);
    if (result.ok) return ctx.finish(ft(L, 'manage.cancelled', { ...bookingVars(b, L), host: result.hostName || b.hostName }));
    return ctx.finish(ft(L, 'manage.cantChange', { status: statusText(result.status || 'closed', L) }));
  },

  async 'fb.topic'(s, raw, io, ctx) {
    const option = pickOption(raw, 'feedbackTopic');
    if (!option) {
      ctx.say(ft(s.lang, 'common.pickNumber'));
      return ctx.say(await prompt(s, io));
    }
    s.data.topic = option.key;
    if (option.key === 'complaint') return ctx.go('fb.complaint');
    return ctx.go('fb.comment');
  },

  async 'fb.offer'(s, raw, io, ctx) {
    const answer = yesNo(raw);
    if (answer === null) {
      // Anything else: leave the offer and treat the message normally from the menu.
      s.step = 'menu';
      s.data = {};
      return STEPS.menu(s, raw, io, ctx);
    }
    if (!answer) return ctx.finish(ft(s.lang, 'fb.noThanks'));
    s.data.topic = 'visit';
    return ctx.go('fb.comment');
  },

  async 'fb.comment'(s, raw, io, ctx) {
    const value = freeText(raw, 2000);
    if (!value) return ctx.say(await prompt(s, io));
    s.data.comment = value;
    return ctx.go('fb.rating');
  },

  async 'fb.rating'(s, raw, io, ctx) {
    const m = clean(raw).match(/^([1-5])(\s*(stars?|⭐+|\/\s*5))?$/i) || (/^⭐{1,5}$/.test(clean(raw)) ? [null, String(clean(raw).length)] : null);
    if (!m) return ctx.say(ft(s.lang, 'fb.badRating'));
    const rating = Number(m[1]);
    const result = await io.createFeedback({ topic: s.data.topic, comment: s.data.comment, rating, isComplaint: false, contactRequested: false, visitId: s.data.visitId || null });
    return ctx.finish(ft(s.lang, 'fb.thanks', { ref: result.ref }));
  },

  async 'fb.complaint'(s, raw, io, ctx) {
    const value = freeText(raw, 2000);
    if (!value) return ctx.say(await prompt(s, io));
    s.data.comment = value;
    return ctx.go('fb.contact');
  },

  async 'fb.contact'(s, raw, io, ctx) {
    const answer = yesNo(raw);
    if (answer === null) return ctx.say(await prompt(s, io));
    const result = await io.createFeedback({ topic: 'complaint', comment: s.data.comment, rating: null, isComplaint: true, contactRequested: answer, visitId: s.data.visitId || null });
    return ctx.finish(ft(s.lang, 'fb.complaintSaved', { ref: result.ref, contactLine: answer ? ft(s.lang, 'fb.contactLine') : '' }));
  },

  async 'svc.category'(s, raw, io, ctx) {
    const option = pickOption(raw, 'serviceCategory');
    if (!option) {
      ctx.say(ft(s.lang, 'common.pickNumber'));
      return ctx.say(await prompt(s, io));
    }
    s.data.category = option.key;
    return ctx.go('svc.describe');
  },

  async 'svc.describe'(s, raw, io, ctx) {
    const value = freeText(raw, 2000);
    if (!value) return ctx.say(await prompt(s, io));
    s.data.description = value;
    return ctx.go('svc.priority');
  },

  async 'svc.priority'(s, raw, io, ctx) {
    const option = pickOption(raw, 'priority');
    if (!option) {
      ctx.say(ft(s.lang, 'common.pickNumber'));
      return ctx.say(await prompt(s, io));
    }
    s.data.priority = option.key;
    return ctx.go('svc.attach');
  },

  async 'svc.attach'(s, raw, io, ctx, media) {
    if (media && ['image', 'document'].includes(media.kind)) {
      s.step = 'svc.file';
      return STEPS['svc.file'](s, raw, io, ctx, media);
    }
    const answer = yesNo(raw);
    if (answer === null) return ctx.say(await prompt(s, io));
    if (answer) return ctx.go('svc.file');
    return ctx.go('svc.confirm');
  },

  async 'svc.file'(s, raw, io, ctx, media) {
    if (!media) {
      if (isSkip(raw)) return ctx.go('svc.confirm');
      return ctx.say(ft(s.lang, 'svc.needFile'));
    }
    const saved = await io.saveDocument('attachment', media);
    if (saved.ok) {
      s.data.docId = saved.id;
      ctx.say(ft(s.lang, 'svc.fileSaved'));
    } else ctx.say(ft(s.lang, 'svc.storageFull'));
    return ctx.go('svc.confirm');
  },

  async 'svc.confirm'(s, raw, io, ctx) {
    const idx = pickIndex(raw, 3);
    if (idx === 2) return ctx.toMenu(ft(s.lang, 'cmd.cancelled'));
    if (idx === 1 || (idx === null && isNo(raw))) {
      s.stack = [];
      return ctx.go('svc.category', { push: false, data: {} });
    }
    if (!(idx === 0 || isYes(raw))) return ctx.say(await prompt(s, io));
    const result = await io.createServiceRequest({
      category: s.data.category,
      description: s.data.description,
      priority: s.data.priority,
      docId: s.data.docId || null,
    });
    return ctx.finish(ft(s.lang, 'svc.sent', { ref: result.ref }));
  },

  async 'ask.question'(s, raw, io, ctx) {
    const question = clean(raw);
    if (!question) return ctx.say(await prompt(s, io));
    const answer = await answerQuestion(s, raw, io);
    if (answer?.known && answer.text) {
      ctx.say(answer.text);
      s.step = 'ask.question';
      return ctx.say(ft(s.lang, 'ask.more'));
    }
    s.data.lastQuestion = question;
    return ctx.go('ask.unknown');
  },

  async 'ask.unknown'(s, raw, io, ctx) {
    const idx = pickIndex(raw, 4);
    if (idx === 0) {
      if (!io.company.features?.human_handover) return ctx.say(ft(s.lang, 'common.unavailable'));
      return ctx.go('ho.dept', { data: {} });
    }
    if (idx === 1) {
      if (!io.company.features?.service_requests) return ctx.say(ft(s.lang, 'common.unavailable'));
      return ctx.go('svc.category', { data: {} });
    }
    if (idx === 2) {
      s.step = 'ask.question';
      return ctx.say(ft(s.lang, 'ask.again'));
    }
    if (idx === 3) return ctx.toMenu();
    // Another question typed straight away.
    if (idx === null && clean(raw).length > 3) {
      s.step = 'ask.question';
      return STEPS['ask.question'](s, raw, io, ctx);
    }
    return ctx.say(await prompt(s, io));
  },

  async 'ho.dept'(s, raw, io, ctx) {
    const depts = handoverDepartments(io);
    let idx = pickIndex(raw, depts.length);
    if (idx === null) idx = depts.findIndex((d) => words(d) === words(raw));
    if (idx === null || idx < 0) {
      ctx.say(ft(s.lang, 'common.pickNumber'));
      return ctx.say(await prompt(s, io));
    }
    const dept = depts[idx];
    const result = await io.openHandover(dept);
    s.step = 'handover';
    s.data = { handoverRef: result.ref, department: dept };
    s.stack = [];
    return ctx.say(ft(s.lang, 'ho.connected', { dept, ref: result.ref }));
  },
};
