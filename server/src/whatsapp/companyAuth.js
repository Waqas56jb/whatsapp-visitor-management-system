import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';
import { CompanyWhatsApp } from '../models/index.js';

function encode(value) {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

function decode(value) {
  if (!value) return null;
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver);
}

export async function useCompanyAuthState() {
  const row = await CompanyWhatsApp.get();
  const creds = decode(row?.creds) || initAuthCreds();
  const keys = decode(row?.keys) || {};

  async function persist(nextCreds = creds, nextKeys = keys) {
    await CompanyWhatsApp.saveAuth({
      creds: encode(nextCreds),
      keys: encode(nextKeys),
    });
  }

  return {
    registered: Boolean(creds?.me?.id),
    creds,
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            let value = keys[type]?.[id];
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }
          return data;
        },
        set: async (data) => {
          for (const type of Object.keys(data || {})) {
            keys[type] = keys[type] || {};
            for (const id of Object.keys(data[type] || {})) {
              const value = data[type][id];
              if (value == null) delete keys[type][id];
              else keys[type][id] = value;
            }
          }
          await persist(creds, keys);
        },
      },
    },
    saveCreds: async () => persist(creds, keys),
  };
}
