// Zarafshon ZR·42 order intake: validates the form and forwards it to Telegram.
// No dependencies — Node 22 built-ins only.
import http from 'node:http';

const PORT = Number(process.env.PORT) || 8080;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_IDS = (process.env.TELEGRAM_CHAT_ID || '').split(',').map(s => s.trim()).filter(Boolean);
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://pulat-star.github.io,http://localhost:8000,http://127.0.0.1:8000')
  .split(',').map(s => s.trim()).filter(Boolean);

const FINISHES = { steel: 'Registan Steel', obsidian: 'Night Obsidian', gold: 'Zarafshon Gold', rose: 'Silk Road Rose' };
const MAX_BODY = 4096;

// 5 orders per IP per 10 minutes
const WINDOW_MS = 10 * 60 * 1000, LIMIT = 5;
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  list.push(now); hits.set(ip, list);
  return list.length > LIMIT;
}
setInterval(() => { const now = Date.now(); for (const [ip, l] of hits) if (!l.some(t => now - t < WINDOW_MS)) hits.delete(ip); }, WINDOW_MS).unref();

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Accepts "+998 90 123 45 67", "90 123 45 67", "998901234567", other international numbers.
export function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 9) return '+998' + digits;
  if (digits.length === 12 && digits.startsWith('998')) return '+' + digits;
  if (digits.length >= 10 && digits.length <= 15 && String(raw).trim().startsWith('+')) return '+' + digits;
  return null;
}

export function validate(body) {
  if (!body || typeof body !== 'object') return { error: 'Invalid request.' };
  if (clean(body.website, 100)) return { spam: true }; // honeypot
  const name = clean(body.name, 60);
  const phone = normalizePhone(body.phone);
  const finish = FINISHES[body.finish] ? body.finish : 'steel';
  const note = clean(body.note, 300);
  if (name.length < 2) return { error: 'Enter your name.' };
  if (!phone) return { error: 'Enter a phone number, for example +998 90 123 45 67.' };
  return { order: { name, phone, finish, note } };
}

function orderId() {
  const d = new Date();
  return 'ZR-' + d.toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

async function sendTelegram(o, id) {
  const text = [
    `<b>🕰 New ZR·42 order</b>  <code>${id}</code>`,
    '',
    `<b>Name:</b> ${esc(o.name)}`,
    `<b>Phone:</b> ${esc(o.phone)}`,
    `<b>Finish:</b> ${esc(FINISHES[o.finish])}`,
    o.note ? `<b>Note:</b> ${esc(o.note)}` : null,
    '',
    `<i>${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Tashkent' })} (Tashkent)</i>`,
  ].filter(l => l !== null).join('\n');
  const results = await Promise.all(CHAT_IDS.map(chat_id =>
    fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    }).then(r => r.ok).catch(() => false)));
  return results.some(Boolean);
}

function send(res, status, data, origin) {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', vary: 'Origin' };
  if (origin) Object.assign(headers, { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' });
  res.writeHead(status, headers);
  res.end(data === null ? '' : JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const origin = ORIGINS.includes(req.headers.origin) ? req.headers.origin : null;
  const path = (req.url || '/').split('?')[0];

  if (path === '/health') return send(res, 200, { ok: true, telegram: Boolean(TOKEN && CHAT_IDS.length) });
  if (path !== '/api/order') return send(res, 404, { error: 'Not found.' });
  if (req.method === 'OPTIONS') return send(res, origin ? 204 : 403, null, origin);
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' }, origin);
  if (req.headers.origin && !origin) return send(res, 403, { error: 'Origin not allowed.' });

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size > MAX_BODY) { send(res, 413, { error: 'Request too large.' }, origin); req.destroy(); } else chunks.push(c); });
  req.on('end', async () => {
    if (res.writableEnded) return;
    let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, { error: 'Invalid request.' }, origin); }
    const v = validate(body);
    if (v.spam) return send(res, 200, { ok: true, id: orderId() }, origin);
    if (v.error) return send(res, 422, { error: v.error }, origin);
    if (limited(ip)) return send(res, 429, { error: 'Too many requests. Try again in a few minutes.' }, origin);
    if (!TOKEN || !CHAT_IDS.length) { console.error('order received but Telegram is not configured'); return send(res, 503, { error: 'Orders are temporarily unavailable. Please try again later.' }, origin); }
    const id = orderId();
    const ok = await sendTelegram(v.order, id);
    console.log(`order ${id} ${ok ? 'delivered' : 'FAILED'}`);
    if (!ok) return send(res, 502, { error: 'We could not send your request. Please try again.' }, origin);
    send(res, 200, { ok: true, id }, origin);
  });
});

if (!process.env.NO_LISTEN) server.listen(PORT, () => console.log(`orders service on :${PORT}`));
export { server };
