// Module resolve hook: every import of src/models/index.js gets the in-memory login tables from
// authModels.js (which itself re-exports the real module for everything else).
const FAKE_URL = new URL('./authModels.js', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  const fromFake = String(context.parentURL || '') === FAKE_URL;
  if (!fromFake && resolved.url.replace(/\\/g, '/').endsWith('/src/models/index.js')) {
    return { ...resolved, url: FAKE_URL, shortCircuit: true };
  }
  return resolved;
}
