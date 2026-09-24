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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, '../..');
export const AUTH_DIR = path.join(SERVER_ROOT, 'auth_info_baileys');
export const QR_FILE = path.join(SERVER_ROOT, 'whatsapp-qr.png');

const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });

const sessions = new Map();

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
  const status = publicStatus(sessions.get('admin'), includeQr);
  if (status.connected) {
    status.qrDataUrl = null;
    status.qrAvailable = false;
    status.connecting = false;
  }
  return {
    ...status,
    shared: true,
    scope: 'company',
  };
}

async function persistLink(session, extras = {}) {
  if (!session?.accountId) return;
  try {
    const { WhatsAppLink } = await import('../models/index.js');
    await WhatsAppLink.upsert({
      account_id: session.accountId,
      host_id: session.hostId || null,
      phone: extras.phone ?? session.status.user?.id?.split(':')[0] ?? null,
      wa_name: extras.wa_name ?? session.status.user?.name ?? null,
      status: extras.status || (session.status.connected ? 'connected' : session.status.connecting ? 'connecting' : 'disconnected'),
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
  const { state, saveCreds } = await useMultiFileAuthState(dir);
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
        await persistLink(current, { status: 'disconnected', phone: null, wa_name: null });
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
  return startSession('admin', { listenMessages: options.listenMessages !== false });
}

export async function startCompanyWhatsApp() {
  const current = getCompanyWhatsAppStatus(true);
  if (current.connected || current.connecting) return current;
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
