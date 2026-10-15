// Optional cloud TTS proxy for "తెలుగు పఠనం".
// Dependency-free Node 18+ server. Keeps the Google Cloud API key on the server.
// It cannot run on GitHub Pages (static hosting only) — deploy it separately.
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.GOOGLE_TTS_API_KEY || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_TEXT = Number(process.env.MAX_TEXT_LENGTH || 1500);
const RATE_PER_MIN = Number(process.env.RATE_LIMIT_PER_MINUTE || 60);
const DEFAULT_VOICE = process.env.DEFAULT_VOICE || 'te-IN-Standard-A';

if (!API_KEY) {
  console.error('GOOGLE_TTS_API_KEY is not set. See server/.env.example');
  process.exit(1);
}
if (ALLOWED_ORIGINS.length === 0) {
  console.error('ALLOWED_ORIGINS is not set (e.g. https://USER.github.io). Refusing to start an open proxy.');
  process.exit(1);
}

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_PER_MIN;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (list.every((t) => now - t >= 60_000)) hits.delete(ip);
}, 60_000).unref();

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    return true;
  }
  return false;
}

function send(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

async function readJson(req, limit = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const clamp = (n, lo, hi, d) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d);

const server = createServer(async (req, res) => {
  const allowed = cors(req, res);
  if (req.method === 'OPTIONS') return send(res, allowed ? 204 : 403, '');
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, 'ok');
  if (req.method !== 'POST' || req.url !== '/synthesize') return send(res, 404, 'Not found');
  if (!allowed) return send(res, 403, 'Origin not allowed');

  const ip = req.socket.remoteAddress || 'unknown';
  if (rateLimited(ip)) return send(res, 429, 'Too many requests');

  try {
    const body = await readJson(req);
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) return send(res, 400, 'Missing text');
    if (text.length > MAX_TEXT) return send(res, 413, `Text longer than ${MAX_TEXT} characters`);
    const languageCode = /^[a-z]{2,3}-[A-Z]{2}$/.test(body.languageCode) ? body.languageCode : 'te-IN';
    const voice = typeof body.voice === 'string' && /^[A-Za-z0-9-]{3,64}$/.test(body.voice) ? body.voice : DEFAULT_VOICE;

    const upstream = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode, name: voice },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: clamp(Number(body.speakingRate), 0.25, 4, 1),
            pitch: clamp(Number(body.pitch), -20, 20, 0),
          },
        }),
      },
    );
    if (!upstream.ok) {
      // Never forward upstream bodies verbatim (could contain key-related info).
      console.error('Upstream error', upstream.status);
      return send(res, 502, `TTS service error ${upstream.status}`);
    }
    const data = await upstream.json();
    const audio = Buffer.from(data.audioContent || '', 'base64');
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length, 'Cache-Control': 'no-store' });
    res.end(audio);
  } catch (error) {
    send(res, error.status || 400, error.status ? error.message : 'Bad request');
  }
});

server.listen(PORT, () => console.log(`TTS proxy listening on :${PORT}; allowed origins: ${ALLOWED_ORIGINS.join(', ')}`));
