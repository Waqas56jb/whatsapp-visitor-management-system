import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import pino from 'pino';
import { CompanyWhatsApp } from '../models/index.js';
import { useCompanyAuthState } from './companyAuth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, '../..');
export const AUTH_DIR = path.join(SERVER_ROOT, 'auth_info_baileys');
export const QR_FILE = path.join(SERVER_ROOT, 'whatsapp-qr.png');

const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });

const sessions = new Map();

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
    companyCache.registered = Boolean(row.creds && (row.creds.me?.id || row.creds.me?.name));
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
  if (key && key !== 'admin' && sessions.get(key)?.sock) return sessions.get(key).sock;
  if (sessions.get('admin')?.sock) return sessions.get('admin').sock;
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
    qrDataUrl: includeQr && status.qrAvailable ? status.qrDataUrl : null,
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
  const saved =
    companyCache.status === 'connected' ||
    Boolean(companyCache.phone) ||
    companyCache.registered;
  const user = live.user || (companyCache.phone || companyCache.wa_name
    ? { id: companyCache.phone, name: companyCache.wa_name }
    : null);

  if (live.connected || saved) {
    return {
      connected: true,
      connecting: false,
      reconnecting: saved && !live.connected,
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
  companyCache.status = status;
  if (phone !== undefined) companyCache.phone = phone;
  if (wa_name !== undefined) companyCache.wa_name = wa_name;
  if (status === 'connected') companyCache.registered = true;
  if (status === 'disconnected' && extras.clear) {
    companyCache.phone = null;
    companyCache.wa_name = null;
    companyCache.registered = false;
  }
  try {
    if (extras.clear) await CompanyWhatsApp.clear();
    else await CompanyWhatsApp.saveLink({ status, phone, wa_name });
  } catch (err) {
    console.error('Company WhatsApp persist failed:', err.message);
  }
}

async function persistLink(session, extras = {}) {
  const phone = extras.phone ?? session.status.user?.id?.split(':')[0] ?? null;
  const wa_name = extras.wa_name ?? session.status.user?.name ?? null;
  const status = extras.status || (session.status.connected ? 'connected' : session.status.connecting ? 'connecting' : 'disconnected');
  if (session?.key === 'admin') {
    await persistCompanyLink({ status, phone, wa_name, clear: extras.clear });
  }
  if (!session?.accountId) return;
  try {
    const { WhatsAppLink } = await import('../models/index.js');
    await WhatsAppLink.upsert({
      account_id: session.accountId,
      host_id: session.hostId || null,
      phone,
      wa_name,
      status,
    });
  } catch (err) {
    console.error('WhatsApp link persist failed:', err.message);
  }
}

async function saveAdminQrFile(qr) {
  await QRCode.toFile(QR_FILE, qr, { width: 512, margin: 2 });
  console.log(`WhatsApp QR also saved to ${QR_FILE}`);
  console.log('Or open http://localhost:5000/api/whatsapp/qr in a browser.');
}

function clearAdminQrFile() {
  if (fs.existsSync(QR_FILE)) fs.unlinkSync(QR_FILE);
}

export async function startSession(key, options = {}) {
  let session = sessions.get(key);
  if (session?.starting) return session.sock;
  if (session?.sock && (session.status.connected || session.status.connecting)) return session.sock;

  session = {
    key,
    accountId: options.accountId || null,
    hostId: options.hostId || null,
    listenMessages: options.listenMessages !== false,
    starting: true,
    generation: (session?.generation || 0) + 1,
    sock: null,
    status: emptyStatus(),
  };
  session.status.connecting = true;
  sessions.set(key, session);
  const myGen = session.generation;

  const dir = authDirFor(key);
  await fs.promises.mkdir(dir, { recursive: true });
  let state;
  let saveCreds;
  if (key === 'admin') {
    const dbAuth = await useCompanyAuthState();
    state = dbAuth.state;
    saveCreds = dbAuth.saveCreds;
    if (dbAuth.registered) {
      companyCache.registered = true;
      if (companyCache.status !== 'disconnected') companyCache.status = 'connected';
    }
  } else {
    const fileAuth = await useMultiFileAuthState(dir);
    state = fileAuth.state;
    saveCreds = fileAuth.saveCreds;
  }
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  session.sock = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const current = sessions.get(key);
    if (!current || current.generation !== myGen) return;
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      const alreadyLinked = key === 'admin' && (companyCache.status === 'connected' || companyCache.registered);
      if (!alreadyLinked) {
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
      current.status.connected = true;
      current.status.connecting = false;
      current.status.qrAvailable = false;
      current.status.qrDataUrl = null;
      current.status.user = {
        id: sock.user?.id || null,
        name: sock.user?.name || sock.user?.verifiedName || null,
      };
      if (key === 'admin') clearAdminQrFile();
      await persistLink(current, { status: 'connected' });
      console.log(`WhatsApp linked (${key}) as ${current.status.user.name || current.status.user.id}`);
    }

    if (connection === 'close') {
      current.status.connected = false;
      current.status.connecting = false;
      current.status.user = null;
      current.status.qrAvailable = false;
      current.status.qrDataUrl = null;
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.warn(`WhatsApp disconnected (${key})`, loggedOut ? '(logged out)' : `(code ${code || 'unknown'})`);
      current.starting = false;
      current.sock = null;
      if (loggedOut) {
        await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
        if (key === 'admin') clearAdminQrFile();
        await persistLink(current, { status: 'disconnected', phone: null, wa_name: null, clear: true });
      } else if (key === 'admin' && (companyCache.status === 'connected' || companyCache.registered)) {
        await persistLink(current, { status: 'connected' });
      } else {
        await persistLink(current, { status: 'disconnected' });
      }
      setTimeout(() => {
        startSession(key, {
          listenMessages: current.listenMessages,
          accountId: current.accountId,
          hostId: current.hostId,
        }).catch((err) => console.error(`WhatsApp reconnect failed (${key}):`, err.message));
      }, loggedOut ? 1500 : 3000);
    }
  });

  if (session.listenMessages) {
    const { attachMessageHandler } = await import('./messageHandler.js');
    attachMessageHandler(sock, { accountId: session.accountId, hostId: session.hostId, key });
  }

  session.starting = false;
  await persistLink(session, { status: 'connecting' });
  return sock;
}

export async function startWhatsApp(options = {}) {
  await hydrateCompanyCache();
  return startSession('admin', { listenMessages: options.listenMessages !== false });
}

export async function startCompanyWhatsApp() {
  await hydrateCompanyCache();
  const current = getCompanyWhatsAppStatus(true);
  if (current.connected) {
    if (!sessions.get('admin')?.status?.connected) {
      startWhatsApp({ listenMessages: true }).catch((err) => console.error('Company WhatsApp restore failed:', err.message));
    }
    return getCompanyWhatsAppStatus(true);
  }
  if (current.connecting && current.qrDataUrl) return current;
  await startWhatsApp({ listenMessages: true });
  return getCompanyWhatsAppStatus(true);
}

export async function stopCompanyWhatsApp() {
  const session = sessions.get('admin');
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
  sessions.delete('admin');
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
  session.generation = (session?.generation || 0) + 1;
  sessions.delete(key);
  const dir = authDirFor(key);
  await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  if (session) {
    session.status = emptyStatus();
    await persistLink({ ...session, accountId, hostId: session.hostId }, { status: 'disconnected', phone: null, wa_name: null });
  }
}

export async function restoreClientSessions() {
  try {
    const { WhatsAppLink } = await import('../models/index.js');
    const rows = await WhatsAppLink.listLinked();
    for (const row of rows) {
      startClientWhatsApp(row.account_id, row.host_id).catch((err) =>
        console.error(`Restore WhatsApp for account ${row.account_id} failed:`, err.message)
      );
    }
  } catch (err) {
    console.error('Restore client WhatsApp sessions failed:', err.message);
  }
}
