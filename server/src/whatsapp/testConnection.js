import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log('Starting Baileys in isolation (no Express, no message bot).');
console.log('Scan the QR in this terminal, or open server/whatsapp-qr.png');
console.log('WhatsApp → Linked Devices → Link a device');
console.log('Press Ctrl+C when the session is linked.\n');

const { startWhatsApp } = await import('./connection.js');
await startWhatsApp({ listenMessages: false });
