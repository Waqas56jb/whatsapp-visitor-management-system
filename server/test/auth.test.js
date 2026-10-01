// Roles, sessions and password management, through the real Express app and routes. Data lives
// in memory (test/helpers/authModels.js); the database URL points nowhere, so nothing can reach
// a real database, and no test calls an endpoint that starts WhatsApp.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { after, before, beforeEach, describe, test } from 'node:test';

process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://nobody:nothing@127.0.0.1:9/none';
register('./helpers/authHooks.js', import.meta.url);

const bcrypt = (await import('bcryptjs')).default;
const { default: app } = await import('../src/app.js');
const { store } = await import('./helpers/authModels.js');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => server.close());

let nextId = 1;
async function addAdmin(username, password, role = 'super_admin', name = 'Michael Ntsima') {
  const row = {
    id: nextId++,
    username,
    name,
    role,
    status: 'active',
    password_hash: await bcrypt.hash(password, 4),
    password_changed_at: null,
    created_at: new Date(),
  };
  store.admins.push(row);
  return row;
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function login(username, password) {
  const res = await call('POST', '/auth/admin/login', { body: { username, password } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

beforeEach(() => {
  store.admins.length = 0;
  store.audit.length = 0;
  store.knowledge.length = 0;
});

describe('changing passwords', () => {
  test('wrong current password is rejected', async () => {
    await addAdmin('chief', 'correct-horse-1');
    const tok = await login('chief', 'correct-horse-1');
    const res = await call('POST', '/auth/admin/password', { token: tok, body: { currentPassword: 'wrong-password', newPassword: 'brand-new-pass-1' } });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /current password is incorrect/);
  });

  test('a password shorter than 10 characters is rejected', async () => {
    await addAdmin('chief', 'correct-horse-1');
    const tok = await login('chief', 'correct-horse-1');
    const res = await call('POST', '/auth/admin/password', { token: tok, body: { currentPassword: 'correct-horse-1', newPassword: 'short1' } });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /at least 10 characters/);
    const sub = await addAdmin('desk', 'desk-pass-123', 'reception');
    assert.equal((await call('POST', `/admins/${sub.id}/password`, { token: tok, body: { newPassword: 'tiny' } })).status, 400);
  });

  test('every role can change its own password; this session continues and the audit has no password', async () => {
    for (const role of ['super_admin', 'admin', 'reception']) {
      await addAdmin(`u-${role}`, 'correct-horse-1', role);
      const tok = await login(`u-${role}`, 'correct-horse-1');
      const res = await call('POST', '/auth/admin/password', { token: tok, body: { currentPassword: 'correct-horse-1', newPassword: 'brand-new-pass-1' } });
      assert.equal(res.status, 200, role);
      assert.equal((await call('GET', '/auth/me', { token: res.body.token })).status, 200, role);
      await login(`u-${role}`, 'brand-new-pass-1');
    }
    assert.doesNotMatch(JSON.stringify(store.audit), /correct-horse-1|brand-new-pass-1/);
  });
});

describe('sessions end when they should', () => {
  test('an old token is rejected after the password changes', async () => {
    await addAdmin('chief', 'correct-horse-1');
    const a = await login('chief', 'correct-horse-1');
    const b = await login('chief', 'correct-horse-1');
    assert.equal((await call('POST', '/auth/admin/password', { token: a, body: { currentPassword: 'correct-horse-1', newPassword: 'brand-new-pass-1' } })).status, 200);
    const stale = await call('GET', '/auth/me', { token: b });
    assert.equal(stale.status, 401);
    assert.match(stale.body.error, /password was changed/);
  });

  test('a super_admin reset ends the sub-admin’s sessions', async () => {
    await addAdmin('chief', 'correct-horse-1');
    const sub = await addAdmin('desk', 'desk-pass-123', 'reception');
    const chief = await login('chief', 'correct-horse-1');
    const desk = await login('desk', 'desk-pass-123');
    assert.equal((await call('POST', `/admins/${sub.id}/password`, { token: chief, body: { newPassword: 'reset-by-chief-1' } })).status, 200);
    assert.equal((await call('GET', '/auth/me', { token: desk })).status, 401);
    await login('desk', 'reset-by-chief-1');
    assert.doesNotMatch(JSON.stringify(store.audit), /reset-by-chief-1/);
  });

  test('a blocked or deleted admin’s token is rejected immediately, and a blocked admin cannot sign in', async () => {
    await addAdmin('chief', 'correct-horse-1');
    const sub = await addAdmin('ops', 'ops-pass-1234', 'admin');
    const tok = await login('ops', 'ops-pass-1234');
    store.admins.find((a) => a.id === sub.id).status = 'blocked';
    const blocked = await call('GET', '/visits', { token: tok });
    assert.equal(blocked.status, 401);
    assert.match(blocked.body.error, /blocked/);
    assert.equal((await call('POST', '/auth/admin/login', { body: { username: 'ops', password: 'ops-pass-1234' } })).status, 403);
    store.admins.splice(store.admins.findIndex((a) => a.id === sub.id), 1);
    assert.equal((await call('GET', '/auth/me', { token: tok })).status, 401);
  });

  test('a role change takes effect on the next request', async () => {
    await addAdmin('chief', 'correct-horse-1');
    const sub = await addAdmin('ops', 'ops-pass-1234', 'admin');
    const chief = await login('chief', 'correct-horse-1');
    const ops = await login('ops', 'ops-pass-1234');
    assert.notEqual((await call('GET', '/visits', { token: ops })).status, 403);
    assert.equal((await call('PATCH', `/admins/${sub.id}/role`, { token: chief, body: { role: 'reception' } })).status, 200);
    assert.equal((await call('GET', '/visits', { token: ops })).status, 403);
  });

  test('/auth/me returns the signed-in admin’s name and role from the database', async () => {
    await addAdmin('desk', 'desk-pass-123', 'reception', 'Neo Setlhare');
    const tok = await login('desk', 'desk-pass-123');
    store.admins[0].name = 'Neo K Setlhare';
    assert.deepEqual((await call('GET', '/auth/me', { token: tok })).body, { name: 'Neo K Setlhare', username: 'desk', role: 'reception' });
  });
});

// [method, path, roles that may use it, body]. Every other role must get 403.
const SUPER = ['super_admin'];
const STAFF = ['super_admin', 'admin'];
const ANY = ['super_admin', 'admin', 'reception'];
const TOKEN64 = 'a'.repeat(64);
const ROUTES = [
  ['GET', '/auth/me', ANY],
  ['GET', '/visits/today', ANY],
  ['POST', '/passes/validate', ANY, { pin: '123456' }],
  ['GET', '/passes/info?pin=123456', ANY],
  ['GET', '/dashboard/stats', STAFF],
  ['GET', '/visitors', STAFF],
  ['GET', '/visits', STAFF],
  ['POST', '/visits', STAFF, {}],
  ['PATCH', '/visits/1/approve', STAFF],
  ['PATCH', '/visits/1/reject', STAFF],
  ['GET', '/passes', STAFF],
  ['POST', '/passes/1/revoke', STAFF],
  ['GET', '/conversations', STAFF],
  ['GET', '/conversations/26770000000', STAFF],
  ['GET', '/hosts', STAFF],
  ['POST', '/hosts', STAFF, {}],
  ['PATCH', '/hosts/1', STAFF, {}],
  ['PATCH', '/hosts/1/block', STAFF],
  ['PATCH', '/hosts/1/unblock', STAFF],
  ['DELETE', '/hosts/1', STAFF, {}],
  ['GET', '/knowledge', STAFF],
  ['POST', '/knowledge', STAFF, {}],
  ['PUT', '/knowledge/training', STAFF, {}],
  ['PATCH', '/knowledge/1', STAFF, {}],
  ['DELETE', '/knowledge/1', STAFF],
  ['POST', '/knowledge/website', STAFF, {}],
  ['GET', '/reports/summary', STAFF],
  ['GET', '/reports/export?type=visits', STAFF],
  ['GET', '/audit', STAFF],
  ['GET', '/settings', STAFF],
  ['PUT', '/settings', SUPER, {}],
  ['GET', '/settings/whatsapp', SUPER],
  ['POST', '/settings/whatsapp/connect', SUPER, null, { skipAllowed: true }],
  ['POST', '/settings/whatsapp/disconnect', SUPER, null, { skipAllowed: true }],
  ['GET', '/admins', SUPER],
  ['POST', '/admins', SUPER, {}],
  ['PATCH', '/admins/999/role', SUPER, { role: 'admin' }],
  ['PATCH', '/admins/999/block', SUPER],
  ['PATCH', '/admins/999/unblock', SUPER],
  ['DELETE', '/admins/999', SUPER, { confirm: true }],
  ['POST', '/admins/999/password', SUPER, { newPassword: 'long-enough-pass' }],
];

describe('role access on the server', () => {
  test('each role reaches exactly its routes; everything else is 403 (and 401 without a login)', async () => {
    const tokens = {};
    for (const role of ANY) {
      await addAdmin(`r-${role}`, 'role-pass-1234', role);
      tokens[role] = await login(`r-${role}`, 'role-pass-1234');
    }
    for (const [method, path, allowed, body, opts = {}] of ROUTES) {
      const anon = await call(method, path, { body: body ?? undefined });
      assert.equal(anon.status, 401, `${method} ${path} without login`);
      for (const role of ANY) {
        // connect/disconnect would start or stop WhatsApp, so the allowed role is not called here.
        if (allowed.includes(role) && opts.skipAllowed) continue;
        const res = await call(method, path, { token: tokens[role], body: body ?? undefined });
        if (allowed.includes(role)) assert.ok(![401, 403].includes(res.status), `${role} should reach ${method} ${path} (got ${res.status})`);
        else assert.equal(res.status, 403, `${role} must be refused ${method} ${path}`);
      }
    }
  });

  test('gate validation and PIN lookup need a login; the pass page by full token stays public', async () => {
    assert.equal((await call('POST', '/passes/validate', { body: { pin: '123456' } })).status, 401);
    assert.equal((await call('GET', '/passes/info?pin=123456')).status, 401);
    assert.equal((await call('GET', `/passes/info?token=${TOKEN64}`)).status, 401);
    // Public: not found (the pass doesn't exist), but not refused.
    assert.equal((await call('GET', `/passes/info/${TOKEN64}`)).status, 404);
    // A PIN or short value in the public path is never looked up.
    assert.equal((await call('GET', '/passes/info/123456')).status, 404);
  });

  test('removed public and portal endpoints return 404', async () => {
    for (const [method, path] of [
      ['GET', '/whatsapp/qr'],
      ['GET', '/whatsapp/status'],
      ['POST', '/visits/public'],
      ['POST', '/auth/client/login'],
      ['GET', '/host/visits'],
      ['GET', '/host/profile'],
      ['POST', '/host/password'],
      ['POST', '/host/agent'],
      ['GET', '/host/whatsapp/status'],
      ['GET', '/host/knowledge'],
      ['GET', '/accounts'],
      ['POST', '/accounts/1/password'],
    ]) {
      assert.equal((await call(method, path, { body: method === 'GET' ? undefined : {} })).status, 404, `${method} ${path}`);
    }
  });
});

describe('sub-admin management', () => {
  test('a super_admin creates, blocks, unblocks and deletes sub-admins, with audit rows', async () => {
    await addAdmin('chief', 'correct-horse-1');
    const tok = await login('chief', 'correct-horse-1');
    const created = await call('POST', '/admins', { token: tok, body: { name: 'Neo Setlhare', username: 'neo', password: 'neo-pass-12345', role: 'reception' } });
    assert.equal(created.status, 201);
    assert.equal(created.body.role, 'reception');
    await login('neo', 'neo-pass-12345');
    assert.equal((await call('PATCH', `/admins/${created.body.id}/block`, { token: tok })).status, 200);
    assert.equal((await call('POST', '/auth/admin/login', { body: { username: 'neo', password: 'neo-pass-12345' } })).status, 403);
    assert.equal((await call('PATCH', `/admins/${created.body.id}/unblock`, { token: tok })).status, 200);
    assert.equal((await call('DELETE', `/admins/${created.body.id}`, { token: tok, body: { confirm: true } })).status, 200);
    assert.deepEqual(store.audit.map((a) => a.action), ['Created sub-admin', 'Blocked sub-admin', 'Unblocked sub-admin', 'Deleted sub-admin']);
    assert.doesNotMatch(JSON.stringify(store.audit), /neo-pass-12345/);
  });

  test('bad input is refused: short password, unknown role, duplicate username', async () => {
    await addAdmin('chief', 'correct-horse-1');
    const tok = await login('chief', 'correct-horse-1');
    assert.equal((await call('POST', '/admins', { token: tok, body: { name: 'A', username: 'a', password: 'short', role: 'admin' } })).status, 400);
    assert.equal((await call('POST', '/admins', { token: tok, body: { name: 'A', username: 'a', password: 'long-enough-1', role: 'host' } })).status, 400);
    assert.equal((await call('POST', '/admins', { token: tok, body: { name: 'A', username: 'chief', password: 'long-enough-1', role: 'admin' } })).status, 409);
  });

  test('nobody can lock themselves out, and the last active super_admin is protected', async () => {
    const chief = await addAdmin('chief', 'correct-horse-1');
    const tok = await login('chief', 'correct-horse-1');
    assert.equal((await call('PATCH', `/admins/${chief.id}/block`, { token: tok })).status, 400);
    assert.equal((await call('DELETE', `/admins/${chief.id}`, { token: tok, body: { confirm: true } })).status, 400);
    assert.equal((await call('PATCH', `/admins/${chief.id}/role`, { token: tok, body: { role: 'admin' } })).status, 400);
    const other = await addAdmin('deputy', 'deputy-pass-12', 'super_admin');
    // With two super_admins, one can block the other — but not the last remaining one.
    assert.equal((await call('PATCH', `/admins/${other.id}/block`, { token: tok })).status, 200);
    store.admins.find((a) => a.id === other.id).status = 'active';
    store.admins.find((a) => a.id === chief.id).status = 'blocked';
    const deputy = await login('deputy', 'deputy-pass-12');
    assert.equal((await call('PATCH', `/admins/${other.id}/role`, { token: deputy, body: { role: 'admin' } })).status, 400);
  });
});

describe('knowledge base is organisation-wide', () => {
  test('an admin adds, edits and deletes entries that belong to no account', async () => {
    await addAdmin('ops', 'ops-pass-1234', 'admin');
    const tok = await login('ops', 'ops-pass-1234');
    const created = await call('POST', '/knowledge', { token: tok, body: { kind: 'qa', question: 'Parking?', answer: 'Visitor parking is at gate 2.' } });
    assert.equal(created.status, 201);
    assert.equal(store.knowledge[0].account_id, null);
    assert.equal((await call('PATCH', `/knowledge/${created.body.id}`, { token: tok, body: { answer: 'Gate 3.' } })).status, 200);
    const training = await call('PUT', '/knowledge/training', { token: tok, body: { instruction: 'Be brief.' } });
    assert.equal(training.status, 200);
    assert.equal((await call('GET', '/knowledge', { token: tok })).body.length, 2);
    assert.equal((await call('DELETE', `/knowledge/${created.body.id}`, { token: tok })).status, 200);
  });
});

describe('login rate limit', () => {
  test('the 11th attempt in 15 minutes for the same username is refused; other usernames are not affected', async () => {
    await addAdmin('target', 'correct-horse-1');
    for (let i = 0; i < 10; i += 1) {
      const res = await call('POST', '/auth/admin/login', { body: { username: 'target', password: `guess-${i}` } });
      assert.equal(res.status, 401, `attempt ${i + 1}`);
    }
    const blocked = await call('POST', '/auth/admin/login', { body: { username: 'target', password: 'correct-horse-1' } });
    assert.equal(blocked.status, 429);
    await addAdmin('someone-else', 'correct-horse-2');
    assert.equal((await call('POST', '/auth/admin/login', { body: { username: 'someone-else', password: 'correct-horse-2' } })).status, 200);
  });
});
