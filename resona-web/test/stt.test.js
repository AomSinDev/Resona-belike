// ทดสอบ /api/stt โดยไม่เรียก API จริง (แทน fetch ด้วยตัวปลอม) — รัน: npm test
const assert = require('assert'), { Readable } = require('stream');
const stt = require('../api/stt.js');

const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(200)]);
function call(method, body, headers = {}) {
  const req = Readable.from(body ? [body] : []);
  Object.assign(req, { method, headers: { host: 'localhost:8787', ...headers } });
  return new Promise(done => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, end(s) { done({ code: this.statusCode, json: JSON.parse(s) }) } };
    stt(req, res);
  });
}
const calls = [];
const mock = replies => { let i = 0; global.fetch = async (url, o) => { calls.push({ url, auth: o.headers.Authorization, model: o.body.get('model'), lang: o.body.get('language'), type: o.body.get('file').type }); const r = replies[i++]; return new Response(JSON.stringify(r.body), { status: r.status }) } };

(async () => {
  delete process.env.TYPHOON_API_KEY; delete process.env.GROQ_API_KEY;
  assert.deepStrictEqual((await call('GET')).json, { engines: [] });
  assert.strictEqual((await call('POST', WAV)).code, 503, 'no keys → 503');

  process.env.TYPHOON_API_KEY = 'test-typhoon'; process.env.GROQ_API_KEY = 'test-groq';
  assert.deepStrictEqual((await call('GET')).json, { engines: ['typhoon', 'groq'] }, 'GET lists engines, never keys');

  mock([{ status: 200, body: { text: ' สวัสดี ' } }]);
  let r = await call('POST', WAV, { origin: 'http://localhost:8787' });
  assert.deepStrictEqual(r.json, { p: 'typhoon', text: 'สวัสดี' });
  assert.deepStrictEqual(calls.at(-1), { url: 'https://api.opentyphoon.ai/v1/audio/transcriptions', auth: 'Bearer test-typhoon', model: 'typhoon-asr-realtime', lang: null, type: 'audio/wav' });

  mock([{ status: 401, body: {} }, { status: 200, body: { text: 'เรือ' } }]);
  r = await call('POST', WAV);
  assert.deepStrictEqual(r.json, { p: 'groq', text: 'เรือ' }, 'typhoon fails → groq');
  assert.strictEqual(calls.at(-1).lang, 'th');

  mock([{ status: 429, body: {} }, { status: 401, body: {} }]);
  r = await call('POST', WAV);
  assert.strictEqual(r.code, 502); assert.match(r.json.error, /groq: คีย์ไม่ถูกต้อง/);

  assert.strictEqual((await call('POST', WAV, { origin: 'https://evil.example' })).code, 403, 'other site blocked');
  assert.strictEqual((await call('POST', WAV, { origin: 'null' })).code, 403, 'opaque origin blocked, no crash');
  assert.strictEqual((await call('POST', Buffer.from('not a wav file at all'.repeat(5)))).code, 400);
  assert.strictEqual((await call('POST', Buffer.alloc(2_000_001))).code, 413);
  assert.strictEqual((await call('PUT')).code, 405);
  console.log('stt tests passed');
})().catch(e => { console.error(e); process.exit(1); });
