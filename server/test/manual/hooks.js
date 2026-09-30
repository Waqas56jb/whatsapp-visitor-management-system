// Module resolve hook: swaps the database, host/visit services and WhatsApp sender for fakes.js.
const FAKED = ['/src/models/index.js', '/src/services/hosts.js', '/src/services/visits.js', '/src/whatsapp/sendMessage.js'];
const FAKES_URL = new URL('./fakes.js', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  const url = resolved.url.replace(/\\/g, '/');
  if (url.endsWith('/src/config/db.js')) throw new Error('transcripts must not load the real database module');
  if (FAKED.some((path) => url.endsWith(path))) return { ...resolved, url: FAKES_URL, shortCircuit: true };
  return resolved;
}
