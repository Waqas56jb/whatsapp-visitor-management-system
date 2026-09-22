import { ConversationState, Host, Settings, Visit } from '../models/index.js';
import { formatDateNice } from '../utils/mappers.js';
import { parseFlexibleDate, parseFlexibleTime } from '../utils/dateParse.js';
import { createPendingVisit } from '../services/visits.js';
import { sendText } from './sendMessage.js';

async function orgName() {
  const settings = await Settings.get().catch(() => null);
  return settings?.org_name || 'Botho Innovations';
}

function dataOf(state) {
  const raw = state?.collected_data;
  return raw && typeof raw === 'object' ? { ...raw } : {};
}

async function ask(phone, step, data, prompt) {
  await ConversationState.upsert(phone, step, { ...data, prompt });
  await sendText(phone, prompt);
}

async function sorry(phone, data, extra) {
  const prompt = extra || data.prompt || 'Please reply with a number.';
  await sendText(phone, `Sorry, I didn't understand that.\n${prompt}`);
}

export async function menuPrompt() {
  const org = await orgName();
  return [
    `Welcome to ${org} Visitor Management.`,
    '1. Request a visit',
    '2. Check visit status',
    '3. Help',
    'Reply with a number.',
  ].join('\n');
}

export async function showMenu(phone) {
  const prompt = await menuPrompt();
  await ask(phone, 'menu', {}, prompt);
}

const TYPE_PROMPT = [
  'What type of visit is this?',
  '1. Social Visit',
  '2. Official Visit',
].join('\n');

async function hostPrompt() {
  const hosts = await Host.listActive();
  if (!hosts.length) {
    return { prompt: 'Please type the full name of the host you are visiting.', hosts: [] };
  }
  const lines = ['Who are you visiting? Reply with the number:'];
  hosts.forEach((h, i) => {
    lines.push(`${i + 1}. ${h.name}${h.department ? ` (${h.department})` : ''}`);
  });
  return { prompt: lines.join('\n'), hosts };
}

export async function handleIncomingMessage({ from, text }) {
  const body = String(text || '').trim();
  const state = await ConversationState.findByPhone(from);
  const data = dataOf(state);
  const step = state?.current_step;

  const lower = body.toLowerCase();
  if (lower === 'menu' || lower === 'cancel') {
    await showMenu(from);
    return;
  }

  if (!state || !step) {
    await showMenu(from);
    return;
  }

  if (step === 'menu') {
    if (body === '1' || lower === 'request a visit' || lower === 'request visit') {
      await ask(from, 'visit_type', {}, TYPE_PROMPT);
      return;
    }
    if (body === '2' || lower.includes('status')) {
      await ask(from, 'status_ref', {}, 'Please send your reference number (e.g. VMS-2026-001245).');
      return;
    }
    if (body === '3' || lower === 'help') {
      await sendText(
        from,
        [
          'I can book a visit, check a request, or explain how this works.',
          '',
          '1 — Request a visit (social or official)',
          '2 — Check visit status (you will need your reference number)',
          '',
          'Reply menu at any time to start over.',
        ].join('\n')
      );
      await showMenu(from);
      return;
    }
    await sorry(from, data);
    return;
  }

  if (step === 'visit_type') {
    let visitType = null;
    if (body === '1' || lower.includes('social')) visitType = 'social';
    if (body === '2' || lower.includes('official')) visitType = 'official';
    if (!visitType) {
      await sorry(from, data, TYPE_PROMPT);
      return;
    }
    const next = { visitType, company: visitType === 'social' ? '—' : undefined };
    await ask(from, 'name', next, 'Please reply with your full name.');
    return;
  }

  if (step === 'name') {
    if (body.length < 2 || /^\d+$/.test(body)) {
      await sorry(from, data, 'Please reply with your full name.');
      return;
    }
    const next = { ...data, name: body };
    if (data.visitType === 'social') {
      const { prompt, hosts } = await hostPrompt();
      await ask(from, 'host', { ...next, hostOptions: hosts.map((h) => ({ id: h.id, name: h.name })) }, prompt);
    } else {
      await ask(from, 'company', next, 'Please reply with your company name.');
    }
    return;
  }

  if (step === 'company') {
    if (body.length < 2) {
      await sorry(from, data, 'Please reply with your company name.');
      return;
    }
    const { prompt, hosts } = await hostPrompt();
    await ask(from, 'host', { ...data, company: body, hostOptions: hosts.map((h) => ({ id: h.id, name: h.name })) }, prompt);
    return;
  }

  if (step === 'host') {
    let host = null;
    if (/^\d+$/.test(body) && data.hostOptions?.length) {
      const option = data.hostOptions[Number(body) - 1];
      if (option) host = await Host.findById(option.id);
    }
    if (!host) host = (await Host.findByName(body)) || (await Host.searchByName(body));
    if (!host) {
      const { prompt, hosts } = await hostPrompt();
      await ask(from, 'host', { ...data, hostOptions: hosts.map((h) => ({ id: h.id, name: h.name })) }, `Sorry, I didn't understand that.\n${prompt}`);
      return;
    }
    await ask(from, 'purpose', { ...data, hostId: host.id, hostName: host.name }, 'What is the purpose of your visit?');
    return;
  }

  if (step === 'purpose') {
    if (body.length < 2) {
      await sorry(from, data, 'What is the purpose of your visit?');
      return;
    }
    await ask(from, 'date', { ...data, purpose: body }, 'Preferred date? You can send 2026-09-22, 22 Sep, or 22/09/2026.');
    return;
  }

  if (step === 'date') {
    const date = parseFlexibleDate(body);
    if (date === 'past') {
      await sorry(from, data, 'That date is in the past. Please send a future date.');
      return;
    }
    if (!date) {
      await sorry(from, data, 'Preferred date? You can send 2026-09-22, 22 Sep, or 22/09/2026.');
      return;
    }
    await ask(from, 'time', { ...data, date }, 'Preferred time? You can send 10am, 10:00, or 10:00 AM.');
    return;
  }

  if (step === 'time') {
    const time = parseFlexibleTime(body);
    if (!time) {
      await sorry(from, data, 'Preferred time? You can send 10am, 10:00, or 10:00 AM.');
      return;
    }
    try {
      await createPendingVisit({
        name: data.name,
        company: data.company || '—',
        hostId: data.hostId,
        purpose: data.purpose,
        date: data.date,
        time,
        visitType: data.visitType,
        visitorPhone: from,
        actor: data.name || 'Visitor',
        notify: true,
      });
      await ConversationState.clear(from);
    } catch (err) {
      console.error('WhatsApp visit create failed:', err.message);
      await sendText(from, 'Could not create your visit request. Please reply menu and try again.');
      await showMenu(from);
    }
    return;
  }

  if (step === 'status_ref') {
    const visit = await Visit.findByRef(body);
    if (!visit) {
      await sorry(from, data, 'I could not find that reference. Please send it like VMS-2026-001245.');
      return;
    }
    await sendText(
      from,
      [
        `Reference: ${visit.ref_number}`,
        `Visitor: ${visit.visitor_name}`,
        `Host: ${visit.host_name}`,
        `Date: ${formatDateNice(visit.visit_date)} at ${visit.visit_time}`,
        `Status: ${visit.status}`,
      ].join('\n')
    );
    await showMenu(from);
    return;
  }

  await showMenu(from);
}
