// Email for platform announcements. Uses SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and
// SMTP_FROM; when SMTP is not configured, emailing is reported as unavailable (the in-app
// banner still works).
import nodemailer from 'nodemailer';

export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

let transport = null;
function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    });
  }
  return transport;
}

// Sends one email per recipient. Returns how many were sent.
export async function sendEmails(recipients, subject, text) {
  if (!emailConfigured()) return { sent: 0, configured: false };
  let sent = 0;
  for (const to of recipients) {
    try {
      await getTransport().sendMail({ from: process.env.SMTP_FROM, to, subject, text });
      sent += 1;
    } catch (err) {
      console.error(`Announcement email to ${to} failed:`, err.message);
    }
  }
  return { sent, configured: true };
}
