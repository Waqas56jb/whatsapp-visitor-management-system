// Host approve/decline by WhatsApp reply: every routing branch of the decision handler, with
// in-memory data access, plus how the sender's phone number is read from a WhatsApp message.
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

// Nothing here may reach a real database: the modules are loaded with an address that goes nowhere.
process.env.DATABASE_URL = 'postgresql://nobody:nothing@127.0.0.1:9/none';
const { createHostDecisionHandler, parseDecision } = await import('../src/whatsapp/hostDecisions.js');
const { quotedMessageId, senderPhone } = await import('../src/whatsapp/inbound.js');

const HOSTS = [
  { id: 1, name: 'Kabo Majube', phone: '26771000101', status: 'active' },
  { id: 2, name: 'Micha Ntsima', phone: '26771000102', status: 'active' },
  { id: 3, name: 'Old Host', phone: '26771000103', status: 'blocked' },
];
const KABO = '26771000101';
const MICHA = '26771000102';

let visits;
let decisions;
let replies;
let waiting;
let raceLost;

function visit(id, hostId, extra = {}) {
  return {
    id,
    host_id: hostId,
    ref_number: `VMS-2026-00000${id}`,
    visitor_name: `Visitor ${id}`,
    visit_date: '2026-10-02',
    visit_time: '10:00',
    status: 'pending',
    host_message_id: `MSG-${id}`,
    ...extra,
  };
}

function handler() {
  return createHostDecisionHandler({
    findHostByPhone: async (phone) => HOSTS.find((h) => h.phone === phone) || null,
    findVisitByHostMessageId: async (id) => visits.find((v) => v.host_message_id === id) || null,
    findVisitByRef: async (ref) => visits.find((v) => v.ref_number === ref) || null,
    findVisitById: async (id) => visits.find((v) => v.id === id) || null,
    listPendingForHost: async (hostId) => visits.filter((v) => v.host_id === hostId && v.status === 'pending'),
    bookingWaiting: async (phone) => waiting.has(phone),
    decide: async ({ visitId, decision, actorHostId, via }) => {
      const v = visits.find((x) => x.id === visitId);
      if (raceLost) {
        v.status = 'approved';
        return { visit: v, alreadyDecided: true };
      }
      decisions.push({ visitId, decision, actorHostId, via });
      v.status = decision;
      return { visit: v, alreadyDecided: false };
    },
  });
}

async function send(h, phone, text, quotedId = null) {
  const out = [];
  const handled = await h({ phone, text, quotedId, reply: async (m) => out.push(m) });
  replies.push(...out);
  return { handled, out };
}

beforeEach(() => {
  visits = [];
  decisions = [];
  replies = [];
  waiting = new Set();
  raceLost = false;
});

describe('reading a decision', () => {
  test('words, numbers, references, list picks and Setswana', () => {
    assert.deepEqual(parseDecision('1'), { decision: 'approved', explicit: false, ref: null });
    assert.deepEqual(parseDecision('Decline'), { decision: 'rejected', explicit: true, ref: null });
    assert.deepEqual(parseDecision('approve VMS-2026-123456'), { decision: 'approved', explicit: true, ref: 'VMS-2026-123456' });
    assert.deepEqual(parseDecision('2 vms-2026-123456'), { decision: 'rejected', explicit: false, ref: 'VMS-2026-123456' });
    assert.deepEqual(parseDecision('approve 2'), { decision: 'approved', explicit: true, index: 2 });
    assert.equal(parseDecision('ke a amogela').decision, 'approved');
    assert.equal(parseDecision('nnyaa').decision, 'rejected');
    for (const text of ['hello', 'VMS-2026-123456', 'yes please book Hamza', 'dumela', '1 2']) assert.equal(parseDecision(text), null, text);
  });
});

describe('a. reply quoting a request notification', () => {
  test('applies to the quoted visit, even when the host has several pending', async () => {
    visits = [visit(1, 1), visit(2, 1)];
    const { handled, out } = await send(handler(), KABO, '1', 'MSG-2');
    assert.equal(handled, true);
    assert.deepEqual(decisions, [{ visitId: 2, decision: 'approved', actorHostId: 1, via: 'whatsapp' }]);
    assert.match(out[0], /^Approved\. Visitor 2 will be told on WhatsApp\.\nFriday, 2 October 2026 at 10:00 AM · VMS-2026-000002$/);
  });

  test('wins over the host’s own booking step', async () => {
    visits = [visit(1, 1)];
    waiting.add(KABO);
    assert.equal((await send(handler(), KABO, '2', 'MSG-1')).handled, true);
    assert.equal(decisions[0].decision, 'rejected');
  });

  test('a quote without a decision gets the 1 / 2 hint', async () => {
    visits = [visit(1, 1)];
    const { out } = await send(handler(), KABO, 'who is this?', 'MSG-1');
    assert.equal(out[0], 'To decide this request, reply 1 to approve or 2 to decline.');
    assert.equal(decisions.length, 0);
  });
});

describe('b. reference in the message', () => {
  test('"approve VMS-…" and "2 VMS-…" apply to that visit', async () => {
    visits = [visit(1, 1), visit(2, 1)];
    const h = handler();
    await send(h, KABO, 'approve VMS-2026-000001');
    await send(h, KABO, '2 VMS-2026-000002');
    assert.deepEqual(decisions.map((d) => [d.visitId, d.decision]), [[1, 'approved'], [2, 'rejected']]);
  });

  test('an unknown reference is reported', async () => {
    const { out } = await send(handler(), KABO, 'approve VMS-2026-999999');
    assert.equal(out[0], "I couldn't find a visit with reference VMS-2026-999999.");
  });
});

describe('c. exactly one pending request', () => {
  test('a bare 1 / approve / yes / Setswana approves it', async () => {
    for (const text of ['1', 'approve', 'yes', 'ee']) {
      visits = [visit(1, 1)];
      decisions = [];
      await send(handler(), KABO, text);
      assert.deepEqual(decisions.map((d) => d.decision), ['approved'], text);
    }
  });

  test('a bare 2 / decline / no / nnyaa declines it, with a Setswana reply to Setswana', async () => {
    for (const text of ['2', 'decline', 'no', 'nnyaa', 'gana']) {
      visits = [visit(1, 1)];
      decisions = [];
      const { out } = await send(handler(), KABO, text);
      assert.deepEqual(decisions.map((d) => d.decision), ['rejected'], text);
      if (['nnyaa', 'gana'].includes(text)) assert.match(out[0], /^E ganetswe\. Visitor 1 o tla itsisiwe mo WhatsApp\./);
    }
  });
});

describe('d. several pending requests', () => {
  test('a bare decision gets a numbered list; "approve 2" then decides the second', async () => {
    visits = [visit(1, 1, { visit_time: '09:00' }), visit(2, 1, { visit_time: '11:30' })];
    const h = handler();
    const listed = await send(h, KABO, 'approve');
    assert.equal(decisions.length, 0);
    assert.equal(
      listed.out[0],
      'You have 2 visit requests waiting:\n' +
        '1. Visitor 1 — Friday, 2 October 2026, 9:00 AM — VMS-2026-000001\n' +
        '2. Visitor 2 — Friday, 2 October 2026, 11:30 AM — VMS-2026-000002\n\n' +
        'Reply to a request message with 1 or 2, or send for example "approve 2" or "decline 1".'
    );
    await send(h, KABO, 'approve 2');
    assert.deepEqual(decisions.map((d) => [d.visitId, d.decision]), [[2, 'approved']]);
  });

  test('a number outside the list asks again', async () => {
    visits = [visit(1, 1), visit(2, 1)];
    const h = handler();
    await send(h, KABO, '1');
    const { out } = await send(h, KABO, 'decline 5');
    assert.equal(out[0], 'Please choose a number from the list, for example "approve 1".');
    assert.equal(decisions.length, 0);
  });
});

describe('the host’s own booking', () => {
  test('while their booking waits for an answer, a bare 1 / yes belongs to the booking', async () => {
    visits = [visit(1, 1)];
    waiting.add(KABO);
    for (const text of ['1', '2', 'yes', 'no']) assert.equal((await send(handler(), KABO, text)).handled, false, text);
    assert.equal(decisions.length, 0);
  });

  test('a reference or an explicit "approve" still decides', async () => {
    visits = [visit(1, 1), visit(2, 1)];
    waiting.add(KABO);
    const h = handler();
    await send(h, KABO, '1 VMS-2026-000001');
    assert.equal(decisions.length, 1);
    visits = [visit(3, 1)];
    await send(h, KABO, 'decline');
    assert.deepEqual(decisions.map((d) => d.visitId), [1, 3]);
  });
});

describe('nothing to decide', () => {
  test('"approve" with no pending requests gets "nothing waiting"', async () => {
    const { handled, out } = await send(handler(), KABO, 'approve');
    assert.equal(handled, true);
    assert.equal(out[0], 'You have no visit requests waiting for approval.');
  });

  test('a bare 1 / yes with nothing pending, and ordinary messages, go to the visitor flow', async () => {
    for (const text of ['1', 'yes', 'Hi', 'I want to book a visit', 'VMS-2026-000001']) {
      assert.equal((await send(handler(), KABO, text)).handled, false, text);
    }
  });

  test('a decision for a visit that is no longer pending states its status and changes nothing', async () => {
    visits = [visit(1, 1, { status: 'approved' }), visit(2, 1, { status: 'cancelled' }), visit(3, 1, { status: 'used' })];
    const h = handler();
    assert.equal((await send(h, KABO, '2', 'MSG-1')).out[0], 'Visit VMS-2026-000001 for Visitor 1 is already approved. Nothing was changed.');
    assert.match((await send(h, KABO, 'approve VMS-2026-000002')).out[0], /is already cancelled\./);
    assert.match((await send(h, KABO, '1', 'MSG-3')).out[0], /is already checked in\./);
    assert.equal(decisions.length, 0);
  });
});

describe('who may decide', () => {
  test('a decision from a number that is not a host is ignored (visitor flow)', async () => {
    visits = [visit(1, 1)];
    for (const [text, quote] of [['1', null], ['approve VMS-2026-000001', null], ['1', 'MSG-1']]) {
      assert.equal((await send(handler(), '26779999999', text, quote)).handled, false);
    }
    assert.equal(decisions.length, 0);
  });

  test('a decision from the wrong host is refused, by reference or by quoting', async () => {
    visits = [visit(1, 1)];
    const h = handler();
    assert.equal((await send(h, MICHA, 'approve VMS-2026-000001')).out[0], 'Visit VMS-2026-000001 is not one of your requests, so nothing was changed.');
    assert.equal((await send(h, MICHA, '1', 'MSG-1')).out[0], 'Visit VMS-2026-000001 is not one of your requests, so nothing was changed.');
    assert.equal(decisions.length, 0);
    assert.equal(visits[0].status, 'pending');
  });

  test('a blocked host, or a sender whose phone could not be resolved (LID), is not treated as a host', async () => {
    visits = [visit(1, 3)];
    assert.equal((await send(handler(), '26771000103', 'approve VMS-2026-000001')).handled, false);
    assert.equal((await send(handler(), null, 'approve VMS-2026-000001')).handled, false);
    assert.equal(decisions.length, 0);
  });

  test('when the admin decided a moment earlier, the host is told the result and nothing changes', async () => {
    visits = [visit(1, 1)];
    raceLost = true;
    const { out } = await send(handler(), KABO, '1');
    assert.equal(out[0], 'Visit VMS-2026-000001 for Visitor 1 is already approved. Nothing was changed.');
  });
});

describe('reading the sender and the quoted message from WhatsApp', () => {
  test('a phone-number sender, a LID with the phone number attached, a LID resolved by the store, and an unresolvable LID', async () => {
    assert.equal(await senderPhone({ key: { remoteJid: '26771000101@s.whatsapp.net' } }), '26771000101');
    assert.equal(await senderPhone({ key: { remoteJid: '1234567890@lid', remoteJidAlt: '26771000101@s.whatsapp.net' } }), '26771000101');
    const sock = { signalRepository: { lidMapping: { getPNForLID: async (lid) => (lid === '555@lid' ? '26771000102:0@s.whatsapp.net' : null) } } };
    assert.equal(await senderPhone({ key: { remoteJid: '555@lid' } }, sock), '26771000102');
    assert.equal(await senderPhone({ key: { remoteJid: '999@lid' } }, sock), null);
    assert.equal(await senderPhone({ key: { remoteJid: '999@lid' } }), null);
  });

  test('the id of a quoted message', () => {
    const msg = { message: { extendedTextMessage: { text: '1', contextInfo: { stanzaId: 'ABC123' } } } };
    assert.equal(quotedMessageId(msg), 'ABC123');
    assert.equal(quotedMessageId({ message: { conversation: '1' } }), null);
  });
});
