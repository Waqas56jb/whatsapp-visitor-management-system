import bcrypt from 'bcryptjs';
import { Account, Host } from '../models/index.js';

export async function ensureDemoAccounts() {
  const hostHash = await bcrypt.hash('host2026', 10);
  const account = await Account.upsertLogin({
    name: 'Boikarabelo Ramaretlwa',
    username: 'boikarabelo',
    password_hash: hostHash,
    role: 'Host',
    status: 'active',
  });

  let host = (await Host.findByAccountId(account.id)) || (await Host.findByName(account.name));
  if (!host) {
    host = await Host.create({
      name: account.name,
      department: 'Technology Planning',
      phone: '26771000001',
      account_id: account.id,
    });
  } else if (!host.account_id) {
    host = await Host.update(host.id, { account_id: account.id });
  }

  console.log('Host login ready: boikarabelo / host2026');
  return { account, host };
}
