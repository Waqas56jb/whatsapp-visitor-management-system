import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { router } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Railway puts one proxy in front of the app; trusting exactly that hop makes req.ip the real
// client IP (for rate limits) without letting clients spoof it. TRUST_PROXY overrides the hop count.
app.set('trust proxy', process.env.TRUST_PROXY === undefined ? 1 : Number(process.env.TRUST_PROXY) || false);

const extraOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const origins = [
  ...new Set(
    [process.env.ADMIN_ORIGIN, ...extraOrigins, 'https://authentic-vision-production-7a37.up.railway.app'].filter(Boolean)
  ),
];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (origins.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return host.endsWith('.up.railway.app') || host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '8mb' }));
app.use(morgan('dev'));
app.use('/api', router);
app.use(errorHandler);

export default app;
