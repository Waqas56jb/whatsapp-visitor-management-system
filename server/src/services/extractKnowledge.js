import { createRequire } from 'module';
import axios from 'axios';

const require = createRequire(import.meta.url);

const MAX_CHARS = 40000;

function cleanText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHARS);
}

function stripHtml(html) {
  return cleanText(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
  );
}

export async function extractFromUpload(file) {
  if (!file?.buffer) throw new Error('No file uploaded');
  const name = String(file.originalname || 'document').trim();
  const lower = name.toLowerCase();
  const mime = String(file.mimetype || '');

  if (lower.endsWith('.txt') || lower.endsWith('.md') || mime.startsWith('text/')) {
    return { title: name, text: cleanText(file.buffer.toString('utf8')) };
  }
  if (lower.endsWith('.pdf') || mime === 'application/pdf') {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(file.buffer);
    return { title: name, text: cleanText(data.text) };
  }
  if (lower.endsWith('.docx') || mime.includes('wordprocessingml')) {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return { title: name, text: cleanText(result.value) };
  }
  throw new Error('Use a PDF, Word (.docx), or text file');
}

function isPrivateHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

export async function extractFromWebsite(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error('Enter a valid website link');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateHost(parsed.hostname)) {
    throw new Error('Only public http(s) website links can be imported');
  }
  const { data, headers } = await axios.get(parsed.href, {
    timeout: 12000,
    maxContentLength: 1_500_000,
    maxRedirects: 3,
    headers: { 'User-Agent': 'BothoInnovationsVMS/1.0' },
    validateStatus: (status) => status >= 200 && status < 400,
  });
  const type = String(headers['content-type'] || '');
  const text = type.includes('html') || typeof data === 'string' ? stripHtml(data) : cleanText(JSON.stringify(data));
  if (!text) throw new Error('No readable text was found on that page');
  return { title: parsed.hostname, url: parsed.href, text };
}
