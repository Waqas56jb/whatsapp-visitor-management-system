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

let sock = null;
let starting = false;
let listenMessages = true;
let generation = 0;
const status = {
  connected: false,
  connecting: false,
  qrAvailable: false,
  user: null,
};

export function getSock() {
  return sock;
}

export function getQrFilePath() {
  return QR_FILE;
}

export function getWhatsAppStatus() {
  return {
    connected: status.connected,
    connecting: status.connecting,
    qrAvailable: status.qrAvailable && fs.existsSync(QR_FILE),
    user: status.user,
    qrUrl: '/api/whatsapp/qr',
  };
}

async function saveQrImage(qr) {
  await QRCode.toFile(QR_FILE, qr, { width: 512, margin: 2 });
  status.qrAvailable = true;
  console.log(`WhatsApp QR also saved to ${QR_FILE}`);
  console.log('Or open http://localhost:5000/api/whatsapp/qr in a browser.');
}

function clearQrFile() {
  status.qrAvailable = false;
  if (fs.existsSync(QR_FILE)) fs.unlinkSync(QR_FILE);
}

async function wipeAuth() {
  await fs.promises.rm(AUTH_DIR, { recursive: true, force: true });
}

export async function startWhatsApp(options = {}) {
  if (typeof options.listenMessages === 'boolean') listenMessages = options.listenMessages;
  if (starting) return sock;
  starting = true;
  const myGen = ++generation;
  status.connecting = true;
  status.connected = false;

  await fs.promises.mkdir(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    if (myGen !== generation) return;
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\nScan this QR with WhatsApp → Linked Devices → Link a device\n');
      qrcodeTerminal.generate(qr, { small: true });
      await saveQrImage(qr).catch((err) => console.error('Could not write WhatsApp QR image:', err.message));
    }

    if (connection === 'open') {
      status.connected = true;
      status.connecting = false;
      status.qrAvailable = false;
      status.user = {
        id: sock.user?.id || null,
        name: sock.user?.name || sock.user?.verifiedName || null,
      };
      clearQrFile();
      console.log(`WhatsApp linked as ${status.user.name || status.user.id}`);
    }

    if (connection === 'close') {
      status.connected = false;
      status.connecting = false;
      status.user = null;
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.warn('WhatsApp disconnected', loggedOut ? '(logged out)' : `(code ${code || 'unknown'})`);
      starting = false;
      sock = null;
      if (loggedOut) {
        console.warn('Session logged out. Clearing auth_info_baileys and showing a new QR.');
        await wipeAuth().catch(() => {});
        clearQrFile();
      }
      setTimeout(() => {
        startWhatsApp({ listenMessages }).catch((err) => console.error('WhatsApp reconnect failed:', err.message));
      }, loggedOut ? 1500 : 3000);
    }
  });

  if (listenMessages) {
    const { attachMessageHandler } = await import('./messageHandler.js');
    attachMessageHandler(sock);
  }

  starting = false;
  return sock;
}
