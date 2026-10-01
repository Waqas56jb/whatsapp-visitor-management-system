// Password management and session checks, through the real Express app and routes. Logins live
// in memory (test/helpers/authModels.js); the database URL points nowhere, so nothing can reach
// a real database.
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
async function addAdmin(username, password, name = 'Michael Ntsima') {
  const row = { id: nextId++, username, name, password_hash: await bcrypt.hash(password, 4), password_changed_at: null };
  store.admins.push(row);
  return row;
}
async function addAccount(username, password, status = 'active') {
  const row = { id: nextId++, username, name: username, role: 'Host', status, password_hash: await bcrypt.hash(password, 4), password_changed_at: null };
  store.accounts.push(row);
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

async function login(kind, username, password) {
  const res = await call('POST', `/auth/${kind}/login`, { body: { username, password } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

beforeEach(() => {
  store.admins.length = 0;
  store.accounts.length = 0;
  store.audit.length = 0;
});

describe('changing passwords', () => {
  test('wrong current password is rejected (admin and portal)', async () => {
    await addAdmin('chief', 'correct-horse-1');
    const adminTok = await login('admin', 'chief', 'correct-horse-1');
    const a = await call('POST', '/auth/admin/password', { token: adminTok, body: { currentPassword: 'wrong-password', newPassword: 'brand-new-pass-1' } });
    assert.equal(a.status, 400);
    assert.match(a.body.error, /current password is incorrect/);

    await addAccount('host1', 'host-pass-123');
    const hostTok = await login('client', 'host1', 'host-pass-123');
    const h = await call('POST', '/host/password', { token: hostTok, body: { currentPassword: 'nope', newPassword: 'brand-new-pass-1' } });
    assert.equal(h.status, 400);
  });

  test('a password shorter than 10 characters is rejected', async () => {
    await addAdmin('chief', 'correct-horse-1');
    const tok = await login('admin', 'chief', 'correct-horse-1');
    const res = await call('POST', '/auth/admin/password', { token: tok, body: { currentPassword: 'correct-horse-1', newPassword: 'short1' } });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /at least 10 characters/);
    const reset = await addAccount('host1', 'host-pass-123');
    const resetRes = await call('POST', `/accounts/${reset.id}/password`, { token: tok, body: { newPassword: 'tiny' } });
    assert.equal(resetRes.status, 400);
  });

  test('a mismatched confirmation is rejected', async () => {
    await addAdmin('chief', 'correct-horse-1');
    const tok = await login('admin', 'chief', 'correct-horse-1');
    const res = await call('POST', '/auth/admin/password', {
      token: tok,
      body: { currentPassword: 'correct-horse-1', newPassword: 'brand-new-pass-1', confirmPassword: 'brand-new-pass-2' },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /do not match/);
  });

  test('a successful change works, keeps this session and writes an audit row without the password', async () => {
    await addAdmin('chief', 'correct-horse-1');
    const tok = await login('admin', 'chief', 'correct-horse-1');
    const res = await call('POST', '/auth/admin/password', { token: tok, body: { currentPassword: 'correct-horse-1', newPassword: 'brand-new-pass-1' } });
    assert.equal(res.status, 200);
    assert.equal((await call('GET', '/auth/me', { token: res.body.token })).status, 200);
    assert.equal((await call('POST', '/auth/admin/login', { body: { username: 'chief', password: 'correct-horse-1' } })).status, 401);
    await login('admin', 'chief', 'brand-new-pass-1');
    assert.deepEqual(store.audit.map((a) => a.action), ['Changed own password']);
    assert.doesNotMatch(JSON.stringify(store.audit), /correct-horse-1|brand-new-pass-1/);
  });

  test('a host cannot change another account’s password', async () => {
    const mine = await addAccount('host1', 'host-pass-123');
    const other = await addAccount('host2', 'other-pass-123');
    const tok = await login('client', 'host1', 'host-pass-123');

    // The admin reset endpoint is closed to portal users.
    const reset = await call('POST', `/accounts/${other.id}/password`, { token: tok, body: { newPassword: 'hijacked-pass-1' } });
    assert.equal(reset.status, 403);

    // The portal endpoint ignores any account id in the request and only changes the signed-in account.
    const before = store.accounts.find((a) => a.id === other.id).password_hash;
    const own = await call('POST', '/host/password', {
      token: tok,
      body: { accountId: other.id, id: other.id, currentPassword: 'host-pass-123', newPassword: 'host-pass-new-1' },
    });
    assert.equal(own.status, 200);
    assert.equal(store.accounts.find((a) => a.id === other.id).password_hash, before);
    assert.ok(await bcrypt.compare('host-pass-new-1', store.accounts.find((a) => a.id === mine.id).password_hash));
  });
});

describe('sessions end when they should', () => {
  test('an old token is rejected after the password changes', async () => {
    await addAdmin('chief', 'correct-horse-1');
    const oldTok = await login('admin', 'chief', 'correct-horse-1');
    const otherSession = await login('admin', 'chief', 'correct-horse-1');
    const res = await call('POST', '/auth/admin/password', { token: oldTok, body: { currentPassword: 'correct-horse-1', newPassword: 'brand-new-pass-1' } });
    assert.equal(res.status, 200);
    const stale = await call('GET', '/auth/me', { token: otherSession });
    assert.equal(stale.status, 401);
    assert.match(stale.body.error, /password was changed/);
    assert.equal((await call('GET', '/auth/me', { token: oldTok })).status, 401);
  });

  test('an admin reset ends the portal user’s sessions', async () => {
    await addAdmin('chief', 'correct-horse-1');
    const host = await addAccount('host1', 'host-pass-123');
    const adminTok = await login('admin', 'chief', 'correct-horse-1');
    const hostTok = await login('client', 'host1', 'host-pass-123');
    assert.equal((await call('GET', '/auth/me', { token: hostTok })).status, 200);
    const reset = await call('POST', `/accounts/${host.id}/password`, { token: adminTok, body: { newPassword: 'reset-by-admin-1' } });
    assert.equal(reset.status, 200);
    assert.equal((await call('GET', '/auth/me', { token: hostTok })).status, 401);
    await login('client', 'host1', 'reset-by-admin-1');
    assert.deepEqual(store.audit.map((a) => a.action), ['Reset account password']);
    assert.doesNotMatch(JSON.stringify(store.audit), /reset-by-admin-1/);
  });

  test('a blocked or deleted account’s token is rejected immediately', async () => {
    const host = await addAccount('host1', 'host-pass-123');
    const tok = await login('client', 'host1', 'host-pass-123');
    store.accounts.find((a) => a.id === host.id).status = 'blocked';
    const blocked = await call('GET', '/host/profile', { token: tok });
    assert.equal(blocked.status, 401);
    assert.match(blocked.body.error, /no longer active/);
    store.accounts.length = 0;
    assert.equal((await call('GET', '/auth/me', { token: tok })).status, 401);
  });

  test('/auth/me returns the signed-in admin’s name from the database', async () => {
    await addAdmin('chief', 'correct-horse-1', 'Michael Ntsima');
    const tok = await login('admin', 'chief', 'correct-horse-1');
    store.admins[0].name = 'Michael K Ntsima';
    const res = await call('GET', '/auth/me', { token: tok });
    assert.deepEqual(res.body, { role: 'admin', name: 'Michael K Ntsima', username: 'chief' });
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
    assert.match(blocked.body.error, /Too many sign-in attempts/);

    await addAdmin('someone-else', 'correct-horse-2');
    assert.equal((await call('POST', '/auth/admin/login', { body: { username: 'someone-else', password: 'correct-horse-2' } })).status, 200);
  });

  test('the portal login is limited the same way', async () => {
    for (let i = 0; i < 10; i += 1) await call('POST', '/auth/client/login', { body: { username: 'portal-target', password: 'x' } });
    assert.equal((await call('POST', '/auth/client/login', { body: { username: 'portal-target', password: 'x' } })).status, 429);
  });
});
