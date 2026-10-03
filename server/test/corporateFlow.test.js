// The Corporate Office chat flow, driven turn by turn with an in-memory io.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { COMPANY_DEFAULTS } from '../src/services/companyConfig.js';
import { loadFlowState, parseCommand, pickIndex, runFlow, STALE_MS } from '../src/whatsapp/corporateFlow.js';

const ALL_FEATURES = {
  knowledge_base: true,
  ai_answers: true,
  appointments: true,
  feedback: true,
  service_requests: true,
  human_handover: true,
  visitation_rules: true,
  reminders: true,
  white_label: true,
  slack: true,
  guest_wifi: true,
  reports_pdf: true,
};

const HOSTS = [
  { id: 1, name: 'John Smith', department: 'Human Resources', office: 'Block A, 2nd floor', status: 'active' },
  { id: 2, name: 'Jane Smith', department: 'Finance', office: '', status: 'active' },
  { id: 3, name: 'Thabo Kgosi', department: 'IT Support', office: 'Block C', status: 'active' },
];

// 2026-10-05 is a Monday.
function makeIo({ visitor = null, features = ALL_FEATURES, settings = {}, bookings = [], answers = {} } = {}) {
  const calls = [];
  const io = {
    calls,
    company: {
      name: 'Acme Holdings',
      features,
      settings: { ...structuredClone(COMPANY_DEFAULTS), ...settings, rules: { ...COMPANY_DEFAULTS.rules, ...(settings.rules || {}) } },
    },
    visitor,
    hosts: HOSTS,
    today: '2026-10-05',
    now: '09:00',
    clock: () => io.time,
    time: 1_000_000,
    openBookings: async () => bookings,
    saveProfile: async (p) => {
      calls.push(['saveProfile', p]);
      return { id: 77, ...p };
    },
    limitReached: async () => false,
    createVisit: async (v) => {
      calls.push(['createVisit', v]);
      return { ok: true, ref: 'VMS-2026-100001', hostName: HOSTS.find((h) => h.id === v.hostId).name };
    },
    upcoming: async () => io.upcomingList || [],
    bookingDetails: async (ref) => (io.upcomingList || []).find((b) => b.ref === ref),
    cancel: async (ref) => {
      calls.push(['cancel', ref]);
      return { ok: true, hostName: 'John Smith' };
    },
    reschedule: async (ref, date, time) => {
      calls.push(['reschedule', ref, date, time]);
      return { ok: true, hostName: 'John Smith' };
    },
    calendarFile: async (ref) => ({ buffer: Buffer.from('BEGIN:VCALENDAR'), fileName: `${ref}.ics`, mimetype: 'text/calendar' }),
    hasIdOnFile: async () => Boolean(io.idOnFile),
    saveDocument: async (kind, media) => {
      calls.push(['saveDocument', kind, media.kind]);
      return { ok: true, id: 501 };
    },
    createFeedback: async (f) => {
      calls.push(['createFeedback', f]);
      return { ref: f.isComplaint ? 'CMP-200001' : 'FB-200001' };
    },
    createServiceRequest: async (r) => {
      calls.push(['createServiceRequest', r]);
      return { ref: 'SR-300001' };
    },
    statusItems: async () => ({ visits: io.upcomingList || [], tickets: [{ ref: 'SR-300001', category: 'it_support', status: 'in_progress' }], feedback: [] }),
    answer: async (q) => answers[q] || { text: '', known: false },
    openHandover: async (dept) => {
      calls.push(['openHandover', dept]);
      io.handover = true;
      return { ref: 'HO-400001' };
    },
    handoverOpen: async () => Boolean(io.handover),
    closeHandover: async () => {
      calls.push(['closeHandover']);
      io.handover = false;
    },
  };
  return io;
}

// Sends messages one by one; returns every reply of the last turn joined, and the state.
async function chat(io, messages, state = null) {
  let s = state;
  let last = null;
  for (const m of messages) {
    const input = typeof m === 'string' ? { text: m } : m;
    last = await runFlow({ state: s, text: input.text || '', media: input.media || null, io });
    s = last.state;
    io.time += 1000;
  }
  return { state: s, reply: last.replies.join('\n---\n'), replies: last.replies, files: last.files };
}

const PHOTO = { kind: 'image', mime: 'image/jpeg', fileName: 'id.jpg', download: async () => Buffer.from('x') };

describe('input helpers', () => {
  test('menu numbers, keycap emoji and out-of-range numbers', () => {
    assert.equal(pickIndex('2', 5), 1);
    assert.equal(pickIndex('2️⃣', 5), 1);
    assert.equal(pickIndex('option 3', 5), 2);
    assert.equal(pickIndex('9', 5), -1);
    assert.equal(pickIndex('hello', 5), null);
  });

  test('global commands in English and Setswana', () => {
    assert.equal(parseCommand('MENU'), 'menu');
    assert.equal(parseCommand('help'), 'help');
    assert.equal(parseCommand('Appointment'), 'appointment');
    assert.equal(parseCommand('STATUS'), 'status');
    assert.equal(parseCommand('cancel'), 'cancel');
    assert.equal(parseCommand('back'), 'back');
    assert.equal(parseCommand('HUMAN'), 'human');
    assert.equal(parseCommand('agent'), 'human');
    assert.equal(parseCommand('khansela'), 'cancel');
    assert.equal(parseCommand('morago'), 'back');
    assert.equal(parseCommand('setswana'), 'setswana');
    assert.equal(parseCommand('book a meeting with John'), null);
  });

  test('old saved state from the previous bot starts fresh', () => {
    const s = loadFlowState({ stage: 'collecting', slots: { name: 'x' }, lang: 'tn' });
    assert.equal(s.step, 'idle');
    assert.equal(s.lang, 'tn');
  });
});

describe('1. new user: welcome and profile', () => {
  test('organisation profile with email', async () => {
    const io = makeIo();
    let r = await chat(io, ['Hi']);
    assert.match(r.reply, /Welcome to Acme Holdings! 👋/);
    assert.match(r.reply, /let's create your profile/);
    assert.match(r.reply, /Please enter your full name/);
    r = await chat(io, ['kabelo molefe'], r.state);
    assert.match(r.reply, /1️⃣ Organisation\n2️⃣ Individual\n3️⃣ Other/);
    r = await chat(io, ['1'], r.state);
    assert.match(r.reply, /company \/ organisation name/);
    r = await chat(io, ['Orange Botswana'], r.state);
    assert.match(r.reply, /email address \(optional\)/);
    r = await chat(io, ['not-an-email'], r.state);
    assert.match(r.reply, /doesn't look like an email/);
    r = await chat(io, ['kabelo@orange.co.bw'], r.state);
    assert.match(r.replies[0], /✅ Profile created successfully! Thank you, Kabelo\./);
    assert.match(r.replies[1], /1️⃣ Visitor Registration\n2️⃣ Make an Appointment\n3️⃣ Give Feedback\n4️⃣ Request a Service\n5️⃣ Ask a Question/);
    assert.match(r.replies[1], /Type \*MENU\* anytime/);
    assert.deepEqual(io.calls.find((c) => c[0] === 'saveProfile')[1], {
      name: 'Kabelo Molefe',
      profile_type: 'organisation',
      company: 'Orange Botswana',
      email: 'kabelo@orange.co.bw',
    });
  });

  test('individual skips the company question; SKIP skips the email', async () => {
    const io = makeIo();
    const r = await chat(io, ['Hello', 'Neo Dube', '2', 'skip']);
    assert.match(r.reply, /Profile created successfully/);
    assert.deepEqual(io.calls[0][1], { name: 'Neo Dube', profile_type: 'individual', company: '—', email: '' });
  });

  test('a greeting or question is not accepted as a name', async () => {
    const io = makeIo();
    const r = await chat(io, ['Hi', 'hello']);
    assert.match(r.reply, /full name/);
    assert.equal(r.state.step, 'profile.name');
  });

  test('a Setswana greeting gets the Setswana flow', async () => {
    const io = makeIo();
    const r = await chat(io, ['Dumela rra']);
    assert.match(r.reply, /O amogelesegile kwa Acme Holdings/);
    assert.equal(r.state.lang, 'tn');
  });
});

describe('10. returning user', () => {
  test('welcome back with the menu', async () => {
    const io = makeIo({ visitor: { id: 9, name: 'Kabelo Molefe', company: 'Orange' } });
    const r = await chat(io, ['Hi']);
    assert.match(r.replies[0], /👋 Welcome back, Kabelo!/);
    assert.match(r.replies[1], /How can we help you today\?/);
  });

  test('after a long pause the menu comes back', async () => {
    const io = makeIo({ visitor: { id: 9, name: 'Kabelo Molefe' } });
    let r = await chat(io, ['Hi', '1']);
    assert.equal(r.state.step, 'host');
    io.time += STALE_MS + 1;
    r = await chat(io, ['John'], r.state);
    assert.match(r.reply, /Welcome back/);
    assert.equal(r.state.step, 'menu');
  });

  test('menu items the plan does not include are hidden and renumbered', async () => {
    const io = makeIo({ visitor: { id: 9, name: 'Kabelo' }, features: { ...ALL_FEATURES, appointments: false, service_requests: false } });
    const r = await chat(io, ['Hi']);
    assert.match(r.reply, /1️⃣ Visitor Registration\n2️⃣ Give Feedback\n3️⃣ Ask a Question/);
  });
});

const VISITOR = { id: 9, name: 'Kabelo Molefe', company: 'Orange Botswana' };

describe('3. visitor registration', () => {
  test('host found and confirmed, purpose, date, time, confirm, submitted', async () => {
    const io = makeIo({ visitor: VISITOR });
    let r = await chat(io, ['Hi', '1']);
    assert.match(r.reply, /Who are you visiting\?/);
    r = await chat(io, ['John Smith'], r.state);
    assert.match(r.reply, /I found \*John Smith\*\nDepartment: Human Resources\nOffice: Block A, 2nd floor/);
    assert.match(r.reply, /Is this the person you are visiting\?\n1️⃣ Yes\n2️⃣ No/);
    r = await chat(io, ['1'], r.state);
    assert.match(r.reply, /1️⃣ Meeting\n2️⃣ Business\n3️⃣ Interview\n4️⃣ Delivery\n5️⃣ Service \/ Support\n6️⃣ Other/);
    r = await chat(io, ['3'], r.state);
    assert.match(r.reply, /What date will you visit\?/);
    r = await chat(io, ['tomorrow'], r.state);
    assert.match(r.reply, /What time will you arrive on Tuesday, 6 October 2026\?/);
    assert.match(r.reply, /Office hours: 08:00 – 17:00/);
    assert.match(r.reply, /Available times: 08:00, 08:30/);
    r = await chat(io, ['10am'], r.state);
    assert.match(r.reply, /Please confirm your visit:/);
    assert.match(r.reply, /👤 Name: Kabelo Molefe\n🏢 Company: Orange Botswana\n🙋 Host: John Smith \(Human Resources\)\n📝 Purpose: Interview\n📅 Date: Tuesday, 6 October 2026\n🕐 Time: 10:00 AM/);
    r = await chat(io, ['1'], r.state);
    assert.match(r.reply, /✅ Your visit request has been sent to \*John Smith\* for approval\.\nReference: \*VMS-2026-100001\*/);
    assert.match(r.reply, /You will receive a notification here once your host responds\./);
    const v = io.calls.find((c) => c[0] === 'createVisit')[1];
    assert.equal(v.kind, 'visit');
    assert.equal(v.hostId, 1);
    assert.equal(v.purpose, 'Interview');
    assert.equal(v.date, '2026-10-06');
    assert.equal(v.time, '10:00');
    assert.equal(v.flagged, false);
    assert.equal(r.state.step, 'menu');
  });

  test('several matches give a numbered list; "No" asks again', async () => {
    const io = makeIo({ visitor: VISITOR });
    let r = await chat(io, ['Hi', '1', 'Smith']);
    assert.match(r.reply, /I found several matches/);
    assert.match(r.reply, /1️⃣ John Smith \(Human Resources\)\n2️⃣ Jane Smith \(Finance\)/);
    r = await chat(io, ['2'], r.state);
    assert.match(r.reply, /purpose of your visit/);
    const io2 = makeIo({ visitor: VISITOR });
    r = await chat(io2, ['Hi', '1', 'Thabo', '2']);
    assert.match(r.reply, /Please enter the name or department/);
  });

  test('unknown host twice shows the directory', async () => {
    const io = makeIo({ visitor: VISITOR });
    let r = await chat(io, ['Hi', '1', 'Zebediah']);
    assert.match(r.reply, /couldn't find "Zebediah"/);
    r = await chat(io, ['Qwerty'], r.state);
    assert.match(r.reply, /Here is our directory:\n1️⃣ John Smith/);
    r = await chat(io, ['3'], r.state);
    assert.match(r.reply, /purpose of your visit/);
  });

  test('"Other" purpose asks for a description', async () => {
    const io = makeIo({ visitor: VISITOR });
    const r = await chat(io, ['Hi', '1', 'Thabo', 'yes', '6', 'Site inspection of the server room', 'tomorrow', '14:00', '1']);
    assert.match(r.reply, /sent to \*Thabo Kgosi\*/);
    assert.equal(io.calls.find((c) => c[0] === 'createVisit')[1].purpose, 'Site inspection of the server room');
  });

  test('date and time checks: past, closed day, outside hours, taken slot', async () => {
    const bookings = [{ ref: 'VMS-1', hostId: 1, date: '2026-10-06', time: '10:00', status: 'approved' }];
    const io = makeIo({ visitor: VISITOR, bookings });
    let r = await chat(io, ['Hi', '1', 'John', '1', '1', '01/01/2026']);
    assert.match(r.reply, /already passed/);
    r = await chat(io, ['Saturday'], r.state);
    assert.match(r.reply, /We're closed on Saturday, 10 October 2026/);
    r = await chat(io, ['tomorrow', '7pm'], r.state);
    assert.match(r.reply, /outside office hours \(08:00 – 17:00\)/);
    r = await chat(io, ['10:15'], r.state);
    assert.match(r.reply, /John Smith already has a visit at that time/);
    assert.doesNotMatch(r.reply, /10:00,/);
    r = await chat(io, ['10:30'], r.state);
    assert.match(r.reply, /Please confirm your visit/);
  });

  test('today, a time already passed is refused', async () => {
    const io = makeIo({ visitor: VISITOR });
    const r = await chat(io, ['Hi', '1', 'John', '1', '1', 'today', '8:30']);
    assert.match(r.reply, /already passed today/);
  });

  test('visitation rules: ID upload, NDA and health screening flag the visit', async () => {
    const io = makeIo({ visitor: VISITOR, settings: { rules: { requireId: 'first_visit', requireNda: true, healthScreening: true } } });
    let r = await chat(io, ['Hi', '1', 'John', '1', '2', 'tomorrow', '11:00']);
    assert.match(r.reply, /upload a clear photo of your ID/);
    r = await chat(io, ['here'], r.state);
    assert.match(r.reply, /Please send a \*photo\* or \*PDF\*/);
    r = await chat(io, [{ media: PHOTO }], r.state);
    assert.match(r.reply, /✅ ID document received/);
    assert.match(r.reply, /confidentiality agreement/);
    assert.match(r.reply, /Reply \*I AGREE\* to accept/);
    r = await chat(io, ['ok'], r.state);
    assert.match(r.reply, /you must reply \*I AGREE\*/);
    r = await chat(io, ['I agree'], r.state);
    assert.match(r.reply, /health screening \(2 questions\)/);
    assert.match(r.reply, /1\. Do you have a fever/);
    r = await chat(io, ['2'], r.state);
    assert.match(r.reply, /2\. Have you been in contact/);
    r = await chat(io, ['1'], r.state);
    assert.match(r.reply, /Please confirm your visit/);
    r = await chat(io, ['1'], r.state);
    assert.match(r.reply, /Reception will review your health screening answers/);
    const v = io.calls.find((c) => c[0] === 'createVisit')[1];
    assert.equal(v.flagged, true);
    assert.match(v.flagReason, /Health screening/);
    assert.equal(v.idDocId, 501);
    assert.equal(v.screening.nda.accepted, true);
    assert.equal(v.screening.health.length, 2);
  });

  test('ID on first visit only: a visitor with an ID on file is not asked again', async () => {
    const io = makeIo({ visitor: VISITOR, settings: { rules: { requireId: 'first_visit' } } });
    io.idOnFile = true;
    const r = await chat(io, ['Hi', '1', 'John', '1', '2', 'tomorrow', '11:00']);
    assert.match(r.reply, /Please confirm your visit/);
  });

  test('rules are ignored when the plan lacks visitation rules', async () => {
    const io = makeIo({ visitor: VISITOR, features: { ...ALL_FEATURES, visitation_rules: false }, settings: { rules: { requireId: 'every_visit', requireNda: true } } });
    const r = await chat(io, ['Hi', '1', 'John', '1', '2', 'tomorrow', '11:00']);
    assert.match(r.reply, /Please confirm your visit/);
  });

  test('"Change details" restarts, "Cancel" returns to the menu', async () => {
    const io = makeIo({ visitor: VISITOR });
    let r = await chat(io, ['Hi', '1', 'John', '1', '2', 'tomorrow', '11:00', '2']);
    assert.match(r.reply, /Who are you visiting\?/);
    r = await chat(io, ['John', '1', '2', 'tomorrow', '11:00', '3'], r.state);
    assert.match(r.replies[0], /cancelled/);
    assert.match(r.replies[1], /How can we help you today/);
    assert.equal(io.calls.filter((c) => c[0] === 'createVisit').length, 0);
  });
});

describe('4. make an appointment', () => {
  test('with whom, topic, type, date, time, confirm', async () => {
    const io = makeIo({ visitor: VISITOR });
    let r = await chat(io, ['Hi', '2']);
    assert.match(r.reply, /Who would you like to meet\?/);
    r = await chat(io, ['IT Support'], r.state);
    assert.match(r.reply, /I found \*Thabo Kgosi\*/);
    r = await chat(io, ['yes'], r.state);
    assert.match(r.reply, /What would you like to discuss\?/);
    r = await chat(io, ['Fibre connection for our new branch'], r.state);
    assert.match(r.reply, /1️⃣ Consultation\n2️⃣ Business Meeting\n3️⃣ Service \/ Support\n4️⃣ Sales\n5️⃣ Other/);
    r = await chat(io, ['4'], r.state);
    r = await chat(io, ['Wednesday', '15:00'], r.state);
    assert.match(r.reply, /Please confirm your appointment:\n\n🙋 With: Thabo Kgosi \(IT Support\)\n📌 Type: Sales\n💬 Topic: Fibre connection for our new branch\n📅 Date: Wednesday, 7 October 2026\n🕐 Time: 3:00 PM/);
    r = await chat(io, ['1'], r.state);
    assert.match(r.reply, /📅 Your appointment request has been sent to \*Thabo Kgosi\*/);
    assert.match(r.reply, /calendar invite/);
    const v = io.calls.find((c) => c[0] === 'createVisit')[1];
    assert.equal(v.kind, 'appointment');
    assert.equal(v.appointmentType, 'sales');
    assert.equal(v.topic, 'Fibre connection for our new branch');
  });
});

const BOOKING = { ref: 'VMS-2026-100001', kind: 'appointment', hostId: 1, hostName: 'John Smith', hostDepartment: 'Human Resources', hostOffice: 'Block A', date: '2026-10-07', time: '10:00', status: 'approved', purpose: 'Sales: fibre', pin: '123456' };

describe('5. manage appointments', () => {
  test('APPOINTMENT lists bookings with Reschedule / Cancel / View / Calendar / Return', async () => {
    const io = makeIo({ visitor: VISITOR });
    io.upcomingList = [BOOKING];
    let r = await chat(io, ['Hi', 'APPOINTMENT']);
    assert.match(r.reply, /Your upcoming bookings:\n1️⃣ Appointment · John Smith/);
    r = await chat(io, ['1'], r.state);
    assert.match(r.reply, /1️⃣ Reschedule\n2️⃣ Cancel\n3️⃣ View details\n4️⃣ Add to calendar\n5️⃣ Return to menu/);
    r = await chat(io, ['3'], r.state);
    assert.match(r.reply, /Reference: VMS-2026-100001/);
    assert.match(r.reply, /PIN: 123456/);
    r = await chat(io, ['4'], r.state);
    assert.equal(r.files.length, 1);
    assert.equal(r.files[0].fileName, 'VMS-2026-100001.ics');
    r = await chat(io, ['1', 'Thursday', '11:30'], r.state);
    assert.match(r.reply, /moved to Thursday, 8 October 2026 at 11:30 AM/);
    assert.deepEqual(io.calls.find((c) => c[0] === 'reschedule').slice(1), ['VMS-2026-100001', '2026-10-08', '11:30']);
  });

  test('cancel asks for confirmation', async () => {
    const io = makeIo({ visitor: VISITOR });
    io.upcomingList = [BOOKING];
    let r = await chat(io, ['Hi', 'appointment', '1', '2']);
    assert.match(r.reply, /Cancel appointment \*VMS-2026-100001\*/);
    r = await chat(io, ['2'], r.state);
    assert.match(r.reply, /unchanged/);
    r = await chat(io, ['appointment', '1', '2', '1'], r.state);
    assert.match(r.reply, /❌ Appointment \*VMS-2026-100001\* has been cancelled/);
  });

  test('no bookings', async () => {
    const io = makeIo({ visitor: VISITOR });
    const r = await chat(io, ['Hi', 'APPOINTMENT']);
    assert.match(r.reply, /don't have any upcoming visits or appointments/);
  });
});

describe('6. feedback', () => {
  test('topic, comment, 1–5 rating, reference', async () => {
    const io = makeIo({ visitor: VISITOR });
    let r = await chat(io, ['Hi', '3']);
    assert.match(r.reply, /1️⃣ Visit Experience\n2️⃣ Appointment\n3️⃣ Service\n4️⃣ Staff\n5️⃣ General Feedback\n6️⃣ Complaint/);
    r = await chat(io, ['4', 'Reception was very friendly'], r.state);
    assert.match(r.reply, /1 to 5 ⭐/);
    r = await chat(io, ['7'], r.state);
    assert.match(r.reply, /number from 1 to 5/);
    r = await chat(io, ['5'], r.state);
    assert.match(r.reply, /🙏 Thank you for your feedback!\nReference: \*FB-200001\*/);
    assert.deepEqual(io.calls.find((c) => c[0] === 'createFeedback')[1], {
      topic: 'staff',
      comment: 'Reception was very friendly',
      rating: 5,
      isComplaint: false,
      contactRequested: false,
      visitId: null,
    });
  });

  test('complaint: describe, offer contact, recorded and escalated', async () => {
    const io = makeIo({ visitor: VISITOR });
    let r = await chat(io, ['Hi', '3', '6']);
    assert.match(r.reply, /We're sorry to hear that/);
    r = await chat(io, ['I waited 45 minutes at the gate'], r.state);
    assert.match(r.reply, /Would you like a staff member to contact you/);
    r = await chat(io, ['1'], r.state);
    assert.match(r.reply, /recorded and escalated to our team\.\nReference: \*CMP-200001\*\nA staff member will contact you shortly\./);
    const f = io.calls.find((c) => c[0] === 'createFeedback')[1];
    assert.equal(f.isComplaint, true);
    assert.equal(f.contactRequested, true);
  });

  test('after check-out the visitor is offered feedback on the visit', async () => {
    const io = makeIo({ visitor: VISITOR });
    const state = { v: 2, lang: 'en', step: 'fb.offer', data: { visitId: 42 }, stack: [], lastAt: io.time };
    let r = await chat(io, ['1'], state);
    assert.match(r.reply, /Please share your feedback/);
    r = await chat(io, ['Great meeting', '4'], r.state);
    assert.match(r.reply, /Thank you for your feedback/);
    const f = io.calls.find((c) => c[0] === 'createFeedback')[1];
    assert.equal(f.topic, 'visit');
    assert.equal(f.visitId, 42);
  });
});

describe('7. request a service', () => {
  test('category, description, priority, attachment, confirm, ticket number', async () => {
    const io = makeIo({ visitor: VISITOR });
    let r = await chat(io, ['Hi', '4']);
    assert.match(r.reply, /1️⃣ IT Support\n2️⃣ Technical Assistance\n3️⃣ Account \/ Billing\n4️⃣ Document Request\n5️⃣ Maintenance\n6️⃣ Other/);
    r = await chat(io, ['1', 'My office Wi-Fi keeps dropping'], r.state);
    assert.match(r.reply, /1️⃣ Low\n2️⃣ Normal\n3️⃣ High\n4️⃣ Critical/);
    r = await chat(io, ['3'], r.state);
    assert.match(r.reply, /attach a file or photo/);
    r = await chat(io, ['1'], r.state);
    assert.match(r.reply, /send the file or photo now/);
    r = await chat(io, [{ media: PHOTO }], r.state);
    assert.match(r.reply, /📎 File attached/);
    assert.match(r.reply, /🔧 Type: IT Support\n📝 Details: My office Wi-Fi keeps dropping\n⚡ Priority: High\n📎 Attachment: yes/);
    r = await chat(io, ['1'], r.state);
    assert.match(r.reply, /Ticket number: \*SR-300001\*/);
    assert.match(r.reply, /notify you here when the status changes/);
    assert.deepEqual(io.calls.find((c) => c[0] === 'createServiceRequest')[1], {
      category: 'it_support',
      description: 'My office Wi-Fi keeps dropping',
      priority: 'high',
      docId: 501,
    });
  });

  test('STATUS shows tickets', async () => {
    const io = makeIo({ visitor: VISITOR });
    const r = await chat(io, ['Hi', 'STATUS']);
    assert.match(r.reply, /SR-300001 – IT Support: \*In progress\*/);
  });
});

describe('8. ask a question', () => {
  test('opening hours come from the company settings', async () => {
    const io = makeIo({ visitor: VISITOR });
    const r = await chat(io, ['Hi', '5', 'What are your opening hours?']);
    assert.match(r.reply, /🕗 Our opening hours:\nMon–Fri: 08:00 – 17:00\nSat–Sun: Closed/);
    assert.match(r.reply, /Anything else\?/);
  });

  test('a known answer from the knowledge base', async () => {
    const io = makeIo({ visitor: VISITOR, answers: { 'Do you have parking?': { text: 'Yes, visitor parking is at Gate 2.', known: true } } });
    const r = await chat(io, ['Hi', '5', 'Do you have parking?']);
    assert.match(r.reply, /visitor parking is at Gate 2/);
  });

  test('unknown: connect to staff / submit a request / ask another / menu', async () => {
    const io = makeIo({ visitor: VISITOR });
    let r = await chat(io, ['Hi', '5', 'Who won the 2010 world cup?']);
    assert.match(r.reply, /I'm not sure about that\. Would you like to:\n1️⃣ Connect to a staff member\n2️⃣ Submit a request\n3️⃣ Ask another question\n4️⃣ Return to menu/);
    r = await chat(io, ['2'], r.state);
    assert.match(r.reply, /What type of service do you need/);
  });

  test('free text at the menu is treated as a question', async () => {
    const io = makeIo({ visitor: VISITOR });
    const r = await chat(io, ['Hi', 'when do you open on saturday']);
    assert.match(r.reply, /Our opening hours/);
  });
});

describe('9. global commands', () => {
  test('HELP lists the commands; BACK goes one step back; CANCEL stops', async () => {
    const io = makeIo({ visitor: VISITOR });
    let r = await chat(io, ['Hi', 'HELP']);
    for (const cmd of ['MENU', 'APPOINTMENT', 'STATUS', 'BACK', 'CANCEL', 'HUMAN', 'AGENT']) assert.match(r.reply, new RegExp(`\\*${cmd}\\*`));
    r = await chat(io, ['1', 'John', '1', '2'], r.state);
    assert.match(r.reply, /What date/);
    r = await chat(io, ['BACK'], r.state);
    assert.match(r.reply, /purpose of your visit/);
    r = await chat(io, ['BACK'], r.state);
    assert.match(r.reply, /Is this the person/);
    r = await chat(io, ['CANCEL'], r.state);
    assert.match(r.replies[0], /cancelled/);
    assert.equal(r.state.step, 'menu');
  });

  test('MENU from the middle of a flow; language switch', async () => {
    const io = makeIo({ visitor: VISITOR });
    let r = await chat(io, ['Hi', '4', 'MENU']);
    assert.match(r.reply, /How can we help you today/);
    r = await chat(io, ['SETSWANA'], r.state);
    assert.match(r.reply, /Puo e fetotswe go Setswana/);
    assert.match(r.reply, /Re ka go thusa ka eng gompieno/);
  });

  test('END and thanks end the conversation', async () => {
    const io = makeIo({ visitor: VISITOR });
    let r = await chat(io, ['Hi', 'END']);
    assert.match(r.reply, /Thank you for contacting Acme Holdings! 😊\nHave a great day\./);
    r = await chat(io, ['thank you'], r.state);
    assert.match(r.reply, /Thank you for contacting Acme Holdings/);
  });
});

describe('11. human handover', () => {
  test('department, reference, assistant stays quiet, MENU returns', async () => {
    const io = makeIo({ visitor: VISITOR });
    let r = await chat(io, ['Hi', 'HUMAN']);
    assert.match(r.reply, /1️⃣ Reception\n2️⃣ Sales\n3️⃣ IT Support\n4️⃣ Accounts\n5️⃣ General Enquiries/);
    r = await chat(io, ['2'], r.state);
    assert.match(r.reply, /👤 You are being connected to \*Sales\*\.\nReference: \*HO-400001\*/);
    r = await chat(io, ['I want a quote for 50 users'], r.state);
    assert.match(r.reply, /passed to our team \(reference HO-400001\)/);
    r = await chat(io, ['Are you there?'], r.state);
    assert.equal(r.replies.length, 0, 'the assistant stays quiet while staff handle the chat');
    r = await chat(io, ['MENU'], r.state);
    assert.match(r.reply, /back with the virtual assistant/);
    assert.ok(io.calls.some((c) => c[0] === 'closeHandover'));
  });

  test('handover is refused when the plan lacks it', async () => {
    const io = makeIo({ visitor: VISITOR, features: { ...ALL_FEATURES, human_handover: false } });
    const r = await chat(io, ['Hi', 'agent']);
    assert.match(r.reply, /not available right now/);
  });
});

describe('white-label templates', () => {
  test('custom welcome and goodbye', async () => {
    const io = makeIo({
      settings: { templates: { welcome: { en: 'Hello from {company}! Our concierge will help.', tn: '' }, goodbye: { en: 'Bye from {company}.', tn: '' }, approved: { en: '', tn: '' } } },
    });
    let r = await chat(io, ['Hi']);
    assert.match(r.reply, /Hello from Acme Holdings! Our concierge will help\./);
    const io2 = makeIo({ visitor: VISITOR, settings: { templates: { goodbye: { en: 'Bye from {company}.', tn: '' }, welcome: { en: '', tn: '' }, approved: { en: '', tn: '' } } } });
    r = await chat(io2, ['Hi', 'bye']);
    assert.match(r.reply, /Bye from Acme Holdings\./);
  });
});
