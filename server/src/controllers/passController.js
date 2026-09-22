import { validatePass } from '../services/visits.js';

export async function validatePassEndpoint(req, res) {
  const token = String(req.body.token || '').trim();
  if (!token) {
    return res.status(400).json({ ok: false, reason: 'missing', error: 'Provide token' });
  }
  const result = await validatePass({ token });
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 400;
    return res.status(status).json(result);
  }
  res.json(result);
}
