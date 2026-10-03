// Background jobs: visit/appointment reminders 1 hour before (companies whose plan includes
// reminders and whose WhatsApp number is connected), every 5 minutes.
import { Company, Visit } from '../models/index.js';
import { hasFeature } from '../config/plans.js';
import { runWithTenant } from '../tenant.js';
import { nowTimeIn, todayIn } from '../utils/dateParse.js';
import { isConnected } from '../whatsapp/connection.js';
import { notifyVisitorReminder } from '../whatsapp/notify.js';
import { companySettings } from './companyConfig.js';

function addMinutes(time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export async function sendDueReminders() {
  const companies = (await Company.list()).filter((c) => c.status === 'active' && hasFeature(c, 'reminders') && isConnected(c.id));
  let sent = 0;
  for (const company of companies) {
    const tz = companySettings(company).timezone;
    const today = todayIn(tz);
    const now = nowTimeIn(tz);
    await runWithTenant(company.id, async () => {
      const due = await Visit.listDueReminders(today, now, addMinutes(now, 60));
      for (const visit of due) {
        // Claim the reminder first so two runs never send it twice.
        if (!(await Visit.markReminded(visit.id))) continue;
        if (await notifyVisitorReminder(visit).catch(() => false)) sent += 1;
      }
    }).catch((err) => console.error(`Reminders failed for company ${company.id}:`, err.message));
  }
  return sent;
}

let timer = null;
export function startJobs() {
  if (timer) return;
  timer = setInterval(() => sendDueReminders().catch((err) => console.error('Reminder job failed:', err.message)), 5 * 60 * 1000);
  timer.unref?.();
}
