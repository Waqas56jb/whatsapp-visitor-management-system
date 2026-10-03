// End to end over WhatsApp: real database, the real message handler and chat flow, and an
// in-memory WhatsApp socket per company. Covers a visitor's whole journey and the isolation of
// two companies that share a visitor. PRINT_TRANSCRIPT=1 prints the conversations.
// Skipped unless TEST_DATABASE_URL points at a throwaway PostgreSQL server.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { createScratchDatabase, dropScratchDatabase, migrate } from './helpers/testDb.js';

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const VISITOR = '26772222222';
const HOST = '26771111111';

function fakeSock(label) {
  let n = 0;
  const sock = {
    label,
    sent: [],
    async sendMessage(jid, content) {
      n += 1;
      const id = `${label}-OUT-${n}`;
      sock.sent.push({ jid, content, id });
      return { key: { id } };
    },
    async onWhatsApp(digits) {
      return [{ jid: `${digits}@s.whatsapp.net`, exists: true }];
    },
  };
  return sock;
}

describe('WhatsApp end to end', { skip: !enabled && 'set TEST_DATABASE_URL to run' }, () => {
  let db;
  let sql;
  let m; // modules
  const socks = {};
  const transcript = [];
  let msgId = 0;

  // Messages sent to a phone since the last call.
  const cursor = {};
  function inbox(company, phone) {
    const sock = socks[company];
    const key = `${company}|${phone}`;
    const start = cursor[key] || 0;
    const mine = sock.sent.filter((s) => s.jid.startsWith(phone));
    cursor[key] = mine.length;
    return mine.slice(start);
  }
  const texts = (msgs) => msgs.map((x) => x.content.text || x.content.caption || `[file ${x.content.fileName}]`);

  async function send(company, phone, text, { quoted = null, media } = {}) {
    msgId += 1;
    const msg = {
      key: { remoteJid: `${phone}@s.whatsapp.net`, id: `IN-${msgId}`, fromMe: false },
      message: quoted ? { extendedTextMessage: { text, contextInfo: { stanzaId: quoted } } } : { conversation: text },
      messageTimestamp: Math.floor(Date.now() / 1000),
    };
    transcript.push(`[${company}] ${phone === HOST ? 'HOST' : 'VISITOR'} → ${text || '[photo]'}`);
    await m.runWithTenant(company, () => m.processMessage(msg, { companyId: company, sock: socks[company], media: media ?? null }));
    const replies = texts(inbox(company, phone));
    for (const r of replies) transcript.push(`[${company}] BOT → ${phone === HOST ? 'HOST' : 'VISITOR'}: ${r.replace(/\n/g, '\n        ')}`);
    return replies.join('\n---\n');
  }

  before(async () => {
    db = await createScratchDatabase('wa');
    await migrate(db.url);
    Object.assign(process.env, { DATABASE_URL: db.url, DB_SSL: 'false', JWT_SECRET: 'wa-test-secret', OPENAI_API_KEY: '', NODE_ENV: 'test' });
    sql = new pg.Client({ connectionString: db.url });
    await sql.connect();
    await sql.query(`UPDATE whatsapp_visitor_management_companies SET name = 'Botho Innovations' WHERE id = 1`);
    await sql.query(`INSERT INTO whatsapp_visitor_management_companies (id, name, plan) VALUES (2, 'Acme Holdings', 'business')`);
    await sql.query(`SELECT setval(pg_get_serial_sequence('whatsapp_visitor_management_companies','id'), 2)`);
    await sql.query(
      `INSERT INTO whatsapp_visitor_management_hosts (company_id, name, department, phone, status, office) VALUES
        (1, 'John Smith', 'Human Resources', $1, 'active', 'Block A, 2nd floor'),
        (1, 'Thabo Kgosi', 'IT Support', '', 'active', ''),
        (2, 'Mary Jones', 'Finance', '', 'active', '')`,
      [HOST]
    );
    m = {
      ...(await import('../src/tenant.js')),
      ...(await import('../src/whatsapp/messageHandler.js')),
      ...(await import('../src/whatsapp/connection.js')),
      ...(await import('../src/services/visits.js')),
      ...(await import('../src/services/jobs.js')),
      models: await import('../src/models/index.js'),
    };
    socks[1] = fakeSock('botho');
    socks[2] = fakeSock('acme');
    m.useSocketForTests(1, socks[1]);
    m.useSocketForTests(2, socks[2]);
  });

  after(async () => {
    if (process.env.PRINT_TRANSCRIPT) console.log(`\n${transcript.join('\n')}\n`);
    const { pool } = await import('../src/config/db.js');
    await pool.end().catch(() => {});
    await sql?.end();
    if (db) await dropScratchDatabase(db.name);
  });

  const one = async (q, p) => (await sql.query(q, p)).rows[0];

  test('a new visitor creates a profile and registers a visit; the host is asked on WhatsApp', async () => {
    let r = await send(1, VISITOR, 'Hi');
    assert.match(r, /Welcome to Botho Innovations! 👋/);
    await send(1, VISITOR, 'Kabelo Molefe');
    await send(1, VISITOR, '1');
    await send(1, VISITOR, 'Orange Botswana');
    r = await send(1, VISITOR, 'kabelo@orange.co.bw');
    assert.match(r, /Profile created successfully/);
    assert.match(r, /1️⃣ Visitor Registration/);
    const visitor = await one(`SELECT * FROM whatsapp_visitor_management_visitors WHERE phone = $1`, [VISITOR]);
    assert.deepEqual([visitor.company_id, visitor.name, visitor.company, visitor.email, visitor.profile_type], [1, 'Kabelo Molefe', 'Orange Botswana', 'kabelo@orange.co.bw', 'organisation']);

    await send(1, VISITOR, '1');
    r = await send(1, VISITOR, 'John');
    assert.match(r, /I found \*John Smith\*\nDepartment: Human Resources\nOffice: Block A, 2nd floor/);
    await send(1, VISITOR, '1');
    await send(1, VISITOR, '1');
    await send(1, VISITOR, 'next monday');
    r = await send(1, VISITOR, '10am');
    assert.match(r, /Please confirm your visit/);
    r = await send(1, VISITOR, '1');
    assert.match(r, /sent to \*John Smith\* for approval\.\nReference: \*VMS-\d{4}-\d{6}\*/);

    const visit = await one(`SELECT * FROM whatsapp_visitor_management_visits WHERE company_id = 1 ORDER BY id DESC LIMIT 1`);
    assert.equal(visit.status, 'pending');
    assert.equal(visit.kind, 'visit');
    assert.equal(visit.purpose, 'Meeting');
    const hostMsgs = texts(inbox(1, HOST));
    assert.equal(hostMsgs.length, 1);
    assert.match(hostMsgs[0], /Hello John, you have a new visit request\.[\s\S]*Visitor: Kabelo Molefe[\s\S]*Reply 1 to approve or 2 to decline\./);
    assert.ok(visit.host_message_id, 'the request message id is stored for quoted replies');
  });

  test('the host approves by replying 1; the visitor gets the QR pass and a calendar invite', async () => {
    const r = await send(1, HOST, '1');
    assert.match(r, /Approved\. Kabelo Molefe will be told on WhatsApp/);
    const visit = await one(`SELECT * FROM whatsapp_visitor_management_visits WHERE company_id = 1 ORDER BY id DESC LIMIT 1`);
    assert.equal(visit.status, 'approved');
    assert.equal(visit.decided_by, 'John Smith');
    const toVisitor = inbox(1, VISITOR);
    assert.ok(toVisitor.some((x) => x.content.image && /Your visit has been approved/.test(x.content.caption)), 'QR image with the approval');
    assert.ok(toVisitor.some((x) => x.content.document && x.content.mimetype === 'text/calendar' && x.content.fileName.endsWith('.ics')), 'calendar invite');
    const ics = toVisitor.find((x) => x.content.document).content.document.toString();
    assert.match(ics, /BEGIN:VEVENT[\s\S]*SUMMARY:Visit with John Smith/);
  });

  test('the same phone talking to another company starts a separate profile and sees only that company', async () => {
    let r = await send(2, VISITOR, 'Hello');
    assert.match(r, /Welcome to Acme Holdings! 👋/);
    await send(2, VISITOR, 'Kabelo Molefe');
    await send(2, VISITOR, '2');
    await send(2, VISITOR, 'skip');
    r = await send(2, VISITOR, 'APPOINTMENT');
    assert.match(r, /don't have any upcoming visits/, 'Botho visits are not visible to Acme');
    r = await send(2, VISITOR, 'MENU');
    await send(2, VISITOR, '1');
    r = await send(2, VISITOR, 'John Smith');
    assert.doesNotMatch(r, /I found \*John Smith\*/, "Botho's host is not in Acme's directory");
    assert.equal(socks[1].sent.filter((s) => s.jid.startsWith(VISITOR)).length, cursor[`1|${VISITOR}`], 'nothing was sent from Botho’s number');
    await send(2, VISITOR, 'CANCEL');
  });

  test('APPOINTMENT and STATUS show the visit; an appointment can be booked', async () => {
    let r = await send(1, VISITOR, 'STATUS');
    assert.match(r, /Visit with John Smith.*\*Confirmed\*/);
    r = await send(1, VISITOR, 'MENU');
    await send(1, VISITOR, '2');
    r = await send(1, VISITOR, 'IT Support');
    assert.match(r, /I found \*Thabo Kgosi\*/);
    await send(1, VISITOR, 'yes');
    await send(1, VISITOR, 'Fibre for our new branch');
    await send(1, VISITOR, '4');
    await send(1, VISITOR, 'next tuesday');
    await send(1, VISITOR, '14:00');
    r = await send(1, VISITOR, '1');
    assert.match(r, /appointment request has been sent to \*Thabo Kgosi\*/);
    const appt = await one(`SELECT * FROM whatsapp_visitor_management_visits WHERE company_id = 1 AND kind = 'appointment'`);
    assert.equal(appt.appointment_type, 'sales');
    assert.equal(appt.topic, 'Fibre for our new branch');
    r = await send(1, VISITOR, 'APPOINTMENT');
    assert.match(r, /1️⃣ Visit · John Smith[\s\S]*2️⃣ Appointment · Thabo Kgosi/);
    await send(1, VISITOR, '2');
    await send(1, VISITOR, '2');
    r = await send(1, VISITOR, '1');
    assert.match(r, /has been cancelled/);
    assert.equal((await one(`SELECT status FROM whatsapp_visitor_management_visits WHERE id = $1`, [appt.id])).status, 'cancelled');
  });

  test('service request with an attachment, and feedback / complaint are stored', async () => {
    await send(1, VISITOR, 'MENU');
    await send(1, VISITOR, '4');
    await send(1, VISITOR, '1');
    await send(1, VISITOR, 'Projector in boardroom 2 is broken');
    await send(1, VISITOR, '3');
    await send(1, VISITOR, '1');
    const photo = { kind: 'image', mime: 'image/jpeg', fileName: 'projector.jpg', download: async () => Buffer.from('fake-jpeg') };
    let r = await send(1, VISITOR, '', { media: photo });
    assert.match(r, /File attached/);
    r = await send(1, VISITOR, '1');
    assert.match(r, /Ticket number: \*SR-\d{6}\*/);
    const ticket = await one(`SELECT * FROM whatsapp_visitor_management_service_requests WHERE company_id = 1`);
    assert.deepEqual([ticket.category, ticket.priority, ticket.status], ['it_support', 'high', 'open']);
    const doc = await one(`SELECT kind, size_bytes, service_request_id FROM whatsapp_visitor_management_visitor_documents WHERE company_id = 1`);
    assert.deepEqual(doc, { kind: 'attachment', size_bytes: 9, service_request_id: ticket.id });

    await send(1, VISITOR, 'MENU');
    await send(1, VISITOR, '3');
    await send(1, VISITOR, '6');
    await send(1, VISITOR, 'Nobody answered the phone at reception');
    r = await send(1, VISITOR, '1');
    assert.match(r, /Reference: \*CMP-\d{6}\*\nA staff member will contact you shortly/);
    const complaint = await one(`SELECT * FROM whatsapp_visitor_management_feedback WHERE company_id = 1 AND is_complaint`);
    assert.equal(complaint.contact_requested, true);
    const audit = await one(`SELECT * FROM whatsapp_visitor_management_audit_log WHERE company_id = 1 AND action = 'Complaint escalated'`);
    assert.ok(audit);
  });

  test('staff update the ticket and the visitor is told', async () => {
    const ticket = await one(`SELECT id FROM whatsapp_visitor_management_service_requests WHERE company_id = 1`);
    const { notifyServiceUpdate } = await import('../src/whatsapp/notify.js');
    await m.runWithTenant(1, async () => {
      const row = await m.models.ServiceRequest.update(ticket.id, { status: 'in_progress', staff_note: 'Technician on the way' });
      await notifyServiceUpdate(row, 'In progress', 'E a dirwa');
    });
    const msg = texts(inbox(1, VISITOR)).join('\n');
    assert.match(msg, /Update on your service request \*SR-\d{6}\*:\nStatus: \*In progress\*\nNote: Technician on the way/);
  });

  test('human handover: department, reference, the assistant stays quiet, staff close it', async () => {
    let r = await send(1, VISITOR, 'HUMAN');
    assert.match(r, /Which team would you like to talk to\?/);
    r = await send(1, VISITOR, '2');
    assert.match(r, /connected to \*Sales\*\.\nReference: \*HO-\d{6}\*/);
    r = await send(1, VISITOR, 'I need a quote for 50 users');
    assert.match(r, /passed to our team/);
    r = await send(1, VISITOR, 'hello?');
    assert.equal(r, '', 'quiet while staff handle the chat');
    const open = await one(`SELECT * FROM whatsapp_visitor_management_handovers WHERE company_id = 1 AND status = 'open'`);
    assert.equal(open.department, 'Sales');
    const { endHandoverFromPanel } = await import('../src/whatsapp/flowAgent.js');
    await m.runWithTenant(1, () => endHandoverFromPanel(VISITOR, 'Reception Staff'));
    assert.match(texts(inbox(1, VISITOR)).join('\n'), /Our team has closed this conversation/);
    r = await send(1, VISITOR, '5');
    assert.match(r, /What would you like to know\?/);
    r = await send(1, VISITOR, 'What are your opening hours?');
    assert.match(r, /Our opening hours:\nMon–Fri: 08:00 – 17:00/);
  });

  test('gate check-in welcomes the visitor and alerts the host; check-out offers feedback', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Gaborone' }).format(new Date());
    const visit = await one(`SELECT * FROM whatsapp_visitor_management_visits WHERE company_id = 1 AND kind = 'visit' AND status = 'approved'`);
    await sql.query(`UPDATE whatsapp_visitor_management_visits SET visit_date = $2 WHERE id = $1`, [visit.id, today]);
    inbox(1, HOST);
    const result = await m.runWithTenant(1, () => m.validatePass({ pin: visit.pin, actor: 'Gate' }));
    assert.equal(result.ok, true);
    assert.equal(result.hostNotified, true);
    assert.match(texts(inbox(1, HOST)).join('\n'), /Your visitor has arrived\.\nVisitor: Kabelo Molefe/);
    assert.match(texts(inbox(1, VISITOR)).join('\n'), /✅ Welcome to Botho Innovations, Kabelo! You are checked in\. John Smith has been told you have arrived\./);

    await m.runWithTenant(1, () => m.checkOutVisit({ visitId: visit.id, actor: 'Gate' }));
    assert.match(texts(inbox(1, VISITOR)).join('\n'), /Would you like to give feedback on your visit\?\n1️⃣ Yes\n2️⃣ No/);
    let r = await send(1, VISITOR, '1');
    assert.match(r, /Please share your feedback/);
    await send(1, VISITOR, 'Smooth and quick, thank you');
    r = await send(1, VISITOR, '5');
    assert.match(r, /Thank you for your feedback!\nReference: \*FB-\d{6}\*/);
    const fb = await one(`SELECT * FROM whatsapp_visitor_management_feedback WHERE company_id = 1 AND topic = 'visit'`);
    assert.deepEqual([fb.rating, fb.visit_id], [5, visit.id]);
  });

  test('a reminder goes out 1 hour before an approved visit, once', async (t) => {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Gaborone', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const [h, min] = fmt.format(new Date()).split(':').map(Number);
    const later = h * 60 + min + 30;
    if (later >= 24 * 60) return t.skip('too close to midnight in Gaborone');
    const time = `${String(Math.floor(later / 60)).padStart(2, '0')}:${String(later % 60).padStart(2, '0')}`;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Gaborone' }).format(new Date());
    const visitor = await one(`SELECT id FROM whatsapp_visitor_management_visitors WHERE company_id = 1 AND phone = $1`, [VISITOR]);
    await sql.query(
      `INSERT INTO whatsapp_visitor_management_visits (company_id, ref_number, visitor_id, host_id, purpose, visit_date, visit_time, status, visitor_phone, kind)
       VALUES (1, 'VMS-2026-999999', $1, (SELECT id FROM whatsapp_visitor_management_hosts WHERE name = 'Thabo Kgosi'), 'Meeting', $2, $3, 'approved', $4, 'appointment')`,
      [visitor.id, today, time, VISITOR]
    );
    inbox(1, VISITOR);
    assert.ok((await m.sendDueReminders()) >= 1);
    assert.match(texts(inbox(1, VISITOR)).join('\n'), /⏰ Reminder: your appointment with Thabo Kgosi is today at/);
    await m.sendDueReminders();
    assert.equal(inbox(1, VISITOR).length, 0, 'not reminded twice');
  });

  test('a suspended company’s number does not answer; reactivated, it answers again', async () => {
    const handlers = {};
    const sock = socks[2];
    sock.ev = { on: (event, fn) => (handlers[event] = fn) };
    m.attachMessageHandler(sock, { companyId: 2 });
    const deliver = async (text) => {
      msgId += 1;
      await handlers['messages.upsert']({
        type: 'notify',
        messages: [{ key: { remoteJid: `${VISITOR}@s.whatsapp.net`, id: `IN-${msgId}`, fromMe: false }, message: { conversation: text }, messageTimestamp: Math.floor(Date.now() / 1000) }],
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
    };
    inbox(2, VISITOR);
    await sql.query(`UPDATE whatsapp_visitor_management_companies SET status = 'suspended' WHERE id = 2`);
    await deliver('Hi');
    assert.equal(inbox(2, VISITOR).length, 0);
    await sql.query(`UPDATE whatsapp_visitor_management_companies SET status = 'active' WHERE id = 2`);
    await deliver('Hi');
    assert.match(texts(inbox(2, VISITOR)).join(' '), /Welcome back, Kabelo!/);
  });
});
