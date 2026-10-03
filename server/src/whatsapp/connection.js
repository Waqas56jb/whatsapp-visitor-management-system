// WhatsApp sessions, one per company: each company links its own WhatsApp number from its admin
// panel. Company 1 (the original organisation) keeps its existing login folder, so the live link
// survives the move to multi-company without a new QR scan.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { Company, CompanyWhatsApp } from '../models/index.js';
import { clearAuthDir, hasSavedCreds, restoreAuthDir, snapshotAuthDir } from './companyAuth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, '../..');
export const AUTH_DIR = path.join(SERVER_ROOT, 'auth_info_baileys');
const SESSIONS_DIR = path.join(SERVER_ROOT, 'auth_sessions');

const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });
const sessions = new Map(); // companyId -> session
const startLocks = new Map();
const caches = new Map(); // companyId -> { status, phone, wa_name, registered }

export function authDirFor(companyId) {
  return Number(companyId) === 1 ? AUTH_DIR : path.join(SESSIONS_DIR, `company-${Number(companyId)}`);
}

function cacheFor(companyId) {
  if (!caches.has(companyId)) caches.set(companyId, { status: 'disconnected', phone: null, wa_name: null, registered: false });
  return caches.get(companyId);
}

export async function hydrateCompanyCache(companyId) {
  const cache = cacheFor(companyId);
  try {
    const row = await CompanyWhatsApp.get(companyId);
    if (!row) return cache;
    cache.status = row.status || 'disconnected';
    cache.phone = row.phone || null;
    cache.wa_name = row.wa_name || null;
    cache.registered = Boolean(row.phone || row.status === 'connected' || row.keys?.['creds.json']);
  } catch (err) {
    console.error(`Company ${companyId} WhatsApp cache failed:`, err.message);
  }
  return cache;
}

function emptyStatus() {
  return { connected: false, connecting: false, qrAvailable: false, qrDataUrl: null, user: null };
}

// The socket of a company's linked number, or null.
export function getSock(companyId) {
  return sessions.get(Number(companyId))?.sock || null;
}

// Tests attach an in-memory socket for a company (never used by the running server).
export function useSocketForTests(companyId, sock) {
  if (process.env.NODE_ENV === 'production') throw new Error('Not available in production');
  sessions.set(Number(companyId), { companyId: Number(companyId), sock, generation: 0, status: { ...emptyStatus(), connected: true } });
}

export function isConnected(companyId) {
  return Boolean(sessions.get(Number(companyId))?.status?.connected);
}

// For the platform health page: every running session.
export function sessionSummary() {
  return [...sessions.values()].map((s) => ({
    companyId: s.companyId,
    connected: Boolean(s.status.connected),
    connecting: Boolean(s.status.connecting),
    waitingForQr: Boolean(s.status.qrAvailable),
  }));
}

export function getCompanyWhatsAppStatus(companyId, includeQr = false) {
  const session = sessions.get(Number(companyId));
  const cache = cacheFor(Number(companyId));
  const status = session?.status || emptyStatus();
  const user = status.user || (cache.phone || cache.wa_name ? { id: cache.phone, name: cache.wa_name } : null);
  const base = { user, phone: cache.phone || user?.id?.split(':')[0] || null, scope: 'company' };
  if (status.connected) return { ...base, connected: true, connecting: false, reconnecting: false, qrAvailable: false, qrDataUrl: null };
  const saved = cache.status === 'connected' || Boolean(cache.phone) || cache.registered;
  if (saved && !status.qrAvailable && session) {
    return { ...base, connected: true, connecting: false, reconnecting: true, qrAvailable: false, qrDataUrl: null };
  }
  return {
    ...base,
    connected: false,
    connecting: Boolean(status.connecting),
    reconnecting: false,
    qrAvailable: Boolean(status.qrAvailable && status.qrDataUrl),
    qrDataUrl: includeQr && status.qrAvailable ? status.qrDataUrl : null,
  };
}

async function persistLink(companyId, { status, phone = null, wa_name = null, clear = false }) {
  const cache = cacheFor(companyId);
  if (clear) {
    Object.assign(cache, { status: 'disconnected', phone: null, wa_name: null, registered: false });
  } else {
    cache.status = status;
    if (phone) cache.phone = phone;
    if (wa_name) cache.wa_name = wa_name;
    if (status === 'connected') cache.registered = true;
  }
  try {
    if (clear) await CompanyWhatsApp.clear(companyId);
    else await CompanyWhatsApp.saveLink(companyId, { status, phone, wa_name });
  } catch (err) {
    console.error(`Company ${companyId} WhatsApp persist failed:`, err.message);
  }
}

function isLoggedOut(code) {
  return code === DisconnectReason.loggedOut || code === 401;
}

function reconnectDelay(code) {
  if (code === 515 || code === DisconnectReason.restartRequired) return 800;
  return 2500;
}

async function startSessionInner(companyId, options = {}) {
  const existing = sessions.get(companyId);
  if (existing?.starting) return existing.sock;
  if (existing?.sock && (existing.status.connected || existing.status.connecting)) return existing.sock;

  const session = {
    companyId,
    listenMessages: options.listenMessages !== false,
    starting: true,
    generation: (existing?.generation || 0) + 1,
    sock: null,
    status: emptyStatus(),
  };
  session.status.connecting = true;
  sessions.set(companyId, session);
  const myGen = session.generation;
  const dir = authDirFor(companyId);
  const cache = await hydrateCompanyCache(companyId);

  await fs.promises.mkdir(dir, { recursive: true });
  if (!hasSavedCreds(dir)) await restoreAuthDir(companyId, dir).catch((err) => console.error('Auth restore failed:', err.message));

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const persistCreds = async () => {
    await saveCreds();
    await snapshotAuthDir(companyId, dir).catch((err) => console.error('Auth snapshot failed:', err.message));
  };

  const sock = makeWASocket({
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    browser: Browsers.macOS('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000,
    retryRequestDelayMs: 400,
  });
  session.sock = sock;
  sock.ev.on('creds.update', persistCreds);

  sock.ev.on('connection.update', async (update) => {
    const current = sessions.get(companyId);
    if (!current || current.generation !== myGen) return;
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const paired = hasSavedCreds(dir) || cache.registered || cache.status === 'connected';
      if (paired) {
        console.log(`WhatsApp (company ${companyId}) already paired — ignoring replacement QR`);
      } else {
        current.status.qrDataUrl = await QRCode.toDataURL(qr, { width: 512, margin: 2 }).catch(() => null);
        current.status.qrAvailable = Boolean(current.status.qrDataUrl);
        current.status.connecting = true;
        current.status.connected = false;
        await persistLink(companyId, { status: 'connecting' });
      }
    }

    if (connection === 'open') {
      current.starting = false;
      Object.assign(current.status, { connected: true, connecting: false, qrAvailable: false, qrDataUrl: null });
      current.status.user = { id: sock.user?.id || null, name: sock.user?.name || sock.user?.verifiedName || null };
      await persistCreds().catch(() => {});
      await persistLink(companyId, {
        status: 'connected',
        phone: current.status.user.id?.split(':')[0] || null,
        wa_name: current.status.user.name,
      });
      console.log(`WhatsApp linked (company ${companyId}) as ${current.status.user.name || current.status.user.id}`);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = isLoggedOut(code);
      console.warn(`WhatsApp disconnected (company ${companyId})`, loggedOut ? '(logged out)' : `(code ${code || 'unknown'})`);
      current.starting = false;
      current.sock = null;
      Object.assign(current.status, { connected: false, connecting: !loggedOut, qrAvailable: false, qrDataUrl: null });
      if (loggedOut) {
        await clearAuthDir(dir);
        await persistLink(companyId, { clear: true });
      }
      setTimeout(() => {
        const latest = sessions.get(companyId);
        if (!latest || latest.generation !== myGen) return; // stopped or paused meanwhile
        startSession(companyId, { listenMessages: current.listenMessages }).catch((err) =>
          console.error(`WhatsApp reconnect failed (company ${companyId}):`, err.message)
        );
      }, reconnectDelay(code));
    }
  });

  if (session.listenMessages) {
    const { attachMessageHandler } = await import('./messageHandler.js');
    attachMessageHandler(sock, { companyId });
  }
  return sock;
}

export async function startSession(companyId, options = {}) {
  const id = Number(companyId);
  const prev = startLocks.get(id) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => startSessionInner(id, options));
  startLocks.set(id, next);
  return next;
}

// On boot: company 1 always (as before), and every other active company with a saved login.
export async function startAllWhatsApp() {
  const ids = new Set();
  const company1 = await Company.findById(1).catch(() => null);
  if (company1?.status === 'active') ids.add(1);
  const linked = await CompanyWhatsApp.listWithCredentials().catch(() => []);
  for (const row of linked) {
    const company = await Company.findById(row.company_id).catch(() => null);
    if (company?.status === 'active') ids.add(Number(row.company_id));
  }
  for (const id of ids) {
    await startSession(id, { listenMessages: true }).catch((err) => console.error(`WhatsApp start failed (company ${id}):`, err.message));
  }
  return [...ids];
}

// The company admin presses "Connect": start (or show) the linking QR.
export async function startCompanyWhatsApp(companyId) {
  const id = Number(companyId);
  await startSession(id, { listenMessages: true });
  for (let i = 0; i < 12; i += 1) {
    const status = getCompanyWhatsAppStatus(id, true);
    if (status.connected || status.qrDataUrl) return status;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return getCompanyWhatsAppStatus(id, true);
}

function endSession(companyId) {
  const session = sessions.get(companyId);
  if (session) session.generation = (session.generation || 0) + 1;
  sessions.delete(companyId);
  return session;
}

// Unlinks the number: logs out of WhatsApp and forgets the saved login.
export async function stopCompanyWhatsApp(companyId) {
  const id = Number(companyId);
  const session = endSession(id);
  if (session?.sock) {
    try {
      await session.sock.logout();
    } catch {
      try {
        session.sock.end();
      } catch {
        /* ignore */
      }
    }
  }
  await clearAuthDir(authDirFor(id));
  await persistLink(id, { clear: true });
  return getCompanyWhatsAppStatus(id, false);
}

// Suspension: the bot goes quiet but the link is kept, so reactivation needs no new QR.
export async function pauseCompanyWhatsApp(companyId) {
  const session = endSession(Number(companyId));
  try {
    session?.sock?.end(undefined);
  } catch {
    /* ignore */
  }
}

export async function resumeCompanyWhatsApp(companyId) {
  const id = Number(companyId);
  const row = await CompanyWhatsApp.get(id).catch(() => null);
  if (id === 1 || row?.keys?.['creds.json']) await startSession(id, { listenMessages: true });
}
