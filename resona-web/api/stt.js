// /api/stt — ใช้ได้ทั้งบน Vercel (serverless function) และ server.js ในเครื่อง
// GET  → {engines:[...]} ตัวถอดคำที่มีคีย์ (ไม่ส่งคีย์ออกไป)
// POST เสียง WAV (Content-Type: audio/wav) → {p, text} ลอง Typhoon ก่อน ถ้าล้มค่อยลอง Groq
// คีย์อ่านจาก env เท่านั้น: TYPHOON_API_KEY, GROQ_API_KEY
const ENGINES = [
  { id: 'typhoon', env: 'TYPHOON_API_KEY', url: 'https://api.opentyphoon.ai/v1/audio/transcriptions', model: 'typhoon-asr-realtime' },
  { id: 'groq', env: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/audio/transcriptions', model: 'whisper-large-v3', lang: 'th' },
];
const MAX_BYTES = 2_000_000; // ~60 วินาทีของ WAV 16 kHz — กันคนส่งไฟล์ใหญ่มาเผาโควตา

module.exports = async function stt(req, res) {
  const send = (code, body) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };
  const on = ENGINES.filter(e => process.env[e.env]);
  if (req.method === 'GET') return send(200, { engines: on.map(e => e.id) });
  if (req.method !== 'POST') return send(405, { error: 'ใช้ได้แค่ GET/POST' });
  // shortcut: กันแค่เว็บอื่นที่เปิดในเบราว์เซอร์ (Origin ปลอมได้จากสคริปต์) ถ้าเปิดสาธารณะจริงควรเพิ่ม rate limit / ล็อกอิน
  const origin = req.headers.origin;
  if (origin && URL.parse(origin)?.host !== req.headers.host) return send(403, { error: 'ไม่อนุญาตเว็บอื่น' });
  if (!on.length) return send(503, { error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งคีย์' });

  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BYTES) return send(413, { error: 'ไฟล์เสียงยาวเกิน' });
    chunks.push(c);
  }
  const wav = Buffer.concat(chunks);
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') return send(400, { error: 'ต้องเป็นไฟล์ WAV' });

  let last = '';
  for (const e of on) {
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
    form.append('model', e.model);
    if (e.lang) form.append('language', e.lang);
    try {
      const r = await fetch(e.url, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env[e.env] }, body: form, signal: AbortSignal.timeout(9000) });
      if (r.ok) {
        const j = await r.json();
        return send(200, { p: e.id, text: String(j.text || '').trim() });
      }
      last = `${e.id}: ${r.status == 401 ? 'คีย์ไม่ถูกต้อง' : r.status == 429 ? 'ใช้เกินโควตาฟรี' : 'รหัส ' + r.status}`;
    } catch (err) {
      last = `${e.id}: ${err.name === 'TimeoutError' ? 'ตอบช้าเกิน 9 วิ' : 'เชื่อมต่อไม่ได้'}`;
    }
  }
  send(502, { error: last });
};
