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
import qrcodeTerminal from 'qrcode-terminal';
import pino from 'pino';
import { CompanyWhatsApp } from '../models/index.js';
import { clearAuthDir, hasSavedCreds, restoreAuthDir, snapshotAuthDir } from './companyAuth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, '../..');
export const AUTH_DIR = path.join(SERVER_ROOT, 'auth_info_baileys');
export const QR_FILE = path.join(SERVER_ROOT, 'whatsapp-qr.png');

const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });
const sessions = new Map();
const startLocks = new Map();

const companyCache = {
  status: 'disconnected',
  phone: null,
  wa_name: null,
  registered: false,
};

export async function hydrateCompanyCache() {
  try {
    const row = await CompanyWhatsApp.get();
    if (!row) return companyCache;
    companyCache.status = row.status || 'disconnected';
    companyCache.phone = row.phone || null;
    companyCache.wa_name = row.wa_name || null;
    companyCache.registered = Boolean(row.phone || row.status === 'connected' || row.keys?.['creds.json']);
    return companyCache;
  } catch (err) {
    console.error('Company WhatsApp cache failed:', err.message);
    return companyCache;
  }
}

function emptyStatus() {
  return {
    connected: false,
    connecting: false,
    qrAvailable: false,
    qrDataUrl: null,
    user: null,
  };
}

export function clientSessionKey(accountId) {
  return `client:${accountId}`;
}

function authDirFor(key) {
  if (key === 'admin') return AUTH_DIR;
  return path.join(SERVER_ROOT, 'auth_info_baileys', key.replace(':', '_'));
}

export function getSession(key = 'admin') {
  return sessions.get(key) || null;
}

export function getSock(key = 'admin') {
  if (sessions.get('admin')?.status?.connected && sessions.get('admin')?.sock) return sessions.get('admin').sock;
  if (key && sessions.get(key)?.sock) return sessions.get(key).sock;
  for (const session of sessions.values()) {
    if (session.sock && session.status.connected) return session.sock;
  }
  return sessions.get(key)?.sock || null;
}

export function getSockForAccount() {
  return getSock('admin');
}

export function getQrFilePath() {
  return QR_FILE;
}

function publicStatus(session, includeQr = false) {
  const status = session?.status || emptyStatus();
  return {
    connected: Boolean(status.connected),
    connecting: Boolean(status.connecting),
    qrAvailable: Boolean(status.qrAvailable && status.qrDataUrl),
    qrDataUrl: includeQr && status.qrAvailable && !status.connected ? status.qrDataUrl : null,
    user: status.user,
  };
}

export function getWhatsAppStatus() {
  const session = sessions.get('admin');
  return {
    ...publicStatus(session),
    qrUrl: '/api/whatsapp/qr',
  };
}

export function getClientWhatsAppStatus(accountId, includeQr = false) {
  return getCompanyWhatsAppStatus(includeQr);
}

export function getCompanyWhatsAppStatus(includeQr = false) {
  const live = publicStatus(sessions.get('admin'), includeQr);
  const saved = companyCache.status === 'connected' || Boolean(companyCache.phone) || companyCache.registered;
  const user =
    live.user ||
    (companyCache.phone || companyCache.wa_name ? { id: companyCache.phone, name: companyCache.wa_name } : null);

  if (live.connected) {
    return {
      connected: true,
      connecting: false,
      reconnecting: false,
      qrAvailable: false,
      qrDataUrl: null,
      user,
      phone: companyCache.phone || user?.id || null,
      shared: true,
      scope: 'company',
    };
  }

  if (saved && !live.qrAvailable) {
    return {
      connected: true,
      connecting: false,
      reconnecting: true,
      qrAvailable: false,
      qrDataUrl: null,
      user,
      phone: companyCache.phone || user?.id || null,
      shared: true,
      scope: 'company',
    };
  }

  return {
    ...live,
    user,
    phone: companyCache.phone,
    shared: true,
    scope: 'company',
  };
}

async function persistCompanyLink(extras = {}) {
  const phone = extras.phone ?? companyCache.phone ?? null;
  const wa_name = extras.wa_name ?? companyCache.wa_name ?? null;
  const status = extras.status || companyCache.status || 'disconnected';
  if (extras.clear) {
    companyCache.status = 'disconnected';
    companyCache.phone = null;
    companyCache.wa_name = null;
    companyCache.registered = false;
  } else {
    companyCache.status = status;
    if (phone) companyCache.phone = phone;
    if (wa_name) companyCache.wa_name = wa_name;
    if (status === 'connected') companyCache.registered = true;
  }
  try {
    if (extras.clear) await CompanyWhatsApp.clear();
    else await CompanyWhatsApp.saveLink({ status, phone, wa_name });
  } catch (err) {
    console.error('Company WhatsApp persist failed:', err.message);
  }
}

async function persistLink(session, extras = {}) {
  const phone = extras.phone ?? session?.status?.user?.id?.split(':')[0] ?? null;
  const wa_name = extras.wa_name ?? session?.status?.user?.name ?? null;
  const status =
    extras.status ||
    (session?.status?.connected ? 'connected' : session?.status?.connecting ? 'connecting' : 'disconnected');
  if (session?.key === 'admin') {
    await persistCompanyLink({ status, phone, wa_name, clear: extras.clear });
  }
}

async function saveAdminQrFile(qr) {
  await QRCode.toFile(QR_FILE, qr, { width: 512, margin: 2 });
}

function clearAdminQrFile() {
  if (fs.existsSync(QR_FILE)) fs.unlinkSync(QR_FILE);
}

function isLoggedOut(code) {
  return code === DisconnectReason.loggedOut || code === 401;
}

function reconnectDelay(code) {
  if (code === 515 || code === DisconnectReason.restartRequired) return 800;
  return 2500;
}

async function startSessionInner(key, options = {}) {
  const existing = sessions.get(key);
  if (existing?.starting) return existing.sock;
  if (existing?.sock && (existing.status.connected || existing.status.connecting)) return existing.sock;

  const session = {
    key,
    accountId: options.accountId || null,
    hostId: options.hostId || null,
    listenMessages: options.listenMessages !== false,
    starting: true,
    generation: (existing?.generation || 0) + 1,
    sock: null,
    status: emptyStatus(),
  };
  session.status.connecting = true;
  sessions.set(key, session);
  const myGen = session.generation;
  const dir = authDirFor(key);

  await fs.promises.mkdir(dir, { recursive: true });
  if (key === 'admin' && !hasSavedCreds(dir)) {
    await restoreAuthDir(dir);
  }

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const persistCreds = async () => {
    await saveCreds();
    if (key === 'admin') await snapshotAuthDir(dir).catch((err) => console.error('Auth snapshot failed:', err.message));
  };

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
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
    const current = sessions.get(key);
    if (!current || current.generation !== myGen) return;
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const paired = hasSavedCreds(dir) || companyCache.registered || companyCache.status === 'connected';
      if (paired) {
        console.log(`WhatsApp (${key}) already paired — ignoring replacement QR`);
      } else {
        if (key === 'admin') {
          console.log('\nScan this QR with WhatsApp → Linked Devices → Link a device\n');
          qrcodeTerminal.generate(qr, { small: true });
          await saveAdminQrFile(qr).catch((err) => console.error('Could not write WhatsApp QR image:', err.message));
        }
        current.status.qrDataUrl = await QRCode.toDataURL(qr, { width: 512, margin: 2 }).catch(() => null);
        current.status.qrAvailable = Boolean(current.status.qrDataUrl);
        current.status.connecting = true;
        current.status.connected = false;
        await persistLink(current, { status: 'connecting' });
      }
    }

    if (connection === 'open') {
      current.starting = false;
      current.status.connected = true;
      current.status.connecting = false;
      current.status.qrAvailable = false;
      current.status.qrDataUrl = null;
      current.status.user = {
        id: sock.user?.id || null,
        name: sock.user?.name || sock.user?.verifiedName || null,
      };
      if (key === 'admin') {
        clearAdminQrFile();
        await persistCreds().catch(() => {});
      }
      await persistLink(current, { status: 'connected' });
      console.log(`WhatsApp linked (${key}) as ${current.status.user.name || current.status.user.id}`);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = isLoggedOut(code);
      console.warn(`WhatsApp disconnected (${key})`, loggedOut ? '(logged out)' : `(code ${code || 'unknown'})`);
      current.starting = false;
      current.sock = null;
      current.status.connected = false;
      current.status.connecting = !loggedOut;
      current.status.qrAvailable = false;
      current.status.qrDataUrl = null;

      if (loggedOut) {
        await clearAuthDir(dir);
        if (key === 'admin') clearAdminQrFile();
        await persistLink(current, { status: 'disconnected', phone: null, wa_name: null, clear: true });
      } else if (hasSavedCreds(dir) || companyCache.status === 'connected') {
        await persistLink(current, { status: 'connected' });
      }

      setTimeout(() => {
        startSession(key, {
          listenMessages: current.listenMessages,
          accountId: current.accountId,
          hostId: current.hostId,
        }).catch((err) => console.error(`WhatsApp reconnect failed (${key}):`, err.message));
      }, reconnectDelay(code));
    }
  });

  if (session.listenMessages) {
    const { attachMessageHandler } = await import('./messageHandler.js');
    attachMessageHandler(sock, { accountId: session.accountId, hostId: session.hostId, key });
  }

  return sock;
}

export async function startSession(key, options = {}) {
  const prev = startLocks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => startSessionInner(key, options));
  startLocks.set(key, next);
  return next;
}

export async function startWhatsApp(options = {}) {
  await hydrateCompanyCache();
  return startSession('admin', { listenMessages: options.listenMessages !== false });
}

export async function startCompanyWhatsApp() {
  await hydrateCompanyCache();
  await startWhatsApp({ listenMessages: true });
  for (let i = 0; i < 12; i += 1) {
    const status = getCompanyWhatsAppStatus(true);
    if (status.connected || status.qrDataUrl) return status;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return getCompanyWhatsAppStatus(true);
}

export async function stopCompanyWhatsApp() {
  const session = sessions.get('admin');
  if (session) session.generation = (session.generation || 0) + 1;
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
  sessions.delete('admin');
  await clearAuthDir(AUTH_DIR);
  clearAdminQrFile();
  await persistCompanyLink({ status: 'disconnected', phone: null, wa_name: null, clear: true });
  return getCompanyWhatsAppStatus(false);
}

export async function startClientWhatsApp(accountId, hostId) {
  if (!accountId) throw new Error('accountId is required');
  let resolvedHostId = hostId || null;
  if (!resolvedHostId) {
    const { Host } = await import('../models/index.js');
    const host = await Host.findByAccountId(accountId);
    resolvedHostId = host?.id || null;
  }
  return startSession(clientSessionKey(accountId), {
    listenMessages: true,
    accountId,
    hostId: resolvedHostId,
  });
}

export async function stopClientWhatsApp(accountId) {
  const key = clientSessionKey(accountId);
  const session = sessions.get(key);
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
  if (session) session.generation = (session.generation || 0) + 1;
  sessions.delete(key);
  await clearAuthDir(authDirFor(key));
}

export async function restoreClientSessions() {
  await startWhatsApp({ listenMessages: true });
}
