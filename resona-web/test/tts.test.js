// ทดสอบ /api/tts โดยไม่เรียก Gemini จริง (แทน fetch ด้วยตัวปลอม) — รัน: npm test
const assert = require('assert'), { Readable } = require('stream');
const tts = require('../api/tts.js');

function call(method, body, headers = {}) {
  const req = Readable.from(body == null ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
  Object.assign(req, { method, headers: { host: 'localhost:8787', ...headers } });
  return new Promise(done => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, end(b) { done({ code: this.statusCode, type: this.headers['Content-Type'], body: b }) } };
    tts(req, res);
  });
}
const pcm = Buffer.alloc(4800, 1); // 0.1 วิ
const wavFile = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(40), pcm]);
let sent = [];
const mock = (status, json) => { sent = []; global.fetch = async (url, o) => { sent.push({ url, key: o.headers['x-goog-api-key'], body: JSON.parse(o.body) }); return new Response(JSON.stringify(json), { status }) } };

(async () => {
  delete process.env.GEMINI_API_KEY;
  assert.deepStrictEqual(JSON.parse((await call('GET')).body), { ok: false, voice: null });
  assert.strictEqual((await call('POST', { text: 'สวัสดี' })).code, 503);
  process.env.GEMINI_API_KEY = 'test-gemini';
  assert.deepStrictEqual(JSON.parse((await call('GET')).body), { ok: true, voice: 'Sulafat' });

  // Interactions API: steps[].content[] type audio (WAV มีหัวไฟล์แล้ว) → ส่งต่อเป็น audio/wav
  mock(200, { steps: [{ type: 'model_output', content: [{ type: 'audio', mime_type: 'audio/wav', data: wavFile.toString('base64') }] }] });
  let r = await call('POST', { text: 'มาถึงตลาดน้ำแล้ว  ลมเย็นสบายจัง' }, { origin: 'http://localhost:8787' });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.type, 'audio/wav'); assert.ok(r.body.equals(wavFile));
  const b = sent[0].body;
  assert.strictEqual(sent[0].url, 'https://generativelanguage.googleapis.com/v1beta/interactions'); assert.strictEqual(sent[0].key, 'test-gemini');
  assert.strictEqual(b.model, 'gemini-3.8-flash-tts'); assert.deepStrictEqual(b.generation_config.speech_config, [{ voice: 'Sulafat' }]);
  assert.strictEqual(b.input[0].content[0].text, 'มาถึงตลาดน้ำแล้ว ลมเย็นสบายจัง'); assert.match(b.input[0].content[0].annotations[0].style, /slower/);

  // ข้อความเดิม → ใช้แคช ไม่เรียก Gemini ซ้ำ
  mock(500, {});
  r = await call('POST', { text: 'มาถึงตลาดน้ำแล้ว ลมเย็นสบายจัง' });
  assert.strictEqual(r.code, 200); assert.strictEqual(sent.length, 0);

  // PCM ดิบ (รุ่นเก่า / inlineData) → ใส่หัว WAV ให้
  mock(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: pcm.toString('base64') } }] } }] });
  r = await call('POST', { text: 'ทักลุงดัง ๆ กันเลย' });
  assert.strictEqual(r.body.toString('ascii', 0, 4), 'RIFF'); assert.strictEqual(r.body.readUInt32LE(24), 24000); assert.strictEqual(r.body.length, 44 + pcm.length);
  mock(200, { output_audio: { data: wavFile.toString('base64') } });
  assert.strictEqual((await call('POST', { text: 'ดูสิ วิวสวยมากเลย' })).code, 200);

  // ข้อผิดพลาด → 502 พร้อมเหตุผล (เกมจะใช้เสียงของเบราว์เซอร์แทน)
  for (const [status, why] of [[429, /โควตา/], [403, /คีย์/], [500, /รหัส 500/]]) {
    mock(status, {});
    r = await call('POST', { text: 'ข้อความใหม่ ' + status });
    assert.strictEqual(r.code, 502); assert.match(JSON.parse(r.body).error, why);
  }
  mock(200, { steps: [] });
  assert.match(JSON.parse((await call('POST', { text: 'ไม่มีเสียง' })).body).error, /ไม่ได้ส่งเสียง/);

  // กันการเอาคีย์ไปใช้อย่างอื่น
  assert.strictEqual((await call('POST', { text: 'Read this English text please' })).code, 400);
  assert.strictEqual((await call('POST', { text: 'ก'.repeat(601) })).code, 400);
  assert.strictEqual((await call('POST', { text: '' })).code, 400);
  assert.strictEqual((await call('POST', 'not json')).code, 400);
  assert.strictEqual((await call('POST', { text: 'สวัสดี' }, { origin: 'https://evil.example' })).code, 403);
  assert.strictEqual((await call('PUT')).code, 405);
  console.log('tts tests passed');
})().catch(e => { console.error(e); process.exit(1); });
