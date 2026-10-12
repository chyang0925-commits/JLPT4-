// 기존 앱 데이터(data_raw.json)를 정리·검수하여 새 앱용 data.js 를 생성한다.
const fs = require('fs');
const d = require('./source_v3.json');

const toKata = s => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
const isKanji = c => /[一-鿿]/.test(c);
const hasKanji = s => /[一-鿿]/.test(s || '');

/* ───────── 1. 한자 ───────── */
// 기존 모양 힌트 중 자형 설명이 틀렸던 것 교정
const HINT_FIX = {
  '近': '辶(가다)+斤(도끼) → 도끼 소리가 들릴 만큼 가까운 거리',
  '青': '生(새싹)+月(丹, 붉은 광물) → 새싹처럼 맑고 푸른 빛',
  '早': '日(해)+十 → 해가 막 지평선 위로 떠오른 이른 아침',
  '冬': '夂(뒤져 오다)+冫(얼음) → 얼음이 어는 한 해의 끝 계절',
  '走': '土(땅)+龰(발) → 땅을 박차고 달려 나가는 모습',
  '帰': '刂+帚(빗자루) → 빗자루를 든 가족이 있는 집으로 돌아가다',
  '急': '⺈(사람)+彐(손)+心(마음) → 뒤쫓기듯 마음이 급하다',
  '姉': '女(여자)+市 → 손위 여자, 즉 언니·누나',
  '予': '실 꾸러미를 미리 건네주는 베틀 북의 모양 → 미리',
  '食': '人(지붕)+良(좋은 밥) → 그릇에 담긴 밥을 먹다',
  '売': '士+冖+儿 (본래 出+買) → 물건을 내놓아 팔다',
  '低': '亻(사람)+氏(밑바닥) → 몸을 낮게 숙인 사람',
  '研': '石(돌)+开(평평하다) → 돌을 평평하게 갈다 → 갈고 닦아 연구하다',
  '院': '阝(언덕)+完(완전하다) → 담장을 두른 큰 건물(병원·대학원)',
  '台': 'ム+口 → 높게 쌓은 받침대',
  '最': '日(모자)+取(잡다) → 모자를 덮어쓰듯 가장 위의 것을 잡다',
  '地': '土(흙)+也 → 흙이 펼쳐진 땅',
  '図': '囗(테두리) 안에 그린 그림·지도',
};
const dbMap = {};
d.KANJI_DB.forEach(r => { if (!dbMap[r[0]]) dbMap[r[0]] = r; });

const KANJI = [];
const seenK = new Set();
fs.readFileSync(__dirname + '/kanji_table.txt', 'utf8').split('\n').forEach(line => {
  if (!line.trim() || line.startsWith('#')) return;
  const [k, lv, hun, on, kun] = line.split('|');
  if (seenK.has(k)) return;
  seenK.add(k);
  const db = dbMap[k];
  const hunParts = hun.trim().split(' ');
  const meanFromHun = hunParts.slice(0, -1).join(' ');
  KANJI.push({
    k, lv,
    hun: hun.trim(),
    mean: db ? db[3] : meanFromHun,
    on: on ? on.split('・').filter(Boolean) : [],
    kun: kun ? kun.trim().split('・').filter(Boolean) : [],
    hint: HINT_FIX[k] || (db ? db[4] : ''),
  });
});
const missingFromTable = Object.keys(dbMap).filter(k => !seenK.has(k));
if (missingFromTable.length) console.warn('표에 없는 기존 DB 한자:', missingFromTable.join(''));

/* ───────── 2. 어휘 ───────── */
const LESSON_INFO = {
  1: ['한자읽기', '기출어휘 2016~2024'], 2: ['한자읽기', '기출어휘 2000~2015'], 3: ['한자읽기', '기출어휘 1990~1999'],
  4: ['한자표기', '기출어휘 2016~2024'], 5: ['한자표기', '기출어휘 2000~2015'], 6: ['한자표기', '기출어휘 1990~1999'],
  7: ['문맥규정', '기출어휘 2016~2024'], 8: ['문맥규정', '기출어휘 2000~2015'], 9: ['문맥규정', '기출어휘 1990~1999'],
  10: ['유의표현', '기출표현 2016~2024'], 11: ['유의표현', '기출표현 2000~2015'], 12: ['유의표현', '기출표현 1990~1999'],
  13: ['용법', '기출어휘 2016~2024'], 14: ['용법', '기출어휘 2000~2015'], 15: ['종합', '출제 예상어휘'],
};
// 어휘 데이터 교정 (힌트 자형 오류·뜻 보완)
const VOCAB_FIX = {
  'お姉さん|おねえさん': { h: '女(여자)+市 = 姉(손윗누이) → 언니·누나 (존칭 お〜さん)' },
  '近い|ちかい': { h: '辶(가다)+斤(도끼) → 도끼 소리가 들릴 만큼 가깝다' },
  '近所|きんじょ': { h: '近(가깝다)+所(곳) = 가까운 곳' },
  '早い|はやい': { m: '(시간이) 이르다, 빠르다', h: '日(해)+十 → 해가 막 떠오른 이른 때. 속도가 빠른 것은 速い' },
  '早く|はやく': { h: '早(이르다) → 일찍, 빨리' },
  '青い|あおい': { h: '生(새싹)+月(丹) → 새싹처럼 푸른 빛' },
  '冬|ふゆ': { h: '夂(뒤져 오다)+冫(얼음) → 얼음이 어는 계절' },
  '走る|はしる': { h: '土(땅)+龰(발) → 땅을 박차고 달리다' },
  '帰る|かえる': { h: '帰(돌아갈 귀) → 집으로 돌아가다' },
  '姉|あね': { h: '女(여자)+市 → 손위 여자 = 언니·누나' },
  '方|かた': { m: '분(사람의 높임말), 방법' },
  'お子さん|おこさん': { m: '자제분, (남의) 자녀' },
};
const VOCAB = [];
const vIndex = {};
const VOCAB_DROP = new Set(['利由|りゆう']); // 理由의 오타 (7과에 理由가 이미 있음)
function addVocab(w, r, m, h, imp, L, cat) {
  if (!w) return;
  if (VOCAB_DROP.has(String(w).trim() + '|' + String(r || w).trim())) return;
  w = String(w).trim(); r = String(r || w).trim(); m = String(m || '').trim();
  const key = w + '|' + r;
  if (vIndex[key] != null) {
    const v = VOCAB[vIndex[key]];
    if (!v.L.includes(L)) v.L.push(L);
    if (!v.h && h) v.h = h;
    if (imp) v.imp = 1;
    return;
  }
  const fix = VOCAB_FIX[key] || {};
  const v = { w, r, m: fix.m || m, L: [L] };
  const hint = fix.h || h;
  if (hint && L !== 15) v.h = hint;
  if (imp && L !== 15) v.imp = 1;
  if (cat) v.c = cat;
  vIndex[key] = VOCAB.length;
  VOCAB.push(v);
}
for (let L = 1; L <= 15; L++) {
  const V = d['V' + L];
  V.forEach(row => {
    if (L >= 1 && L <= 9) addVocab(row[0], row[1], row[2], row[3], row[4], L);
    else if (L === 13 || L === 14) addVocab(row[1], row[0], row[2], '', row[4], L);
    else if (L === 15) addVocab(row[0], row[1], row[2], '', 0, L, row[3]);
  });
}
// 13·14과는 한자 표기가 히라가나와 같은 경우(부사 등)도 있음 – 그대로 둔다.

/* 유의표현 (10~12과) */
const SYN = [];
[10, 11, 12].forEach(L => d['V' + L].forEach(r => SYN.push({ a: r[0], b: r[1], m: r[2], L, imp: r[4] ? 1 : 0 })));

/* ───────── 3. 문제 ───────── */
const typeOf = (L, title) => {
  if (L <= 3) return 'read';
  if (L <= 6) return 'write';
  if (L <= 9) return 'ctx';
  if (L <= 12) return 'syn';
  if (L <= 14) return 'use';
  if (/한자읽기/.test(title)) return 'read';
  if (/한자표기/.test(title)) return 'write';
  if (/문맥/.test(title)) return 'ctx';
  if (/유의/.test(title)) return 'syn';
  return 'use';
};
// 읽기 문제의 오답 보기 해설: 정답과의 발음 차이를 자동 분석
const DAK = { 'が':'か','ぎ':'き','ぐ':'く','げ':'け','ご':'こ','ざ':'さ','じ':'し','ず':'す','ぜ':'せ','ぞ':'そ','だ':'た','ぢ':'ち','づ':'つ','で':'て','ど':'と','ば':'は','び':'ひ','ぶ':'ふ','べ':'へ','ぼ':'ほ','ぱ':'は','ぴ':'ひ','ぷ':'ふ','ぺ':'へ','ぽ':'ほ' };
const SMALL = { 'ゃ':'や','ゅ':'ゆ','ょ':'よ' };
const norms = {
  '탁음(゛゜)': s => s.replace(/[がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ]/g, c => DAK[c]),
  '장음(う·い 유무)': s => s.replace(/([おこそとのほもよろごぞどぼぽょ])う/g, '$1').replace(/([えけせてねへめれげぜでべぺ])い/g, '$1').replace(/([うくすつぬふむゆるぐずづぶぷゅ])う/g, '$1'),
  '촉음(っ)': s => s.replace(/っ/g, ''),
  '요음(ゃゅょ)': s => s.replace(/[ゃゅょ]/g, c => SMALL[c]),
};
function diffLabel(opt, ans) {
  const keys = Object.keys(norms);
  const found = [];
  // 하나씩, 그리고 조합으로 비교
  for (let mask = 1; mask < (1 << keys.length); mask++) {
    let a = opt, b = ans; const used = [];
    keys.forEach((k, i) => { if (mask & (1 << i)) { a = norms[k](a); b = norms[k](b); used.push(k); } });
    if (a === b) { found.push(used); break; }
  }
  if (found.length) return '★ 발음 함정 — ' + found[0].join(' + ') + ' 차이';
  return '★ 다른 읽기';
}
const readingSet = {};
VOCAB.forEach(v => { if (v.r && hasKanji(v.w)) (readingSet[v.r] = readingSet[v.r] || []).push(v); });
const BAD_NOTE_OPTS = new Set(['おねさん', 'おにさん']);
const NOTE_FIX = {
  'みがこう': '닦자(磨こう)', 'そふ': '할아버지(祖父) — 할머니는 そぼ', 'しゃがい': '사외(社外)',
  'この カフェは ニュースが 多いです。': '★오용 (메뉴가 많다 = メニューが 多い)',
};
function cleanNote(type, opt, note, ans, isAns) {
  note = String(note || '').replace(/\s*✅\s*/g, '').trim();
  if (isAns) return note.replace(/^\s*$/, '');
  if (NOTE_FIX[opt]) return NOTE_FIX[opt];
  if (type === 'read') {
    const bad = !note || /오독|★/.test(note) || BAD_NOTE_OPTS.has(opt);
    if (!bad) return note;
    if (readingSet[opt]) { const v = readingSet[opt][0]; return `${v.w} : ${v.m}`; }
    return diffLabel(opt, ans);
  }
  if (type === 'write' && (!note || /오표기/.test(note))) {
    const rest = note.replace(/\(?\s*★[^)]*\)?/g, '').trim();
    return rest ? rest + ' — 다른 단어' : '★ 틀린 표기 (모양이 비슷한 한자)';
  }
  return note;
}
const PROBS = [];
for (let L = 1; L <= 15; L++) {
  d['P' + L].forEach(ps => {
    const type = ps.syn ? 'syn' : ps.yoho ? 'use' : typeOf(L, ps.title);
    PROBS.push({
      id: ps.id, L, type,
      title: ps.title.replace(/[📝✍️]/gu, '').trim(),
      qs: ps.qs.map(q => {
        const [s, u, opts, a, , t] = q;
        const pairs = opts.map(o => Array.isArray(o) ? o : [o, '']);
        const ansText = pairs[a][0];
        return {
          s: String(s).replace(/\n/g, ' '), u, a, t: t || '',
          o: pairs.map((o, i) => [o[0], cleanNote(type, o[0], o[1], ansText, i === a)]),
        };
      }),
    });
  });
}

// 밑줄 범위가 보기와 맞지 않던 문항 교정 (보기는 밑줄 부분의 읽기만 다룸)
const PROB_FIX = { '15-0': { u: '楽しそうに' }, '18-9': { u: '動き' }, '21-8': { u: '何度' } };
PROBS.forEach(p => p.qs.forEach((q, i) => { const f = PROB_FIX[p.id + '-' + i]; if (f) Object.assign(q, f); }));
// 한자읽기 문제에서 밑줄 정답 위에 후리가나가 붙어 정답이 보이던 문항 교정
let furiLeak = 0;
PROBS.forEach(p => { if (p.type !== 'read') return; p.qs.forEach(q => {
  const u = String(q.u).replace(/\{([^|{}]+)\|[^|{}]+\}/g, '$1');
  // 밑줄 부분과 겹치는 {漢|かな} 마크업을 평문으로 바꾼다
  const plainAll = String(q.s).replace(/\{([^|{}]+)\|[^|{}]+\}/g, '$1');
  if (plainAll.includes(u)) {
    // 정답이 들어간 첫 위치의 마크업을 제거
    let out = '', i = 0, plainPos = 0; const target = plainAll.indexOf(u), tEnd = target + u.length;
    const src = q.s;
    while (i < src.length) {
      const mm = src.slice(i).match(/^\{([^|{}]+)\|([^|{}]+)\}/);
      if (mm) { const st = plainPos, en = plainPos + mm[1].length; out += (en > target && st < tEnd) ? mm[1] : mm[0]; plainPos = en; i += mm[0].length; }
      else { out += src[i]; plainPos++; i++; }
    }
    if (out !== q.s) { q.s = out; furiLeak++; }
  }
}); });
console.log('밑줄 정답 후리가나 제거', furiLeak);

/* ───────── 4. 헷갈리는 한자 ───────── */
const CONFUSE = [
  ['待', '持', '特', '時'], ['暑', '署', '著'], ['開', '閉', '間', '聞', '問'], ['未', '末', '味'],
  ['牛', '午', '年'], ['鳥', '島', '烏'], ['体', '休', '本'], ['白', '百', '自', '目'], ['大', '太', '犬', '天'],
  ['土', '士', '工'], ['人', '入', '八'], ['右', '石', '若'], ['書', '昼', '晝'], ['買', '貸', '貨', '質'],
  ['借', '貸'], ['早', '草', '朝'], ['計', '記', '話', '語'], ['校', '交', '効'], ['堂', '党', '常'],
  ['送', '関', '返'], ['遠', '園', '近'], ['動', '働', '重'], ['持', '寺', '詩'], ['姉', '妹', '始'],
  ['使', '仕', '便'], ['低', '底', '氏'], ['住', '注', '主', '柱'], ['広', '店', '庭'], ['紙', '低'],
  ['研', '形', '開'], ['発', '登', '祭'], ['弟', '第'], ['終', '冬', '絵'], ['練', '線', '紳'],
  ['飯', '飲', '館', '食'], ['短', '知', '矢'], ['験', '険', '検'], ['料', '科', '斗'], ['考', '老', '孝'],
  ['青', '晴', '静', '清'], ['問', '門', '間'], ['理', '里', '野'], ['田', '由', '甲', '申'],
  ['員', '買', '貝'], ['困', '因', '固'], ['宅', '室', '家'], ['寺', '時', '持', '待', '特'],
];
const kanjiSet = new Set(KANJI.map(k => k.k));
// 동음이의어(같은 읽기, 다른 한자) — 한자표기 대비
const HOMO = [];
Object.entries(readingSet).forEach(([r, list]) => {
  const ws = [...new Map(list.map(v => [v.w, v])).values()];
  if (ws.length >= 2) HOMO.push({ r, items: ws.map(v => ({ w: v.w, m: v.m })) });
});
const HOMO_EXTRA = [
  { r: 'あつい', items: [{ w: '暑い', m: '(날씨가) 덥다' }, { w: '熱い', m: '(물건이) 뜨겁다' }, { w: '厚い', m: '두껍다' }] },
  { r: 'はやい', items: [{ w: '早い', m: '(시간이) 이르다' }, { w: '速い', m: '(속도가) 빠르다' }] },
  { r: 'とる', items: [{ w: '取る', m: '잡다, 집다' }, { w: '撮る', m: '(사진을) 찍다' }] },
  { r: 'かえる', items: [{ w: '帰る', m: '돌아가다' }, { w: '変える', m: '바꾸다' }] },
  { r: 'あう', items: [{ w: '会う', m: '만나다' }, { w: '合う', m: '맞다, 일치하다' }] },
  { r: 'あく', items: [{ w: '開く', m: '열리다' }, { w: '空く', m: '비다' }] },
  { r: 'きく', items: [{ w: '聞く', m: '듣다, 묻다' }, { w: '効く', m: '효과가 있다' }] },
  { r: 'おりる', items: [{ w: '降りる', m: '(탈것에서) 내리다' }, { w: '下りる', m: '(위에서) 내려오다' }] },
  { r: 'やさしい', items: [{ w: '易しい', m: '쉽다' }, { w: '優しい', m: '상냥하다' }] },
  { r: 'かわる', items: [{ w: '変わる', m: '변하다' }, { w: '代わる', m: '대신하다' }] },
];
HOMO_EXTRA.forEach(h => { const ex = HOMO.find(x => x.r === h.r); if (ex) ex.items = h.items; else HOMO.push(h); });

// 구버전 오답 기록(과별 인덱스) → 새 ID 변환표
const LEGACY = {};
let synBase = 0;
for (let L = 1; L <= 15; L++) {
  const V = d['V' + L];
  if (L >= 10 && L <= 12) { LEGACY[L] = V.map((_, i) => 's' + (synBase + i)); synBase += V.length; }
  else LEGACY[L] = V.map(r => (L === 13 || L === 14) ? r[1] + '|' + r[0] : String(r[0]).trim() + '|' + String(r[1] || r[0]).trim());
}
const out = {
  version: '4.0', LEGACY, LESSON_INFO, KANJI, VOCAB, SYN, PROBS,
  CONFUSE: CONFUSE.map(g => g.filter(c => kanjiSet.has(c) || true)), HOMO,
};
require('./add_speech')(out, report => {
  fs.writeFileSync(__dirname + '/../data.js', '/* JLPT N4 한자·어휘·문제 데이터 (자동 생성: tools/build_data.js) */\nwindow.N4 = ' + JSON.stringify(out) + ';\n');
  fs.writeFileSync(__dirname + '/speech_report.txt',
    '# 음성 점검 결과 — 기계가 다르게 읽는 항목은 히라가나로 바꿔 읽힘\n\n## 단어 (' + report.word.length + ')\n' + report.word.join('\n') +
    '\n\n## 문장 후리가나 (' + report.furi.length + ')\n' + report.furi.join('\n') + '\n');
  console.log('KANJI', KANJI.length, 'VOCAB', VOCAB.length, 'SYN', SYN.length, 'PROBS', PROBS.length,
    'questions', PROBS.reduce((s, p) => s + p.qs.length, 0), 'HOMO', HOMO.length);
  console.log('speech: word→kana', report.word.length, ' furigana→kana', report.furi.length);
  console.log('size', fs.statSync(__dirname + '/../data.js').size);
});
