import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { afterBooking, afterCancel, runTurn } from '../src/whatsapp/bookingEngine.js';
import { matchHosts } from '../src/whatsapp/hostMatch.js';
import { extractFields } from '../src/whatsapp/slotExtract.js';
import { detectLanguage } from '../src/whatsapp/lang.js';
import { extractDate, extractTime } from '../src/utils/dateParse.js';

const TODAY = '2026-09-24';

// Mirrors the live host directory (names/departments only).
const HOSTS = [
  { id: 2, name: 'Naledi Kgosi', department: 'Human Resources', status: 'active' },
  { id: 3, name: 'Tshepo Molefe', department: 'Finance', status: 'active' },
  { id: 4, name: 'Botho Prince', department: 'Technology Planning', status: 'active' },
  { id: 5, name: 'ASTRA', department: '—', status: 'active' },
  { id: 8, name: 'Botho', department: '—', status: 'active' },
  { id: 9, name: 'Waqas Naveed', department: 'AI/ML Egnineer', status: 'active' },
  { id: 10, name: 'Hamza', department: 'food services', status: 'active' },
];

const HOSTS_WITH_PROCUREMENT = [
  ...HOSTS,
  { id: 11, name: 'Lesego Dintwa', department: 'Procurement', status: 'active' },
];

function chat(messages, { hosts = HOSTS, state = null, visits = [], bookings = [], now = null } = {}) {
  const log = [];
  let current = state;
  for (const text of messages) {
    let { state: next, reply, actions } = runTurn(current, text, { hosts, today: TODAY, now, visits, bookings });
    for (const action of actions) {
      if (action.type === 'book') {
        const booked = afterBooking(
          next,
          { ok: true, ref: 'VMS-2026-000123', hostName: next.slots.hostName, date: next.slots.date, time: next.slots.time },
          { hosts }
        );
        log.push({ text, reply: booked.reply, booked: { ...next.slots }, state: booked.state });
        next = booked.state;
        reply = null;
      }
      if (action.type === 'cancel') {
        const done = afterCancel(next, { ok: true, ref: action.ref, hostName: 'Hamza' });
        log.push({ text, reply: done.reply, cancelled: action.ref, state: done.state });
        next = done.state;
        reply = null;
      }
      if (action.type === 'faq') reply = `[faq] ${action.followUp}`;
      if (action.type === 'status') reply = `[status ${action.ref}]`;
    }
    if (reply !== null) log.push({ text, reply, state: next });
    current = next;
  }
  return { log, state: current, replies: log.map((l) => l.reply) };
}

describe('real production chat lines', () => {
  test('Procurement / Botho answers never repeat the host question', () => {
    const { replies } = chat(['Hello', 'Michael Ntsima', 'BOTHO INNOVATIONS', 'Sales pitch', 'Procurement', 'Procurement', 'Botho']);
    const hostQuestion = 'Who would you like to visit? Please share the host name or department.';
    assert.equal(replies.filter((r) => r === hostQuestion).length, 1, replies.join('\n---\n'));
    assert.match(replies[4], /don't have a host or department called "Procurement"/);
    assert.match(replies[4], /1\. Naledi Kgosi \(Human Resources\)/);
    assert.match(replies[5], /doesn't match anyone on the list/);
    assert.match(replies[6], /Which date/);
  });

  test('screenshot message: comma list after the welcome fills name, company, purpose, date, time', () => {
    const { replies, state } = chat(['Hello', 'Michael Ntsima, Botho Innovations, Sales Pitch, 25 Sept 2026, 10am']);
    assert.equal(state.slots.name, 'Michael Ntsima');
    assert.equal(state.slots.company, 'Botho Innovations');
    assert.equal(state.slots.purpose, 'Sales Pitch');
    assert.equal(state.slots.date, '2026-09-25');
    assert.equal(state.slots.time, '10:00');
    assert.equal(replies[1], 'Who would you like to visit? Please share the host name or department.');
  });

  test('Bug B: long Waqas sentence asks only for the host', () => {
    const { state, replies } = chat([
      'Hi',
      'Waqas naveed from Astra innovations. I want to consult AI system want yo visit on 25 September at 3 pm',
    ]);
    assert.equal(state.slots.name, 'Waqas Naveed');
    assert.equal(state.slots.company, 'Astra innovations');
    assert.equal(state.slots.purpose, 'Consult AI system');
    assert.equal(state.slots.date, '2026-09-25');
    assert.equal(state.slots.time, '15:00');
    assert.equal(state.slots.hostId, null);
    assert.match(replies[1], /Who would you like to visit/);
  });
});

describe('acceptance tests', () => {
  test('T1 one-message booking', () => {
    const { log } = chat([
      'Hi',
      'Waqas Naveed from Astra. I want to consult the AI system. I want to visit Hamza on 25 September at 3 pm',
      'Yes',
    ]);
    assert.match(log[0].reply, /^Welcome to Botho Innovations Visitor Management System/);
    assert.match(log[1].reply, /Please confirm your visit details/);
    assert.match(log[1].reply, /Name: Waqas Naveed\nCompany: Astra\nPurpose: Consult the AI system\nHost: Hamza \(food services\)/);
    assert.match(log[1].reply, /Date: Friday, 25 September 2026\nTime: 3:00 PM/);
    assert.equal(log[2].booked.hostId, 10);
    assert.match(log[2].reply, /Your visit request has been submitted\.\nReference: VMS-2026-000123/);
  });

  test('T2 department as host is accepted and moves on', () => {
    const { replies, state } = chat(['Hi', 'Kagiso Sebina', 'Debswana', 'Supplier meeting', 'Procurement'], {
      hosts: HOSTS_WITH_PROCUREMENT,
    });
    assert.equal(state.slots.hostId, 11);
    assert.match(replies.at(-1), /Which date/);
  });

  test('T3 unknown department shows the list and the pick advances', () => {
    const { replies, state } = chat(['Hi', 'Kagiso Sebina', 'Debswana', 'Supplier meeting', 'Sales pitch', '3']);
    assert.match(replies[4], /don't have a host or department called "Sales pitch"/);
    assert.equal(state.slots.hostId, 4);
    assert.match(replies[5], /Which date/);
  });

  test('T4 step by step, each answer advances exactly one step', () => {
    const { replies, state } = chat([
      'Hi',
      'Michael Ntsima',
      'Botho Innovations',
      'Technology Planning Meeting',
      'Naledi',
      '25 Sep',
      '10am',
      'yes',
    ]);
    assert.deepEqual(replies.slice(1, 7), [
      'Which company are you visiting from?',
      'What is the purpose of your visit?',
      'Who would you like to visit? Please share the host name or department.',
      'Which date would you like to visit? For example: 25 September, or tomorrow.',
      'What time will you arrive? For example: 10am, or 15:00.',
      replies[6],
    ]);
    assert.match(replies[6], /Host: Naledi Kgosi \(Human Resources\)/);
    assert.match(replies[7], /submitted/);
    assert.equal(state.stage, 'idle');
  });

  test('T5 Setswana end to end', () => {
    const { replies, log } = chat([
      'Dumela',
      'Ke nna Kagiso Molefe, ke tswa kwa Debswana',
      'Kopano ya thekiso',
      'Ke batla go bona Tshepo',
      'Kamoso',
      'ka 10 mo mosong',
      'Ee',
    ]);
    assert.match(replies[0], /^Re a go amogela mo Botho Innovations/);
    assert.equal(replies[1], 'Maikaelelo a ketelo ya gago ke eng?');
    assert.equal(replies[2], 'O batla go etela mang? Tsweetswee kwala leina la motho kgotsa la lefapha.');
    assert.match(replies[3], /letlha lefe/);
    assert.match(replies[4], /nako mang/);
    assert.match(replies[5], /Tsweetswee tlhomamisa/);
    assert.match(replies[5], /Letlha: Labotlhano, 25 Lwetse 2026\nNako: 10:00/);
    assert.match(replies[6], /Kopo ya gago ya ketelo e rometswe/);
    assert.equal(log.at(-1).booked.name, 'Kagiso Molefe');
    assert.equal(log.at(-1).booked.company, 'Debswana');
  });

  test('T6 new booking after a completed one starts from clean slots', () => {
    const first = chat(['Hi', 'Waqas Naveed from Astra. I want to consult the AI system. I want to visit Hamza on 25 September at 3 pm', 'Yes']);
    const { state, replies } = chat(['Hi', 'Ali Raza'], { state: first.state });
    assert.equal(state.slots.name, 'Ali Raza');
    assert.equal(state.slots.company, '');
    assert.equal(state.slots.date, '');
    assert.equal(state.slots.time, '');
    assert.equal(replies[1], 'Which company are you visiting from?');

    const again = chat(['another booking'], { state: first.state });
    assert.match(again.replies[0], /^Welcome/);
    assert.equal(again.state.slots.name, '');
  });
});

describe('guards', () => {
  test('visitor cannot approve their own visit', () => {
    const { replies } = chat(['Hi', 'approve']);
    assert.match(replies[1], /can't be approved or rejected from this chat/);
  });

  test('off-topic programming requests are refused and the booking resumes', () => {
    const { replies } = chat(['Hi', 'Michael Ntsima', 'write me C++ code for a calculator']);
    assert.match(replies[2], /only help with visitor bookings/);
    assert.match(replies[2], /Which company/);
  });

  test('a filled field is never overwritten outside confirmation', () => {
    const { state } = chat(['Hi', 'Michael Ntsima', 'My name is Waqas']);
    assert.equal(state.slots.name, 'Michael Ntsima');
  });

  test('confirmation accepts a correction and re-confirms', () => {
    const { replies, state } = chat([
      'Hi',
      'Waqas Naveed from Astra. I want to consult the AI system. I want to visit Hamza on 25 September at 3 pm',
      'change time to 11am',
    ]);
    assert.equal(state.slots.time, '11:00');
    assert.match(replies[2], /Time: 11:00 AM/);
  });

  test('past dates are rejected with a clear message', () => {
    const { replies } = chat(['Hi', 'Michael Ntsima', 'Botho Innovations', 'Meeting', 'Hamza', '2025-01-10']);
    assert.match(replies.at(-1), /already passed/);
  });

  test('empty directory does not loop', () => {
    const { replies } = chat(['Hi', 'Michael', 'Botho', 'Meeting', 'Hamza'], { hosts: [] });
    assert.match(replies.at(-1), /host directory has not been set up/);
  });

  test('media / empty message keeps the current question', () => {
    const { replies } = chat(['Hi', 'Michael Ntsima', '']);
    assert.match(replies[2], /only read text messages\.\n\nWhich company/);
  });

  test('host ambiguity is a numbered list, not a repeat', () => {
    const { replies } = chat(['Hi', 'Michael Ntsima', 'Botho Innovations', 'Meeting', 'Prince Botho']);
    assert.match(replies.at(-1), /Which date/);
  });
});

describe('realistic variations', () => {
  test('rich single sentence', () => {
    const { state } = chat([
      "Hi, I'm Thabo Kgari from Orange Botswana and I'd like to see Tshepo tomorrow at 9am for a contract review",
    ]);
    assert.equal(state.slots.name, 'Thabo Kgari');
    assert.equal(state.slots.company, 'Orange Botswana');
    assert.equal(state.slots.hostId, 3);
    assert.equal(state.slots.date, '2026-09-25');
    assert.equal(state.slots.time, '09:00');
    assert.equal(state.slots.purpose, 'Contract review');
    assert.equal(state.stage, 'confirm');
  });

  test('labelled lines', () => {
    const { state } = chat(['Hi', 'Name: Neo Setlhare\nCompany: BPC\nPurpose: Meter audit\nHost: Finance\nDate: 30/09/2026\nTime: 14:30']);
    assert.equal(state.slots.name, 'Neo Setlhare');
    assert.equal(state.slots.company, 'BPC');
    assert.equal(state.slots.hostId, 3);
    assert.equal(state.slots.date, '2026-09-30');
    assert.equal(state.slots.time, '14:30');
  });

  test('a question mid-flow is answered and the pending question is kept', () => {
    const { log } = chat(['Hi', 'Michael Ntsima', 'Where is your office?']);
    assert.equal(log[2].reply, '[faq] Which company are you visiting from?');
    assert.equal(log[2].state.slots.name, 'Michael Ntsima');
  });

  test('status lookup by reference', () => {
    const { replies } = chat(['VMS-2026-000123']);
    assert.equal(replies[0], '[status VMS-2026-000123]');
  });

  test('saying no at confirmation, then correcting the date', () => {
    const { replies, state } = chat([
      'Hi',
      'Waqas Naveed from Astra. I want to consult the AI system. I want to visit Hamza on 25 September at 3 pm',
      'no',
      'date 26 September',
    ]);
    assert.match(replies[2], /What would you like to change/);
    assert.equal(state.slots.date, '2026-09-26');
    assert.match(replies[3], /Please confirm/);
  });

  test('changing the host at confirmation', () => {
    const { state } = chat([
      'Hi',
      'Waqas Naveed from Astra. I want to consult the AI system. I want to visit Hamza on 25 September at 3 pm',
      'host Naledi',
    ]);
    assert.equal(state.slots.hostId, 2);
    assert.equal(state.stage, 'confirm');
  });

  test('out-of-range pick re-shows the list with different wording', () => {
    const { replies } = chat(['Hi', 'Michael', 'Botho Innovations', 'Meeting', 'Procurement', '99', '2']);
    assert.match(replies[5], /doesn't match anyone on the list/);
    assert.match(replies[6], /Which date/);
  });

  test('switching to Setswana mid-chat switches replies', () => {
    const { replies } = chat(['Hi', 'Michael Ntsima', 'Ke tswa kwa Debswana']);
    assert.equal(replies[2], 'Maikaelelo a ketelo ya gago ke eng?');
  });

  test('Setswana unknown host list', () => {
    const { replies } = chat(['Dumela', 'Kagiso', 'Debswana', 'Kopano', 'Procurement']);
    assert.match(replies.at(-1), /Ga ke na motho kgotsa lefapha le le bidiwang "Procurement"/);
  });

  test('thanks after booking does not restart the flow', () => {
    const first = chat(['Hi', 'Waqas Naveed from Astra. I want to consult the AI system. I want to visit Hamza on 25 September at 3 pm', 'Yes']);
    const { replies } = chat(['Thank you'], { state: first.state });
    assert.match(replies[0], /You're welcome/);
  });

  test('no generic chatbot phrasing or markdown anywhere', () => {
    const { replies } = chat(['Hi', 'Michael', 'Botho', 'Meeting', 'Sales pitch', '1', 'tomorrow', '10am', 'yes']);
    for (const r of replies) {
      assert.doesNotMatch(r, /how can i (assist|help) you/i);
      assert.doesNotMatch(r, /\*|YYYY-MM-DD/);
    }
  });
});

describe('production transcript from the review', () => {
  test('re-sent name, company correction, and "visit" never reset or corrupt the booking', () => {
    const { replies, state } = chat([
      'Hi',
      'Im waqas Naveed',
      'pakistan',
      'i am waqas naveed',
      'i am from devmark',
      'waqas naveed',
      'visit',
    ]);
    assert.equal(replies[1], 'Which company are you visiting from?');
    assert.equal(replies[2], 'What is the purpose of your visit?');
    for (const r of replies.slice(2)) {
      assert.doesNotMatch(r, /^Welcome/);
      assert.doesNotMatch(r, /host or department called/);
    }
    assert.equal(state.slots.name, 'Waqas Naveed');
    assert.equal(state.slots.company, 'Pakistan');
    assert.equal(state.slots.purpose, '');
    assert.match(replies.at(-1), /why you are visiting/);
  });

  test('typo-heavy one-liner: "visit date is" is a date, never a host', () => {
    const { state, replies } = chat([
      'Hi',
      'i am waqas naveed from culinova comapny pirpose is ai consultant visit date is 2026 25 september',
    ]);
    assert.equal(state.slots.name, 'Waqas Naveed');
    assert.equal(state.slots.company, 'Culinova');
    assert.equal(state.slots.purpose, 'Ai consultant');
    assert.equal(state.slots.date, '2026-09-25');
    assert.equal(state.slots.hostId, null);
    assert.equal(replies[1], 'Who would you like to visit? Please share the host name or department.');
  });

  test('"Ali Raza visiting Waqas" keeps visitor and host separate', () => {
    const { state } = chat(['Ali Raza visiting Waqas']);
    assert.equal(state.slots.name, 'Ali Raza');
    assert.equal(state.slots.hostId, 9);
  });

  test('"visit" as a host answer shows the list, not a "no host called visit" message', () => {
    const { replies } = chat(['Hi', 'Michael', 'Botho Innovations', 'Meeting', 'visit']);
    assert.match(replies.at(-1), /^Please choose the host you are visiting/);
  });
});

describe('production transcript 24/09 23:18 (state must carry across every message)', () => {
  test('company phrasings and a short purpose never reset to the welcome', () => {
    const { replies, state } = chat([
      'Hi',
      'Im waqas Naveed',
      'Im visiting from Culinova',
      'Im waqas Naveed',
      'Culinova company',
      'For cusltant',
    ]);
    assert.equal(replies[1], 'Which company are you visiting from?');
    assert.equal(replies[2], 'What is the purpose of your visit?');
    for (const r of replies.slice(1)) assert.doesNotMatch(r, /^Welcome|May I have your full name/);
    assert.equal(state.slots.name, 'Waqas Naveed');
    assert.equal(state.slots.company, 'Culinova');
    assert.equal(state.slots.purpose, 'Cusltant');
    assert.match(replies.at(-1), /Who would you like to visit/);
  });

  test('one-liner with company, purpose, and date', () => {
    const { state, replies } = chat([
      'Hi',
      'Im waqas from culinova comapny for ai consulting i want to visit on 25 September 2026',
    ]);
    assert.equal(state.slots.name, 'Waqas');
    assert.equal(state.slots.company, 'Culinova');
    assert.equal(state.slots.purpose, 'Ai consulting');
    assert.equal(state.slots.date, '2026-09-25');
    assert.match(replies[1], /Who would you like to visit/);
  });
});

describe('production transcript 25/09 00:02 (questions about an existing request)', () => {
  test('questions after a booking are answered, never stored as name or company', () => {
    const first = chat([
      'Hi',
      'i am waqas naveed',
      'i am from culinova',
      'ai consultant',
      'i want to visit AI/ML engineer',
      'yes tomorrow at 4pm',
      'yes',
    ]);
    assert.equal(first.log.at(-1).booked.hostId, 9);
    const { log, state } = chat(
      [
        'hi',
        'have you given my reuqest to waqas',
        'waqas',
        'i already applied for visit can you tell me which which host you booked my oppointment',
        'ai consultant',
      ],
      { state: first.state }
    );
    assert.match(log[0].reply, /^Welcome/);
    assert.equal(log[1].reply, '[faq] ');
    assert.equal(log[1].state.slots.name, '');
    assert.equal(log[2].reply, 'Which company are you visiting from?');
    assert.equal(log[3].reply, '[faq] Which company are you visiting from?');
    assert.equal(log[3].state.slots.company, '');
    assert.equal(state.slots.company, 'Ai Consultant');
  });

  test('a question that carries booking details still books', () => {
    const { state } = chat(['Hi', 'Michael Ntsima', 'Botho Innovations', 'Meeting', 'Can I visit Hamza tomorrow at 10am?']);
    assert.equal(state.slots.hostId, 10);
    assert.equal(state.slots.date, '2026-09-25');
    assert.equal(state.slots.time, '10:00');
  });
});

const ONE_LINER = 'Waqas Naveed from Astra. I want to consult the AI system. I want to visit Hamza on 25 September at 3 pm';
const HAMZA_3PM = [{ ref: 'VMS-2026-000900', hostId: 10, date: '2026-09-25', time: '15:00', status: 'approved' }];

describe('30-minute host slots', () => {
  test('a taken slot is refused with the nearest free times; 30 minutes later is fine', () => {
    const { replies, state } = chat(['Hi', ONE_LINER, '3:30 pm'], { bookings: HAMZA_3PM });
    assert.match(replies[1], /Hamza already has a visit at 15:00 on Friday, 25 September 2026/);
    assert.match(replies[1], /Available times that day: 13:30, 14:00, 14:30, 15:30, 16:00, 16:30/);
    assert.equal(state.slots.time, '15:30');
    assert.equal(state.stage, 'confirm');
  });

  test('2:30 pm is free when 3 pm is booked, 2:45 pm is not', () => {
    const ok = chat(['Hi', 'Michael', 'Botho', 'Meeting', 'Hamza', '25 September', '2:30 pm'], { bookings: HAMZA_3PM });
    assert.equal(ok.state.stage, 'confirm');
    const clash = chat(['Hi', 'Michael', 'Botho', 'Meeting', 'Hamza', '25 September', '2:45 pm'], { bookings: HAMZA_3PM });
    assert.match(clash.replies.at(-1), /already has a visit at 15:00/);
    assert.equal(clash.state.slots.time, '');
  });

  test('the time question lists the host’s free times', () => {
    const { replies } = chat(['Hi', 'Michael', 'Botho', 'Meeting', 'Hamza', '25 September'], { bookings: HAMZA_3PM });
    assert.match(replies.at(-1), /What time will you arrive/);
    assert.match(replies.at(-1), /Available times for Hamza on Friday, 25 September 2026: 08:00, 08:30/);
    assert.doesNotMatch(replies.at(-1).split('Available times')[1], /15:00/);
    const empty = chat(['Hi', 'Michael', 'Botho', 'Meeting', 'Naledi', '25 September'], { bookings: HAMZA_3PM });
    assert.doesNotMatch(empty.replies.at(-1), /Available times/);
  });

  test('outside office hours and already-passed times are refused', () => {
    const late = chat(['Hi', 'Michael', 'Botho', 'Meeting', 'Hamza', '25 September', '7 pm']);
    assert.match(late.replies.at(-1), /between 08:00 and 17:00/);
    const past = chat(['Hi', 'Michael', 'Botho', 'Meeting', 'Hamza', 'today', '9 am'], { now: '11:10' });
    assert.match(past.replies.at(-1), /already passed today/);
  });

  test('a fully booked day asks for another date', () => {
    const full = [];
    for (let m = 8 * 60; m <= 16 * 60 + 30; m += 30) {
      full.push({ ref: `R${m}`, hostId: 10, date: '2026-09-25', time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, status: 'pending' });
    }
    const { replies, state } = chat(['Hi', 'Michael', 'Botho', 'Meeting', 'Hamza', '25 September'], { bookings: full });
    assert.match(replies.at(-1), /Hamza is fully booked on Friday, 25 September 2026/);
    assert.equal(state.slots.date, '');
  });

  test('free slot question', () => {
    const { replies } = chat(['free slots for Hamza tomorrow'], { bookings: HAMZA_3PM });
    assert.match(replies[0], /Hamza, Friday, 25 September 2026\nBooked: 15:00\nAvailable: 08:00/);
    assert.doesNotMatch(replies[0].split('Available:')[1], /15:00/);
  });
});

const APPROVED = [{ ref: 'VMS-2026-563706', hostId: 9, host: 'Waqas Naveed', date: '2026-09-25', time: '16:00', status: 'approved', purpose: 'Ai consultant' }];

describe('cancelling', () => {
  test('production transcript 25/09 00:29: "Cancel it" really cancels the approved visit after YES', () => {
    const { log } = chat(['Hi', 'Hi', 'Cancel it', 'yes'], { visits: APPROVED });
    assert.match(log[0].reply, /You already have a visit request: VMS-2026-563706/);
    assert.doesNotMatch(log[1].reply, /You already have/);
    assert.match(log[2].reply, /Do you want to cancel this visit\?\nVMS-2026-563706, host Waqas Naveed, Friday, 25 September 2026 at 4:00 PM\. Status: Approved\./);
    assert.equal(log[3].cancelled, 'VMS-2026-563706');
    assert.match(log[3].reply, /Your visit VMS-2026-563706 has been cancelled/);
  });

  test('NO keeps the visit', () => {
    const { replies } = chat(['cancel my booking', 'no'], { visits: APPROVED });
    assert.equal(replies[1], 'Okay, your visit VMS-2026-563706 is still booked.');
  });

  test('cancel while a booking is being typed stops only the draft', () => {
    const { replies, state } = chat(['Hi', 'Michael', 'cancel'], { visits: APPROVED });
    assert.match(replies[2], /Nothing was submitted/);
    assert.equal(state.slots.name, '');
  });

  test('several visits: choose by number, then confirm', () => {
    const visits = [...APPROVED, { ref: 'VMS-2026-000777', hostId: 10, host: 'Hamza', date: '2026-09-28', time: '10:00', status: 'pending' }];
    const { log } = chat(['cancel', '2', 'yes'], { visits });
    assert.match(log[0].reply, /Which visit would you like to cancel\?/);
    assert.match(log[1].reply, /VMS-2026-000777/);
    assert.equal(log[2].cancelled, 'VMS-2026-000777');
  });

  test('nothing to cancel', () => {
    const { replies } = chat(['cancel'], { visits: [{ ...APPROVED[0], status: 'rejected' }] });
    assert.equal(replies[0], 'You have no upcoming visit requests to cancel.');
  });

  test('Setswana cancel', () => {
    const { replies } = chat(['Ke batla go khansela ketelo ya me', 'Ee'], { visits: APPROVED });
    assert.match(replies[0], /A o batla go khansela ketelo e\?/);
    assert.match(replies[1], /e khanseletswe/);
  });
});

describe('status and rebooking', () => {
  test('status lists the visitor’s requests', () => {
    const { replies } = chat(['check my booking status'], { visits: APPROVED });
    assert.match(replies[0], /^Your visit requests:\nVMS-2026-563706, host Waqas Naveed/);
  });

  test('"another visit request" starts a clean booking without the reminder', () => {
    const { replies, state } = chat(['Yes i need another visit request'], { visits: APPROVED });
    assert.match(replies[0], /^Welcome/);
    assert.doesNotMatch(replies[0], /You already have/);
    assert.equal(state.stage, 'collecting');
  });

  test('reschedule explains cancel + rebook', () => {
    const { replies } = chat(['I want to reschedule my visit'], { visits: APPROVED });
    assert.match(replies[0], /send "cancel"/);
  });
});

describe('matchers', () => {
  test('host matching', () => {
    assert.deepEqual(matchHosts('Procurement', HOSTS), []);
    assert.deepEqual(matchHosts('Sales pitch', HOSTS), []);
    assert.deepEqual(matchHosts('Botho', HOSTS).map((h) => h.id), [8]);
    assert.deepEqual(matchHosts('AI/ML', HOSTS).map((h) => h.id), [9]);
    assert.deepEqual(matchHosts('food services', HOSTS).map((h) => h.id), [10]);
    assert.deepEqual(matchHosts('the finance department', HOSTS).map((h) => h.id), [3]);
    assert.deepEqual(matchHosts('finanace', HOSTS).map((h) => h.id), [3]);
    assert.deepEqual(matchHosts('HR', HOSTS).map((h) => h.id), [2]);
    assert.deepEqual(matchHosts('Procurement', HOSTS_WITH_PROCUREMENT).map((h) => h.id), [11]);
  });

  test('dates and times', () => {
    assert.equal(extractDate('25 September', TODAY), '2026-09-25');
    assert.equal(extractDate('25 Sept 2026', TODAY), '2026-09-25');
    assert.equal(extractDate('September 30', TODAY), '2026-09-30');
    assert.equal(extractDate('2026-09-25', TODAY), '2026-09-25');
    assert.equal(extractDate('25/09/2026', TODAY), '2026-09-25');
    assert.equal(extractDate('tomorrow', TODAY), '2026-09-25');
    assert.equal(extractDate('kamoso', TODAY), '2026-09-25');
    assert.equal(extractDate('on Monday', TODAY), '2026-09-28');
    assert.equal(extractDate('10 January', TODAY), '2027-01-10');
    assert.equal(extractDate('2025-01-10', TODAY), 'past');
    assert.equal(extractTime('3 pm'), '15:00');
    assert.equal(extractTime('3:00 PM'), '15:00');
    assert.equal(extractTime('15:00'), '15:00');
    assert.equal(extractTime('15h30'), '15:30');
    assert.equal(extractTime('at 3'), '15:00');
    assert.equal(extractTime('10 mo mosong'), '10:00');
    assert.equal(extractTime('3', { bare: true }), '15:00');
    assert.equal(extractTime('on 25 September'), null);
  });

  test('language detection', () => {
    assert.equal(detectLanguage('Dumela'), 'tn');
    assert.equal(detectLanguage('Ke batla go etela Tshepo kamoso'), 'tn');
    assert.equal(detectLanguage('Hi, I want to visit Hamza'), 'en');
    assert.equal(detectLanguage('Procurement'), null);
    assert.equal(detectLanguage('Michael Ntsima'), null);
  });

  test('visitor sentence does not become the host', () => {
    const found = extractFields('Waqas Naveed from Astra', { today: TODAY });
    assert.equal(found.name, 'Waqas Naveed');
    assert.equal(found.company, 'Astra');
    assert.equal(found.host, undefined);
  });
});
