// เซิร์ฟเวอร์ในเครื่อง: เปิดเกมจาก public/ และ /api/stt, /api/story, /api/tts (โค้ดเดียวกับบน Vercel)
// รัน: npm start  (คีย์อ่านจากไฟล์ .env.local ถ้ามี — ไฟล์นี้ไม่ถูกเปิดให้เบราว์เซอร์และไม่ขึ้น git)
const http = require('http'), fs = require('fs'), path = require('path');
const API = { '/api/stt': require('./api/stt.js'), '/api/story': require('./api/story.js'), '/api/tts': require('./api/tts.js') };
const ROOT = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const PORT = Number(process.env.PORT) || 8787;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (API[url.pathname]) return API[url.pathname](req, res).catch(() => { res.statusCode = 500; res.end('{"error":"server"}'); });
  let file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.statusCode = 403; return res.end(); } // กัน ../ ออกนอก public
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
}).on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.log(`พอร์ต ${PORT} ถูกใช้อยู่ (มีเซิร์ฟเวอร์ Resona เปิดค้างอยู่แล้ว) → ปิดหน้าต่างเซิร์ฟเวอร์เก่า (Ctrl + C) แล้วเปิดใหม่ หรือเปิด http://localhost:${PORT} ได้เลย`);
  process.exitCode = 1;
}).listen(PORT, '127.0.0.1', () => {
  const on = ['TYPHOON_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY'].filter(k => process.env[k]);
  console.log(`Resona: http://localhost:${PORT}  · คีย์ที่ตั้งไว้: ${on.length ? on.join(', ') : 'ยังไม่มี (ใช้ตัวฟังของเบราว์เซอร์)'}`);
});
