// /api/tts — เสียงพากย์นกจาก Gemini TTS (gemini-3.8-flash-tts รองรับภาษาไทย) คีย์ GEMINI_API_KEY อยู่บนเซิร์ฟเวอร์เท่านั้น
// GET → {ok, voice} · POST {text} → audio/wav (24 kHz mono 16 บิต) · ไม่มีคีย์/เรียกไม่สำเร็จ → เกมใช้เสียงของเบราว์เซอร์แทน
// ข้อตกลง Gemini API: เจ้าของคีย์ต้องอายุ 18+ และแบบฟรี Google นำข้อความไปพัฒนาระบบได้ → ส่งแค่บทของนก ห้ามส่งข้อมูลผู้ป่วย
const MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts';
const VOICE = process.env.GEMINI_TTS_VOICE || 'Sulafat'; // เสียง "Warm" จาก 30 เสียงของ Gemini
const STYLE = 'warm, cheerful and gentle, like a kind young relative guiding an elderly person around; speak clearly and a little slower than normal';
const cache = new Map(); // ข้อความเดิม (เรื่องสำรอง, กดฟังซ้ำ) ไม่ต้องเรียกใหม่ — ประหยัดโควตาฟรี
const CACHE_MAX = 200;

// หาเสียง base64 ในคำตอบ: Interactions API (steps[].content[] type audio / output_audio) หรือแบบเก่า (inlineData)
function findAudio(j) {
  const stack = [j];
  while (stack.length) {
    const x = stack.pop();
    if (!x || typeof x !== 'object') continue;
    if (x.output_audio && typeof x.output_audio.data === 'string') return x.output_audio.data;
    if (x.inlineData && typeof x.inlineData.data === 'string') return x.inlineData.data;
    if (typeof x.data === 'string' && x.data.length > 100 && (x.type === 'audio' || /audio/.test(x.mime_type || x.mimeType || ''))) return x.data;
    for (const v of Object.values(x)) if (v && typeof v === 'object') stack.push(v);
  }
  return null;
}
// รุ่นก่อน ๆ ส่ง PCM ดิบไม่มีหัวไฟล์ → ใส่หัว WAV ให้เบราว์เซอร์เล่นได้
function wav(buf) {
  if (buf.toString('ascii', 0, 4) === 'RIFF') return buf;
  const h = Buffer.alloc(44), n = buf.length;
  h.write('RIFF', 0); h.writeUInt32LE(36 + n, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(n, 40);
  return Buffer.concat([h, buf]);
}

module.exports = async function tts(req, res) {
  const json = (code, body) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };
  const key = process.env.GEMINI_API_KEY;
  if (req.method === 'GET') return json(200, { ok: !!key, voice: key ? VOICE : null });
  if (req.method !== 'POST') return json(405, { error: 'ใช้ได้แค่ GET/POST' });
  // shortcut: กันแค่เว็บอื่นที่เปิดในเบราว์เซอร์ (Origin ปลอมได้จากสคริปต์) ถ้าเปิดสาธารณะจริงควรเพิ่ม rate limit / ล็อกอิน
  const origin = req.headers.origin;
  if (origin && URL.parse(origin)?.host !== req.headers.host) return json(403, { error: 'ไม่อนุญาตเว็บอื่น' });
  if (!key) return json(503, { error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้ง GEMINI_API_KEY' });

  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 8000) return json(413, { error: 'ข้อความยาวเกิน' }); chunks.push(c); }
  let text;
  try { text = String(JSON.parse(Buffer.concat(chunks).toString('utf8')).text || '').replace(/\s+/g, ' ').trim(); } catch { return json(400, { error: 'ต้องเป็น JSON' }); }
  // บทนกเป็นภาษาไทยล้วน ≤ 600 ตัว — กันคนเอาคีย์ไปอ่านข้อความอื่นยาว ๆ
  if (!text || text.length > 600 || /[A-Za-z]/.test(text)) return json(400, { error: 'รับเฉพาะข้อความภาษาไทยไม่เกิน 600 ตัว' });

  let audio = cache.get(text);
  if (!audio) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: STYLE }] }] }],
          response_format: { type: 'audio' },
          generation_config: { speech_config: [{ voice: VOICE }] },
        }),
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) return json(502, { error: r.status == 401 || r.status == 403 ? 'คีย์ Gemini ไม่ถูกต้องหรือไม่มีสิทธิ์' : r.status == 429 ? 'ใช้เกินโควตาฟรีของ Gemini' : 'Gemini รหัส ' + r.status });
      const b64 = findAudio(await r.json());
      if (!b64) return json(502, { error: 'Gemini ไม่ได้ส่งเสียงกลับมา' });
      audio = wav(Buffer.from(b64, 'base64'));
    } catch (e) {
      return json(502, { error: e.name === 'TimeoutError' ? 'Gemini ตอบช้าเกิน 25 วิ' : 'เชื่อมต่อ Gemini ไม่ได้' });
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(text, audio);
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.end(audio);
};
