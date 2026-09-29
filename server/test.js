// Runs the service against a fake Telegram API and checks the order flow.
import assert from 'node:assert/strict';
import http from 'node:http';

const sent = [];
const fakeTg = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { sent.push({ url: req.url, body: JSON.parse(b) }); res.end('{"ok":true}'); }); });
await new Promise(r => fakeTg.listen(0, r));
const tgPort = fakeTg.address().port;
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => realFetch(String(url).replace('https://api.telegram.org', `http://127.0.0.1:${tgPort}`), opts);

Object.assign(process.env, { NO_LISTEN: '1', TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '42', ALLOWED_ORIGINS: 'https://pulat-star.github.io' });
const { server, normalizePhone, validate } = await import('./server.js');
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const post = (body, origin = 'https://pulat-star.github.io') => realFetch(base + '/api/order', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });

assert.equal(normalizePhone('+998 90 123 45 67'), '+998901234567');
assert.equal(normalizePhone('90 123-45-67'), '+998901234567');
assert.equal(normalizePhone('998901234567'), '+998901234567');
assert.equal(normalizePhone('12345'), null);
assert.ok(validate({ name: 'A', phone: '901234567' }).error);

let r = await post({ name: 'Aziz <b>', phone: '+998 90 123 45 67', finish: 'gold', note: 'call after 18:00' });
let j = await r.json();
assert.equal(r.status, 200); assert.ok(j.id.startsWith('ZR-'));
assert.equal(r.headers.get('access-control-allow-origin'), 'https://pulat-star.github.io');
assert.equal(sent.length, 1);
assert.equal(sent[0].body.chat_id, '42');
assert.match(sent[0].body.text, /Aziz &lt;b&gt;/);
assert.match(sent[0].body.text, /\+998901234567/);
assert.match(sent[0].body.text, /Zarafshon Gold/);

r = await post({ name: 'Aziz', phone: '123' }); assert.equal(r.status, 422);
r = await post({ name: 'Bot', phone: '+998901234567', website: 'x' }); assert.equal(r.status, 200); assert.equal(sent.length, 1, 'honeypot must not send');
r = await post({ name: 'Aziz', phone: '+998901234567' }, 'https://evil.example'); assert.equal(r.status, 403);
r = await realFetch(base + '/api/order', { method: 'OPTIONS', headers: { origin: 'https://pulat-star.github.io' } }); assert.equal(r.status, 204);
for (let i = 0; i < 4; i++) await post({ name: 'Aziz', phone: '+998901234567' });
r = await post({ name: 'Aziz', phone: '+998901234567' }); assert.equal(r.status, 429);

console.log('all order tests passed'); server.close(); fakeTg.close();
