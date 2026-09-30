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
const { store } = await import('./fakes.js');
const { isGreetingOnly } = await import('../../src/whatsapp/lang.js');

const HOST_LIST_RE = /^1\. (Kabo Majube|Micha Ntsima|Boikarabelo Ramaretlwa)/m;
const BULK = 'John Moeng, University of Botswana, project meeting, tomorrow, 10am';

const SCENARIOS = [
  {
    id: 'A',
    title: 'New number, one message, host "Kabo", confirm',
    messages: ['Hi', BULK, 'Kabo', 'yes'],
    hostSelectors: ['Kabo'],
    names: ['John Moeng'],
    expect: (r) => (r.visits.length === 1 && r.visits[0].host_id === 1 ? null : 'expected one visit booked with Kabo Majube'),
  },
  {
    id: 'B',
    title: 'Ambiguous host "Technology Planning", pick 2',
    messages: ['Hi', 'John Moeng, University of Botswana, project meeting, Technology Planning, tomorrow, 10am', '2', 'yes'],
    hostSelectors: ['2'],
    names: ['John Moeng'],
    expect: (r) =>
      !HOST_LIST_RE.test(r.turns[1].reply)
        ? 'the two Technology Planning hosts were not listed'
        : r.visits.length === 1 && r.visits[0].host_id === 2
          ? null
          : 'expected one visit booked with Micha Ntsima',
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
    messages: ['Hi', BULK, 'Kabbo Majub', 'no', 'Micha Ntsima', 'yes'],
    hostSelectors: ['Micha Ntsima'],
    names: ['John Moeng'],
    expect: (r) => {
      if (!/^Did you mean Kabo Majube \(Technology Planning\)\? Reply yes or no\.$/.test(r.turns[2].reply)) return 'no "Did you mean" question';
      if (r.turns[2].state.slots.hostId !== null) return 'fuzzy host was accepted without a yes';
      return r.visits.length === 1 && r.visits[0].host_id === 2 ? null : 'expected one visit booked with Micha Ntsima';
    },
  },
  {
    id: 'E',
    title: 'Greeting mid-booking, reply 1, finish',
    messages: ['Hi', 'Lesedi Tau', 'Debswana', 'Hi', '1', 'Supplier meeting', 'Boikarabelo', 'tomorrow', '11am', 'yes'],
    hostSelectors: ['Boikarabelo'],
    names: ['Lesedi Tau'],
    expect: (r) => {
      if (!/^You have a visit request in progress/.test(r.turns[3].reply)) return 'no continue/new question after "Hi"';
      const v = r.visits[0];
      return v && v.visitor_name === 'Lesedi Tau' && v.company === 'Debswana' && v.host_id === 3 ? null : 'booking did not keep the details given before "Hi"';
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
    messages: ['Dumela', 'John Moeng, University of Botswana, kopano ya poroje, kamoso, 10am', 'Kabo', 'Ee'],
    hostSelectors: ['Kabo'],
    names: ['John Moeng'],
    expect: (r) => {
      if (!/^Re a go amogela/.test(r.turns[0].reply)) return 'welcome was not in Setswana';
      if (!/Kopo ya gago ya ketelo e rometswe/.test(r.turns[3].reply)) return 'submission reply was not in Setswana';
      return r.visits.length === 1 && r.visits[0].host_id === 1 ? null : 'expected one visit booked with Kabo Majube';
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
let senderNo = 100;
for (const scenario of SCENARIOS) {
  const from = `26770000${senderNo++}`;
  // Each scenario starts with an empty booking book, so one scenario's 10am visit cannot
  // occupy the slot another scenario books.
  store.visits.length = 0;
  const visitsBefore = 0;
  console.log(`\n=== ${scenario.id}. ${scenario.title} (sender ${from}) ===`);
  const turns = [];
  for (const text of scenario.messages) {
    const { reply, state } = await handleVisitorWithAgent({ from, text });
    console.log(`VISITOR: ${text}`);
    console.log(`BOT: ${reply.replace(/\n/g, '\n     ')}`);
    turns.push({ text, reply, state: JSON.parse(JSON.stringify(state)) });
  }
  const visits = store.visits.slice(visitsBefore);
  const problem = commonProblems(scenario, turns) || scenario.expect({ turns, visits });
  results.push({ id: scenario.id, pass: !problem, reason: problem || 'all checks passed' });
}

console.log('\n=== Results ===');
for (const r of results) console.log(`${r.id}  ${r.pass ? 'PASS' : 'FAIL'}  ${r.reason}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} scenarios passed`);
process.exitCode = failed ? 1 : 0;
