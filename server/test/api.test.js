// The real API (Express app + PostgreSQL) on a scratch database: platform console, company
// isolation, roles and permissions, plan limits, suspension, impersonation, sessions.
// Skipped unless TEST_DATABASE_URL points at a throwaway PostgreSQL server.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { createScratchDatabase, dropScratchDatabase, migrate } from './helpers/testDb.js';

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe('API', { skip: !enabled && 'set TEST_DATABASE_URL to run' }, () => {
  let db;
  let server;
  let base;
  let sql;
  const ctx = {};

  async function call(method, path, { token, body } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, data: type.includes('json') ? await res.json() : await res.text(), headers: res.headers };
  }
  const expectStatus = async (status, method, path, opts) => {
    const r = await call(method, path, opts);
    assert.equal(r.status, status, `${method} ${path} → ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    return r.data;
  };
  const login = async (username, password) => (await expectStatus(200, 'POST', '/auth/admin/login', { body: { username, password } })).token;

  before(async () => {
    db = await createScratchDatabase('api');
    await migrate(db.url);
    Object.assign(process.env, { DATABASE_URL: db.url, DB_SSL: 'false', JWT_SECRET: 'api-test-secret', OPENAI_API_KEY: '', NODE_ENV: 'test' });
    sql = new pg.Client({ connectionString: db.url });
    await sql.connect();
    await sql.query(
      `INSERT INTO whatsapp_visitor_management_admins (username, password_hash, name, role, status) VALUES ('owner', $1, 'Platform Owner', 'super_admin', 'active')`,
      [await bcrypt.hash('OwnerPass#2026', 10)]
    );
    const { default: app } = await import('../src/app.js');
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
    ctx.sa = await login('owner', 'OwnerPass#2026');
  });

  after(async () => {
    server?.close();
    const { pool } = await import('../src/config/db.js');
    await pool.end().catch(() => {});
    await sql?.end();
    if (db) await dropScratchDatabase(db.name);
  });

  test('the super admin works at platform level and never sees daily operations', async () => {
    const me = await expectStatus(200, 'GET', '/auth/me', { token: ctx.sa });
    assert.equal(me.scope, 'platform');
    assert.equal(me.company, null);
    for (const path of ['/visits', '/visitors', '/conversations', '/hosts', '/feedback', '/service-requests', '/dashboard']) {
      await expectStatus(403, 'GET', path, { token: ctx.sa });
    }
    const overview = await expectStatus(200, 'GET', '/platform/overview', { token: ctx.sa });
    assert.equal(overview.counts.companies, 1);
    assert.equal(overview.currency, 'BWP');
  });

  test('creating a company appoints its company admin with a one-time password', async () => {
    const a = await expectStatus(201, 'POST', '/platform/companies', {
      token: ctx.sa,
      body: { name: 'Acme Holdings', registrationNumber: 'BW00012345', domain: 'https://acme.co.bw/', plan: 'business', admin: { name: 'Alice Admin', username: 'alice.acme', email: 'alice@acme.co.bw' } },
    });
    assert.equal(a.company.domain, 'acme.co.bw');
    assert.match(a.password, /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]+$/);
    const b = await expectStatus(201, 'POST', '/platform/companies', { token: ctx.sa, body: { name: 'Beta Ltd', plan: 'starter', admin: { name: 'Bob', username: 'bob.beta' } } });
    await expectStatus(409, 'POST', '/platform/companies', { token: ctx.sa, body: { name: 'acme holdings', admin: { name: 'X', username: 'xx1' } } });
    await expectStatus(409, 'POST', '/platform/companies', { token: ctx.sa, body: { name: 'Gamma', admin: { name: 'X', username: 'alice.acme' } } });
    const list = await expectStatus(200, 'GET', '/platform/companies', { token: ctx.sa });
    assert.deepEqual(list.map((c) => c.name), ['Botho Innovations', 'Acme Holdings', 'Beta Ltd']);
    assert.ok(!list.some((c) => c.name === 'Gamma'), 'a failed admin creation leaves no company behind');
    Object.assign(ctx, { a, b, alice: await login('alice.acme', a.password), bob: await login('bob.beta', b.password) });
    const me = await expectStatus(200, 'GET', '/auth/me', { token: ctx.alice });
    assert.equal(me.role, 'company_admin');
    assert.equal(me.company.name, 'Acme Holdings');
    assert.equal(me.company.features.service_requests, true);
    assert.equal(me.company.features.white_label, false);
    await expectStatus(403, 'GET', '/platform/companies', { token: ctx.alice });
  });

  test('companies never see each other’s data', async () => {
    ctx.hostA = await expectStatus(201, 'POST', '/hosts', { token: ctx.alice, body: { name: 'John Smith', department: 'Human Resources', phone: '26771111111', office: 'Block A' } });
    await expectStatus(201, 'POST', '/hosts', { token: ctx.bob, body: { name: 'Mary Jones', department: 'Finance' } });
    assert.deepEqual((await expectStatus(200, 'GET', '/hosts', { token: ctx.alice })).map((h) => h.name), ['John Smith']);
    assert.deepEqual((await expectStatus(200, 'GET', '/hosts', { token: ctx.bob })).map((h) => h.name), ['Mary Jones']);
    await expectStatus(404, 'PATCH', `/hosts/${ctx.hostA.id}`, { token: ctx.bob, body: { name: 'Hacked' } });
    await expectStatus(404, 'DELETE', `/hosts/${ctx.hostA.id}`, { token: ctx.bob, body: { confirm: true } });

    ctx.visit = await expectStatus(201, 'POST', '/visits', {
      token: ctx.alice,
      body: { name: 'Kabelo Molefe', company: 'Orange', host_id: ctx.hostA.id, purpose: 'Meeting', date: '2030-01-07', time: '10:00', phone: '26772222222' },
    });
    await expectStatus(400, 'POST', '/visits', { token: ctx.bob, body: { name: 'X', host_id: ctx.hostA.id, date: '2030-01-07' } });
    await expectStatus(404, 'GET', `/visits/${ctx.visit.id}`, { token: ctx.bob });
    await expectStatus(404, 'PATCH', `/visits/${ctx.visit.id}/approve`, { token: ctx.bob });
    assert.equal((await expectStatus(200, 'GET', '/visits', { token: ctx.bob })).length, 0);
    assert.equal((await expectStatus(200, 'GET', '/visitors', { token: ctx.bob })).length, 0);

    const approved = await expectStatus(200, 'PATCH', `/visits/${ctx.visit.id}/approve`, { token: ctx.alice });
    assert.equal(approved.status, 'approved');
    assert.match(approved.pin, /^\d{6}$/);
    ctx.approved = approved;
    await expectStatus(404, 'POST', '/passes/validate', { token: ctx.bob, body: { pin: approved.pin } });
    await expectStatus(404, 'GET', `/passes/info?pin=${approved.pin}`, { token: ctx.bob });
  });

  test('the public pass page shows the company’s branding, only by the full token', async () => {
    const pass = await expectStatus(200, 'GET', `/passes/info/${ctx.approved.qrToken}`);
    assert.equal(pass.organisation.name, 'Acme Holdings');
    assert.equal(pass.ref, ctx.approved.ref);
    await expectStatus(404, 'GET', `/passes/info/${ctx.approved.qrToken.slice(0, 40)}`);
  });

  test('company roles: security only uses the gate, HR only manages hosts', async () => {
    const guard = await expectStatus(201, 'POST', '/staff', { token: ctx.alice, body: { name: 'Gate Guard', username: 'guard.acme', role: 'company_security' } });
    const hr = await expectStatus(201, 'POST', '/staff', { token: ctx.alice, body: { name: 'HR Person', username: 'hr.acme', role: 'company_hr' } });
    const manager = await expectStatus(201, 'POST', '/staff', { token: ctx.alice, body: { name: 'Ops Manager', username: 'ops.acme', role: 'company_manager' } });
    ctx.guard = await login('guard.acme', guard.password);
    ctx.hr = await login('hr.acme', hr.password);
    ctx.manager = await login('ops.acme', manager.password);
    ctx.guardId = guard.login.id;

    for (const path of ['/hosts', '/visits', '/visitors', '/settings', '/staff', '/reports/summary', '/audit']) await expectStatus(403, 'GET', path, { token: ctx.guard });
    await expectStatus(200, 'GET', '/visits/today', { token: ctx.guard });
    await expectStatus(200, 'GET', '/gate/traffic', { token: ctx.guard });

    await expectStatus(201, 'POST', '/hosts', { token: ctx.hr, body: { name: 'New Host', department: 'IT' } });
    for (const path of ['/visits', '/staff', '/settings', '/gate/traffic']) await expectStatus(403, 'GET', path, { token: ctx.hr });

    await expectStatus(200, 'GET', '/visits', { token: ctx.manager });
    await expectStatus(200, 'GET', '/reports/summary', { token: ctx.manager });
    await expectStatus(403, 'GET', '/staff', { token: ctx.manager });
    await expectStatus(403, 'PUT', '/settings', { token: ctx.manager, body: {} });

    const staff = await expectStatus(200, 'GET', '/staff', { token: ctx.alice });
    assert.deepEqual(staff.roles.map((r) => r.key), ['company_admin', 'company_manager', 'company_hr', 'company_security']);
    await expectStatus(400, 'POST', '/staff', { token: ctx.alice, body: { name: 'X', username: 'x.acme', role: 'super_admin' } });
  });

  test('gate: a pass is only valid on its visit day; flagged visits; check-out', async () => {
    const r = await call('POST', '/passes/validate', { token: ctx.guard, body: { pin: ctx.approved.pin } });
    assert.equal(r.status, 400);
    assert.equal(r.data.reason, 'not_today');

    // A visit for today, approved and checked in, then checked out.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Gaborone' }).format(new Date());
    const v = await expectStatus(201, 'POST', '/visits', { token: ctx.alice, body: { name: 'Neo Dube', host_id: ctx.hostA.id, purpose: 'Delivery', date: today, time: '23:30', phone: '26773333333' } });
    await expectStatus(200, 'PATCH', `/visits/${v.id}/flag`, { token: ctx.alice, body: { flagged: true, reason: 'Check ID' } });
    const ok = await expectStatus(200, 'PATCH', `/visits/${v.id}/approve`, { token: ctx.alice });
    const lookup = await expectStatus(200, 'GET', `/passes/info?pin=${ok.pin}`, { token: ctx.guard });
    assert.equal(lookup.flagged, true);
    const checkIn = await expectStatus(200, 'POST', '/passes/validate', { token: ctx.guard, body: { pin: ok.pin } });
    assert.equal(checkIn.ok, true);
    assert.equal(checkIn.visit.flagged, true);
    const again = await call('POST', '/passes/validate', { token: ctx.guard, body: { pin: ok.pin } });
    assert.equal(again.data.reason, 'already_used');
    let traffic = await expectStatus(200, 'GET', '/gate/traffic', { token: ctx.guard });
    assert.equal(traffic.onSite.length, 1);
    assert.equal(traffic.onSite[0].pin, undefined, 'gate lists never carry the PIN');
    await expectStatus(200, 'POST', `/visits/${v.id}/checkout`, { token: ctx.guard });
    await expectStatus(400, 'POST', `/visits/${v.id}/checkout`, { token: ctx.guard });
    traffic = await expectStatus(200, 'GET', '/gate/traffic', { token: ctx.guard });
    assert.equal(traffic.onSite.length, 0);
    assert.deepEqual(traffic.events.map((e) => e.type), ['out', 'in']);
  });

  test('settings, branding and plan features', async () => {
    const saved = await expectStatus(200, 'PUT', '/settings', {
      token: ctx.alice,
      body: { address: 'Plot 123, CBD', hours: { sat: { open: '09:00', close: '13:00', closed: false } }, rules: { requireId: 'first_visit', requireNda: true } },
    });
    assert.equal(saved.settings.hours.sat.closed, false);
    assert.equal(saved.settings.hours.mon.open, '08:00');
    await expectStatus(400, 'PUT', '/settings', { token: ctx.alice, body: { hours: { mon: { open: '17:00', close: '08:00' } } } });
    await expectStatus(400, 'PUT', '/settings', { token: ctx.alice, body: { integrations: { slackWebhook: 'https://evil.example/hook' } } });
    await expectStatus(403, 'PUT', '/settings/branding', { token: ctx.alice, body: { primaryColor: '#123456' } });
    await expectStatus(403, 'PUT', '/settings', { token: ctx.alice, body: { templates: { welcome: { en: 'Hi', tn: '' } } } });
    // Upgrade to enterprise: white-labelling is unlocked.
    await expectStatus(200, 'PATCH', `/platform/companies/${ctx.a.company.id}/subscription`, { token: ctx.sa, body: { plan: 'enterprise' } });
    const branding = await expectStatus(200, 'PUT', '/settings/branding', { token: ctx.alice, body: { primaryColor: '#123456', displayName: 'Acme' } });
    assert.equal(branding.branding.primaryColor, '#123456');
    await expectStatus(400, 'PUT', '/settings/branding', { token: ctx.alice, body: { logo: 'data:text/html;base64,PHNjcmlwdD4=' } });
    const plan = await expectStatus(200, 'GET', '/plan', { token: ctx.alice });
    assert.equal(plan.plan.key, 'enterprise');
    assert.equal(plan.usage.hosts.used, 2);
  });

  test('reports: summary, CSV and PDF (PDF only on plans that include it)', async () => {
    const summary = await expectStatus(200, 'GET', '/reports/summary?from=2026-01-01&to=2030-12-31', { token: ctx.alice });
    assert.ok(summary.totals.visits >= 2);
    assert.equal(summary.byHour.length, 24);
    const csv = await call('GET', '/reports/export?type=visits&from=2026-01-01&to=2030-12-31', { token: ctx.alice });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(csv.data, /Kabelo Molefe/);
    const pdf = await call('GET', '/reports/pdf?from=2026-01-01&to=2030-12-31', { token: ctx.alice });
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-type'), /application\/pdf/);
    await expectStatus(403, 'GET', '/reports/pdf', { token: ctx.bob });
  });

  test('plan limits and per-company overrides', async () => {
    await expectStatus(200, 'PATCH', `/platform/companies/${ctx.b.company.id}/subscription`, {
      token: ctx.sa,
      body: { overrides: { features: { feedback: false }, limits: { hosts: 2 } } },
    });
    await expectStatus(201, 'POST', '/hosts', { token: ctx.bob, body: { name: 'Second', department: 'Ops' } });
    const refused = await call('POST', '/hosts', { token: ctx.bob, body: { name: 'Third', department: 'Ops' } });
    assert.equal(refused.status, 403);
    assert.equal(refused.data.code, 'limit_reached');
    const me = await expectStatus(200, 'GET', '/auth/me', { token: ctx.bob });
    assert.equal(me.company.features.feedback, false);
    assert.equal(me.company.limits.hosts, 2);
  });

  test('impersonation opens the company as its admin, audited on both sides', async () => {
    const imp = await expectStatus(200, 'POST', `/platform/companies/${ctx.a.company.id}/impersonate`, { token: ctx.sa });
    const me = await expectStatus(200, 'GET', '/auth/me', { token: imp.token });
    assert.equal(me.role, 'company_admin');
    assert.equal(me.company.name, 'Acme Holdings');
    assert.equal(me.impersonating.by, 'owner');
    await expectStatus(200, 'GET', '/visits', { token: imp.token });
    await expectStatus(400, 'POST', '/auth/admin/password', { token: imp.token, body: { currentPassword: 'x', newPassword: 'y' } });
    const companyAudit = await expectStatus(200, 'GET', '/audit', { token: ctx.alice });
    assert.ok(companyAudit.some((a) => a.action === 'Platform support signed in to this panel'));
    const platformAudit = await expectStatus(200, 'GET', '/platform/audit', { token: ctx.sa });
    assert.ok(platformAudit.some((a) => a.action === 'Started impersonation' && a.details.includes('Acme Holdings')));
    assert.ok(!platformAudit.some((a) => /Kabelo/.test(a.details)), 'company operations stay out of the platform audit');
  });

  test('suspension blocks the company’s users and reactivation restores them', async () => {
    await expectStatus(400, 'POST', `/platform/companies/${ctx.b.company.id}/status`, { token: ctx.sa, body: { status: 'suspended' } });
    await expectStatus(200, 'POST', `/platform/companies/${ctx.b.company.id}/status`, { token: ctx.sa, body: { status: 'suspended', reason: 'Unpaid invoice' } });
    const blocked = await call('GET', '/hosts', { token: ctx.bob });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.data.code, 'company_suspended');
    await expectStatus(403, 'POST', '/auth/admin/login', { body: { username: 'bob.beta', password: ctx.b.password } });
    await expectStatus(200, 'POST', `/platform/companies/${ctx.b.company.id}/status`, { token: ctx.sa, body: { status: 'active' } });
    await expectStatus(200, 'GET', '/hosts', { token: ctx.bob });
  });

  test('platform sub-admins: support and billing auditor see only their areas', async () => {
    const support = await expectStatus(201, 'POST', '/platform/team', { token: ctx.sa, body: { name: 'Support One', username: 'support1', role: 'platform_support' } });
    const billing = await expectStatus(201, 'POST', '/platform/team', { token: ctx.sa, body: { name: 'Billing One', username: 'billing1', role: 'platform_billing' } });
    const sup = await login('support1', support.password);
    const bill = await login('billing1', billing.password);
    await expectStatus(200, 'GET', '/platform/health', { token: sup });
    await expectStatus(200, 'POST', `/platform/companies/${ctx.a.company.id}/impersonate`, { token: sup });
    await expectStatus(403, 'GET', '/platform/metering', { token: sup });
    await expectStatus(403, 'POST', '/platform/companies', { token: sup, body: {} });
    await expectStatus(403, 'GET', '/platform/team', { token: sup });
    const metering = await expectStatus(200, 'GET', '/platform/metering', { token: bill });
    assert.ok(metering.rows.find((r) => r.name === 'Acme Holdings').storageBytes > 0);
    await expectStatus(403, 'GET', '/platform/health', { token: bill });
    await expectStatus(403, 'POST', `/platform/companies/${ctx.a.company.id}/impersonate`, { token: bill });
    await expectStatus(403, 'PATCH', `/platform/companies/${ctx.a.company.id}/subscription`, { token: bill, body: { plan: 'starter' } });
  });

  test('announcements appear as a banner for company users', async () => {
    await expectStatus(201, 'POST', '/platform/announcements', { token: ctx.sa, body: { title: 'Scheduled maintenance', body: 'Saturday 22:00', severity: 'warning' } });
    const me = await expectStatus(200, 'GET', '/auth/me', { token: ctx.alice });
    assert.deepEqual(me.announcements.map((a) => a.title), ['Scheduled maintenance']);
    const list = await expectStatus(200, 'GET', '/platform/announcements', { token: ctx.sa });
    await expectStatus(200, 'POST', `/platform/announcements/${list.items[0].id}/end`, { token: ctx.sa });
    assert.equal((await expectStatus(200, 'GET', '/auth/me', { token: ctx.alice })).announcements.length, 0);
  });

  test('sessions: password change ends other sessions; blocking and role changes apply at once', async () => {
    const second = await login('alice.acme', ctx.a.password);
    const changed = await expectStatus(200, 'POST', '/auth/admin/password', {
      token: ctx.alice,
      body: { currentPassword: ctx.a.password, newPassword: 'AliceNewPass#2026', confirmPassword: 'AliceNewPass#2026' },
    });
    await expectStatus(401, 'GET', '/auth/me', { token: second });
    ctx.alice = changed.token;
    await expectStatus(200, 'GET', '/auth/me', { token: ctx.alice });

    await expectStatus(200, 'PATCH', `/staff/${ctx.guardId}`, { token: ctx.alice, body: { role: 'company_manager' } });
    await expectStatus(200, 'GET', '/visits', { token: ctx.guard });
    await expectStatus(200, 'PATCH', `/staff/${ctx.guardId}`, { token: ctx.alice, body: { status: 'blocked' } });
    await expectStatus(401, 'GET', '/visits/today', { token: ctx.guard });
  });

  test('nobody locks themselves out; the last company admin and super admin are protected', async () => {
    const me = await expectStatus(200, 'GET', '/auth/me', { token: ctx.alice });
    const staff = (await expectStatus(200, 'GET', '/staff', { token: ctx.alice })).staff;
    const aliceId = staff.find((s) => s.username === 'alice.acme').id;
    assert.ok(me);
    await expectStatus(400, 'PATCH', `/staff/${aliceId}`, { token: ctx.alice, body: { status: 'blocked' } });
    await expectStatus(400, 'DELETE', `/staff/${aliceId}`, { token: ctx.alice, body: { confirm: true } });
    const team = await expectStatus(200, 'GET', '/platform/team', { token: ctx.sa });
    const ownerId = team.find((t) => t.username === 'owner').id;
    await expectStatus(400, 'PATCH', `/platform/team/${ownerId}/role`, { token: ctx.sa, body: { role: 'platform_support' } });
  });

  test('termination needs the typed name; deletion removes the company and its logins', async () => {
    await expectStatus(400, 'DELETE', `/platform/companies/${ctx.b.company.id}`, { token: ctx.sa, body: { confirmName: 'Beta Ltd' } });
    await expectStatus(400, 'POST', `/platform/companies/${ctx.b.company.id}/status`, { token: ctx.sa, body: { status: 'terminated', confirmName: 'beta' } });
    await expectStatus(200, 'POST', `/platform/companies/${ctx.b.company.id}/status`, { token: ctx.sa, body: { status: 'terminated', confirmName: 'Beta Ltd' } });
    await expectStatus(400, 'POST', `/platform/companies/${ctx.b.company.id}/status`, { token: ctx.sa, body: { status: 'active' } });
    const exported = await call('GET', `/platform/companies/${ctx.b.company.id}/export`, { token: ctx.sa });
    assert.equal(exported.status, 200);
    assert.doesNotMatch(JSON.stringify(exported.data), /password_hash/);
    assert.equal(exported.data.data.staff[0].username, "bob.beta");
    await expectStatus(200, 'DELETE', `/platform/companies/${ctx.b.company.id}`, { token: ctx.sa, body: { confirmName: 'Beta Ltd' } });
    await expectStatus(401, 'GET', '/hosts', { token: ctx.bob });
    await expectStatus(401, 'POST', '/auth/admin/login', { body: { username: 'bob.beta', password: ctx.b.password } });
  });

  test('platform settings: password policy applies to new passwords', async () => {
    await expectStatus(200, 'PUT', '/platform/settings', { token: ctx.sa, body: { passwordMinLength: 16 } });
    const r = await call('POST', '/staff', { token: ctx.alice, body: { name: 'Short', username: 'short.acme', role: 'company_hr', password: 'Short#2026abc' } });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /at least 16/);
    await expectStatus(200, 'PUT', '/platform/settings', { token: ctx.sa, body: { passwordMinLength: 10 } });
  });

  test('sign-in rate limit: the 11th attempt in 15 minutes for one username is refused', async () => {
    for (let i = 0; i < 10; i += 1) await expectStatus(401, 'POST', '/auth/admin/login', { body: { username: 'nobody', password: 'wrong' } });
    await expectStatus(429, 'POST', '/auth/admin/login', { body: { username: 'nobody', password: 'wrong' } });
    await expectStatus(401, 'POST', '/auth/admin/login', { body: { username: 'someone-else', password: 'wrong' } });
  });
});
