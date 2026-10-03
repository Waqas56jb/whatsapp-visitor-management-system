// Slack notifications for a company (plans with the Slack feature): new visit requests,
// check-ins, complaints, service requests and handovers, posted to the company's webhook.
import axios from 'axios';
import { Company } from '../models/index.js';
import { hasFeature } from '../config/plans.js';
import { companySettings } from './companyConfig.js';
import { optionalTenantId } from '../tenant.js';

export async function notifySlack(event, text, companyId = optionalTenantId()) {
  try {
    if (!companyId) return false;
    const company = await Company.findById(companyId);
    if (!company || !hasFeature(company, 'slack')) return false;
    const { integrations } = companySettings(company);
    if (!integrations.slackWebhook || integrations.slackEvents?.[event] === false) return false;
    await axios.post(integrations.slackWebhook, { text }, { timeout: 5000 });
    return true;
  } catch (err) {
    console.error(`Slack notify failed (${event}):`, err.message);
    return false;
  }
}

export async function testSlack(webhook, companyName) {
  await axios.post(webhook, { text: `✅ ${companyName}: Slack notifications are connected to the visitor management system.` }, { timeout: 5000 });
}
