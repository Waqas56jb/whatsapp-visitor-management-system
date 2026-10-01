// Manual end-to-end transcripts for the visitor bot (not part of `npm test`).
// Drives handleVisitorWithAgent — the same function the WhatsApp message handler calls for a
// visitor turn — with an in-memory state store and a fixed host directory. No database, no
// WhatsApp socket, no OpenAI.
//
//   node test/manual/transcripts.js
import { register } from 'node:module';

// No API key: the AI classifier and FAQ model are skipped and the deterministic fallbacks run.
process.env.OPENAI_API_KEY = '';
register('./hooks.js', import.meta.url);

const { handleVisitorWithAgent } = await import('../../src/whatsapp/visitorAgent.js');
const { notifyHostNewVisit, notifyVisitorApproved } = await import('../../src/whatsapp/notify.js');
const { store, joinVisit } = await import('./fakes.js');
const { processMessage } = await import('../../src/whatsapp/messageHandler.js');
const { decideVisit, validatePass } = await import('../../src/services/visits.js');
const { isGreetingOnly } = await import('../../src/whatsapp/lang.js');

const HOST_LIST_RE = /^1\. (Kabo Majube|Micha Ntsima|Boikarabelo Ramaretlwa)/m;
const NAME_OR_COMPANY_QUESTION = /May I have your full name|Which company are you visiting from/;
const TYPE_QUESTION = /^Is this an official or a social visit\? Reply 1 for Official or 2 for Social\.$/m;
const BULK = 'John Moeng, University of Botswana, project meeting, tomorrow, 10am';
const MICHAEL = { name: 'Michael Ntsima', company: 'Botho Innovations' };

const booked = (r, hostId, type) =>
  r.visits.length === 1 && r.visits[0].host_id === hostId && r.visits[0].visit_type === type
    ? null
    : `expected one ${type} visit with host #${hostId}`;

const SCENARIOS = [
  {
    id: 'A',
    title: 'New number, one message, host "Kabo", type, confirm',
    messages: ['Hi', BULK, 'Kabo', '1', 'yes'],
    hostSelectors: ['Kabo'],
    names: ['John Moeng'],
    expect: (r) => (!TYPE_QUESTION.test(r.turns[2].reply) ? 'visit type was not asked' : booked(r, 1, 'official')),
  },
  {
    id: 'B',
    title: 'Ambiguous host "Technology Planning", pick 2',
    messages: ['Hi', 'John Moeng, University of Botswana, project meeting, Technology Planning, tomorrow, 10am', '2', '1', 'yes'],
    hostSelectors: ['2'],
    names: ['John Moeng'],
    expect: (r) => (!HOST_LIST_RE.test(r.turns[1].reply) ? 'the two Technology Planning hosts were not listed' : booked(r, 2, 'official')),
  },
  {
    id: 'C',
    title: 'Regression: two misses at the host list, then "new booking"',
    messages: ['Hi', 'John Moeng, University of Botswana, project meeting, Technology Planning, tomorrow, 10am', 'before sleep i will make it ready', 'no need to worry brother', 'new booking'],
    hostSelectors: [],
    names: ['John Moeng'],
    expect: (r) => {
      if (r.turns[3].state.stage !== 'idle') return 'step was not cleared after the second miss';
      if (!/paused this request/.test(r.turns[3].reply)) return 'no paused message after the second miss';
      if (!/^Welcome to Botho Innovations/.test(r.turns[4].reply)) return '"new booking" did not start again';
      return r.visits.length ? 'a visit was created' : null;
    },
  },
  {
    id: 'D',
    title: 'Fuzzy host "Kabbo Majub", reply no, then "Micha Ntsima"',
    messages: ['Hi', BULK, 'Kabbo Majub', 'no', 'Micha Ntsima', '2', 'yes'],
    hostSelectors: ['Micha Ntsima'],
    names: ['John Moeng'],
    expect: (r) => {
      if (!/^Did you mean Kabo Majube \(Technology Planning\)\? Reply yes or no\.$/.test(r.turns[2].reply)) return 'no "Did you mean" question';
      if (r.turns[2].state.slots.hostId !== null) return 'fuzzy host was accepted without a yes';
      return booked(r, 2, 'social');
    },
  },
  {
    id: 'E',
    title: 'Greeting mid-booking, reply 1, finish',
    messages: ['Hi', 'Lesedi Tau', 'Debswana', 'Hi', '1', 'Supplier meeting', 'Boikarabelo', 'tomorrow', '11am', 'official', 'yes'],
    hostSelectors: ['Boikarabelo'],
    names: ['Lesedi Tau'],
    expect: (r) => {
      if (!/^You have a visit request in progress/.test(r.turns[3].reply)) return 'no continue/new question after "Hi"';
      const v = r.visits[0];
      return v && v.visitor_name === 'Lesedi Tau' && v.visitor_company === 'Debswana' && v.host_id === 3 ? null : 'booking did not keep the details given before "Hi"';
    },
  },
  {
    id: 'F',
    title: 'Greeting mid-booking, reply 2',
    messages: ['Hi', 'Lesedi Tau', 'Debswana', 'Hi', '2'],
    hostSelectors: [],
    names: ['Lesedi Tau'],
    expect: (r) => {
      if (!/^You have a visit request in progress/.test(r.turns[3].reply)) return 'no continue/new question after "Hi"';
      if (!/^Welcome to Botho Innovations/.test(r.turns[4].reply)) return '"2" did not start a new request';
      return r.turns[4].state.slots.name === '' ? null : '"2" kept the old details';
    },
  },
  {
    id: 'G',
    title: 'Free text after the welcome, then a real name',
    messages: ['Hi', 'ok let me check and come back', 'Thabo Kgosi'],
    hostSelectors: [],
    names: ['Thabo Kgosi'],
    expect: (r) => {
      if (r.turns[1].state.slots.name !== '') return 'the sentence was stored as the name';
      if (!/send your details \(Names, Company, Purpose, Visit date, Time\)/.test(r.turns[1].reply)) return 'no bulk details prompt';
      return r.turns[2].state.slots.name === 'Thabo Kgosi' ? null : '"Thabo Kgosi" was not taken as the name';
    },
  },
  {
    id: 'H',
    title: 'The word "slot" vs a real availability question',
    messages: ['is there a slot problem with my booking', 'what times are free tomorrow for Kabo'],
    hostSelectors: [],
    names: [],
    expect: (r) => {
      if (/Available:|Booked:/.test(r.turns[0].reply)) return 'first message listed free slots';
      return /^Kabo Majube, .*\nBooked: .*\nAvailable: 08:00/.test(r.turns[1].reply) ? null : 'second message did not list Kabo\'s free slots';
    },
  },
  {
    id: 'I',
    title: 'Scenario A in Setswana',
    messages: ['Dumela', 'John Moeng, University of Botswana, kopano ya poroje, kamoso, 10am', 'Kabo', '1', 'Ee'],
    hostSelectors: ['Kabo'],
    names: ['John Moeng'],
    expect: (r) => {
      if (!/^Re a go amogela/.test(r.turns[0].reply)) return 'welcome was not in Setswana';
      if (!/^A ke ketelo ya semmuso kgotsa ya sebele\?/.test(r.turns[2].reply)) return 'visit type was not asked in Setswana';
      if (!/Kopo ya gago ya ketelo e rometswe/.test(r.turns[4].reply)) return 'submission reply was not in Setswana';
      return booked(r, 1, 'official');
    },
  },
  {
    id: 'J',
    title: 'Known visitor: "new booking" pre-fills name and company',
    record: MICHAEL,
    messages: ['new booking', 'Sales pitch, Kabo, tomorrow, 10am', '1', 'yes'],
    hostSelectors: ['Sales pitch, Kabo, tomorrow, 10am'],
    names: ['Michael Ntsima'],
    expect: (r) => {
      if (r.turns[0].reply !== 'Hello Michael Ntsima, please send the details of your visit (Purpose, Who you are visiting, Visit date, Time).') return 'no short prompt with the name';
      if (r.turns.some((t) => NAME_OR_COMPANY_QUESTION.test(t.reply))) return 'name or company was asked';
      if (!/Name: Michael Ntsima\nCompany: Botho Innovations/.test(r.turns[2].reply)) return 'confirmation does not show name and company';
      return booked(r, 1, 'official');
    },
  },
  {
    id: 'K',
    title: 'Known visitor corrects their name at confirmation',
    record: MICHAEL,
    messages: ['new booking', 'Sales pitch, Kabo, tomorrow, 10am, official', 'name Michael K. Ntsima', 'yes'],
    hostSelectors: ['Sales pitch, Kabo, tomorrow, 10am, official'],
    // Names are stored without dots ("Michael K Ntsima"), as for every visitor.
    names: ['Michael Ntsima', 'Michael K Ntsima'],
    expect: (r) => {
      if (!/Name: Michael K Ntsima/.test(r.turns[2].reply)) return 'correction not shown in the summary';
      const record = store.visitors.find((v) => v.phone === r.from);
      return record?.name === 'Michael K Ntsima' ? booked(r, 1, 'official') : 'visitor record was not updated';
    },
  },
  {
    id: 'L',
    title: 'Known visitor sends full details anyway',
    record: MICHAEL,
    messages: ['new booking', 'John Moeng, University of Botswana, project meeting, Kabo, tomorrow, 10am', 'social', 'yes'],
    hostSelectors: ['John Moeng, University of Botswana, project meeting, Kabo, tomorrow, 10am'],
    names: ['Michael Ntsima', 'John Moeng'],
    expect: (r) => {
      if (r.turns.some((t) => NAME_OR_COMPANY_QUESTION.test(t.reply))) return 'something was asked twice';
      if (!/Name: John Moeng\nCompany: University of Botswana/.test(r.turns[2].reply)) return 'the details sent were not used';
      return booked(r, 1, 'social');
    },
  },
  {
    id: 'M',
    title: 'Category stated in the message is not asked',
    messages: ['Hi', 'Lesedi Tau, Debswana, business meeting, Boikarabelo, tomorrow, 11am', 'yes'],
    hostSelectors: ['Lesedi Tau, Debswana, business meeting, Boikarabelo, tomorrow, 11am'],
    names: ['Lesedi Tau'],
    expect: (r) => {
      if (r.turns.some((t) => TYPE_QUESTION.test(t.reply))) return 'visit type was asked although stated';
      if (!/Visit type: Official/.test(r.turns[1].reply)) return 'summary does not show the visit type';
      return booked(r, 3, 'official');
    },
  },
  {
    id: 'N',
    title: 'Category asked in Setswana, answered with 2',
    messages: ['Dumela', 'Kagiso Molefe, Debswana, kopano ya poroje, Boikarabelo, kamoso, 11am', '2', 'Ee'],
    hostSelectors: ['Kagiso Molefe, Debswana, kopano ya poroje, Boikarabelo, kamoso, 11am'],
    names: ['Kagiso Molefe'],
    expect: (r) => {
      if (!/^A ke ketelo ya semmuso kgotsa ya sebele\?/.test(r.turns[1].reply)) return 'visit type was not asked in Setswana';
      if (!/Mofuta wa ketelo: Ya sebele/.test(r.turns[2].reply)) return 'summary does not show the visit type';
      return booked(r, 3, 'social');
    },
  },
];

// Checks every scenario must satisfy.
function commonProblems(scenario, turns) {
  let prevHost = null;
  let prevSlots = null;
  for (const turn of turns) {
    const { slots } = turn.state;
    if (slots.hostId !== null && slots.hostId !== prevHost && !scenario.hostSelectors.includes(turn.text)) {
      return `host ${slots.hostName} was chosen from "${turn.text}"`;
    }
    if (slots.name && !scenario.names.includes(slots.name)) return `"${slots.name}" was stored as a name`;
    if (isGreetingOnly(turn.text) && prevSlots && (prevSlots.name || prevSlots.company)) {
      if (slots.name !== prevSlots.name || slots.company !== prevSlots.company) return `details were wiped by "${turn.text}"`;
    }
    prevHost = slots.hostId;
    prevSlots = slots;
  }
  const lists = turns.filter((t) => HOST_LIST_RE.test(t.reply)).length;
  if (lists > 2) return `host list was sent ${lists} times`;
  return null;
}

const results = [];
const created = {};
let senderNo = 100;
for (const scenario of SCENARIOS) {
  const from = `26770000${senderNo++}`;
  // Each scenario starts with an empty booking book and only its own visitor record.
  store.visits.length = 0;
  store.visitors.length = 0;
  if (scenario.record) store.visitors.push({ id: 900, ...scenario.record, phone: from });
  console.log(`\n=== ${scenario.id}. ${scenario.title} (sender ${from}${scenario.record ? `, on record as ${scenario.record.name} / ${scenario.record.company}` : ''}) ===`);
  const turns = [];
  for (const text of scenario.messages) {
    const { reply, state } = await handleVisitorWithAgent({ from, text });
    console.log(`VISITOR: ${text}`);
    console.log(`BOT: ${reply.replace(/\n/g, '\n     ')}`);
    turns.push({ text, reply, state: JSON.parse(JSON.stringify(state)) });
  }
  const visits = store.visits.map(joinVisit);
  if (visits.length) created[scenario.id] = visits[0];
  const problem = commonProblems(scenario, turns) || scenario.expect({ turns, visits, from });
  results.push({ id: scenario.id, pass: !problem, reason: problem || 'all checks passed' });
}

// The host's WhatsApp notification and the visitor's approval message for the visit from N.
{
  const visit = { ...created.N, status: 'approved', qr_token: 'test-token', pin: '123456' };
  store.sent.length = 0;
  await notifyHostNewVisit(visit);
  await notifyVisitorApproved(visit);
  const [host, approval] = store.sent;
  console.log('\n=== O. Host notification and approval message for the visit from N ===');
  console.log(`TO HOST ${host?.to}:\n     ${String(host?.text).replace(/\n/g, '\n     ')}`);
  console.log(`TO VISITOR ${approval?.to} (QR image caption):\n     ${String(approval?.text).replace(/\n/g, '\n     ')}`);
  const problem = !/Visit type: Social/.test(host?.text || '')
    ? 'host notification has no visit type'
    : !/Mofuta wa ketelo: Ya sebele/.test(approval?.text || '') || !approval?.image
      ? 'approval message has no visit type'
      : null;
  results.push({ id: 'O', pass: !problem, reason: problem || 'visit type shown to host and visitor' });
}

// ---- Hosts deciding on WhatsApp, and arrival alerts --------------------------------------
// Both sides of the chat go through processMessage, the real handler for every incoming WhatsApp
// message. Each line shows who wrote and every message the system sent in response.
const PEOPLE = {
  '26771000101': 'HOST Kabo Majube',
  '26771000102': 'HOST Micha Ntsima',
  '26771000103': 'HOST Boikarabelo Ramaretlwa',
};
let waId = 1;

function waMessage(phone, text, quotedId) {
  return {
    key: { remoteJid: `${phone}@s.whatsapp.net`, id: `IN-${waId++}`, fromMe: false },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: quotedId ? { extendedTextMessage: { text, contextInfo: { stanzaId: quotedId } } } : { conversation: text },
  };
}

function printSent(messages) {
  for (const m of messages) {
    const who = PEOPLE[m.to] ? `host ${PEOPLE[m.to].replace('HOST ', '')}` : `visitor ${m.to}`;
    console.log(`   BOT → ${who}${m.image ? ' [QR image + caption]' : ''}: ${m.text.replace(/\n/g, '\n         ')}`);
  }
}

async function say(phone, text, { quote = null, label } = {}) {
  const before = store.sent.length;
  const log = console.log;
  console.log = () => {}; // the handler logs every inbound message; keep the transcript readable
  try {
    await processMessage(waMessage(phone, text, quote), {});
  } finally {
    console.log = log;
  }
  console.log(`${label || PEOPLE[phone] || `VISITOR ${phone}`}${quote ? ' (replying to the request message)' : ''}: ${text}`);
  const out = store.sent.slice(before);
  printSent(out);
  return out;
}

async function book(phone, messages) {
  for (const text of messages) await say(phone, text);
  return store.visits.map(joinVisit).filter((v) => v.visitor_phone === phone).at(-1);
}

const requestTo = (hostPhone, visit) => store.sent.find((m) => m.to === hostPhone && m.id && m.text.includes(visit.ref_number));
const visitOf = (id) => joinVisit(store.visits.find((v) => v.id === id));

store.visits.length = 0;
store.visitors.length = 0;
store.audit.length = 0;
store.states.clear();

{
  console.log('\n=== P. Host approves by replying to the request message ===');
  const visit = await book('26770000301', ['Hi', 'Lesedi Tau, Debswana, supplier meeting, Kabo, tomorrow, 10am', '1', 'yes']);
  const request = requestTo('26771000101', visit);
  const out = await say('26771000101', '1', { quote: request?.id });
  const now = visitOf(visit.id);
  const problem = !request
    ? 'the host got no request message'
    : !/Reply 1 to approve or 2 to decline\.$/.test(request.text)
      ? 'request does not end with the 1 / 2 instruction'
      : now.status !== 'approved'
        ? `visit is ${now.status}, expected approved`
        : !out.some((m) => m.to === '26770000301' && m.image && /^Your visit has been approved/.test(m.text))
          ? 'visitor did not get the QR pass'
          : !out.some((m) => m.to === '26771000101' && /^Approved\. Lesedi Tau will be told on WhatsApp\./.test(m.text))
            ? 'host got no confirmation'
            : !store.audit.some((a) => a.action === 'Approved visit' && /by the host on WhatsApp/.test(a.details))
              ? 'audit does not say it came from WhatsApp'
              : null;
  results.push({ id: 'P', pass: !problem, reason: problem || 'approved by quoting; visitor got the QR; audit says WhatsApp' });

  console.log('\n=== S. The visitor arrives: reception validates the pass, the host is alerted ===');
  const before = store.sent.length;
  const check = await validatePass({ pin: now.pin, actor: 'Neo Setlhare (gate)' });
  console.log(`GATE (Neo Setlhare, reception): validates backup PIN ${now.pin} → ${check.ok ? 'Access granted' : check.error}`);
  const alert = store.sent.slice(before);
  printSent(alert);
  const arrived = alert.find((m) => m.to === '26771000101');
  const sProblem = !check.ok
    ? 'check-in failed'
    : !arrived
      ? 'host was not alerted'
      : !/^Your visitor has arrived\.\nVisitor: Lesedi Tau\nCompany: Debswana\nPurpose: Supplier meeting\nChecked in: \d\d:\d\d$/.test(arrived.text)
        ? 'arrival message is not as expected'
        : null;
  results.push({ id: 'S', pass: !sProblem, reason: sProblem || 'host alerted with visitor, company, purpose and check-in time' });
}

{
  console.log('\n=== Q. Host declines with a bare "decline" (their only pending request) ===');
  const visit = await book('26770000302', ['Hi', 'Thabo Kgosi, BPC, contract review, Micha Ntsima, tomorrow, 11am', '1', 'yes']);
  const out = await say('26771000102', 'decline');
  const now = visitOf(visit.id);
  const problem = now.status !== 'rejected'
    ? `visit is ${now.status}, expected rejected`
    : !out.some((m) => m.to === '26770000302' && /was declined by the host/.test(m.text))
      ? 'visitor was not told'
      : !out.some((m) => m.to === '26771000102' && /^Declined\. Thabo Kgosi will be told on WhatsApp\./.test(m.text))
        ? 'host got no confirmation'
        : null;
  results.push({ id: 'Q', pass: !problem, reason: problem || 'declined; visitor and host told' });
}

{
  console.log('\n=== R. Host with several pending requests: list, "approve 2", then a bare "2" ===');
  const first = await book('26770000303', ['Hi', 'Neo Molefe, Orange, interview, Boikarabelo, tomorrow, 9am', '2', 'yes']);
  const second = await book('26770000304', ['Hi', 'Kagiso Dintwa, Mascom, audit, Boikarabelo, tomorrow, 2pm', '1', 'yes']);
  const listed = await say('26771000103', 'yes');
  await say('26771000103', 'approve 2');
  await say('26771000103', '2');
  const a = visitOf(first.id);
  const b = visitOf(second.id);
  const list = listed.find((m) => m.to === '26771000103')?.text || '';
  const problem = !/^You have 2 visit requests waiting:\n1\. Neo Molefe .*\n2\. Kagiso Dintwa /.test(list)
    ? 'no numbered list for two pending requests'
    : b.status !== 'approved'
      ? `"approve 2" left the second visit ${b.status}`
      : a.status !== 'rejected'
        ? `bare "2" left the first visit ${a.status}`
        : null;
  results.push({ id: 'R', pass: !problem, reason: problem || 'list sent; "approve 2" approved the 2nd; bare "2" declined the last one' });
}

{
  console.log('\n=== T. An administrator approves in the panel; the host’s later reply changes nothing ===');
  const visit = await book('26770000305', ['Hi', 'Mpho Seretse, Debswana, site inspection, Kabo, tomorrow, 3pm', '1', 'yes']);
  const before = store.sent.length;
  await decideVisit({ visitId: visit.id, decision: 'approved', actor: 'Michael Ntsima', via: 'panel' });
  console.log('ADMIN PANEL (Michael Ntsima): approves the request');
  printSent(store.sent.slice(before));
  const notice = store.sent.slice(before).find((m) => m.to === '26771000101');
  const out = await say('26771000101', '2', { quote: requestTo('26771000101', visit)?.id });
  const problem = !/was approved by an administrator\. No action is needed\.$/.test(notice?.text || '')
    ? 'host was not told about the admin decision'
    : visitOf(visit.id).status !== 'approved'
      ? 'the host’s late reply changed the visit'
      : !/is already approved\. Nothing was changed\.$/.test(out.find((m) => m.to === '26771000101')?.text || '')
        ? 'host was not told the request was already decided'
        : null;
  results.push({ id: 'T', pass: !problem, reason: problem || 'host told about the admin decision; late reply refused' });
}

console.log('\n=== Results ===');
for (const r of results) console.log(`${r.id}  ${r.pass ? 'PASS' : 'FAIL'}  ${r.reason}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} scenarios passed`);
process.exitCode = failed ? 1 : 0;
