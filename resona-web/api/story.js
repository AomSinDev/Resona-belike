// /api/story — ทริปใหม่ทุกครั้ง: คำ/ประโยคที่ผู้เล่นพูดสุ่มจากคลังที่คนเขียน (lib/bank.js) แล้วให้ Groq แต่งสถานที่ + เนื้อเรื่องพาไปถึงคำ/ประโยคนั้น
// เหตุผล: AI รุ่นฟรีแต่งประโยคให้ผู้เล่นพูดได้ไม่เป็นธรรมชาติ ("สวัสดีพี่ ดูทรายเรียบ") แต่แต่งเนื้อเรื่องรอบประโยคที่ให้ไปได้ดี
// POST {scene, avoid:[สถานที่/คำ/ประโยคที่เคยใช้]} → {scene, model, place, intro, beats[3], ending, words[3], sentences[3]}
// prompt อยู่ฝั่งเซิร์ฟเวอร์ทั้งหมด เบราว์เซอร์ส่งได้แค่ชื่อฉากกับรายการห้ามซ้ำ — กันคนเอาคีย์ไปใช้แต่งอย่างอื่น
const BANK = require('../lib/bank.js');

// กิจกรรมแต่ละด่านต้องตรงกับฉากที่วาดไว้ในเกม · places = สถานที่จริงให้เซิร์ฟเวอร์สุ่ม (AI ชอบเลือกที่ดังที่สุดซ้ำ ๆ และอาจแต่งชื่อที่ไม่มีจริง)
const SCENES = {
  market: { th: 'ตลาดน้ำ', places: ['ตลาดน้ำดำเนินสะดวก ราชบุรี', 'ตลาดน้ำตลิ่งชัน กรุงเทพฯ', 'ตลาดน้ำคลองลัดมะยม กรุงเทพฯ', 'ตลาดน้ำบางน้ำผึ้ง สมุทรปราการ', 'ตลาดน้ำท่าคา สมุทรสงคราม', 'ตลาดน้ำดอนหวาย นครปฐม', 'ตลาดน้ำขวัญเรียม กรุงเทพฯ', 'ตลาดน้ำบางคล้า ฉะเชิงเทรา', 'ตลาดน้ำวัดตะเคียน นนทบุรี', 'ตลาดน้ำบางพลี สมุทรปราการ', 'ตลาดน้ำลำพญา นครปฐม', 'ตลาดน้ำสี่ภาค พัทยา'], acts: ['ทักทายคนพายเรือที่ท่าเรือ', 'สั่งผลไม้จากแม่ค้าที่แผง', 'นั่งพักที่ศาลาริมน้ำ (nobody else there)'] },
  beach: { th: 'ทะเลหรือเกาะ', places: ['หาดหัวหิน ประจวบคีรีขันธ์', 'เกาะเสม็ด ระยอง', 'เกาะช้าง ตราด', 'หาดบางแสน ชลบุรี', 'เกาะล้าน ชลบุรี', 'หาดชะอำ เพชรบุรี', 'เกาะสมุย สุราษฎร์ธานี', 'เกาะลันตา กระบี่', 'หาดอ่าวนาง กระบี่', 'หาดกะรน ภูเก็ต', 'เกาะกูด ตราด', 'หาดจอมเทียน ชลบุรี'], acts: ['ทักทายคนริมหาด', 'สั่งของที่ร้านน้ำมะพร้าว', 'ชมพระอาทิตย์ตก (nobody else there)'] },
  mountain: { th: 'ภูเขา ดอย หรือน้ำตก', places: ['ดอยสุเทพ เชียงใหม่', 'ดอยอ่างขาง เชียงใหม่', 'ดอยหลวงเชียงดาว เชียงใหม่', 'ภูชี้ฟ้า เชียงราย', 'ดอยแม่สลอง เชียงราย', 'ภูกระดึง เลย', 'ภูทับเบิก เพชรบูรณ์', 'เขาใหญ่ นครราชสีมา', 'ดอยผ้าห่มปก เชียงใหม่', 'ภูหินร่องกล้า พิษณุโลก', 'ดอยม่อนแจ่ม เชียงใหม่', 'อุทยานแห่งชาติเอราวัณ กาญจนบุรี'], acts: ['ทักทายคนขับรถที่ลานจอดรถ', 'ตะโกนบอกเพื่อนร่วมทริปแข่งกับเสียงน้ำตก', 'ชูธงบนยอดดอยแล้วตะโกนความรู้สึก'] },
  temple: { th: 'วัดหรือโบราณสถาน', places: ['วัดพระแก้ว กรุงเทพฯ', 'วัดอรุณราชวราราม กรุงเทพฯ', 'วัดโพธิ์ กรุงเทพฯ', 'วัดเบญจมบพิตร กรุงเทพฯ', 'วัดพระธาตุดอยสุเทพ เชียงใหม่', 'วัดร่องขุ่น เชียงราย', 'วัดมหาธาตุ อยุธยา', 'วัดไชยวัฒนาราม อยุธยา', 'วัดพระธาตุพนม นครพนม', 'วัดพระธาตุหริภุญชัย ลำพูน', 'วัดภูมินทร์ น่าน', 'วัดพระศรีรัตนมหาธาตุ พิษณุโลก'], acts: ['ทักทายลุงยามที่ประตูวัด', 'ถามทางพระภิกษุที่ลานเจดีย์', 'กล่าวคำอธิษฐานหน้าพระพุทธรูป'] },
};
// ทริปตัวอย่างที่เขียนเป็นภาษาพูดตามที่ต้องการ — AI เลียนแบบตัวอย่างได้ดีกว่าทำตามกฎ
const EXAMPLE = {
  place: 'ตลาดน้ำอัมพวา',
  intro: 'มาถึงอัมพวาแล้ว! ตลาดน้ำที่นี่เก่าแก่มาก มีเรือขายของเต็มคลองเลย',
  beats: ['ดูสิ มีเรือลำเล็กพายมาจอดที่ท่าพอดี พี่คนพายเรือโบกมือให้ด้วย ทักพี่เขาดัง ๆ กันเลย', 'แผงนี้มีมะม่วงสุกเหลืองน่ากินมาก แม่ค้ายิ้มรออยู่ ลองถามแม่ค้าดูสิว่าหวานไหม', 'เดินมาเหนื่อยแล้ว นั่งพักที่ศาลาริมน้ำกันก่อน ลมเย็นสบายเลย บอกหน่อยว่ารู้สึกยังไง'],
  ending: 'วันนี้เที่ยวสนุกมากเลย ไว้มาตลาดน้ำด้วยกันอีกนะ',
};
const EXAMPLE_GIVEN = { words: ['เรือ', 'มะม่วง', 'ศาลา'], sentences: ['สวัสดีพี่ ขอนั่งเรือด้วยได้ไหม', 'แม่ค้า มะม่วงหวานไหม', 'นั่งพักที่ศาลาสบายจังเลย'] };
// คำทางการ/สแลง/ภาษาแชตที่ไม่ใช่ "ภาษาพูดทั่วไป" — ตรวจซ้ำหลัง AI ตอบ (prompt อย่างเดียวไม่พอ)
const FORMAL = /ข้าพเจ้า|กระผม|ดิฉัน|ดำเนินการ|รับประทาน|ประสงค์|ดังกล่าว|ทัศนียภาพ|อันงดงาม|กรุณา|ยิ่งนัก|เป็นอย่างยิ่ง/;
// ลากตัวอักษรท้ายคำแบบแชต (มากกก) — ดูเฉพาะท้ายคำ เพราะกลางคำมีอักษรซ้ำได้จริง เช่น "เรือออก"
const SLANG = /โคตร|ว่ะ|เว้ย|555|(\S)\1\1(?=[\s!?.,]|$)/;
// คำหยาบ — ห้ามเด็ดขาด · ใช้ตรวจคลังคำใน npm test ด้วย (ไม่ใส่ กู เพราะอยู่ในคำปกติ เช่น เกาะกูด กู้ภัย — มึง จับคำพูดระดับนี้ได้แล้ว)
const PROFANE = /ควย|เหี้ย|เชี่ย|สัส|แม่ง|มึง|เย็ด|ตอแหล|ระยำ|ชิบหาย|ส้นตีน|จัญไร|อีดอก|ไอ้สัตว์|สถุน/;
// Groq ปลดรุ่นบ่อย (ณ 21 พ.ย. 2569 ใช้ได้: openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b) เปลี่ยนรุ่นได้ด้วย env GROQ_STORY_MODEL
// Qwen เขียนไทยเป็นธรรมชาติกว่า gpt-oss (ลองเทียบแล้ว 21 พ.ย. 2569) แต่เผลอใส่อังกฤษ/คำสั่งบ้าง → check() จับแล้วขอใหม่
const MODELS = [process.env.GROQ_STORY_MODEL || 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b'];
const norm = s => String(s).replace(/\s+/g, '');
const str = (x, min, max) => typeof x === 'string' && x.trim().length >= min && x.trim().length <= max;
const three = (a, min, max) => Array.isArray(a) && a.length === 3 && a.every(x => str(x, min, max));

function pickPlace(scene, avoid) {
  const used = new Set(avoid.map(norm)), all = SCENES[scene].places, fresh = all.filter(p => !used.has(norm(p)));
  const pool = fresh.length ? fresh : all;
  return pool[Math.floor(Math.random() * pool.length)];
}
// สุ่มคู่ [คำ, ประโยค] ด่านละ 1 คู่ ที่ไม่อยู่ในรายการห้ามซ้ำ (ถ้าใช้หมดแล้วสุ่มจากทั้งหมด)
function pickPairs(scene, avoid) {
  const used = new Set(avoid.map(norm));
  return BANK[scene].map(level => {
    const fresh = level.filter(([w, s]) => !used.has(norm(w)) && !used.has(norm(s)));
    const pool = fresh.length ? fresh : level;
    return pool[Math.floor(Math.random() * pool.length)];
  });
}

// ภารกิจลากเสียงแต่ละแบบ (ตรงกับ TIERS ในเกม) — บอก AI ว่าต้องชวนผู้เล่นทำเสียงอะไร
const QUESTS = { long: 'ลากเสียง "อา" ให้ยาวที่สุด', loud: 'ตะโกน "อา" ให้ดังที่สุด', up: 'ไล่เสียง "อา" จากต่ำขึ้นสูง', down: 'ไล่เสียง "อา" จากสูงลงต่ำ', steady: 'ลากเสียง "อา" ให้นิ่งไม่สั่น', siren: 'ทำเสียงไซเรน "อา" ขึ้นสูงแล้วลงต่ำ' };
const QUESTS_TEMPLE = { loud: 'เปล่งเสียง "อา" ให้ดังและหนักแน่น', siren: 'ไล่เสียง "อา" ขึ้นสูงแล้วลงต่ำ เหมือนทำนองสวดมนต์' }; // ในวัดไม่ตะโกน/ไม่ทำเสียงไซเรน
const MODES = ['sentence', 'word', 'vowel'];
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// เหตุผลในฉากที่ทำให้ต้องส่งเสียง "อา" (โหมดลากเสียง) — ให้เข้ากับบริบท และสุภาพ (ที่วัดไม่ตะโกนใส่พระ ใช้ส่งเสียงตามระฆัง/เปล่งเสียงสงบ ๆ แทน)
const CALLS = {
  market: ['พี่คนพายเรืออยู่ไกล ส่งเสียงเรียกให้เขาหันมา', 'ตลาดคนเยอะเสียงดัง ส่งเสียงเรียกแม่ค้าให้ได้ยิน', 'นั่งพักรับลมเย็น ส่งเสียงยาว ๆ ให้ชื่นใจ'],
  beach: ['คนริมหาดอยู่ไกลและคลื่นดัง ส่งเสียงเรียกให้ได้ยิน', 'ร้านมะพร้าวคนเยอะ ส่งเสียงเรียกคนขาย', 'พระอาทิตย์กำลังตก ส่งเสียงยาว ๆ ไปพร้อมกับพระอาทิตย์'],
  mountain: ['คนขับรถยืนอยู่อีกฝั่งลานจอด ส่งเสียงเรียกเขา', 'น้ำตกดังมาก ต้องส่งเสียงแข่งกับน้ำตกให้เพื่อนได้ยิน', 'ถึงยอดดอยแล้ว ตะโกนดีใจให้เสียงก้องไปทั้งหุบเขา'],
  temple: ['ลุงยามอยู่ตรงประตูไกล ๆ ส่งเสียงทักให้ลุงได้ยิน', 'เพิ่งตีระฆัง ส่งเสียงยาว ๆ ตามเสียงระฆังที่ก้องอยู่', 'หน้าพระพุทธรูป เปล่งเสียงยาว ๆ อย่างสงบเหมือนสวดมนต์'],
};
// สิ่งที่ผู้เล่นทำหลังจบเนื้อเรื่องของด่าน แยกตามโหมดเกม — เนื้อเรื่องต้องชวนไปสู่สิ่งนี้ และมีเหตุผลจากสิ่งที่เกิดในฉาก
function task(mode, w, s, qt, sc, i) {
  if (mode === 'word') return `ชวนพูดคำว่า “${w}” ดัง ๆ ชัด ๆ โดยมีเหตุผลจากสิ่งที่เกิดตรงนั้น เช่น บอกคนในฉากว่าอยากได้/เห็นสิ่งนี้ หรือชมสิ่งนี้ (เขียนคำนี้ในเครื่องหมาย “ ” ในเรื่องด้วย)`;
  if (mode === 'vowel') return `ชวน${(sc === 'temple' && QUESTS_TEMPLE[qt]) || QUESTS[qt]} เพราะ${CALLS[sc][i]} (เขียนเสียงในเครื่องหมาย “ ” เช่น “อาาา”)`;
  return `ชวนพูดสิ่งที่ตรงกับ SENTENCE "${s}" (อย่ายกประโยคมาทั้งประโยค)`;
}

// คืนเหตุผลถ้าใช้ไม่ได้, null ถ้าผ่าน (ตรวจเฉพาะส่วนที่ AI แต่ง — คำ/ประโยคมาจากคลัง ตรวจใน npm test แล้ว)
function check(t, words, mode = 'sentence') {
  if (!t || !str(t.intro, 10, 300) || !three(t.beats, 5, 240) || !str(t.ending, 5, 200)) return 'JSON ไม่ครบตามรูปแบบ (ต้องมี intro, beats 3 ตอน, ending)';
  const all = [t.intro, ...t.beats, t.ending].join(' ');
  if (/พูดเบา|เสียงเบา|กระซิบ/.test(all)) return 'มีการชวนพูดเบา';
  if (/ชวนคุณ|เชิญคุณ|ชวนผู้เล่น/.test(all)) return 'ไกด์พูดถึงผู้เล่นแทนที่จะพูดกับผู้เล่น (ชวนคุณ/เชิญคุณ)';
  if (/[A-Za-z]/.test(all)) return 'มีภาษาอังกฤษปน ให้ใช้ภาษาไทยทั้งหมด';
  if (/ในฉาก|WORD|SENTENCE|TASK|ด่าน ?[1-3]/.test(all)) return 'คัดลอกคำสั่งมาใส่ในเรื่อง ให้เขียนเป็นคำพูดของเรโซน่าเท่านั้น';
  if (/ตอนแรก|ต่อมา|สุดท้าย/.test(t.beats.join(' '))) return 'เล่าแบบนิทาน (ตอนแรก/ต่อมา/สุดท้าย) ให้พูดกับผู้เล่นตอนนี้เลย';
  const p = all.match(PROFANE);
  if (p) return `มีคำหยาบ "${p[0]}" ห้ามใช้เด็ดขาด`;
  const f = all.match(FORMAL) || all.match(SLANG);
  if (f) return `ใช้คำ "${f[0]}" ซึ่งไม่ใช่ภาษาพูดทั่วไป`;
  // เนื้อเรื่องต้องพาไปหาคำของด่านนั้น ไม่งั้นคำที่ให้อ่านลอย ๆ ไม่เข้ากับเรื่อง
  const miss = words.findIndex((w, i) => !norm(t.beats[i]).includes(norm(w)));
  if (miss >= 0) return `เนื้อเรื่องด่าน ${miss + 1} ต้องมีคำ "${words[miss]}" อยู่ในเรื่องตรง ๆ`;
  // เนื้อเรื่องต้องชวนไปสู่ภารกิจของโหมดนั้น: ลากเสียง → ชวนทำเสียง “อาาา”, อ่านคำ → ชวนพูดคำนั้น
  if (mode === 'vowel') { const m = t.beats.findIndex(b => !/[“"]\s*อ[าะ]/.test(b)); if (m >= 0) return `เนื้อเรื่องด่าน ${m + 1} ต้องชวนทำเสียง เช่น “อาาา” (เขียนเสียงในเครื่องหมาย “ ”)`; }
  if (mode === 'word') { const m = words.findIndex((w, i) => !new RegExp('[“"]\\s*' + reEsc(w) + '\\s*[”"]').test(t.beats[i])); if (m >= 0) return `เนื้อเรื่องด่าน ${m + 1} ต้องชวนพูดคำว่า “${words[m]}” (เขียนคำในเครื่องหมาย “ ”)`; }
  return null;
}

function prompt(sc, place, pairs, why, mode = 'sentence', quests = []) {
  const S = SCENES[sc];
  return [
    // กฎเขียนเป็นอังกฤษเพื่อประหยัด token (ไทยกิน token มาก) ตัวอย่างเป็นไทย · หลักจากงานวิจัยภาษาพูดไทย: ระดับภาษาพูดทั่วไป, ละสรรพนาม, คำลงท้ายเท่าที่มีความหมาย, ไม่ใช่ภาษาแปล/แชต/สแลง
    { role: 'system', content: `You write the guide's lines for one trip in a Thai speech-therapy travel game for older adults with Parkinson's disease (LSVT LOUD). The guide is a parrot named "เรโซน่า" talking to the player. Each level has a fixed WORD that must appear in the story and a TASK the player does right after the beat (say a sentence, say the word, or make an "อา" sound); your story must lead naturally to that task. Reply with JSON only.

LANGUAGE = neutral everyday spoken Central Thai (ภาษาพูดทั่วไป ระดับปกติ): what an ordinary Thai adult actually says out loud. NOT written/formal Thai, NOT news/textbook/translated-English Thai, NOT teen slang, NOT chat spelling (555, มากกก), NOT regional dialect.
- Everyday words: กิน not รับประทาน, อยาก not ประสงค์, ดู not ตรวจสอบ, บอก not แจ้งให้ทราบ, เพราะ not เนื่องจาก, ที่นี่/ตรงนั้น not สถานที่ดังกล่าว.
- Drop pronouns when context is clear; never repeat คุณ. The guide may say เรา meaning "us".
- Particles (นะ เลย จัง เนอะ หน่อย สิ กันเถอะ) only where they add meaning, never on every sentence. Interjections (ว้าว ดูสิ เอาล่ะ) at most once per beat.
- Short sentences, one breath each. Never tell the player to speak softly or whisper; invite speaking loud and clear.
- Absolutely no rude, vulgar or insulting words (คำหยาบ), even jokingly.
- A monk is always called หลวงพ่อ or หลวงพี่ (never พี่พระ or พระเฉย ๆ); at a temple keep the tone calm and respectful.

GUIDE LINES: the parrot's own spoken words, no speaker label. Talk directly to the player right now, warm and respectful to an older listener, like a cheerful younger relative standing next to them. Do not narrate like a storybook (no ตอนแรก / ต่อมา / สุดท้าย); never copy these instructions. Speak TO the player: "ทักลุงดัง ๆ กันเลย", never "ชวนคุณทักลุง" or "เชิญคุณ…".
- intro: 1-2 sentences, arrive at the given place and say one simple, well-known true thing about it (if unsure, just describe the view; never invent facts).
- beat n: 1-2 sentences describing what is in front of them; MUST contain WORD n exactly as written; then invite the player to do TASK n. Write any word or sound the player must say inside “ ” (e.g. ลองพูดคำว่า “เรือ” ดัง ๆ / ลองตะโกนว่า “อาาา” ยาว ๆ).
- When TASK n is about a SENTENCE, the person in beat n must fit its address term: พี่ = someone a bit older, น้อง = someone younger (a child or young adult), ลุง/ป้า = an older man/woman, แม่ค้า = a woman selling things, หลวงพ่อ/หลวงพี่ = a monk. Never describe a grandmother if the sentence says น้อง.
- ending: 1 sentence closing the trip.

Style examples (do not copy):
✗ ท่านจะได้ชมทัศนียภาพอันงดงาม → ✓ ดูสิ วิวสวยมากเลย
✗ ตอนแรกเรามาถึงประตูวัด เราเห็นลุงยามยิ้มรับ → ✓ ถึงหน้าวัดแล้ว ลุงยามยิ้มรออยู่ตรงประตูเลย ทักลุงดัง ๆ กันเถอะ
✗ ขอบคุณที่เดินทางกับเรา แล้วพบกันใหม่นะ → ✓ วันนี้เที่ยวสนุกมากเลย ไว้มาด้วยกันอีกนะ
Sound task ✓ พี่คนพายเรืออยู่ไกลเลย ลองตะโกนเรียกเขาว่า “อาาา” ยาว ๆ ดัง ๆ ดูสิ
Word task ✓ ดูสิ เรือลำเล็กจอดอยู่ที่ท่าพอดี ลองพูดคำว่า “เรือ” ดัง ๆ ชัด ๆ กันเลย

A complete example (different trip — write NEW lines, never copy it):
given ${JSON.stringify(EXAMPLE_GIVEN)}
place "${EXAMPLE.place}" → answer ${JSON.stringify({ intro: EXAMPLE.intro, beats: EXAMPLE.beats, ending: EXAMPLE.ending })}` },
    { role: 'user', content:
`สถานที่: ${place} (${S.th})
${pairs.map(([w, s], i) => `ด่าน ${i + 1}: ${S.acts[i]} · WORD "${w}" · TASK: ${task(mode, w, s, quests[i], sc, i)}`).join('\n')}
ตอบ JSON: {"intro":"...","beats":["...","...","..."],"ending":"..."}
${why ? 'คำตอบครั้งก่อนใช้ไม่ได้เพราะ: ' + why + ' — แก้ให้ถูก' : ''}` },
  ];
}

async function groq(model, messages, temperature = 0.8) {
  const body = { model, messages, temperature, max_completion_tokens: 2000, response_format: { type: 'json_object' } };
  if (model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low';
  if (model.startsWith('qwen/')) body.reasoning_effort = 'none'; // ปิดโหมดคิด ไม่งั้นข้อความ <think> ปนกับ JSON
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw Object.assign(new Error('Groq รหัส ' + r.status), { status: r.status });
  const c = (await r.json()).choices?.[0]?.message?.content || '';
  return JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1));
}

// รอบ 2: ให้ AI ตรวจแก้ไวยากรณ์/ลำดับคำ/คำที่ไม่เข้ากัน (เช่น "มีหอมกลิ่น" → "มีกลิ่นหอม") ซึ่ง regex ตรวจไม่ได้
// ถ้าฉบับแก้ผิดกฎ (check) หรือเรียกไม่สำเร็จ ใช้ฉบับเดิมที่ผ่านกฎแล้ว — เพิ่มเวลา ~1 วิ และใช้โควตาเพิ่ม 1 ครั้งต่อทริป
async function polish(model, t, words, sentences, mode = 'sentence') {
  const messages = [
    { role: 'system', content: `You are a careful native Thai copy editor. Below are a parrot guide's spoken lines for a game for elderly Thai people. Fix grammar, word order, wrong collocations, typos and anything a native Thai speaker would find odd, so every line is natural everyday spoken Thai (ภาษาพูดทั่วไป). Keep the meaning, roughly the same length, keep each WORD in its beat exactly as written, and keep every quoted word or sound in “ ” (such as “เรือ” or “อาาา”) exactly. No ครับ/ค่ะ, no English, no rude words, never tell the player to speak softly. Make the person in each beat fit the address term in that level's sentence (พี่ older, น้อง younger, ลุง/ป้า older man/woman, หลวงพ่อ monk). If a line is already natural, leave it unchanged.
Examples of fixes: "มีหอมกลิ่นข้าวโพดปิ้งลอยมา" → "มีกลิ่นหอมของข้าวโพดปิ้งลอยมา" · "ลองทักป้ายดัง ๆ" → "ลองถามพี่คนขับดัง ๆ ว่าป้ายนี้ไปไหน" · "ชวนคุณทักลุง" → "ทักลุงกันเลย" · "พี่พระยืนรออยู่" → "หลวงพี่ยืนรออยู่"
Reply with JSON only: {"intro":"...","beats":["...","...","..."],"ending":"..."}` },
    { role: 'user', content: JSON.stringify({ words, sentences, intro: t.intro, beats: t.beats, ending: t.ending }) },
  ];
  try { const p = await groq(model, messages, 0.2); return check(p, words, mode) ? t : p; } catch { return t; }
}

module.exports = story;
module.exports.rules = { PROFANE, FORMAL, SLANG, SCENES, CALLS }; // ให้ test ใช้ตรวจคลังคำด้วยกฎเดียวกัน
async function story(req, res) {
  const send = (code, body) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST') return send(405, { error: 'ใช้ได้แค่ POST' });
  // shortcut: กันแค่เว็บอื่นที่เปิดในเบราว์เซอร์ (Origin ปลอมได้จากสคริปต์) ถ้าเปิดสาธารณะจริงควรเพิ่ม rate limit / ล็อกอิน
  const origin = req.headers.origin;
  if (origin && URL.parse(origin)?.host !== req.headers.host) return send(403, { error: 'ไม่อนุญาตเว็บอื่น' });
  if (!process.env.GROQ_API_KEY) return send(503, { error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้ง GROQ_API_KEY' });

  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 16000) return send(413, { error: 'ข้อมูลยาวเกิน' }); chunks.push(c); }
  let q;
  try { q = JSON.parse(Buffer.concat(chunks).toString('utf8')) || {}; } catch { return send(400, { error: 'ต้องเป็น JSON' }); }
  const scene = SCENES[q.scene] ? q.scene : Object.keys(SCENES)[Math.floor(Math.random() * 4)];
  const avoid = (Array.isArray(q.avoid) ? q.avoid : []).filter(x => typeof x === 'string' && x.trim()).slice(-80).map(x => x.slice(0, 60));
  const place = pickPlace(scene, avoid), pairs = pickPairs(scene, avoid), words = pairs.map(p => p[0]), sentences = pairs.map(p => p[1]);
  const mode = MODES.includes(q.mode) ? q.mode : 'sentence';
  const quests = mode === 'vowel' && Array.isArray(q.quests) && q.quests.length === 3 && q.quests.every(x => QUESTS[x]) ? q.quests : ['long', 'long', 'long'];

  let model = MODELS[0], why = '', last = '';
  for (let i = 0; i < 3; i++) {
    try {
      const t = await groq(model, prompt(scene, place, pairs, why, mode, quests));
      why = check(t, words, mode);
      if (!why) {
        const fin = await polish(model, t, words, sentences, mode);
        const tr = s => s.trim().replace(/^(นก(แก้ว)?\s*)?เรโซน่า\s*[:：]\s*/, ''); // เกมแสดงชื่อเรโซน่าให้อยู่แล้ว
        return send(200, { scene, mode, model, place, intro: tr(fin.intro), beats: fin.beats.map(tr), ending: tr(fin.ending), words, sentences, polished: fin !== t });
      }
      last = why;
    } catch (e) {
      last = e.message;
      if (e.status) model = model === MODELS[0] ? MODELS[1] : MODELS[0]; // เรียกไม่ได้/ติดโควตา → สลับรุ่น (โควตาแยกกันต่อรุ่น)
    }
  }
  send(502, { error: last });
}
