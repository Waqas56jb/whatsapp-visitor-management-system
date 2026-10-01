// The shared decision and gate services, with in-memory data and a recording WhatsApp sender:
// a host and an admin deciding at the same moment, panel decisions telling the host, the new
// request notification, and the arrival alert (including when it cannot be sent).
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { beforeEach, describe, test } from 'node:test';

process.env.DATABASE_URL = 'postgresql://nobody:nothing@127.0.0.1:9/none';
process.env.ORG_TIMEZONE = 'Africa/Gaborone';
register('./helpers/flowHooks.js', import.meta.url);

const { db } = await import('./helpers/flowModels.js');
const { controls, sent } = await import('./helpers/flowSend.js');
const { decideVisit, validatePass } = await import('../src/services/visits.js');
const { notifyHostNewVisit } = await import('../src/whatsapp/notify.js');

const HOST_PHONE = '26771000101';
const VISITOR_PHONE = '26770000200';

function addVisit(extra = {}) {
  const v = {
    id: db.visits.length + 1,
    ref_number: `VMS-2026-10000${db.visits.length + 1}`,
    host_id: 1,
    visitor_name: 'Lesedi Tau',
    visitor_company: 'Debswana',
    visitor_phone: VISITOR_PHONE,
    purpose: 'Supplier meeting',
    visit_date: '2099-10-02',
    visit_time: '10:00',
    visit_type: 'official',
    status: 'pending',
    qr_token: null,
    pin: null,
    used_at: null,
    ...extra,
  };
  db.visits.push(v);
  return v;
}

const toHost = () => sent.filter((m) => m.to === HOST_PHONE);
const toVisitor = () => sent.filter((m) => m.to === VISITOR_PHONE);

beforeEach(() => {
  db.visits.length = 0;
  db.audit.length = 0;
  db.hosts.length = 0;
  db.hosts.push({ id: 1, name: 'Kabo Majube', department: 'Technology Planning', phone: HOST_PHONE, status: 'active' });
  db.clock = null;
  sent.length = 0;
  controls.fail = false;
});

describe('the request notification to the host', () => {
  test('ends with the 1 / 2 instruction and remembers its WhatsApp message id', async () => {
    const v = addVisit();
    await notifyHostNewVisit({ ...v, host_name: 'Kabo Majube' });
    assert.match(toHost()[0].text, /\n\nReply 1 to approve or 2 to decline\.$/);
    assert.doesNotMatch(toHost()[0].text, /awaiting approval/);
    assert.equal(db.visits[0].host_message_id, toHost()[0].id);
  });
});

describe('deciding', () => {
  test('host (WhatsApp) and admin (panel) at the same moment: only the first applies', async () => {
    const v = addVisit();
    const [panel, whatsapp] = await Promise.all([
      decideVisit({ visitId: v.id, decision: 'approved', actor: 'Admin', via: 'panel' }),
      decideVisit({ visitId: v.id, decision: 'rejected', actor: 'Kabo Majube', actorHostId: 1, via: 'whatsapp' }),
    ]);
    // Exactly one wins (here whichever reaches the database first); the other sees its result.
    assert.deepEqual([panel.alreadyDecided, whatsapp.alreadyDecided].sort(), [false, true]);
    const winner = panel.alreadyDecided ? 'rejected' : 'approved';
    assert.equal(db.visits[0].status, winner);
    assert.equal((panel.alreadyDecided ? panel : whatsapp).visit.status, winner);
    assert.equal(db.audit.filter((a) => /visit$/.test(a.action)).length, 1);
    assert.equal(toVisitor().length, 1, 'the visitor is told once');
  });

  test('a WhatsApp decision generates the pass, tells the visitor, and the audit says it came from WhatsApp', async () => {
    const v = addVisit();
    const result = await decideVisit({ visitId: v.id, decision: 'approved', actor: 'Kabo Majube', actorHostId: 1, via: 'whatsapp' });
    assert.equal(result.alreadyDecided, false);
    assert.match(db.visits[0].qr_token, /^[a-f0-9]{64}$/);
    assert.match(db.visits[0].pin, /^\d{6}$/);
    assert.ok(db.visits[0].decided_at);
    assert.deepEqual(db.audit[0], { actor: 'Kabo Majube', action: 'Approved visit', details: 'VMS-2026-100001 — Lesedi Tau (by the host on WhatsApp)' });
    assert.equal(toVisitor()[0].image, true, 'the QR is sent as an image');
    assert.equal(toHost().length, 0, 'no "decided by an administrator" message for the host’s own decision');
  });

  test('a panel decision tells the host it was done by an administrator', async () => {
    const v = addVisit();
    await decideVisit({ visitId: v.id, decision: 'rejected', actor: 'Admin', via: 'panel' });
    assert.equal(toHost()[0].text, 'Visit VMS-2026-100001 for Lesedi Tau (Friday, 2 October 2099 at 10:00 AM) was declined by an administrator. No action is needed.');
    assert.match(toVisitor()[0].text, /was declined by the host/);
  });

  test('a visit that is no longer pending is not changed', async () => {
    const v = addVisit({ status: 'cancelled' });
    const result = await decideVisit({ visitId: v.id, decision: 'approved', actor: 'Admin', via: 'panel' });
    assert.equal(result.alreadyDecided, true);
    assert.equal(db.visits[0].status, 'cancelled');
    assert.equal(sent.length, 0);
  });
});

describe('arrival alert', () => {
  test('checking in tells the host, with the check-in time in the organisation’s time zone', async () => {
    const v = addVisit({ status: 'approved', qr_token: 'a'.repeat(64), pin: '123456' });
    db.clock = new Date('2099-10-02T08:05:00Z'); // 10:05 in Gaborone (UTC+2)
    const result = await validatePass({ pin: '123456', actor: 'Neo (gate)' });
    assert.equal(result.ok, true);
    assert.equal(result.hostNotified, true);
    assert.equal(
      toHost()[0].text,
      'Your visitor has arrived.\nVisitor: Lesedi Tau\nCompany: Debswana\nPurpose: Supplier meeting\nChecked in: 10:05'
    );
    assert.equal(db.visits[0].id, v.id);
    assert.deepEqual(db.audit.map((a) => a.action), ['Validated pass']);
  });

  test('if the alert cannot be sent, the check-in still succeeds and the failure is audited', async () => {
    addVisit({ status: 'approved', pin: '123456' });
    controls.fail = true;
    const result = await validatePass({ pin: '123456' });
    assert.equal(result.ok, true);
    assert.equal(result.hostNotified, false);
    assert.equal(db.visits[0].status, 'used');
    assert.deepEqual(db.audit[1], {
      actor: 'System',
      action: 'Arrival alert not sent',
      details: 'VMS-2026-100001 — Lesedi Tau → Kabo Majube: WhatsApp send failed',
    });
  });

  test('a host without a WhatsApp number: check-in succeeds, the reason is audited', async () => {
    db.hosts[0].phone = '';
    addVisit({ status: 'approved', pin: '123456' });
    const result = await validatePass({ pin: '123456' });
    assert.equal(result.ok, true);
    assert.match(db.audit[1].details, /host has no WhatsApp number$/);
  });

  test('two gates scanning the same pass at the same moment: one check-in, one alert', async () => {
    addVisit({ status: 'approved', pin: '123456' });
    const results = await Promise.all([validatePass({ pin: '123456' }), validatePass({ pin: '123456' })]);
    assert.deepEqual(results.map((r) => r.ok).sort(), [false, true]);
    assert.equal(results.find((r) => !r.ok).reason, 'already_used');
    assert.equal(toHost().length, 1);
  });
});
