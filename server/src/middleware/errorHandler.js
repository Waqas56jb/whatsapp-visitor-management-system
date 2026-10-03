export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || (err.name === 'MulterError' || err.type === 'entity.parse.failed' ? 400 : 500);
  if (status < 500 && !err.status) err.status = status;
  // Expected refusals (validation, permissions, limits) are not server errors.
  if (status >= 500) console.error(err);
  if (res.headersSent) return next(err);
  res.status(status).json({ error: status >= 500 && !err.status ? 'Server error' : err.message || 'Server error', ...(err.code && status < 500 ? { code: err.code } : {}) });
}
