// Module resolve hook for the visit-flow tests: the models and the WhatsApp sender are replaced
// by in-memory fakes (flowModels.js, flowSend.js). The fakes themselves still load the real
// modules for everything they do not replace.
const FAKES = {
  '/src/models/index.js': new URL('./flowModels.js', import.meta.url).href,
  '/src/whatsapp/sendMessage.js': new URL('./flowSend.js', import.meta.url).href,
};
const FAKE_URLS = new Set(Object.values(FAKES));

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  if (FAKE_URLS.has(String(context.parentURL || ''))) return resolved;
  const url = resolved.url.replace(/\\/g, '/');
  for (const [suffix, fake] of Object.entries(FAKES)) {
    if (url.endsWith(suffix)) return { ...resolved, url: fake, shortCircuit: true };
  }
  return resolved;
}
