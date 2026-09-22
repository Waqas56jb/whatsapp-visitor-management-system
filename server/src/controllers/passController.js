import { validatePass } from '../services/visits.js';

export async function validatePassEndpoint(req, res) {
  const token = String(req.body.token || '').trim();
  const pin = String(req.body.pin || '').trim();
  if (!token && !pin) {
    return res.status(400).json({ ok: false, reason: 'missing', error: 'Provide token or pin' });
  }
  const result = await validatePass({ token: token || undefined, pin: pin || undefined });
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 400;
    return res.status(status).json(result);
  }
  res.json(result);
}
