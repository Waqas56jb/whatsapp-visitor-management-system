import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { normalizePhone } from '../utils/phone.js';

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v19.0';

function graphBase() {
  return `https://graph.facebook.com/${GRAPH_VERSION}`;
}

function phoneNumberId() {
  return process.env.WHATSAPP_PHONE_NUMBER_ID;
}

function accessToken() {
  return process.env.WHATSAPP_TOKEN;
}

export function isWhatsAppConfigured() {
  return Boolean(accessToken() && phoneNumberId());
}

function messagesUrl() {
  return `${graphBase()}/${phoneNumberId()}/messages`;
}

function mediaUrl() {
  return `${graphBase()}/${phoneNumberId()}/media`;
}

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${accessToken()}`,
    ...extra,
  };
}

async function postMessage(payload) {
  if (!isWhatsAppConfigured()) {
    console.warn('WhatsApp credentials missing — skipped send to', payload.to);
    return { skipped: true };
  }
  try {
    const { data } = await axios.post(messagesUrl(), payload, {
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      timeout: 20000,
    });
    return data;
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('WhatsApp send failed:', JSON.stringify(detail));
    throw err;
  }
}

export async function sendText(to, body) {
  return postMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizePhone(to),
    type: 'text',
    text: { preview_url: false, body },
  });
}

export async function sendInteractiveButtons(to, bodyText, buttons, headerText) {
  const interactive = {
    type: 'button',
    body: { text: bodyText },
    action: {
      buttons: buttons.slice(0, 3).map((btn) => ({
        type: 'reply',
        reply: {
          id: String(btn.id).slice(0, 256),
          title: String(btn.title).slice(0, 20),
        },
      })),
    },
  };
  if (headerText) interactive.header = { type: 'text', text: String(headerText).slice(0, 60) };

  return postMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizePhone(to),
    type: 'interactive',
    interactive,
  });
}

export async function sendInteractiveList(to, bodyText, buttonLabel, rows, headerText) {
  const interactive = {
    type: 'list',
    body: { text: bodyText },
    action: {
      button: String(buttonLabel || 'Choose').slice(0, 20),
      sections: [
        {
          title: 'Hosts',
          rows: rows.slice(0, 10).map((row) => ({
            id: String(row.id).slice(0, 200),
            title: String(row.title).slice(0, 24),
            description: String(row.description || '').slice(0, 72),
          })),
        },
      ],
    },
  };
  if (headerText) interactive.header = { type: 'text', text: String(headerText).slice(0, 60) };

  return postMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizePhone(to),
    type: 'interactive',
    interactive,
  });
}

export async function uploadMedia(buffer, filename = 'visit-pass.png', mime = 'image/png') {
  if (!isWhatsAppConfigured()) {
    console.warn('WhatsApp credentials missing — skipped media upload');
    return null;
  }

  const tmp = path.join(os.tmpdir(), `wvm-${Date.now()}-${filename}`);
  await fs.promises.writeFile(tmp, buffer);
  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mime);
    form.append('file', fs.createReadStream(tmp), { filename, contentType: mime });

    const { data } = await axios.post(mediaUrl(), form, {
      headers: authHeaders(form.getHeaders()),
      timeout: 30000,
      maxBodyLength: Infinity,
    });
    return data?.id || null;
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('WhatsApp media upload failed:', JSON.stringify(detail));
    throw err;
  } finally {
    await fs.promises.unlink(tmp).catch(() => {});
  }
}

export async function sendImage(to, { mediaId, caption } = {}) {
  return postMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizePhone(to),
    type: 'image',
    image: {
      id: mediaId,
      caption: caption || undefined,
    },
  });
}
