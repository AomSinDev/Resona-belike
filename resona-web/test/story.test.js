// ทดสอบคลังคำ (lib/bank.js) และ /api/story โดยไม่เรียก Groq จริง (แทน fetch ด้วยตัวปลอม) — รัน: npm test
const assert = require('assert'), { Readable } = require('stream');
const story = require('../api/story.js'), BANK = require('../lib/bank.js');
const { PROFANE, FORMAL, SLANG, SCENES } = story.rules;
const norm = s => s.replace(/\s+/g, '');

// ---------- คลังคำ: กฎของข้อความที่ผู้เล่นต้องพูด ----------
assert.deepStrictEqual(Object.keys(BANK), ['market', 'beach', 'mountain', 'temple']);
for (const [sc, levels] of Object.entries(BANK)) {
  assert.strictEqual(levels.length, 3, sc);
  levels.forEach((pairs, l) => {
    assert.ok(pairs.length >= 4, `${sc} ด่าน ${l + 1} ควรมีอย่างน้อย 4 คู่`);
    assert.strictEqual(new Set(pairs.map(p => p[0])).size, pairs.length, `${sc} ด่าน ${l + 1} คำซ้ำ`);
    assert.strictEqual(new Set(pairs.map(p => p[1])).size, pairs.length, `${sc} ด่าน ${l + 1} ประโยคซ้ำ`);
    for (const [w, s] of pairs) {
      const at = `${sc} ด่าน ${l + 1}: "${s}"`;
      for (const x of [w, s]) {
        assert.ok(!PROFANE.test(x) && !SLANG.test(x) && !FORMAL.test(x), at + ' มีคำหยาบ/สแลง/ทางการ');
        assert.ok(!/ครับ|ค่ะ/.test(x), at + ' มีครับ/ค่ะ');
        assert.ok(!/[0-9๐-๙A-Za-z]/.test(x), at + ' มีตัวเลข/อังกฤษ (ตัวถอดเสียงพิมพ์ไม่ตรง)');
        assert.ok(!/ๆ/.test(x), at + ' มี ๆ (ตัวถอดเสียงพิมพ์ไม่ตรง)');
      }
      assert.ok(norm(s).includes(norm(w)), at + ` ไม่มีคำ "${w}"`);
      if (l === 0) assert.ok(s.startsWith('สวัสดี'), at + ' ด่าน 1 ต้องขึ้นต้นด้วยสวัสดี');
    }
  });
}

// ---------- /api/story ----------
function call(method, body, headers = {}) {
  const req = Readable.from(body == null ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
  Object.assign(req, { method, headers: { host: 'localhost:8787', ...headers } });
  return new Promise(done => {
    const res = { setHeader() {}, end(s) { done({ code: this.statusCode, json: JSON.parse(s) }) } };
    story(req, res);
  });
}
// Groq ปลอม: แต่งเนื้อเรื่องที่มีคำ (WORD) ของแต่ละด่านตามที่ prompt ให้มา แล้วแก้ทับด้วย patch
// เนื้อเรื่องที่ผ่านกฎของแต่ละโหมด (ดูจากคำสั่งที่ส่งมา): อ่านคำ → ชวนพูด “คำ”, ลากเสียง → ชวนทำเสียง “อาาา”
const good = (words, c = '') => ({ place: 'ตลาดน้ำดำเนินสะดวก', intro: 'มาถึงดำเนินสะดวกแล้ว เรือเยอะมากเลย', ending: 'วันนี้สนุกมากเลย ไว้มากันอีกนะ',
  beats: words.map(w => /TASK: ชวนพูดคำว่า/.test(c) ? `ดูสิ ตรงนี้มี${w} ลองพูดคำว่า “${w}” ดัง ๆ กันเลย` : /TASK: ชวน.*"อา"/.test(c) ? `ดูสิ ตรงนี้มี${w} ลองส่งเสียง “อาาา” ดัง ๆ กันเลย` : `ดูสิ ตรงนี้มี${w} ลองพูดดัง ๆ กันเลย`) });
let sent = [];
const mock = replies => {
  let i = 0; sent = [];
  global.fetch = async (url, o) => {
    const body = JSON.parse(o.body);
    let words = [...body.messages[1].content.matchAll(/WORD "([^"]+)"/g)].map(m => m[1]);
    if (!words.length) try { words = JSON.parse(body.messages[1].content).words || []; } catch {} // รอบตรวจแก้ส่งคำมาเป็น JSON
    sent.push({ url, body, auth: o.headers.Authorization, words });
    const r = replies[i++];
    if (r.status !== 200) return new Response('{}', { status: r.status });
    const content = typeof r.body === 'string' ? r.body : JSON.stringify({ ...good(words, body.messages[1].content), ...(typeof r.body === 'function' ? r.body(words) : r.body) });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  };
};

(async () => {
  delete process.env.GROQ_API_KEY;
  assert.strictEqual((await call('POST', { scene: 'market' })).code, 503, 'no key → 503');
  process.env.GROQ_API_KEY = 'test-groq';

  // ปกติ: คำ/ประโยคมาจากคลังของฉากนั้น ด่านละ 1 คู่ และส่งให้ Groq ในคำสั่ง
  mock([{ status: 200, body: {} }]);
  let r = await call('POST', { scene: 'market', avoid: ['สวัสดี ขอขึ้นเรือได้ไหม'] }, { origin: 'http://localhost:8787' });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.json.scene, 'market'); assert.ok(SCENES.market.places.includes(r.json.place)); assert.strictEqual(r.json.model, 'qwen/qwen3.8-27b');
  r.json.words.forEach((w, l) => assert.deepStrictEqual(BANK.market[l].find(p => p[0] === w), [w, r.json.sentences[l]], 'pair from bank'));
  assert.deepStrictEqual(sent[0].words, r.json.words);
  const b = sent[0].body;
  assert.strictEqual(sent[0].url, 'https://api.groq.com/openai/v1/chat/completions'); assert.strictEqual(sent[0].auth, 'Bearer test-groq');
  assert.strictEqual(b.reasoning_effort, 'none'); assert.deepStrictEqual(b.response_format, { type: 'json_object' });
  assert.match(b.messages[0].content, /ภาษาพูดทั่วไป/); assert.match(b.messages[0].content, /คำหยาบ/);
  assert.match(b.messages[1].content, /ทักทายคนพายเรือ/); assert.match(b.messages[1].content, /SENTENCE "/);

  // รอบตรวจแก้ภาษา: ใช้ฉบับที่แก้แล้วถ้ายังผ่านกฎ, ถ้าฉบับแก้ทำคำของด่านหาย → ใช้ฉบับเดิม
  mock([{ status: 200, body: {} }, { status: 200, body: w => ({ intro: 'มาถึงดำเนินสะดวกแล้ว มีกลิ่นหอมของผลไม้ลอยมาด้วย' }) }]);
  r = await call('POST', { scene: 'market' });
  assert.strictEqual(r.json.intro, 'มาถึงดำเนินสะดวกแล้ว มีกลิ่นหอมของผลไม้ลอยมาด้วย'); assert.strictEqual(r.json.polished, true);
  assert.strictEqual(sent[1].body.temperature, 0.2); assert.match(sent[1].body.messages[0].content, /copy editor/); assert.deepStrictEqual(JSON.parse(sent[1].body.messages[1].content).words, r.json.words);
  mock([{ status: 200, body: {} }, { status: 200, body: w => ({ beats: ['ดูสิ วิวสวยมาก', 'ดูสิ วิวสวยมาก', 'ดูสิ วิวสวยมาก'] }) }]);
  r = await call('POST', { scene: 'market' });
  assert.strictEqual(r.json.polished, false); assert.ok(r.json.beats.every((b, i) => b.includes(r.json.words[i])), 'kept original when polish broke rules');
  mock([{ status: 200, body: {} }, { status: 429 }]);
  assert.strictEqual((await call('POST', { scene: 'market' })).json.polished, false, 'polish quota error → original');

  // ห้ามซ้ำ: ถ้าใช้คู่อื่นไปหมดแล้ว ต้องได้คู่ที่เหลือ
  const keep = BANK.temple.map(level => level[3]), avoid = BANK.temple.flatMap(level => level.filter((_, k) => k !== 3).flat());
  mock([{ status: 200, body: {} }]);
  r = await call('POST', { scene: 'temple', avoid });
  assert.deepStrictEqual(r.json.words, keep.map(p => p[0])); assert.deepStrictEqual(r.json.sentences, keep.map(p => p[1]));

  mock([{ status: 200, body: { intro: 'เรโซน่า: มาถึงดำเนินสะดวกแล้ว' } }]);
  assert.strictEqual((await call('POST', { scene: 'market' })).json.intro, 'มาถึงดำเนินสะดวกแล้ว', 'speaker label stripped');

  // สถานที่: เซิร์ฟเวอร์สุ่มจากรายชื่อจริง ไม่ซ้ำกับที่เคยไป และบอก AI ในคำสั่ง
  const left = SCENES.market.places[5];
  mock([{ status: 200, body: { place: 'สถานที่ที่ AI แต่งเอง' } }]);
  r = await call('POST', { scene: 'market', avoid: SCENES.market.places.filter(p => p !== left) });
  assert.strictEqual(r.json.place, left); assert.ok(sent[0].body.messages[1].content.includes('สถานที่: ' + left));
  for (const p of Object.values(SCENES).flatMap(x => x.places)) assert.ok(!PROFANE.test(p) && !/[A-Za-z]/.test(p), p);

  // กฎภาษาของเนื้อเรื่อง → ไม่ผ่าน 3 ครั้ง → 502 (เกมใช้เรื่องสำรอง) และบอกเหตุผลให้ AI ในครั้งถัดไป
  const BAD = [
    [{ ending: 'เที่ยวสนุกโคตร ๆ ไอ้สัตว์' }, /คำหยาบ "ไอ้สัตว์"|"โคตร"/],
    [{ intro: 'มาถึงแล้ว แม่งสวยมาก' }, /คำหยาบ "แม่ง"/],
    [w => ({ beats: [`พูดเบา ๆ กับ${w[0]}นะ`, `ดูสิ ${w[1]}`, `ดูสิ ${w[2]}`] }), /ชวนพูดเบา/],
    [w => ({ beats: [`ชวนคุณดู${w[0]}`, `ดูสิ ${w[1]}`, `ดูสิ ${w[2]}`] }), /ชวนคุณ/],
    [w => ({ beats: [`ตอนแรกเราเห็น${w[0]}`, `ดูสิ ${w[1]}`, `ดูสิ ${w[2]}`] }), /เล่าแบบนิทาน/],
    [{ intro: 'ข้าพเจ้าพามาตลาดน้ำ' }, /"ข้าพเจ้า"/],
    [{ ending: 'สนุกมากกก เจอกันใหม่นะ' }, /"กกก"/],
    [w => ({ beats: ['ดูสิ วิวสวยมาก', `ดูสิ ${w[1]}`, `ดูสิ ${w[2]}`] }), /ด่าน 1 ต้องมีคำ/],
    [{ ending: 'ดอกไม้บานเต็ม hill เลย' }, /ภาษาอังกฤษ/],
    [{ intro: 'ตอนนี้ไม่มีใครในฉากแล้ว' }, /คัดลอกคำสั่ง/],
    [{ beats: ['ตอนเดียว'] }, /JSON ไม่ครบ/],
  ];
  for (const [bad, why] of BAD) {
    mock([0, 1, 2].map(() => ({ status: 200, body: bad })));
    const r2 = await call('POST', { scene: 'market' });
    assert.strictEqual(r2.code, 502, String(why)); assert.strictEqual(sent.length, 3);
    assert.match(r2.json.error, why); assert.match(sent[2].body.messages[1].content, why);
  }
  assert.ok(!PROFANE.test('กู้ภัยมาช่วย กู่ร้องเรียก เกาะกูด'), 'คำปกติที่มี กู ไม่ใช่คำหยาบ');

  // ติดโควตา (429) → สลับไปรุ่นสำรองที่โควตาแยกกัน
  mock([{ status: 429 }, { status: 200, body: {} }]);
  r = await call('POST', { scene: 'beach' });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.json.model, 'openai/gpt-oss-120b');

  // รุ่นหลักเรียกไม่ได้ → รุ่นสำรอง, JSON ห่อด้วยข้อความ → ยังอ่านได้
  mock([{ status: 404 }, { status: 200, body: 'คำตอบ ' + JSON.stringify(good(BANK.temple.map(l => l[0][0]))) + ' จบ' }]);
  global.Math.random = (orig => () => 0)(Math.random); // บังคับให้สุ่มได้คู่แรกของทุกด่าน
  r = await call('POST', { scene: 'temple' });
  assert.strictEqual(r.code, 200); assert.strictEqual(sent[1].body.model, 'openai/gpt-oss-120b'); assert.strictEqual(sent[1].body.reasoning_effort, 'low'); assert.strictEqual(r.json.model, 'openai/gpt-oss-120b');

  mock([{ status: 200, body: {} }]);
  assert.ok(Object.keys(BANK).includes((await call('POST', { scene: 'mars' })).json.scene), 'unknown scene → valid scene');
  assert.strictEqual((await call('POST', 'not json')).code, 400);
  assert.strictEqual((await call('POST', 'x'.repeat(16001))).code, 413);
  assert.strictEqual((await call('POST', { scene: 'market' }, { origin: 'https://evil.example' })).code, 403);
  assert.strictEqual((await call('GET')).code, 405);
  // โหมดอ่านคำ: คำสั่งให้ชวนพูดคำนั้น และเนื้อเรื่องต้องมี “คำ” ในเครื่องหมายคำพูด
  mock([{ status: 200, body: {} }, { status: 500 }]);
  r = await call('POST', { scene: 'market', mode: 'word' });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.json.mode, 'word'); assert.match(sent[0].body.messages[1].content, /TASK: ชวนพูดคำว่า “/);
  r.json.beats.forEach((b, i) => assert.ok(b.includes('“' + r.json.words[i] + '”')));
  mock([0, 1, 2].map(() => ({ status: 200, body: w => ({ beats: w.map(x => `ดูสิ มี${x} สวยจัง`) }) })));
  r = await call('POST', { scene: 'market', mode: 'word' });
  assert.strictEqual(r.code, 502); assert.match(r.json.error, /ต้องชวนพูดคำว่า/);

  // โหมดลากเสียง: เควสจากเกม + เหตุผลจากฉาก, ที่วัดใช้ "เปล่งเสียง"/ทำนองสวด แทนตะโกน/ไซเรน
  mock([{ status: 200, body: {} }, { status: 500 }]);
  r = await call('POST', { scene: 'temple', mode: 'vowel', quests: ['loud', 'down', 'siren'] });
  const pv = sent[0].body.messages[1].content;
  assert.strictEqual(r.code, 200); assert.strictEqual(r.json.mode, 'vowel');
  assert.match(pv, /เปล่งเสียง "อา" ให้ดังและหนักแน่น/); assert.match(pv, /ไล่เสียง "อา" จากสูงลงต่ำ/); assert.match(pv, /ทำนองสวดมนต์/); assert.match(pv, /ระฆัง/);
  assert.ok(!/ตะโกน "อา"|ไซเรน/.test(pv), 'no shouting/siren at the temple');
  mock([{ status: 200, body: {} }, { status: 500 }]);
  await call('POST', { scene: 'mountain', mode: 'vowel', quests: ['loud', 'long', 'siren'] });
  assert.match(sent[0].body.messages[1].content, /ตะโกน "อา" ให้ดังที่สุด เพราะ.*ลานจอด/); assert.match(sent[0].body.messages[1].content, /น้ำตกดังมาก/);
  mock([0, 1, 2].map(() => ({ status: 200, body: w => ({ beats: w.map(x => `ดูสิ มี${x} ลองพูดดัง ๆ`) }) })));
  r = await call('POST', { scene: 'mountain', mode: 'vowel', quests: ['long', 'long', 'long'] });
  assert.strictEqual(r.code, 502); assert.match(r.json.error, /ต้องชวนทำเสียง/);
  mock([{ status: 200, body: {} }, { status: 500 }]);
  await call('POST', { scene: 'beach', mode: 'vowel', quests: ['hack', 'x'] });
  assert.strictEqual((sent[0].body.messages[1].content.match(/ลากเสียง "อา" ให้ยาวที่สุด/g) || []).length, 3, 'bad quests → default long');
  mock([{ status: 200, body: {} }, { status: 500 }]);
  assert.strictEqual((await call('POST', { scene: 'beach', mode: 'hack' })).json.mode, 'sentence');

  console.log('story tests passed (bank: ' + Object.values(BANK).flat(2).length + ' pairs)');
})().catch(e => { console.error(e); process.exit(1); });
