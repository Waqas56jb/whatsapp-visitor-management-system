// A WhatsApp sender that records every message instead of sending it. Set controls.fail to make
// sends to phone numbers fail.
export const sent = [];
export const controls = { fail: false };
let nextId = 1;

export async function sendText(to, text) {
  sent.push({ to: String(to), text: String(text) });
  return true;
}

export async function sendImage(to, image, caption) {
  sent.push({ to: String(to), text: String(caption || ''), image: true });
  return true;
}

export async function sendTextToPhoneDetailed(phone, text) {
  if (controls.fail) return { sent: false, id: null };
  const id = `WAMSG-${nextId++}`;
  sent.push({ to: String(phone), text: String(text), id });
  return { sent: true, id };
}

export async function sendTextToPhone(phone, text) {
  return (await sendTextToPhoneDetailed(phone, text)).sent;
}
