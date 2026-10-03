import crypto from 'crypto';

// Reference numbers shown to visitors: PREFIX-YYYY-123456 (visits) or PREFIX-123456.
export function makeRef(prefix, { year = false } = {}) {
  const digits = String(crypto.randomInt(100000, 1000000));
  return year ? `${prefix}-${new Date().getFullYear()}-${digits}` : `${prefix}-${digits}`;
}

// Runs an insert with a fresh reference, retrying when a reference is already taken.
export async function withUniqueRef(prefix, insert, options = {}) {
  let lastError = null;
  for (let i = 0; i < 5; i += 1) {
    try {
      return await insert(makeRef(prefix, options));
    } catch (err) {
      if (err?.code !== '23505') throw err;
      lastError = err;
    }
  }
  throw lastError;
}
