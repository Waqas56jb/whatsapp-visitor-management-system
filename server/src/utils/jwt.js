import jwt from 'jsonwebtoken';

export function signToken(payload, expiresIn = '12h') {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}
