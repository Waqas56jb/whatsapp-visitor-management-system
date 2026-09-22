import { ConversationState, Host, Visit } from '../models/index.js';
import { formatDateNice } from '../utils/mappers.js';
import { normalizePhone } from '../utils/phone.js';
import { decideVisit, createPendingVisit } from '../services/visits.js';
import { sendInteractiveButtons, sendInteractiveList, sendText } from './client.js';

const MENU_BUTTONS = [
  { id: 'request_visit', title: 'Request Visit' },
  { id: 'check_status', title: 'Check Visit Status' },
  { id: 'help', title: 'Help' },
];

const WELCOME = [
  'Welcome to Botho Innovations Visitor Management.',
  '',
  'How can we assist you today?',
  '',
  'Please select an option below:',
].join('\n');

function idOf(input) {
  return String(input?.buttonId || input?.listId || '').trim();
}

function textOf(input) {
  return String(input?.text || '').trim();
}

async function setStep(phone, step, data) {
  return ConversationState.upsert(phone, step, data);
}

async function showMenu(to) {
  await setStep(to, 'menu', {});
  await sendInteractiveButtons(to, WELCOME, MENU_BUTTONS);
}

async function showHelp(to) {
  await sendText(
    to,
    [
      'Botho Innovations Visitor Management can:',
      '',
      '• Request Visit — book a social or official visit',
      '• Check Visit Status — see if your request is pending, approved, or declined',
      '• Help — show this message',
      '',
      'Reply menu at any time to start over. Reply cancel to stop a booking.',
    ].join('\n')
  );
  await sendInteractiveButtons(to, 'What would you like to do?', MENU_BUTTONS);
  await setStep(to, 'menu', {});
}

async function showStatus(to) {
  const visits = await Visit.listByVisitorPhone(to, 5);
  if (!visits.length) {
    await sendText(to, 'No visit requests found for this number.');
  } else {
    const lines = ['Your visit requests:', ''];
    for (const v of visits) {
      lines.push(`• ${v.ref_number}`);
      lines.push(`  Host: ${v.host_name}`);
      lines.push(`  ${formatDateNice(v.visit_date)} at ${v.visit_time}`);
      lines.push(`  Status: ${v.status}`);
      lines.push('');
    }
    await sendText(to, lines.join('\n').trim());
  }
  await sendInteractiveButtons(to, 'Anything else?', MENU_BUTTONS);
  await setStep(to, 'menu', {});
}

async function startRequest(to) {
  await setStep(to, 'visit_type', {});
  await sendInteractiveButtons(to, 'What type of visit is this?', [
    { id: 'type_social', title: 'Social Visit' },
    { id: 'type_official', title: 'Official Visit' },
  ]);
}

async function askName(to, data) {
  await setStep(to, 'name', data);
  await sendText(to, 'Please reply with your full name.');
}

async function askCompany(to, data) {
  await setStep(to, 'company', data);
  await sendText(to, 'Please reply with your company name.');
}

async function askHost(to, data) {
  const hosts = await Host.listActive();
  await setStep(to, 'host', { ...data, hostOptions: hosts.map((h) => ({ id: h.id, name: h.name })) });
  if (!hosts.length) {
    await sendText(to, 'Please type the full name of the host you are visiting.');
    return;
  }
  await sendInteractiveList(
    to,
    'Please choose your host, or type their name.',
    'Choose host',
    hosts.map((h) => ({
      id: `host_${h.id}`,
      title: h.name,
      description: h.department || '',
    }))
  );
}

async function askPurpose(to, data) {
  await setStep(to, 'purpose', data);
  await sendText(to, 'What is the purpose of your visit?');
}

async function askDate(to, data) {
  await setStep(to, 'date', data);
  await sendText(to, 'Preferred date? Reply as YYYY-MM-DD (e.g. 2026-09-22). You can also send today or tomorrow.');
}

async function askTime(to, data) {
  await setStep(to, 'time', data);
  await sendText(to, 'Preferred time? Reply as HH:MM (e.g. 10:00 or 10:00 AM).');
}

function parseDate(input) {
  const raw = String(input || '').trim();
  const lower = raw.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (lower === 'today') return stamp(today);
  if (lower === 'tomorrow') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return stamp(d);
  }

  let y;
  let m;
  let d;
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  const nice = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (dmy) {
    d = Number(dmy[1]);
    m = Number(dmy[2]);
    y = Number(dmy[3]);
  } else if (nice) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mi = months.findIndex((x) => nice[2].toLowerCase().startsWith(x));
    if (mi < 0) return null;
    d = Number(nice[1]);
    m = mi + 1;
    y = Number(nice[3]);
  } else {
    return null;
  }

  const parsed = new Date(y, m - 1, d);
  if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) return null;
  if (parsed < today) return 'past';
  return stamp(parsed);
}

function stamp(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseTime(input) {
  const raw = String(input || '').trim();
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || '0');
  const mer = (match[3] || '').toLowerCase();
  if (minutes > 59 || hours > 23) return null;
  if (mer === 'pm' && hours < 12) hours += 12;
  if (mer === 'am' && hours === 12) hours = 0;
  if (!mer && hours > 23) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

async function resolveHost(input, data) {
  const button = idOf(input);
  const hostIdFromBtn = button.match(/^host_(\d+)$/);
  if (hostIdFromBtn) return Host.findById(hostIdFromBtn[1]);

  const typed = textOf(input);
  if (!typed) return null;
  if (/^\d+$/.test(typed) && data.hostOptions?.length) {
    const idx = Number(typed) - 1;
    const option = data.hostOptions[idx];
    if (option) return Host.findById(option.id);
  }
  return (await Host.findByName(typed)) || Host.searchByName(typed);
}

function isReset(input) {
  const id = idOf(input).toLowerCase();
  const text = textOf(input).toLowerCase();
  if (id === 'request_visit' || id === 'check_status' || id === 'help') return id;
  if (['hi', 'hello', 'hey', 'menu', 'start', 'help', 'cancel'].includes(text)) return text;
  if (text === 'request visit' || text === '1') return 'request_visit';
  if (text === 'check visit status' || text === 'check status' || text === 'status' || text === '2') return 'check_status';
  if (text === '3') return 'help';
  return null;
}

async function handleHostDecision(from, buttonId) {
  const match = String(buttonId).match(/^(approve|reject)_(\d+)$/);
  if (!match) return false;
  const decision = match[1] === 'approve' ? 'approved' : 'rejected';
  const visitId = match[2];
  const visit = await Visit.findById(visitId);
  if (!visit) {
    await sendText(from, 'That visit request could not be found.');
    return true;
  }
  const sender = normalizePhone(from);
  const hostPhone = normalizePhone(visit.host_phone);
  if (!hostPhone || sender !== hostPhone) {
    await sendText(from, 'This request belongs to another host.');
    return true;
  }
  const host = await Host.findByPhone(from);
  const result = await decideVisit({
    visitId,
    decision,
    actor: host?.name || visit.host_name || 'Host',
    actorHostId: visit.host_id,
    notifyHostPhone: from,
  });
  if (result.alreadyDecided) {
    await sendText(from, `This request was already ${result.visit.status}.\nReference: ${result.visit.ref_number}`);
  }
  return true;
}

async function submitVisit(from, data) {
  const visit = await createPendingVisit({
    name: data.name,
    company: data.company || '—',
    hostId: data.hostId,
    purpose: data.purpose,
    date: data.date,
    time: data.time,
    visitType: data.visitType,
    visitorPhone: from,
    actor: data.name || 'Visitor',
    notify: true,
  });
  await ConversationState.clear(from);
  await setStep(from, 'menu', {});
  return visit;
}

export async function handleIncomingMessage(input) {
  const from = input.from;
  if (!from) return;

  if (await handleHostDecision(from, idOf(input))) return;

  const reset = isReset(input);
  const state = (await ConversationState.findByPhone(from)) || { current_step: 'menu', collected_data: {} };
  const data = state.collected_data && typeof state.collected_data === 'object' ? state.collected_data : {};
  const step = state.current_step || 'menu';

  if (reset === 'cancel' || reset === 'menu' || reset === 'hi' || reset === 'hello' || reset === 'hey' || reset === 'start') {
    await showMenu(from);
    return;
  }
  if (reset === 'help') {
    await showHelp(from);
    return;
  }
  if (reset === 'check_status') {
    await showStatus(from);
    return;
  }
  if (reset === 'request_visit') {
    await startRequest(from);
    return;
  }

  if (step === 'menu' || !step) {
    await showMenu(from);
    return;
  }

  if (step === 'visit_type') {
    const id = idOf(input).toLowerCase();
    const text = textOf(input).toLowerCase();
    let visitType = null;
    if (id === 'type_social' || text === 'social' || text === 'social visit') visitType = 'social';
    if (id === 'type_official' || text === 'official' || text === 'official visit') visitType = 'official';
    if (!visitType) {
      await sendInteractiveButtons(from, 'Please choose Social Visit or Official Visit.', [
        { id: 'type_social', title: 'Social Visit' },
        { id: 'type_official', title: 'Official Visit' },
      ]);
      return;
    }
    const next = { visitType };
    if (visitType === 'social') next.company = '—';
    await askName(from, next);
    return;
  }

  if (step === 'name') {
    const name = textOf(input);
    if (name.length < 2) {
      await sendText(from, 'Please enter your full name.');
      return;
    }
    const next = { ...data, name };
    if (data.visitType === 'social') await askHost(from, next);
    else await askCompany(from, next);
    return;
  }

  if (step === 'company') {
    const company = textOf(input);
    if (company.length < 2) {
      await sendText(from, 'Please enter your company name.');
      return;
    }
    await askHost(from, { ...data, company });
    return;
  }

  if (step === 'host') {
    const host = await resolveHost(input, data);
    if (!host) {
      await sendText(from, 'I could not find that host. Please choose from the list or type the name again.');
      await askHost(from, data);
      return;
    }
    await askPurpose(from, { ...data, hostId: host.id, hostName: host.name });
    return;
  }

  if (step === 'purpose') {
    const purpose = textOf(input);
    if (purpose.length < 2) {
      await sendText(from, 'Please tell us the purpose of your visit.');
      return;
    }
    await askDate(from, { ...data, purpose });
    return;
  }

  if (step === 'date') {
    const date = parseDate(textOf(input));
    if (date === 'past') {
      await sendText(from, 'That date is in the past. Please send a future date as YYYY-MM-DD.');
      return;
    }
    if (!date) {
      await sendText(from, 'I could not read that date. Please use YYYY-MM-DD, e.g. 2026-09-22.');
      return;
    }
    await askTime(from, { ...data, date });
    return;
  }

  if (step === 'time') {
    const time = parseTime(textOf(input));
    if (!time) {
      await sendText(from, 'I could not read that time. Please use HH:MM, e.g. 10:00 AM.');
      return;
    }
    try {
      await submitVisit(from, { ...data, time });
    } catch (err) {
      console.error('WhatsApp visit create failed:', err.message);
      await sendText(from, err.message || 'Could not create your visit request. Please try again.');
      await showMenu(from);
    }
    return;
  }

  await showMenu(from);
}
