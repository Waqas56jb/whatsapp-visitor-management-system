import jwt from 'jsonwebtoken';

export function signToken(payload, expiresIn = '12h') {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

// When the login's password last changed (ms), or 0 if never. Every token carries the value it
// was issued with; a token whose value no longer matches the database is refused.
export function passwordStamp(row) {
  const value = row?.password_changed_at;
  return value ? new Date(value).getTime() : 0;
}
