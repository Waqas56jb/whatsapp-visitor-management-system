// Resource metering and system health. Requests, bandwidth, WhatsApp messages and AI calls are
// counted per company in memory and flushed to the daily usage table once a minute. Request
// latency and errors are kept for the last 15 minutes for the platform health page.
import os from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { query } from '../config/db.js';
import { Usage } from '../models/index.js';
import { optionalTenantId } from '../tenant.js';

const pending = new Map(); // `${companyId}|${metric}` -> value
const recent = []; // { at, ms, status }
const WINDOW_MS = 15 * 60 * 1000;
const startedAt = Date.now();
const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();

export function meter(metric, value = 1, companyId = optionalTenantId()) {
  if (!companyId || !value) return;
  const key = `${companyId}|${metric}`;
  pending.set(key, (pending.get(key) || 0) + value);
}

export async function flushUsage() {
  if (!pending.size) return;
  const items = [...pending.entries()];
  pending.clear();
  for (const [key, value] of items) {
    const [companyId, metric] = key.split('|');
    await Usage.add(Number(companyId), metric, value).catch((err) => {
      if (err?.code === '23503') return; // the company was deleted meanwhile
      // Put it back so the next flush retries.
      pending.set(key, (pending.get(key) || 0) + value);
      console.error('Usage flush failed:', err.message);
    });
  }
}

let timer = null;
export function startMetering() {
  if (timer) return;
  timer = setInterval(() => flushUsage().catch(() => {}), 60 * 1000);
  timer.unref?.();
}

// Express middleware: request count, bytes sent and latency. The company is known only after
// sign-in, so it is read when the response finishes (req.user is set by then).
export function requestMeter() {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      recent.push({ at: Date.now(), ms, status: res.statusCode });
      if (recent.length > 20000) recent.splice(0, recent.length - 20000);
      const companyId = req.user?.companyId;
      if (companyId) {
        meter('api_requests', 1, companyId);
        meter('bandwidth_bytes', Number(res.getHeader('content-length')) || 0, companyId);
      }
    });
    next();
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export async function healthSnapshot(extra = {}) {
  const cutoff = Date.now() - WINDOW_MS;
  while (recent.length && recent[0].at < cutoff) recent.shift();
  const times = recent.map((r) => r.ms).sort((a, b) => a - b);
  const errors = recent.filter((r) => r.status >= 500).length;

  let dbLatencyMs = null;
  let dbOk = false;
  const t0 = process.hrtime.bigint();
  try {
    await query('SELECT 1');
    dbOk = true;
    dbLatencyMs = Math.round((Number(process.hrtime.bigint() - t0) / 1e6) * 10) / 10;
  } catch {
    dbOk = false;
  }

  const mem = process.memoryUsage();
  const round = (n) => Math.round(n * 10) / 10;
  return {
    status: dbOk ? 'operational' : 'degraded',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    startedAt: new Date(startedAt).toISOString(),
    node: process.version,
    cpu: { cores: os.cpus().length, loadAvg: os.loadavg().map(round) },
    memory: {
      rssMb: round(mem.rss / 1048576),
      heapUsedMb: round(mem.heapUsed / 1048576),
      heapTotalMb: round(mem.heapTotal / 1048576),
      systemFreeMb: round(os.freemem() / 1048576),
      systemTotalMb: round(os.totalmem() / 1048576),
    },
    eventLoop: { meanMs: round(loop.mean / 1e6), p99Ms: round(loop.percentile(99) / 1e6), maxMs: round(loop.max / 1e6) },
    database: { ok: dbOk, latencyMs: dbLatencyMs },
    requests: {
      windowMinutes: WINDOW_MS / 60000,
      count: recent.length,
      perMinute: round(recent.length / (WINDOW_MS / 60000)),
      p50Ms: round(percentile(times, 50)),
      p95Ms: round(percentile(times, 95)),
      p99Ms: round(percentile(times, 99)),
      errors5xx: errors,
      errorRate: recent.length ? round((errors / recent.length) * 100) : 0,
    },
    ...extra,
  };
}
