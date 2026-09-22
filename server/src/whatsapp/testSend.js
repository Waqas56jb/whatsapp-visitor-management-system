import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const phone = process.argv[2];
if (!phone) {
  console.error('Usage: node src/whatsapp/testSend.js <phone-number>');
  console.error('Example: node src/whatsapp/testSend.js 26771000001');
  process.exit(1);
}

if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
  console.error('Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID in server/.env');
  process.exit(1);
}

const { sendText } = await import('./client.js');

try {
  const result = await sendText(
    phone,
    'WhatsApp VMS test message — your Cloud API credentials are working.'
  );
  console.log('Sent. Graph API response:');
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  const detail = err.response?.data || err.message;
  console.error('Send failed:', JSON.stringify(detail, null, 2));
  console.error('\nCommon fixes:');
  console.error('- The number must include country code with no + or spaces.');
  console.error('- That number must have messaged your WhatsApp business number in the last 24 hours (session window), unless you use an approved template.');
  console.error('- Confirm WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in server/.env.');
  process.exit(1);
}
