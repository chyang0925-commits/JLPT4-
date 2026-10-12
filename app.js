/* JLPT N4 한자 암기장 v4 — 프레임워크 없이 동작하는 단일 페이지 앱 */
(function () {
  'use strict';
  const N = window.N4;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a, n) => shuffle(a).slice(0, n);
  // 보기 순서를 매번 새로 섞는다 (정답 번호를 다시 계산)
  const shuffleOpts = q => { const order = shuffle(q.opts.map((_, i) => i)); return Object.assign({}, q, { opts: order.map(i => q.opts[i]), ans: order.indexOf(q.ans) }); };
  const isK = c => /[一-鿿]/.test(c);
  const hasK = s => /[一-鿿]/.test(s || '');
  const DAY = 864e5;
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* ───────── 데이터 색인 ───────── */
  const KMAP = {}; N.KANJI.forEach(k => { KMAP[k.k] = k; });
  N.VOCAB.forEach((v, i) => { v.id = v.w + '|' + v.r; v.i = i; });
  const VMAP = {}; N.VOCAB.forEach(v => { VMAP[v.id] = v; });
  N.SYN.forEach((s, i) => { s.id = 's' + i; });
  const SMAP = {}; N.SYN.forEach(s => { SMAP[s.id] = s; });
  const PMAP = {}; N.PROBS.forEach(p => { PMAP[p.id] = p; });
  // 한자 → 그 한자가 들어간 어휘
  const K2V = {};
  N.VOCAB.forEach(v => { [...new Set([...v.w].filter(isK))].forEach(c => { (K2V[c] = K2V[c] || []).push(v); }); });
  Object.values(K2V).forEach(list => list.sort((a, b) => (b.imp || 0) - (a.imp || 0) || a.w.length - b.w.length));
  const CONF = {}; N.CONFUSE.forEach(g => g.forEach(c => { CONF[c] = [...new Set([...(CONF[c] || []), ...g.filter(x => x !== c)])]; }));
  const TYPE_NAME = { read: '한자읽기', write: '한자표기', ctx: '문맥규정', syn: '유의표현', use: '용법', mix: '종합' };
  const TYPE_INS = {
    read: '밑줄 친 말의 읽는 법으로 가장 알맞은 것을 고르세요.',
    write: '밑줄 친 말을 한자로 쓸 때 가장 알맞은 것을 고르세요.',
    ctx: '（　）에 들어갈 가장 알맞은 것을 고르세요.',
    syn: '밑줄 친 문장과 거의 같은 의미의 문장을 고르세요.',
    use: '다음 단어의 사용법으로 가장 알맞은 것을 고르세요.',
  };

  /* ───────── 저장소 ───────── */
  const KEY = 'jlpt_n4_v4';
  const DEF = {
    srs: {}, wrong: {}, best: {}, log: {}, seen: {},
    set: { rate: 0.85, voice: '', auto: true, furi: true, timer: false, theme: 'system', daily: 10, exam: '2026-12-06', mode: 'course' },
    plan: { days: [0, 1, 3, 5], steps: {}, fin: {}, focus: null },
    migrated: false,
  };
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { S = {}; }
  S = Object.assign({}, DEF, S); S.set = Object.assign({}, DEF.set, S.set || {}); S.plan = Object.assign({}, DEF.plan, S.plan || {});
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };
  // 구버전(v3) 오답 기록 이전
  if (!S.migrated && N.LEGACY) {
    try {
      const ov = JSON.parse(localStorage.getItem('jlpt_wrongV') || '{}');
      const op = JSON.parse(localStorage.getItem('jlpt_wrongP') || '{}');
      let n = 0;
      Object.keys(ov).forEach(L => (ov[L] || []).forEach(idx => { const id = (N.LEGACY[L] || [])[idx]; if (id) { S.wrong[id] = (S.wrong[id] || 0) + 1; n++; } }));
      Object.keys(op).forEach(L => (op[L] || []).forEach(key => { if (/^\d+-\d+$/.test(key)) { S.wrong['p:' + key] = (S.wrong['p:' + key] || 0) + 1; n++; } }));
      S.migrated = true; save();
      if (n) setTimeout(() => toast(`이전 앱의 오답 ${n}개를 불러왔습니다`), 600);
    } catch (e) { S.migrated = true; }
  }

  /* SRS: 0=새 항목, 1~6 상자. 간격(일) */
  const GAP = [0, 0, 1, 3, 7, 14, 30];
  const srs = id => S.srs[id] || null;
  const stateOf = id => { const s = srs(id); if (!s) return 0; if (S.wrong[id] && s.b < 4) return 1; return s.b >= 4 ? 3 : (s.b <= 1 ? 1 : 2); };
  function grade(id, g) { // g: 1 모름, 2 애매, 3 앎
    const s = srs(id) || { b: 0, due: 0, n: 0 };
    s.n++;
    if (g === 1) { s.b = 1; s.due = Date.now() + 10 * 60e3; S.wrong[id] = (S.wrong[id] || 0) + 1; }
    else if (g === 2) { s.b = Math.max(2, Math.min(s.b, 3)); s.due = Date.now() + DAY; }
    else { s.b = Math.min(6, Math.max(2, s.b + 1)); s.due = Date.now() + GAP[s.b] * DAY; if (s.b >= 4 && S.wrong[id]) delete S.wrong[id]; }
    S.srs[id] = s; logToday(); save();
  }
  function markWrong(id) { S.wrong[id] = (S.wrong[id] || 0) + 1; const s = srs(id); if (s) { s.b = 1; s.due = Date.now(); } save(); }
  function markRight(id) { if (S.wrong[id]) { S.wrong[id]--; if (S.wrong[id] <= 0) delete S.wrong[id]; } save(); }
  function logToday() { const t = todayStr(); S.log[t] = (S.log[t] || 0) + 1; }
  function streak() { let n = 0; const d = new Date(); for (; ;) { const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); if (S.log[k]) { n++; d.setDate(d.getDate() - 1); } else { if (n === 0 && k === todayStr()) { d.setDate(d.getDate() - 1); continue; } break; } } return n; }
  const kid = c => 'k:' + c;
  const dueList = ids => ids.filter(id => { const s = srs(id); return s && s.due <= Date.now(); });

  /* ───────── 테마 ───────── */
  const applyTheme = () => { const r = document.documentElement; if (S.set.theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', S.set.theme); };
  applyTheme();

  /* ───────── 음성(TTS) ─────────
     · 고음질 일본어 음성(신경망/Enhanced/Google)을 우선 선택
     · 단어는 문장보다 느리게, 끝에 마침표를 붙여 끝음이 잘리지 않게
     · 재생 중 다시 누르면 취소 후 잠깐 쉬었다 재생(크롬 앞부분 잘림 방지)
     · 같은 버튼을 3초 안에 다시 누르면 아주 천천히(0.6배) 다시 읽기 */
  const TTS = {
    ok: 'speechSynthesis' in window,
    voices: [], last: '', lastAt: 0, cur: null,
    load() { if (!this.ok) return; this.voices = speechSynthesis.getVoices().filter(v => /^ja([-_]|$)/i.test(v.lang)); },
    score(v) {
      const n = v.name; let s = 0;
      if (/Natural|Neural|Online/i.test(n)) s += 60;          // Edge·Windows 신경망 음성
      if (/Premium|Enhanced|高品質|拡張/i.test(n)) s += 50;     // iOS·macOS 고음질 음성
      if (/Google/i.test(n)) s += 40;                          // 크롬·안드로이드
      if (/Kyoko|Otoya|O-ren|Nanami|Keita|Hattori/i.test(n)) s += 20;
      if (/Haruka|Ayumi|Ichiro|Sayaka/i.test(n)) s += 5;      // 구형 Windows 음성
      if (/compact|eloquence|Grandma|Grandpa|Rocko|Shelley|Flo|Reed|Sandy|Eddy/i.test(n)) s -= 40; // 저음질·장난감 음성
      if (v.localService === false) s += 3;
      return s;
    },
    ranked() { if (!this.voices.length) this.load(); return this.voices.slice().sort((a, b) => this.score(b) - this.score(a)); },
    pickVoice() {
      const vs = this.ranked();
      if (S.set.voice) { const v = vs.find(x => x.name === S.set.voice); if (v) return v; }
      return vs[0] || null;
    },
    quality(v) { const s = this.score(v); return s >= 40 ? '고음질' : s >= 15 ? '보통' : '낮음'; },
    say(text, opt = {}) {
      if (!this.ok) { toast('이 브라우저는 음성 재생을 지원하지 않습니다'); return; }
      let t = clean(text); if (!t) return;
      const isWord = t.length <= 12 && !/[。、！？]/.test(t);
      if (!/[。！？…]$/.test(t)) t += '。';
      const now = Date.now();
      const slow = opt.slow || (text === this.last && now - this.lastAt < 3000);
      this.last = text; this.lastAt = now;
      let rate = S.set.rate * (isWord ? 0.88 : 1);
      if (slow) { rate = Math.min(rate, 0.6); toast('천천히 다시 읽습니다'); }
      const u = new SpeechSynthesisUtterance(t);
      u.lang = 'ja-JP'; u.rate = Math.max(0.5, rate); u.pitch = 1; u.volume = 1;
      const v = this.pickVoice(); if (v) u.voice = v; else if (!this.warned) { this.warned = 1; toast('일본어 음성이 없어 기본 음성으로 읽습니다. 설정 → 음성 안내를 확인하세요'); }
      u.onend = u.onerror = () => { if (this.cur === u) this.cur = null; };
      this.cur = u; // 크롬에서 재생 도중 객체가 사라지는 문제 방지
      if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); setTimeout(() => speechSynthesis.speak(u), 120); }
      else { speechSynthesis.cancel(); speechSynthesis.speak(u); }
    },
  };
  if (TTS.ok) { TTS.load(); speechSynthesis.onvoiceschanged = () => { TTS.load(); if (cur() && cur().v === 'settings') render(); }; }
  // {漢字|かな} → かな, 오쿠리가나 표시점 제거, 빈칸 처리 (띄어쓰기는 단어 경계라 남겨 둠)
  function clean(t) { return String(t).replace(/\{([^|{}]+)\|([^|{}]+)\}/g, '$2').replace(/[（(]\s*[　 ]*\s*[)）]/g, '、').replace(/\./g, '').replace(/[ 　]+/g, ' ').trim(); }
  const sv = v => v.s || v.r; // 단어 음성용 텍스트 (검증된 한자 표기 또는 히라가나)
  const SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const spkBtn = (text, cls = '') => `<button class="spk ${cls}" data-say="${esc(text)}" aria-label="발음 듣기">${SPK}</button>`;

  /* ───────── 루비(후리가나) ───────── */
  function ruby(text, ul) {
    let s = esc(text);
    // 밑줄 대상 처리 (후리가나 마크업 안에 있어도 찾기)
    let marker = null;
    if (ul) {
      const u = esc(ul);
      if (s.includes(u)) { s = s.replace(u, '\u0001'); marker = u; }
      else {
        const re = new RegExp([...u].map(ch => `(?:\\{${ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\|[^|{}]+\\}|${ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`).join(''));
        const m = s.match(re); if (m) { s = s.replace(m[0], '\u0001'); marker = u; }
      }
    }
    s = s.replace(/\{([^|{}]+)\|([^|{}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>');
    s = s.replace(/[（(]\s*[　 ]*\s*[)）]/g, '<span class="blank">　</span>');
    if (marker) s = s.replace('\u0001', `<span class="ul">${marker}</span>`);
    return s;
  }
  const plainJP = t => String(t).replace(/\{([^|{}]+)\|([^|{}]+)\}/g, '$1');

  /* ───────── 함정 보기 생성 ───────── */
  const DAK = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ', た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ' };
  const UNDAK = {}; Object.entries(DAK).forEach(([a, b]) => { UNDAK[b] = a; }); Object.assign(UNDAK, { ぱ: 'は', ぴ: 'ひ', ぷ: 'ふ', ぺ: 'へ', ぽ: 'ほ' });
  const O_ROW = 'おこそとのほもよろごぞどぼぽょ', U_ROW = 'うくすつぬふむゆるぐずぶぷゅ';
  function readingTraps(r) {
    const out = new Set(); const a = [...r];
    a.forEach((c, i) => {
      if (DAK[c]) out.add(r.slice(0, i) + DAK[c] + r.slice(i + 1));
      if (UNDAK[c]) out.add(r.slice(0, i) + UNDAK[c] + r.slice(i + 1));
      if ((O_ROW + U_ROW).includes(c)) {
        if (a[i + 1] === 'う') out.add(a.slice(0, i + 1).join('') + a.slice(i + 2).join(''));
        else if (i < a.length - 1 || a.length <= 3) out.add(a.slice(0, i + 1).join('') + 'う' + a.slice(i + 1).join(''));
      }
      if (c === 'っ') out.add(a.slice(0, i).join('') + a.slice(i + 1).join(''));
      if ('ゃゅょ'.includes(c)) out.add(a.slice(0, i).join('') + { ゃ: 'や', ゅ: 'ゆ', ょ: 'よ' }[c] + a.slice(i + 1).join(''));
      if (i > 0 && i < a.length - 1 && 'かきくけこさしすせそたちつてとぱぴぷぺぽ'.includes(c) && a[i - 1] !== 'っ' && a[i - 1] !== 'ん') out.add(a.slice(0, i).join('') + 'っ' + a.slice(i).join(''));
    });
    out.delete(r);
    return [...out].filter(x => x && !/^[ぁぃぅぇぉっゃゅょー]/.test(x));
  }
  function writeTraps(w) {
    const out = new Set();
    [...w].forEach((c, i) => { (CONF[c] || []).forEach(x => out.add(w.slice(0, i) + x + w.slice(i + 1))); });
    out.delete(w); return [...out];
  }
  function fill(correct, primary, fallback, n = 3) {
    const seen = new Set([correct]); const res = [];
    for (const x of shuffle(primary).concat(shuffle(fallback))) { if (res.length >= n) break; if (x && !seen.has(x)) { seen.add(x); res.push(x); } }
    return res;
  }

  /* ───────── 화면 관리 ───────── */
  const app = document.getElementById('app');
  let tab = 'home', stack = [], session = null, timerId = null, focusId = null, pendingPlan = null;
  function go(view) { stack.push(view); render(); window.scrollTo(0, 0); }
  function back() { stopTimer(); if (stack.length > 1) stack.pop(); else stack = [{ v: tab }]; session = stack[stack.length - 1].session || null; render(); window.scrollTo(0, 0); }
  function setTab(t) { stopTimer(); tab = t; stack = [{ v: t }]; session = null; render(); window.scrollTo(0, 0); try { history.replaceState(null, '', '#' + t); } catch (e) { } }
  function cur() { return stack[stack.length - 1]; }
  function toast(msg) { document.querySelectorAll('.toast').forEach(x => x.remove()); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 1800); }

  function top(title, sub, backable, right = '') {
    return `<header class="top">${backable ? '<button class="icon-btn" data-act="back" aria-label="뒤로">←</button>' : ''}<h1>${title}${sub ? ` <span class="sub">${sub}</span>` : ''}</h1>${right}</header>`;
  }
  function tabsHtml() {
    const T = [['home', '今', '오늘'], ['plan', '程', '일정'], ['kanji', '漢', '한자'], ['vocab', '語', '어휘'], ['prob', '問', '문제'], ['wrong', '誤', '오답']];
    const wc = Object.keys(S.wrong).length;
    return `<nav class="tabs" aria-label="메뉴"><div class="in">${T.map(([k, c, n]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}"><b>${c}</b>${n}${k === 'wrong' && wc ? `<span class="badge">${wc > 99 ? '99+' : wc}</span>` : ''}</button>`).join('')}</div></nav>`;
  }
  function render() {
    const v = cur() || { v: tab };
    const fn = VIEWS[v.v] || VIEWS.home;
    if (focusId) { clearInterval(focusId); focusId = null; }
    v.after = null; // 이전 화면의 자동 재생·타이머가 다시 실행되지 않도록 초기화
    app.innerHTML = `<div class="wrap">${fn(v)}</div>${tabsHtml()}`;
    if (v.after) v.after();
  }

  /* ───────── 오늘(홈) ───────── */
  function ddays() { const e = new Date(S.set.exam + 'T00:00:00'); const t = new Date(todayStr() + 'T00:00:00'); return Math.round((e - t) / DAY); }
  function kanjiStats(list) { const c = [0, 0, 0, 0]; list.forEach(k => c[stateOf(kid(k.k))]++); return c; }
  function statBar(c, total) { return `<div class="bar">${[3, 2, 1].map(i => `<i class="bg-st${i}" style="width:${c[i] / total * 100}%"></i>`).join('')}</div>`; }
  function todayQueue() {
    const kIds = N.KANJI.map(k => kid(k.k));
    const vIds = N.VOCAB.filter(v => hasK(v.w)).map(v => v.id);
    const dueK = dueList(kIds), dueV = dueList(vIds);
    const newK = S.set.mode === 'course' ? [] : N.KANJI.filter(k => !srs(kid(k.k))).map(k => kid(k.k)).slice(0, S.set.daily);
    return { dueK, dueV, newK };
  }
  const VIEWS = {};
  VIEWS.home = () => {
    const q = todayQueue(); const dd = ddays();
    const kc = kanjiStats(N.KANJI);
    const lv = ['N5', 'N4', '기출', '교재'].map(l => { const list = N.KANJI.filter(k => k.lv === l); return { l, list, c: kanjiStats(list) }; });
    const total = q.dueK.length + q.dueV.length + q.newK.length;
    return top('JLPT N4 한자 암기장', '', false, `${dd >= 0 ? `<span class="chip-dday">D-${dd}</span>` : ''}<button class="icon-btn" data-act="settings" aria-label="설정">⚙</button>`) + `
    ${S.set.mode === 'course' ? homeChapterCard() : `<div class="sec"><div class="today">
      <div class="row"><b class="grow">오늘의 학습</b><span class="small">연속 ${streak()}일째</span></div>
      <div class="nums">
        <div class="num"><b>${q.dueK.length}</b><span>복습할 한자</span></div>
        <div class="num"><b>${q.dueV.length}</b><span>복습할 어휘</span></div>
        <div class="num"><b>${q.newK.length}</b><span>새 한자</span></div>
      </div>
      <button class="btn block" data-act="today" ${total ? '' : 'disabled'}>${total ? `학습 시작 · ${Math.min(total, 40)}장` : '오늘 분량을 모두 마쳤습니다'}</button>
    </div></div>`}
    <div class="sec"><div class="sec-h"><h2>한자 암기 현황</h2><span class="more">${kc[3]} / ${N.KANJI.length}자 암기</span></div>
      <div class="panel">${lv.map(x => `<div class="prog-row"><b>${x.l === '교재' ? '교재' : x.l}</b>${statBar(x.c, x.list.length)}<span class="n">${x.c[3]}/${x.list.length}</span></div>`).join('')}
      <div class="legend"><span><i class="bg-st3"></i>암기 완료</span><span><i class="bg-st2"></i>학습 중</span><span><i class="bg-st1"></i>다시 볼 것</span><span><i class="bg-st0"></i>아직 안 봄</span></div></div>
    </div>
    <div class="sec"><div class="sec-h"><h2>빠른 연습</h2></div>
      <div class="btn-grid">
        <button class="btn" data-act="kq" data-mode="word"><span class="k">漢→かな</span>단어 읽기 20<small>시험 1번 유형 · 함정 보기</small></button>
        <button class="btn" data-act="kq" data-mode="write"><span class="k">かな→漢</span>단어 표기 20<small>시험 2번 유형 · 닮은 한자</small></button>
        <button class="btn" data-act="kq" data-mode="hun"><span class="k">字→훈음</span>훈음 맞히기 30<small>한자 뜻 빠르게 익히기</small></button>
        <button class="btn" data-act="mock"><span class="k">模試</span>실전 모의 25<small>5유형 섞어서</small></button>
      </div>
    </div>
    <div class="sec"><div class="sec-h"><h2>헷갈리는 것만 모아서</h2></div>
      <div class="btn-grid">
        <button class="btn" data-act="confuse"><span class="k">待持特</span>모양이 닮은 한자<small>${N.CONFUSE.length}개 묶음</small></button>
        <button class="btn" data-act="homo"><span class="k">暑熱厚</span>같은 읽기 다른 한자<small>${N.HOMO.length}개 묶음</small></button>
      </div>
    </div>`;
  };

  /* ───────── 한자 탭 ───────── */
  let kFilter = { lv: 'all', st: 'all' };
  function kanjiPool() {
    return N.KANJI.filter(k => (kFilter.lv === 'all' || k.lv === kFilter.lv) && (kFilter.st === 'all' || String(stateOf(kid(k.k))) === kFilter.st));
  }
  VIEWS.kanji = () => {
    const pool = kanjiPool();
    const lvs = [['all', '전체'], ['N5', 'N5'], ['N4', 'N4'], ['기출', '기출 N3'], ['교재', '교재 등장']];
    const sts = [['all', '모두'], ['0', '안 본 것'], ['1', '다시 볼 것'], ['2', '학습 중'], ['3', '암기 완료']];
    return top('한자', `${pool.length}자`, false) + `
    <div class="sec"><div class="chips">${lvs.map(([k, n]) => `<button class="chip ${kFilter.lv === k ? 'on' : ''}" data-kf="lv" data-val="${k}">${n}</button>`).join('')}</div>
    <div class="chips" style="margin-top:8px">${sts.map(([k, n]) => `<button class="chip ${kFilter.st === k ? 'on' : ''}" data-kf="st" data-val="${k}">${n}</button>`).join('')}</div></div>
    <div class="sec"><div class="btn-grid">
      <button class="btn pri" data-act="kcards" ${pool.length ? '' : 'disabled'}><span>카드로 외우기</span><small style="color:inherit;opacity:.8">선택한 ${pool.length}자</small></button>
      <button class="btn" data-act="kq" data-mode="pick" data-pool="1" ${pool.length >= 4 ? '' : 'disabled'}><span>한자 고르기</span><small>훈음·읽기 보고 한자 선택</small></button>
      <button class="btn" data-act="kq" data-mode="hun" data-pool="1" ${pool.length >= 4 ? '' : 'disabled'}><span>훈음 맞히기</span><small>한자 보고 뜻·음 선택</small></button>
      <button class="btn" data-act="kq" data-mode="word" data-pool="1" ${pool.length ? '' : 'disabled'}><span>단어 읽기</span><small>이 한자들이 들어간 단어</small></button>
    </div></div>
    <div class="sec">${pool.length ? `<div class="kgrid">${pool.map(k => `<button class="ktile" data-kanji="${k.k}"><span class="dot st${stateOf(kid(k.k))}"></span><span class="c">${k.k}</span><span class="h">${esc(k.hun)}</span></button>`).join('')}</div>` : '<div class="empty">해당하는 한자가 없습니다.</div>'}</div>`;
  };
  function readingChips(k) {
    const on = k.on.map(r => `<button class="rchip" data-say="${esc(r)}">${esc(r)}</button>`).join('') || '<span class="muted small">없음</span>';
    const kun = k.kun.map(r => { const [a, b] = r.split('.'); return `<button class="rchip" data-say="${esc(a + (b || ''))}">${esc(a)}${b ? `<span class="ok-part">${esc(b)}</span>` : ''}</button>`; }).join('') || '<span class="muted small">없음 (음독으로만 사용)</span>';
    return `<div class="rd"><span class="lb on">音</span><div class="rchips">${on}</div><span class="lb kun">訓</span><div class="rchips">${kun}</div></div>`;
  }
  function wordItem(v, showLesson = true) {
    return `<div class="witem"><div class="grow"><div class="w">${esc(v.w)}</div>${v.w !== v.r ? `<div class="r">${esc(v.r)}</div>` : ''}<div class="m">${esc(v.m)}</div>${showLesson ? `<div class="ls">${v.L.map(l => l + '과').join(' · ')}</div>` : ''}</div>${spkBtn(sv(v))}</div>`;
  }
  VIEWS.kdetail = (vw) => {
    const k = KMAP[vw.k]; const id = kid(k.k);
    const list = vw.list || N.KANJI.map(x => x.k); const pos = list.indexOf(k.k);
    const words = (K2V[k.k] || []).slice(0, 12);
    const conf = CONF[k.k] || [];
    const s = srs(id);
    vw.after = () => { if (S.set.auto && !vw.spoken) { vw.spoken = 1; } };
    return top(`${k.k} <span class="sub">${esc(k.hun)}</span>`, '', true, `<span class="tag">${k.lv}</span>`) + `
    <div class="sec">
      <div class="tian"><span>${k.k}</span></div>
      <div class="kinfo">
        <div class="hun">${esc(k.hun)}<small>${esc(k.mean)}</small></div>
        <div class="panel">${readingChips(k)}</div>
        ${k.hint ? `<div class="hint"><b>모양으로 기억하기</b> · ${esc(k.hint)}</div>` : ''}
      </div>
    </div>
    ${words.length ? `<div class="sec"><div class="sec-h"><h2>이 한자가 들어간 단어</h2><span class="more">${(K2V[k.k] || []).length}개</span></div><div class="wlist">${words.map(v => wordItem(v)).join('')}</div></div>` : ''}
    ${conf.length ? `<div class="sec"><div class="sec-h"><h2>모양이 닮은 한자</h2></div><div class="cmp">${conf.map(c => `<button data-kanji="${c}" ${KMAP[c] ? '' : 'disabled'}><b>${c}</b><small>${KMAP[c] ? esc(KMAP[c].hun) : '범위 외'}</small></button>`).join('')}</div></div>` : ''}
    <div class="sec"><div class="sec-h"><h2>이 한자, 외웠나요?</h2><span class="more">${s ? `${s.n}회 학습` : '처음'}</span></div>
      <div class="grade"><button class="btn g1" data-grade="1" data-id="${id}">모름<small>곧 다시</small></button><button class="btn g2" data-grade="2" data-id="${id}">애매<small>내일</small></button><button class="btn g3" data-grade="3" data-id="${id}">앎<small>간격 늘림</small></button></div>
      <div class="row" style="margin-top:12px"><button class="btn grow" data-act="knav" data-to="${list[pos - 1] || ''}" ${pos > 0 ? '' : 'disabled'}>← 이전</button><button class="btn grow" data-act="knav" data-to="${list[pos + 1] || ''}" ${pos < list.length - 1 ? '' : 'disabled'}>다음 →</button></div>
    </div>`;
  };

  /* ───────── 카드 학습 세션 ───────── */
  function startCards(ids, title) {
    const plan = pendingPlan; pendingPlan = null;
    if (!ids.length) { toast('학습할 항목이 없습니다'); return; }
    const ses = { kind: 'cards', title, ids: ids.slice(), i: 0, flip: false, done: 0, res: { 1: 0, 2: 0, 3: 0 }, plan };
    go({ v: 'cards', session: ses }); session = ses;
  }
  function itemOf(id) {
    if (id.startsWith('k:')) return { t: 'k', k: KMAP[id.slice(2)] };
    if (id.startsWith('s')) return { t: 's', s: SMAP[id] };
    return { t: 'v', v: VMAP[id] };
  }
  function kparts(w) { return [...new Set([...w].filter(c => KMAP[c]))].map(c => `<button class="kpart" data-kanji="${c}"><b>${c}</b>${esc(KMAP[c].hun)}</button>`).join(''); }
  VIEWS.cards = (vw) => {
    const ses = vw.session; session = ses;
    if (ses.i >= ses.ids.length) {
      const t = ses.res[1] + ses.res[2] + ses.res[3];
      planDone(ses);
      return top(ses.title, '', true) + `<div class="result"><div class="stamp">済</div><div class="pct">${t}장</div><p class="muted">앎 ${ses.res[3]} · 애매 ${ses.res[2]} · 모름 ${ses.res[1]}</p></div>
        <div class="list"><button class="btn pri block" data-act="back">${ses.plan ? '챕터로 돌아가기' : '돌아가기'}</button>${ses.res[1] ? `<button class="btn block" data-act="recards">모름으로 표시한 것만 다시</button>` : ''}</div>`;
    }
    const id = ses.ids[ses.i]; const it = itemOf(id);
    let front = '', backHtml = '', say = '';
    if (it.t === 'k') {
      const k = it.k; const ex = (K2V[k.k] || []).slice(0, 3);
      front = `<div class="tian sm"><span>${k.k}</span></div><div class="ask">훈음과 읽기를 떠올려 보세요</div>`;
      backHtml = `<div class="mm">${esc(k.hun)}</div><div class="muted">${esc(k.mean)}</div><div class="panel" style="width:100%;text-align:left">${readingChips(k)}</div>
        ${ex.length ? `<div class="wlist" style="width:100%;text-align:left">${ex.map(v => wordItem(v, false)).join('')}</div>` : ''}
        ${k.hint ? `<div class="hint" style="text-align:left">${esc(k.hint)}</div>` : ''}`;
      say = ex[0] ? sv(ex[0]) : (k.kun[0] || k.on[0] || '');
    } else if (it.t === 'v') {
      const v = it.v;
      front = `<div class="bigw">${esc(v.w)}</div><div class="ask">${hasK(v.w) ? '읽는 법과 뜻을 떠올려 보세요' : '뜻을 떠올려 보세요'}</div>`;
      backHtml = `${v.w !== v.r ? `<div class="rr">${esc(v.r)}</div>` : ''}<div class="mm">${esc(v.m)}</div>
        ${hasK(v.w) ? `<div class="kparts">${kparts(v.w)}</div>` : ''}${v.h ? `<div class="hint" style="text-align:left">${esc(v.h)}</div>` : ''}`;
      say = sv(v);
    } else {
      const s = it.s;
      front = `<div class="bigw" style="font-size:22px">${esc(s.a)}</div><div class="ask">같은 의미의 표현은?</div>`;
      backHtml = `<div class="muted">≒</div><div class="rr" style="font-size:20px">${esc(s.b)}</div><div class="mm" style="font-size:16px">${esc(s.m)}</div>`;
      say = s.a + '。' + s.b;
    }
    vw.after = () => { if (ses.flip && S.set.auto && ses.spoke !== ses.i + ':' + ses.ids.length) { ses.spoke = ses.i + ':' + ses.ids.length; TTS.say(say); } };
    return top(ses.title, '', true) + `
      <div class="study-top"><span>${ses.i + 1} / ${ses.ids.length}</span>${statBar([0, ses.res[1], ses.res[2], ses.res[3]], Math.max(1, ses.ids.length))}</div>
      <div class="card" data-act="flip" role="button" tabindex="0" aria-label="카드 뒤집기">${front}${ses.flip ? `<div class="back">${backHtml}</div>` : '<div class="ask" style="margin-top:14px">탭해서 정답 보기</div>'}</div>
      ${ses.flip ? `<div class="row" style="justify-content:center;margin-top:12px">${spkBtn(say, 'lg')}</div>
      <div class="grade"><button class="btn g1" data-cg="1">모름<small>1</small></button><button class="btn g2" data-cg="2">애매<small>2</small></button><button class="btn g3" data-cg="3">앎<small>3</small></button></div>` :
        `<button class="btn pri block" style="margin-top:14px" data-act="flip">정답 보기 <small>(Space)</small></button>`}
      <p class="kbd">키보드: Space 뒤집기 · 1/2/3 평가</p>`;
  };
  function cardGrade(g) {
    const ses = session; const id = ses.ids[ses.i];
    grade(id, g); ses.res[g]++;
    if (g === 1) { ses.again = ses.again || []; ses.again.push(id); const pos = Math.min(ses.ids.length, ses.i + 4); if (ses.ids.length < 120) ses.ids.splice(pos, 0, id); }
    ses.i++; ses.flip = false; render();
  }

  /* ───────── 퀴즈 엔진 ───────── */
  function startQuiz(title, qs, opts = {}) {
    const plan = pendingPlan; pendingPlan = null;
    if (!qs.length) { toast('문제를 만들 수 없습니다'); return; }
    const ses = { kind: 'quiz', title, qs, i: 0, picked: null, score: 0, wrongIdx: [], setId: opts.setId, src: opts.src, plan };
    go({ v: 'quiz', session: ses }); session = ses;
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
  VIEWS.quiz = (vw) => {
    const ses = vw.session; session = ses; stopTimer();
    if (ses.i >= ses.qs.length) {
      const pct = Math.round(ses.score / ses.qs.length * 100);
      if (ses.setId != null) { S.best[ses.setId] = Math.max(S.best[ses.setId] || 0, pct); save(); }
      else if (ses.ps) { Object.entries(ses.ps).forEach(([id, [n, c]]) => { if (PMAP[id] && n >= PMAP[id].qs.length) S.best[id] = Math.max(S.best[id] || 0, Math.round(c / n * 100)); }); save(); }
      planDone(ses);
      return top(ses.title, '결과', true) + `<div class="result">${pct >= 80 ? '<div class="stamp">合格</div>' : ''}<div class="pct">${pct}%</div><p class="muted">${ses.qs.length}문제 중 ${ses.score}문제 정답</p></div>
      <div class="list"><button class="btn pri block" data-act="requiz">같은 문제 다시 풀기</button>${ses.wrongIdx.length ? `<button class="btn ng block" data-act="rewrong">틀린 ${ses.wrongIdx.length}문제만 다시</button>` : ''}<button class="btn block" data-act="back">${ses.plan ? '챕터로 돌아가기' : '목록으로'}</button></div>
      ${ses.wrongIdx.length ? `<div class="sec"><div class="sec-h"><h2>틀린 문제 다시 보기</h2></div><div class="list">${ses.wrongIdx.map(i => { const q = ses.qs[i]; return `<div class="panel small"><div class="row" style="align-items:flex-start"><div class="jp grow" style="font-size:16px">${q.review || q.prompt}</div>${q.sayAfter ? spkBtn(q.sayAfter) : ''}</div><div style="color:var(--ok);margin-top:4px">정답: ${esc(q.opts[q.ans].t)}</div></div>`; }).join('')}</div></div>` : ''}`;
    }
    const q = ses.qs[ses.i]; const answered = ses.picked != null;
    const okPick = answered && ses.picked === q.ans;
    if (!answered && S.set.timer) vw.after = () => { let t = q.time || 20; const bar = $('.timer i'); timerId = setInterval(() => { t--; if (bar) bar.style.width = (t / (q.time || 20) * 100) + '%'; if (t <= 0) { stopTimer(); answer(-1); } }, 1000); };
    else vw.after = () => { if (answered && S.set.auto && q.sayAfter && ses.spoke !== ses.i) { ses.spoke = ses.i; TTS.say(q.sayAfter); } };
    const optCls = q.optClass || '';
    return top(ses.title, `${ses.i + 1}/${ses.qs.length}`, true) + `
      <div class="study-top"><span>정답 ${ses.score}</span><div class="bar"><i class="bg-st3" style="width:${ses.i / ses.qs.length * 100}%"></i></div></div>
      ${q.ins ? `<div class="q-ins">${q.ins}</div>` : '<div style="height:14px"></div>'}
      <div class="q-box">${q.prompt}${q.sayBefore ? `<div class="row" style="justify-content:flex-end;margin-top:6px">${spkBtn(q.sayBefore)}</div>` : ''}</div>
      ${S.set.timer && !answered ? '<div class="timer"><i style="width:100%"></i></div>' : ''}
      <div class="opts ${q.two ? 'two' : ''}">${q.opts.map((o, i) => {
      let cls = ''; if (answered) { if (i === q.ans) cls = 'ok'; else if (i === ses.picked) cls = 'ng'; }
      if (!answered) return `<button class="opt" data-pick="${i}"><span class="n">${i + 1}</span><span class="t ${optCls}">${esc(o.t)}</span></button>`;
      return `<div class="opt ${cls} ${o.say ? 'has-spk' : ''}"><span class="n">${i + 1}</span><span class="t ${optCls}">${esc(o.t)}</span>${o.say ? spkBtn(o.say, 'sm') : ''}${o.note ? `<span class="note">${esc(o.note)}</span>` : ''}</div>`;
    }).join('')}</div>
      ${answered ? `<div class="fb flash-ok"><div class="res ${okPick ? 'ok' : 'ng'}">${okPick ? '정답입니다' : ses.picked === -1 ? '시간이 지났습니다' : '오답입니다'} — 정답 ${q.ans + 1}번 「${esc(q.opts[q.ans].t)}」</div>${q.explain || ''}${q.sayAfter ? `<div class="row"><span class="grow small muted">정답을 넣은 문장 듣기</span>${spkBtn(q.sayAfter)}</div>` : ''}</div>
      <div class="sticky-next"><button class="btn pri block" data-act="next">${ses.i + 1 >= ses.qs.length ? '결과 보기' : '다음 문제 →'} <small>(Enter)</small></button></div>` : '<p class="kbd">키보드: 1~4 선택 · Enter 다음</p>'}`;
  };
  function answer(i) {
    const ses = session; if (!ses || ses.picked != null) return;
    stopTimer();
    const q = ses.qs[ses.i]; ses.picked = i;
    const ok = i === q.ans;
    if (ok) { ses.score++; q.wid && markRight(q.wid); } else { ses.wrongIdx.push(ses.i); q.wid && markWrong(q.wid); }
    if (q.wid && q.wid.startsWith('p:')) S.seen[q.wid] = Date.now();
    if (q.pset != null) { ses.ps = ses.ps || {}; const x = ses.ps[q.pset] = ses.ps[q.pset] || [0, 0]; x[0]++; if (ok) x[1]++; }
    if (q.srsId) { const s = srs(q.srsId); if (!s && ok) S.srs[q.srsId] = { b: 2, due: Date.now() + DAY, n: 1 }; }
    logToday(); save(); render();
  }

  /* 퀴즈 문제 생성기 */
  const vocabWithK = () => N.VOCAB.filter(v => hasK(v.w) && v.w !== v.r && v.r.length >= 2 && !/[ァ-ヶ]/.test(v.w));
  function qWordRead(v) { // 단어 → 읽기 (함정: 탁음·장음·촉음·요음)
    const others = N.VOCAB.filter(x => x.r.length === v.r.length && x.r !== v.r).map(x => x.r);
    const ds = fill(v.r, readingTraps(v.r), others);
    const opts = shuffle([{ t: v.r, note: v.m, say: v.r }, ...ds.map(t => { const real = N.VOCAB.find(x => x.r === t && hasK(x.w)); return { t, say: t, note: real ? `${real.w} : ${real.m}` : '★ 발음 함정' }; })]);
    return { ins: '단어의 읽는 법으로 알맞은 것을 고르세요.', prompt: `<div class="q-big jp">${esc(v.w)}</div><div class="q-sub">${esc(v.m)}</div>`, opts, ans: opts.findIndex(o => o.t === v.r), wid: v.id, srsId: v.id, sayAfter: sv(v), explain: `<div class="kparts">${kparts(v.w)}</div>`, review: `${esc(v.w)} — ${esc(v.m)}` };
  }
  function qWordWrite(v) { // 읽기 → 표기 (함정: 닮은 한자 · 같은 읽기)
    const homo = N.VOCAB.filter(x => x.r === v.r && x.w !== v.w && hasK(x.w)).map(x => x.w);
    const share = N.VOCAB.filter(x => x.w !== v.w && hasK(x.w) && x.w.length === v.w.length && [...x.w].some(c => isK(c) && v.w.includes(c))).map(x => x.w);
    const ds = fill(v.w, writeTraps(v.w).concat(homo), share.concat(N.VOCAB.filter(x => hasK(x.w) && x.w.length === v.w.length).map(x => x.w)));
    const opts = shuffle([{ t: v.w, note: v.m, say: sv(v) }, ...ds.map(t => { const real = N.VOCAB.find(x => x.w === t); return { t, say: real ? sv(real) : null, note: real ? `${real.r} : ${real.m}` : '★ 틀린 표기 (닮은 한자)' }; })]);
    return { ins: '히라가나를 한자로 쓰면?', prompt: `<div class="q-big jp">${esc(v.r)}</div><div class="q-sub">${esc(v.m)}</div>`, sayBefore: sv(v), opts, ans: opts.findIndex(o => o.t === v.w), optClass: 'kj', two: true, wid: v.id, srsId: v.id, explain: `<div class="kparts">${kparts(v.w)}</div>`, review: `${esc(v.r)} — ${esc(v.m)}` };
  }
  function qKanjiHun(k, pool) {
    const same = pool.filter(x => x.k !== k.k);
    const conf = (CONF[k.k] || []).filter(c => KMAP[c]).map(c => KMAP[c].hun);
    const ds = fill(k.hun, conf, same.map(x => x.hun).concat(N.KANJI.map(x => x.hun)));
    const opts = shuffle([{ t: k.hun, note: [k.on.join('・'), k.kun.join('・')].filter(Boolean).join(' / ') }, ...ds.map(t => { const kk = N.KANJI.find(x => x.hun === t); return { t, note: kk ? kk.k : '' }; })]);
    const ex = (K2V[k.k] || [])[0];
    return { ins: '이 한자의 훈음은?', prompt: `<div class="q-big">${k.k}</div>`, opts, ans: opts.findIndex(o => o.t === k.hun), optClass: 'ko', two: true, wid: kid(k.k), srsId: kid(k.k), sayAfter: ex ? sv(ex) : '', explain: ex ? `<div class="small muted">예) ${esc(ex.w)} (${esc(ex.r)}) ${esc(ex.m)}</div>` : '', review: `${k.k}`, time: 12 };
  }
  function qKanjiPick(k, pool) {
    const sameOn = N.KANJI.filter(x => x.k !== k.k && x.on.some(o => k.on.includes(o))).map(x => x.k);
    const conf = (CONF[k.k] || []).filter(c => KMAP[c]);
    const ds = fill(k.k, conf.concat(sameOn), pool.map(x => x.k).concat(N.KANJI.map(x => x.k)));
    const opts = shuffle([{ t: k.k, note: k.hun }, ...ds.map(t => ({ t, note: KMAP[t] ? KMAP[t].hun : '' }))]);
    const rd = [k.on[0], k.kun[0] && k.kun[0].replace('.', '')].filter(Boolean).join(' / ');
    return { ins: '훈음과 읽기에 맞는 한자를 고르세요.', prompt: `<div class="hun" style="font-size:30px">${esc(k.hun)}</div><div class="q-sub jp">${esc(rd)}</div>`, opts, ans: opts.findIndex(o => o.t === k.k), optClass: 'kj', two: true, wid: kid(k.k), srsId: kid(k.k), sayBefore: k.kun[0] ? k.kun[0].replace('.', '') : k.on[0], review: esc(k.hun), time: 12 };
  }
  function kanjiQuiz(mode, usePool) {
    const pool = usePool ? kanjiPool() : N.KANJI.filter(k => k.lv !== '교재'); // 홈 빠른 연습은 시험 범위(N5·N4·기출) 우선
    let qs = [], title = '';
    if (mode === 'hun') { title = '훈음 맞히기'; qs = pick(pool, 30).map(k => qKanjiHun(k, pool)); }
    else if (mode === 'pick') { title = '한자 고르기'; qs = pick(pool, 20).map(k => qKanjiPick(k, pool)); }
    else if (mode === 'word' || mode === 'write') {
      const set = new Set(pool.map(k => k.k));
      let vs = vocabWithK().filter(v => !usePool || [...v.w].some(c => set.has(c)));
      if (mode === 'write') vs = vs.filter(v => writeTraps(v.w).length || N.VOCAB.some(x => x.r === v.r && x.w !== v.w));
      title = mode === 'word' ? '단어 읽기' : '단어 표기';
      qs = pick(vs, 20).map(mode === 'word' ? qWordRead : qWordWrite);
    }
    startQuiz(title, qs);
  }

  /* 기출 문제 → 퀴즈 문항 */
  function probQ(p, qi) {
    const q = p.qs[qi]; const type = p.type; const ansText = q.o[q.a][0];
    let prompt = '', sayBefore = '', sayAfter = '', two = false, optClass = '';
    const furi = S.set.furi ? '' : 'nofuri';
    // 음성 텍스트는 빌드 때 형태소 분석으로 검증한 q.sb(풀기 전) / q.sa(정답 확인 후)를 사용
    sayBefore = q.sb || ''; sayAfter = q.sa || ansText;
    if (type === 'syn') {
      prompt = `<div class="q-sent ${furi}"><span class="ul">${ruby(q.s)}</span></div>`;
    } else if (type === 'use') {
      prompt = `<div class="q-big jp">${esc(q.s)}</div>`;
    } else {
      prompt = `<div class="q-sent ${furi}">${ruby(q.s, type === 'ctx' ? null : q.u)}</div>`;
      two = type !== 'ctx' || ansText.length <= 8;
      if (type === 'write') optClass = 'kj';
    }
    const opts = q.o.map((o, i) => ({ t: o[0], note: o[1], say: q.os ? q.os[i] : null }));
    return shuffleOpts({ ins: TYPE_INS[type], prompt, opts, ans: q.a, two: two && opts.every(o => o.t.length <= 7), optClass, sayBefore, sayAfter, wid: 'p:' + p.id + '-' + qi, pset: p.id, explain: q.t ? `<div class="tr">${esc(q.t)}</div>` : '', review: type === 'use' ? esc(q.s) : ruby(q.s, type === 'ctx' ? null : q.u) });
  }
  function startSet(p) { startQuiz(p.title, shuffle(p.qs.map((_, i) => probQ(p, i))), { setId: p.id }); }

  function pickFresh(qs, n) {
    const seen = q => S.seen[q.wid] || 0;
    return shuffle(shuffle(qs).sort((a, b) => seen(a) - seen(b)).slice(0, n));
  }
  /* ───────── 어휘 탭 ───────── */
  let vSearch = '';
  VIEWS.vocab = () => {
    const res = vSearch ? N.VOCAB.filter(v => v.w.includes(vSearch) || v.r.includes(vSearch) || v.m.includes(vSearch)).slice(0, 60) : [];
    const kres = vSearch && vSearch.length <= 2 ? [...vSearch].filter(c => KMAP[c]) : [];
    return top('어휘', `${N.VOCAB.length + N.SYN.length}개`, false) + `
    <div class="sec"><input class="search" id="vsearch" type="search" placeholder="한자 · 히라가나 · 뜻으로 찾기" value="${esc(vSearch)}" autocomplete="off"></div>
    ${vSearch ? `<div class="sec">${kres.length ? `<div class="cmp" style="margin-bottom:10px">${kres.map(c => `<button data-kanji="${c}"><b>${c}</b><small>${esc(KMAP[c].hun)}</small></button>`).join('')}</div>` : ''}
      ${res.length ? `<div class="wlist">${res.map(v => wordItem(v)).join('')}</div>` : '<div class="empty">찾는 단어가 없습니다.</div>'}</div>` : `
    <div class="sec"><div class="list">${Object.keys(N.LESSON_INFO).map(L => {
      L = +L; const [type, sub] = N.LESSON_INFO[L];
      const items = lessonIds(L); const done = items.filter(id => (srs(id) || {}).b >= 4).length;
      const tcls = { 한자읽기: 'read', 한자표기: 'write', 문맥규정: 'ctx', 유의표현: 'syn', 용법: 'use', 종합: 'mix' }[type];
      return `<button class="lesson" data-lesson="${L}"><span class="no">${L}</span><span><span class="t">${L}과 </span><span class="tag ${tcls}">${type}</span><div class="s">${sub}</div></span><span class="p">${done}/${items.length}<br>암기</span></button>`;
    }).join('')}</div></div>`}`;
  };
  function lessonIds(L) { return L >= 10 && L <= 12 ? N.SYN.filter(s => s.L === L).map(s => s.id) : N.VOCAB.filter(v => v.L.includes(L)).map(v => v.id); }
  let lcat = 'all';
  VIEWS.lesson = (vw) => {
    const L = vw.L; const [type, sub] = N.LESSON_INFO[L]; const isSyn = L >= 10 && L <= 12;
    let items = isSyn ? N.SYN.filter(s => s.L === L) : N.VOCAB.filter(v => v.L.includes(L));
    const cats = L === 15 ? ['all', ...new Set(items.map(v => v.c))] : null;
    if (cats && lcat !== 'all') items = items.filter(v => v.c === lcat);
    const ids = items.map(x => x.id);
    const kw = items.filter(v => !isSyn && hasK(v.w) && v.w !== v.r);
    return top(`${L}과 ${type}`, sub, true) + `
    ${cats ? `<div class="sec"><div class="chips">${cats.map(c => `<button class="chip ${lcat === c ? 'on' : ''}" data-lcat="${esc(c)}">${c === 'all' ? '전체' : esc(c)}</button>`).join('')}</div></div>` : ''}
    <div class="sec"><div class="btn-grid">
      <button class="btn pri" data-act="lcards"><span>카드로 외우기</span><small style="color:inherit;opacity:.8">${ids.length}개 · 섞어서</small></button>
      ${isSyn ? `<button class="btn" data-act="lq" data-mode="syn"><span>유의표현 퀴즈</span><small>같은 의미 고르기</small></button>` : `
      <button class="btn" data-act="lq" data-mode="mean"><span>뜻 고르기</span><small>단어 → 한국어</small></button>
      <button class="btn" data-act="lq" data-mode="read" ${kw.length >= 4 ? '' : 'disabled'}><span>읽기 고르기</span><small>함정 보기 포함</small></button>
      <button class="btn" data-act="lq" data-mode="write" ${kw.length >= 4 ? '' : 'disabled'}><span>표기 고르기</span><small>닮은 한자 함정</small></button>`}
    </div></div>
    <div class="sec"><div class="sec-h"><h2>단어 목록</h2><span class="more">🔊 눌러 발음 듣기</span></div>
      <div class="wlist">${isSyn ? items.map(s => `<div class="witem"><div class="grow"><div class="jp" style="font-weight:700">${esc(s.a)}</div><div class="r">≒ ${esc(s.b)}</div><div class="m">${esc(s.m)}</div></div>${spkBtn(s.a + '。' + s.b)}</div>`).join('') : items.map(v => wordItem(v, false)).join('')}</div></div>`;
  };
  function lessonQuiz(L, mode) {
    const isSyn = L >= 10 && L <= 12;
    let items = isSyn ? N.SYN.filter(s => s.L === L) : N.VOCAB.filter(v => v.L.includes(L));
    if (L === 15 && lcat !== 'all' && !isSyn) items = items.filter(v => v.c === lcat);
    let qs = [];
    if (mode === 'syn') {
      qs = pick(items, 20).map(s => {
        const ds = fill(s.b, items.filter(x => x !== s).map(x => x.b), N.SYN.map(x => x.b));
        const opts = shuffle([{ t: s.b, note: s.m, say: s.b }, ...ds.map(t => ({ t, say: t, note: (N.SYN.find(x => x.b === t) || {}).m || '' }))]);
        return { ins: '같은 의미의 문장을 고르세요.', prompt: `<div class="q-sent"><span class="ul">${esc(s.a)}</span></div><div class="q-sub">${esc(s.m)}</div>`, sayBefore: s.a, opts, ans: opts.findIndex(o => o.t === s.b), sayAfter: s.b, wid: s.id };
      });
    } else if (mode === 'mean') {
      qs = pick(items, 20).map(v => {
        const ds = fill(v.m, items.filter(x => x !== v).map(x => x.m), N.VOCAB.map(x => x.m));
        const opts = shuffle([{ t: v.m, note: v.r }, ...ds.map(t => { const x = N.VOCAB.find(y => y.m === t); return { t, note: x ? x.w + (x.w !== x.r ? ' (' + x.r + ')' : '') : '' }; })]);
        return { ins: '단어의 뜻을 고르세요.', prompt: `<div class="q-big jp">${esc(v.w)}</div>`, sayBefore: hasK(v.w) ? '' : sv(v), opts, ans: opts.findIndex(o => o.t === v.m), optClass: 'ko', two: true, sayAfter: sv(v), wid: v.id, review: esc(v.w) };
      });
    } else {
      const kw = items.filter(v => hasK(v.w) && v.w !== v.r);
      qs = pick(kw, 20).map(mode === 'read' ? qWordRead : qWordWrite);
    }
    startQuiz(`${L}과 ${{ syn: '유의표현', mean: '뜻 고르기', read: '읽기 고르기', write: '표기 고르기' }[mode]}`, qs);
  }

  /* ───────── 문제 탭 ───────── */
  VIEWS.prob = () => {
    const groups = [['read', [1, 2, 3]], ['write', [4, 5, 6]], ['ctx', [7, 8, 9]], ['syn', [10, 11, 12]], ['use', [13, 14]], ['mix', [15]]];
    return top('기출 문제', `${N.PROBS.reduce((s, p) => s + p.qs.length, 0)}문항`, false) + `
    <div class="sec"><div class="btn-grid">
      <button class="btn pri" data-act="mock"><span>실전 모의 25문항</span><small style="color:inherit;opacity:.8">5유형 섞어서 · 타이머 ${S.set.timer ? '켜짐' : '꺼짐'}</small></button>
      <button class="btn" data-act="pwrong"><span>틀린 기출만</span><small>${Object.keys(S.wrong).filter(k => k.startsWith('p:')).length}문항</small></button>
    </div></div>
    ${groups.map(([t, Ls]) => {
      const sets = N.PROBS.filter(p => Ls.includes(p.L));
      return `<div class="sec"><div class="sec-h"><h2><span class="tag ${t}">${TYPE_NAME[t]}</span> ${Ls.map(l => l + '과').join('·')}</h2><button class="more" style="border:0;background:none" data-act="ptype" data-type="${t}">유형 랜덤 20 →</button></div>
      <div class="list">${sets.map(p => `<button class="set" data-set="${p.id}"><span><b>${esc(p.title)}</b><div class="small muted">${p.L}과 · ${p.qs.length}문항</div></span><span class="sc ${S.best[p.id] >= 80 ? 'done' : ''}">${S.best[p.id] != null ? '최고 ' + S.best[p.id] + '%' : '미풀이'}</span></button>`).join('')}</div></div>`;
    }).join('')}`;
  };
  function mockQuiz() {
    const byType = t => N.PROBS.filter(p => p.type === t).flatMap(p => p.qs.map((_, i) => [p, i]));
    const qs = [];
    ['read', 'write', 'ctx', 'syn', 'use'].forEach(t => pickFresh(byType(t).map(([p, i]) => probQ(p, i)), 5).forEach(q => qs.push(q)));
    startQuiz('실전 모의', shuffle(qs));
  }

  /* ───────── 오답노트 ───────── */
  VIEWS.wrong = () => {
    const keys = Object.keys(S.wrong);
    const ks = keys.filter(k => k.startsWith('k:')).map(k => KMAP[k.slice(2)]).filter(Boolean);
    const vs = keys.filter(k => VMAP[k]).map(k => VMAP[k]);
    const ss = keys.filter(k => SMAP[k]).map(k => SMAP[k]);
    const ps = keys.filter(k => k.startsWith('p:')).map(k => { const [id, qi] = k.slice(2).split('-').map(Number); return PMAP[id] ? { p: PMAP[id], qi, k } : null; }).filter(Boolean);
    if (!keys.length) return top('오답노트', '', false) + '<div class="empty"><div class="stamp">済</div><p>틀린 항목이 없습니다.<br>문제를 풀거나 카드에서 「모름」을 누르면 여기에 모입니다.</p></div>';
    return top('오답노트', `${keys.length}개`, false) + `
    <p class="small muted" style="margin-top:14px">맞히면 횟수가 줄고, 카드에서 「앎」으로 충분히 외우면 자동으로 빠집니다.</p>
    <div class="sec"><div class="btn-grid">
      <button class="btn pri" data-act="wcards" ${ks.length + vs.length + ss.length ? '' : 'disabled'}><span>오답 카드 복습</span><small style="color:inherit;opacity:.8">한자 ${ks.length} · 어휘 ${vs.length + ss.length}</small></button>
      <button class="btn" data-act="pwrong" ${ps.length ? '' : 'disabled'}><span>틀린 문제 다시 풀기</span><small>${ps.length}문항</small></button>
    </div></div>
    ${ks.length ? `<div class="sec"><div class="sec-h"><h2>한자 ${ks.length}</h2></div><div class="kgrid">${ks.map(k => `<button class="ktile" data-kanji="${k.k}"><span class="dot st1"></span><span class="c">${k.k}</span><span class="h">${esc(k.hun)}</span></button>`).join('')}</div></div>` : ''}
    ${vs.length ? `<div class="sec"><div class="sec-h"><h2>어휘 ${vs.length}</h2></div><div class="wlist">${vs.map(v => wordItem(v)).join('')}</div></div>` : ''}
    ${ss.length ? `<div class="sec"><div class="sec-h"><h2>유의표현 ${ss.length}</h2></div><div class="wlist">${ss.map(s => `<div class="witem"><div class="grow"><div class="jp" style="font-weight:700">${esc(s.a)}</div><div class="r">≒ ${esc(s.b)}</div></div>${spkBtn(s.a)}</div>`).join('')}</div></div>` : ''}
    ${ps.length ? `<div class="sec"><div class="sec-h"><h2>기출 문제 ${ps.length}</h2></div><div class="list">${ps.slice(0, 40).map(({ p, qi }) => { const q = p.qs[qi]; return `<div class="panel"><div class="small muted"><span class="tag ${p.type}">${TYPE_NAME[p.type]}</span> ${esc(p.title)} · ${qi + 1}번</div><div class="q-sent" style="font-size:16px;line-height:2">${p.type === 'use' ? esc(q.s) : ruby(q.s, p.type === 'ctx' ? null : q.u)}</div><div class="row"><span class="grow" style="color:var(--ok);font-weight:700">정답: ${esc(q.o[q.a][0])}</span>${q.sa ? spkBtn(q.sa) : ''}</div></div>`; }).join('')}</div></div>` : ''}
    <div class="sec"><button class="btn block" data-act="clearwrong">오답노트 비우기</button></div>`;
  };
  function wrongProbQuiz() {
    const ps = Object.keys(S.wrong).filter(k => k.startsWith('p:')).map(k => { const [id, qi] = k.slice(2).split('-').map(Number); return PMAP[id] ? probQ(PMAP[id], qi) : null; }).filter(Boolean);
    startQuiz('틀린 기출 다시', shuffle(ps).slice(0, 30));
  }

  /* ───────── 헷갈리는 한자 / 동음이의어 ───────── */
  VIEWS.confuse = () => top('모양이 닮은 한자', '', true) + `<p class="small muted" style="margin-top:14px">한자표기 문제의 오답 보기는 대부분 이런 짝에서 나옵니다. 눌러서 자세히 보세요.</p>
    <div class="sec"><button class="btn pri block" data-act="cquiz">닮은 한자 구별 퀴즈 20</button></div>
    <div class="list">${N.CONFUSE.map(g => `<div class="panel"><div class="cmp">${g.map(c => `<button data-kanji="${c}" ${KMAP[c] ? '' : 'disabled'}><b>${c}</b><small>${KMAP[c] ? esc(KMAP[c].hun) : '범위 외'}</small></button>`).join('')}</div></div>`).join('')}</div>`;
  VIEWS.homo = () => top('같은 읽기 다른 한자', '', true) + `<p class="small muted" style="margin-top:14px">읽기가 같아서 표기 문제에 함정으로 자주 나오는 말들입니다.</p>
    <div class="homo sec">${N.HOMO.map(h => `<div class="panel"><div class="row"><span class="rd2 grow">${esc(h.r)}</span>${spkBtn(h.r)}</div>${h.items.map(i => `<div class="it"><b>${esc(i.w)}</b><span class="muted grow">${esc(i.m)}</span>${(() => { const v = N.VOCAB.find(x => x.w === i.w && x.r === h.r) || N.VOCAB.find(x => x.w === i.w); return v ? spkBtn(sv(v), 'sm') : ''; })()}</div>`).join('')}</div>`).join('')}</div>`;
  function confuseQuiz() {
    const ks = N.KANJI.filter(k => (CONF[k.k] || []).some(c => KMAP[c]));
    startQuiz('닮은 한자 구별', pick(ks, 20).map(k => qKanjiPick(k, ks)));
  }

  /* ───────── 30회 완주 코스 (일정 탭) ─────────
     1~26회: 복습 → 새 한자 → 훈음 확인 → 어휘 → 기출 (약 55분)
     27~30회: 실전 모의 + 유형 집중 + 오답 정리
     교재 순서대로 한자 686자 · 어휘 1,415개 · 기출 1,089문항을 26회에 고르게 나눈다. */
  const PLAN_N = 30, LEARN_N = 26;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const PLAN = (() => {
    const chunk = (arr, n) => Array.from({ length: n }, (_, i) => arr.slice(Math.round(arr.length * i / n), Math.round(arr.length * (i + 1) / n)));
    const lvIdx = {}; const lvCnt = {}; N.KANJI.forEach(k => { lvCnt[k.lv] = (lvCnt[k.lv] || 0) + 1; lvIdx[k.k] = lvCnt[k.lv]; });
    const LVN = { N5: 'N5', N4: 'N4', 기출: '기출 N3', 교재: '교재' };
    const kan = chunk(N.KANJI, LEARN_N);
    const seen = new Set(), vlist = [];
    for (let L = 1; L <= 15; L++) lessonIds(L).forEach(id => { if (!seen.has(id)) { seen.add(id); vlist.push({ id, L }); } });
    const voc = chunk(vlist, LEARN_N);
    const totalQ = N.PROBS.reduce((s, p) => s + p.qs.length, 0);
    const bins = Array.from({ length: LEARN_N }, () => []); let cum = 0;
    N.PROBS.forEach(p => { const b = Math.min(LEARN_N - 1, Math.floor((cum + p.qs.length / 2) / totalQ * LEARN_N)); bins[b].push(p.id); cum += p.qs.length; });
    const lrange = Ls => { const a = Math.min(...Ls), b = Math.max(...Ls); return a === b ? `${a}과` : `${a}~${b}과`; };
    const sessions = [];
    for (let i = 0; i < LEARN_N; i++) {
      const ks = kan[i];
      const parts = []; ks.forEach(k => { const last = parts[parts.length - 1]; if (last && last.lv === k.lv) last.b = lvIdx[k.k]; else parts.push({ lv: k.lv, a: lvIdx[k.k], b: lvIdx[k.k] }); });
      const kLabel = parts.map(x => `${LVN[x.lv]} ${x.a}~${x.b}`).join(' · ');
      const qn = bins[i].reduce((s, id) => s + PMAP[id].qs.length, 0);
      sessions.push({
        phase: ks.every(k => k.lv !== '교재') ? '기초 한자' : '교재 한자', title: `한자 ${ks[0].k}~${ks[ks.length - 1].k} · 어휘 ${lrange(voc[i].map(x => x.L))}`,
        steps: [
          { k: 'rev', name: '복습', desc: '기억이 흐려질 때가 된 한자·어휘 (최대 40장)' },
          { k: 'kc', name: '새 한자', desc: `${kLabel} · ${ks.length}자`, ids: ks.map(k => k.k), min: Math.round(ks.length * 0.45) },
          { k: 'kq', name: '훈음 확인', desc: '방금 본 한자 10문항', ids: ks.map(k => k.k), min: 3 },
          { k: 'vc', name: '어휘', desc: `${lrange(voc[i].map(x => x.L))} 단어 ${voc[i].length}개`, ids: voc[i].map(x => x.id), min: Math.round(voc[i].length * 0.2) },
          { k: 'pq', name: '기출 문제', desc: `${lrange(bins[i].map(id => PMAP[id].L))} 확인문제 ${bins[i].length}세트 · ${qn}문항`, sets: bins[i], min: Math.round(qn * 0.4) },
        ],
      });
    }
    const R = { k: 'rev', name: '복습', desc: '기억이 흐려질 때가 된 한자·어휘 (최대 40장)' };
    const M = { k: 'mock', name: '실전 모의 25', desc: '5유형 섞어서 · 실제 시험처럼', min: 15 };
    const T = t => ({ k: 'ptype', type: t, name: `${TYPE_NAME[t]} 집중 20`, desc: '전체 기출에서 무작위', min: 9 });
    sessions.push(
      { phase: '실전 마무리', title: '모의고사 1 · 한자읽기', steps: [R, M, T('read'), { k: 'wcards', name: '오답 카드', desc: '틀렸던 한자·어휘', min: 10 }] },
      { phase: '실전 마무리', title: '모의고사 2 · 한자표기', steps: [R, M, T('write'), { k: 'cquiz', name: '닮은 한자 구별 20', desc: '표기 문제 함정 대비', min: 8 }, { k: 'pwrong', name: '틀린 기출 다시', desc: '최대 30문항', min: 12 }] },
      { phase: '실전 마무리', title: '모의고사 3 · 문맥·유의', steps: [R, M, T('ctx'), T('syn')] },
      { phase: '실전 마무리', title: '모의고사 4 · 용법 · 총정리', steps: [R, M, T('use'), { k: 'pwrong', name: '틀린 기출 다시', desc: '최대 30문항', min: 12 }, { k: 'wcards', name: '오답 카드', desc: '마지막 점검', min: 8 }] },
    );
    return { sessions };
  })();
  const fmtD = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const mdLabel = s => { const d = new Date(s + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
  const validId = id => id.startsWith('k:') ? !!KMAP[id.slice(2)] : !!(VMAP[id] || SMAP[id]);
  function reviewIds() { const now = Date.now(); return shuffle(Object.keys(S.srs).filter(id => S.srs[id].due <= now && validId(id))).slice(0, 40); }
  // 복습 차례가 아직 안 된 경우: 오답 우선, 그다음 복습일이 가까운 카드 20장
  function previewIds() { const ids = Object.keys(S.srs).filter(validId); const w = id => (S.wrong[id] ? 0 : 1); return shuffle(ids.sort((a, b) => w(a) - w(b) || S.srs[a].due - S.srs[b].due).slice(0, 20)); }
  function revDesc() { const d = reviewIds().length; if (d) return `지금 복습 차례인 한자·어휘 ${d}장`; const p = previewIds().length; return p ? `복습 차례인 카드는 없어서, 오답·최근 카드 ${p}장을 미리 복습` : '아직 학습한 카드가 없어 이번에는 건너뜁니다 (첫 회차)'; }
  const stepMin = st => st.k === 'rev' ? Math.max(3, Math.min(10, Math.round((reviewIds().length || previewIds().length) * 0.25))) : st.min;
  const stepDone = (n, si) => !!S.plan.steps[n + '-' + si];
  const nextChapter = () => { for (let n = 1; n <= PLAN_N; n++) if (!S.plan.fin[n]) return n; return 0; };
  // 완료한 회차는 완료일, 남은 회차는 오늘(오늘 이미 끝냈으면 내일)부터 공부 요일에 차례로 배치
  function planDates() {
    const res = {}; const days = S.plan.days; const t = todayStr();
    const d = new Date(t + 'T00:00:00');
    if (Object.values(S.plan.fin).includes(t)) d.setDate(d.getDate() + 1);
    for (let n = 1; n <= PLAN_N; n++) {
      if (S.plan.fin[n]) { res[n] = S.plan.fin[n]; continue; }
      let guard = 0; while (!days.includes(d.getDay()) && guard++ < 8) d.setDate(d.getDate() + 1);
      res[n] = fmtD(d); d.setDate(d.getDate() + 1);
    }
    return res;
  }
  function markStep(n, si, manual) {
    S.plan.steps[n + '-' + si] = 1; logToday();
    const all = PLAN.sessions[n - 1].steps.every((_, i) => stepDone(n, i));
    if (all && !S.plan.fin[n]) finishChapter(n); else if (manual) toast('완료로 표시했습니다');
    save(); if (manual) render();
  }
  function finishChapter(n) { S.plan.fin[n] = todayStr(); if (S.plan.focus && S.plan.focus.n === n) S.plan.focus = null; save(); toast(n === PLAN_N ? '30회 코스를 모두 마쳤습니다. 시험 잘 보세요!' : `${n}회차 완료! 수고했습니다`); }
  function planDone(ses) { if (ses.plan && !ses.planMarked) { ses.planMarked = 1; markStep(ses.plan.n, ses.plan.si, false); } }
  function ptypeQuiz(type) { const all = N.PROBS.filter(p => (type === 'mix' ? p.L === 15 : p.type === type)).flatMap(p => p.qs.map((_, i) => probQ(p, i))); return startQuiz(TYPE_NAME[type] + ' 랜덤', pickFresh(all, 20)); }
  function wrongCards() { return startCards(shuffle(Object.keys(S.wrong).filter(k => (k.startsWith('k:') && KMAP[k.slice(2)]) || VMAP[k] || SMAP[k])), '오답 카드'); }
  function runStep(n, si) {
    const st = PLAN.sessions[n - 1].steps[si];
    pendingPlan = { n, si };
    if (!S.plan.focus) { S.plan.focus = { n, t0: Date.now() }; save(); }
    switch (st.k) {
      case 'rev': { const ids = reviewIds(); if (ids.length) return startCards(ids, `${n}회차 · 복습`); const pv = previewIds(); if (pv.length) return startCards(pv, `${n}회차 · 미리 복습`); pendingPlan = null; toast('아직 학습한 카드가 없어 복습을 건너뜁니다'); return markStep(n, si, true); }
      case 'kc': return startCards(shuffle(st.ids).map(kid), `${n}회차 · 새 한자`);
      case 'kq': { const pool = st.ids.map(c => KMAP[c]); return startQuiz(`${n}회차 · 훈음 확인`, pick(pool, 10).map(k => qKanjiHun(k, pool))); }
      case 'vc': return startCards(shuffle(st.ids), `${n}회차 · 어휘`);
      case 'pq': return startQuiz(`${n}회차 · 기출`, shuffle(st.sets.flatMap(id => PMAP[id].qs.map((_, i) => probQ(PMAP[id], i)))));
      case 'mock': return mockQuiz();
      case 'ptype': return ptypeQuiz(st.type);
      case 'cquiz': return confuseQuiz();
      case 'wcards': { if (!Object.keys(S.wrong).some(k => k.startsWith('k:') || VMAP[k] || SMAP[k])) { pendingPlan = null; toast('오답 카드가 없습니다. 완료로 표시했어요'); return markStep(n, si, true); } return wrongCards(); }
      case 'pwrong': { if (!Object.keys(S.wrong).some(k => k.startsWith('p:'))) { pendingPlan = null; toast('틀린 기출이 없습니다. 완료로 표시했어요'); return markStep(n, si, true); } return wrongProbQuiz(); }
    }
  }
  function chapterMin(n) { return PLAN.sessions[n - 1].steps.reduce((s, st) => s + stepMin(st), 0); }
  function homeChapterCard() {
    const n = nextChapter(); const dates = planDates(); const t = todayStr();
    if (!n) return `<div class="sec"><div class="today"><b>30회 코스 완주!</b><span class="small">이제 오답과 실전 모의로 감각을 유지하세요.</span><button class="btn block" data-tab="plan">일정 보기</button></div></div>`;
    const st = PLAN.sessions[n - 1]; const doneSteps = st.steps.filter((_, i) => stepDone(n, i)).length;
    const doneToday = Object.values(S.plan.fin).includes(t);
    return `<div class="sec"><div class="today">
      <div class="row"><b class="grow">${doneToday ? '오늘 챕터 완료 · 다음 회차' : '오늘의 데일리 챕터'}</b><span class="small">연속 ${streak()}일째</span></div>
      <div><div class="chap-no">${n}<small>/ ${PLAN_N}회차</small></div><div class="small" style="opacity:.9">${esc(st.title)}</div></div>
      <div class="nums"><div class="num"><b>${doneSteps}/${st.steps.length}</b><span>단계</span></div><div class="num"><b>${chapterMin(n)}</b><span>예상 분</span></div><div class="num"><b>${dates[n] === t ? '오늘' : dates[n].slice(5).replace('-', '/').replace(/^0/, '').replace('/0', '/')}</b><span>예정일${dates[n] === t ? '' : ' (' + WD[new Date(dates[n] + 'T00:00:00').getDay()] + ')'}</span></div></div>
      <button class="btn block" data-chap="${n}">${doneSteps ? '이어서 하기' : '챕터 시작'} →</button>
    </div></div>`;
  }
  VIEWS.plan = () => {
    const dates = planDates(); const n0 = nextChapter(); const fin = Object.keys(S.plan.fin).length;
    const last = dates[PLAN_N]; const exam = S.set.exam;
    const late = last > exam; const left = PLAN_N - fin; const dd = ddays();
    const perWeek = dd > 0 ? Math.ceil(left / (dd / 7)) : left;
    return top('30회 완주 코스', `${fin}/${PLAN_N}회`, false, `${dd >= 0 ? `<span class="chip-dday">D-${dd}</span>` : ''}`) + `
    <div class="sec"><div class="panel">
      <div class="row"><b class="grow">진도</b><span class="small muted">${fin}회 완료 · 남은 ${left}회</span></div>
      <div class="bar" style="margin-top:8px"><i class="bg-st3" style="width:${fin / PLAN_N * 100}%"></i></div>
      <div class="plan-eta ${late ? 'late' : ''}">${left ? `이대로면 <b>${mdLabel(last)}</b>에 완주 · ${late ? `시험일(${mdLabel(exam)})보다 늦습니다. 공부 요일을 늘려 주세요 (주 ${perWeek}회 이상)` : `시험 ${Math.round((new Date(exam) - new Date(last)) / DAY)}일 전`}` : '모든 회차를 마쳤습니다'}</div>
      <div class="set-row stack" style="padding-bottom:0"><span><b>공부 요일</b><span class="d">고른 요일에 한 회차씩 배치합니다. 하루 빠져도 남은 회차가 자동으로 뒤로 밀립니다.</span></span>
        <div class="wd">${[1, 2, 3, 4, 5, 6, 0].map(i => `<button class="${S.plan.days.includes(i) ? 'on' : ''}" data-pday="${i}" aria-pressed="${S.plan.days.includes(i)}">${WD[i]}</button>`).join('')}</div></div>
    </div></div>
    <div class="sec"><div class="panel small route">
      <b>하루 루트 (약 1시간)</b>
      <ol><li><span>복습</span> 간격 반복으로 돌아온 카드 · 10분</li><li><span>새 한자</span> 26자 안팎 카드 암기 · 12분</li><li><span>훈음 확인</span> 방금 본 한자 퀴즈 · 3분</li><li><span>어휘</span> 교재 순서대로 55개 안팎 · 11분</li><li><span>기출</span> 확인문제 40문항 안팎 · 17분</li></ol>
      <span class="muted">27~30회는 실전 모의고사와 오답 정리로 마무리합니다.</span>
    </div></div>
    ${[['기초 한자', 'N5 · N4 · 기출 한자 321자'], ['교재 한자', '교재 어휘에 나오는 한자 365자'], ['실전 마무리', '모의고사 4회 · 유형 집중 · 오답']].map(([ph, sub]) => `
    <div class="sec"><div class="sec-h"><h2>${ph}</h2><span class="more">${sub}</span></div><div class="list">
      ${PLAN.sessions.map((st, i) => [st, i + 1]).filter(([st]) => st.phase === ph).map(([st, n]) => {
        const done = !!S.plan.fin[n]; const ds = st.steps.filter((_, i) => stepDone(n, i)).length;
        return `<button class="chap ${done ? 'done' : ''} ${n === n0 ? 'next' : ''}" data-chap="${n}"><span class="no">${done ? '✓' : n}</span><span class="grow"><b>${n}회차</b> <span class="muted small">${done ? '완료 ' : ''}${mdLabel(dates[n])}</span><span class="s">${esc(st.title)}</span></span><span class="p">${done ? '' : ds ? `${ds}/${st.steps.length}` : `${chapterMin(n)}분`}</span></button>`;
      }).join('')}
    </div></div>`).join('')}`;
  };
  VIEWS.chapter = (vw) => {
    const n = vw.n; const st = PLAN.sessions[n - 1]; const dates = planDates();
    const fin = S.plan.fin[n]; const f = S.plan.focus && S.plan.focus.n === n ? S.plan.focus : null;
    const el = () => Math.floor((Date.now() - f.t0) / 60e3);
    if (f) vw.after = () => { focusId = setInterval(() => { const e = $('#focus-el'); if (e) e.textContent = el() + '분'; }, 20e3); };
    const total = chapterMin(n);
    return top(`${n}회차 데일리 챕터`, st.phase, true) + `
    <div class="sec"><div class="panel">
      <div class="row"><b class="grow">${esc(st.title)}</b><span class="tag">${fin ? '완료 ' + mdLabel(fin) : mdLabel(dates[n])}</span></div>
      <div class="focus"><div><span class="small muted">예상</span><b>${total}분</b></div><div><span class="small muted">집중 시간</span><b id="focus-el">${f ? el() + '분' : '—'}</b></div>
        <button class="btn ${f ? '' : 'pri'}" data-act="focus">${f ? '타이머 멈춤' : '60분 집중 시작'}</button></div>
      ${f && el() >= 60 ? '<div class="hint">1시간이 지났습니다. 남은 단계는 다음에 이어서 해도 괜찮습니다.</div>' : ''}
    </div></div>
    <div class="sec"><div class="steps">${st.steps.map((s, i) => { const d = stepDone(n, i); return `
      <div class="step ${d ? 'done' : ''}">
        <button class="chk" data-pchk="${n}" data-si="${i}" aria-label="${d ? '완료 취소' : '완료로 표시'}">${d ? '✓' : i + 1}</button>
        <div class="grow"><b>${s.name}</b> <span class="muted small">${stepMin(s)}분</span><div class="small muted">${esc(s.k === 'rev' ? revDesc() : s.desc)}</div></div>
        <button class="btn ${d ? '' : 'pri'}" data-prun="${n}" data-si="${i}">${d ? '다시' : '시작'}</button>
      </div>`; }).join('')}</div></div>
    <div class="sec"><button class="btn block ${fin ? '' : 'ok'}" data-act="pfin">${fin ? '완료 취소' : '이 회차 완료로 표시'}</button>
      <p class="small muted" style="margin-top:8px">각 단계를 끝까지 마치면 자동으로 체크됩니다. 모든 단계가 체크되면 회차가 완료됩니다.</p></div>
    ${n < PLAN_N ? `<div class="sec"><button class="btn block" data-chap="${n + 1}">다음 회차 미리 보기 →</button></div>` : ''}`;
  };

  /* ───────── 설정 ───────── */
  VIEWS.settings = () => {
    TTS.load();
    const vs = TTS.voices;
    return top('설정', '', true) + `
    <div class="sec"><div class="panel">
      <div class="set-row stack"><label for="s-voice">음성<span class="d">${TTS.ok ? (vs.length ? `일본어 음성 ${vs.length}개 · 지금 사용: ${esc((TTS.pickVoice() || {}).name || '-')}` : '일본어 음성이 없습니다. 아래 안내대로 추가하세요') : '이 브라우저는 음성을 지원하지 않습니다'}</span></label>
        <select id="s-voice"><option value="">자동 (가장 좋은 음성)</option>${vs.map(v => `<option value="${esc(v.name)}" ${S.set.voice === v.name ? 'selected' : ''}>[${TTS.quality(v)}] ${esc(v.name)}</option>`).join('')}</select></div>
      <div class="set-row"><label for="s-rate">말하기 속도<span class="d">현재 ${S.set.rate.toFixed(2)}배</span></label><input id="s-rate" type="range" min="0.6" max="1.2" step="0.05" value="${S.set.rate}"></div>
      <div class="set-row"><label for="s-test">음성 테스트<span class="d">今日は いい 天気ですね。</span></label>${spkBtn('今日はいい天気ですね。')}</div>
      <div class="set-row stack"><span><b>또박또박 듣는 요령</b><span class="d">🔊 버튼을 3초 안에 한 번 더 누르면 0.6배 속도로 다시 읽습니다. 단어는 문장보다 조금 느리게 읽습니다.</span></span></div>
      <div class="set-row stack"><span><b>더 정확한 음성 받기</b><span class="d">iPhone·iPad: 설정 → 손쉬운 사용 → 읽기 및 말하기 → 음성 → 일본어 → Kyoko(고품질) 다운로드<br>Android: 설정 → 텍스트 음성 변환 → Google 음성 엔진 → 일본어 음성 데이터 설치<br>PC: Microsoft Edge로 열면 Nanami(자연스러운 음성)를 쓸 수 있습니다</span></span></div>
      <div class="set-row"><label for="s-auto">정답 확인 시 자동 재생<span class="d">카드 뒤집기 · 문제 채점 후</span></label><input id="s-auto" class="toggle" type="checkbox" ${S.set.auto ? 'checked' : ''}></div>
    </div></div>
    <div class="sec"><div class="panel">
      <div class="set-row"><label for="s-furi">문제 후리가나 표시<span class="d">끄면 실전처럼 한자만 보입니다</span></label><input id="s-furi" class="toggle" type="checkbox" ${S.set.furi ? 'checked' : ''}></div>
      <div class="set-row"><label for="s-timer">문제 타이머<span class="d">문항당 20초 (한자 퀴즈 12초)</span></label><input id="s-timer" class="toggle" type="checkbox" ${S.set.timer ? 'checked' : ''}></div>
      <div class="set-row"><label for="s-mode">학습 방식<span class="d">30회 코스: 일정 탭의 데일리 챕터(약 1시간)로 진도를 나갑니다</span></label><select id="s-mode">${[['course', '30회 코스'], ['free', '자유 학습']].map(([k, n]) => `<option value="${k}" ${S.set.mode === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="set-row"><label for="s-daily">하루 새 한자 수<span class="d">자유 학습일 때만 적용</span></label><input id="s-daily" type="number" min="0" max="50" value="${S.set.daily}" style="width:80px"></div>
      <div class="set-row"><label for="s-exam">시험일<span class="d">홈 화면 D-day에 표시</span></label><input id="s-exam" type="date" value="${S.set.exam}"></div>
      <div class="set-row"><label for="s-theme">화면 테마</label><select id="s-theme">${[['system', '기기 설정'], ['light', '밝게'], ['dark', '어둡게']].map(([k, n]) => `<option value="${k}" ${S.set.theme === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    </div></div>
    <div class="sec"><div class="sec-h"><h2>학습 기록 백업</h2></div><div class="panel">
      <p class="small muted" style="margin-top:0">기록은 이 브라우저에만 저장됩니다. 다른 기기로 옮길 때 아래 내용을 복사해 붙여 넣으세요.</p>
      <textarea id="s-backup" aria-label="백업 데이터">${esc(JSON.stringify({ srs: S.srs, wrong: S.wrong, best: S.best, log: S.log }))}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn grow" data-act="copybk">복사</button><button class="btn grow" data-act="loadbk">붙여 넣은 내용 불러오기</button></div>
      <div class="row" style="margin-top:8px"><button class="btn ng grow" data-act="reset">${S._confirmReset ? '한 번 더 누르면 모든 기록 삭제' : '모든 학습 기록 초기화'}</button></div>
    </div></div>
    <p class="small muted" style="text-align:center;margin-top:20px">데이터 v${N.version} · 한자 ${N.KANJI.length}자 · 어휘 ${N.VOCAB.length} · 문제 ${N.PROBS.reduce((s, p) => s + p.qs.length, 0)}</p>`;
  };

  /* ───────── 이벤트 ───────── */
  document.addEventListener('click', e => {
    const t = e.target.closest('button, [data-act]'); if (!t || t.disabled) return;
    const d = t.dataset;
    if (d.say != null) { e.stopPropagation(); TTS.say(d.say); return; }
    if (d.tab) return setTab(d.tab);
    if (d.kanji) { const list = cur().v === 'kanji' ? kanjiPool().map(k => k.k) : null; return go({ v: 'kdetail', k: d.kanji, list: list || undefined }); }
    if (d.kf) { kFilter[d.kf] = d.val; return render(); }
    if (d.lesson) { lcat = 'all'; return go({ v: 'lesson', L: +d.lesson }); }
    if (d.lcat) { lcat = d.lcat; return render(); }
    if (d.set) return startSet(PMAP[+d.set]);
    if (d.pick != null) return answer(+d.pick);
    if (d.pday != null) { const x = +d.pday, a = S.plan.days; S.plan.days = a.includes(x) ? a.filter(y => y !== x) : a.concat(x).sort(); if (!S.plan.days.length) S.plan.days = [x]; save(); return render(); }
    if (d.chap) return go({ v: 'chapter', n: +d.chap });
    if (d.prun) return runStep(+d.prun, +d.si);
    if (d.pchk) { const n = +d.pchk, si = +d.si, key = n + '-' + si; if (S.plan.steps[key]) { delete S.plan.steps[key]; delete S.plan.fin[n]; save(); return render(); } return markStep(n, si, true); }
    if (d.cg) return cardGrade(+d.cg);
    if (d.grade) { grade(d.id, +d.grade); toast({ 1: '곧 다시 보여 드립니다', 2: '내일 다시 봅니다', 3: '복습 간격을 늘렸습니다' }[d.grade]); return render(); }
    switch (d.act) {
      case 'back': return back();
      case 'settings': return go({ v: 'settings' });
      case 'focus': { const n = cur().n; S.plan.focus = S.plan.focus && S.plan.focus.n === n ? null : { n, t0: Date.now() }; save(); return render(); }
      case 'pfin': { const n = cur().n; if (S.plan.fin[n]) delete S.plan.fin[n]; else finishChapter(n); save(); return render(); }
      case 'today': { const q = todayQueue(); return startCards(shuffle(q.dueK.concat(q.dueV)).concat(q.newK).slice(0, 40), '오늘의 학습'); }
      case 'kcards': return startCards(shuffle(kanjiPool().map(k => kid(k.k))), '한자 카드');
      case 'kq': return kanjiQuiz(d.mode, !!d.pool);
      case 'knav': if (d.to) { const v = cur(); v.k = d.to; v.spoken = 0; render(); window.scrollTo(0, 0); } return;
      case 'flip': if (session && !session.flip) { session.flip = true; render(); } return;
      case 'recards': { const again = [...new Set(session.again || [])]; stack.pop(); return startCards(shuffle(again), session.title + ' · 다시'); }
      case 'next': session.i++; session.picked = null; render(); window.scrollTo(0, 0); return;
      case 'requiz': { const ses = session; stack.pop(); return startQuiz(ses.title, shuffle(ses.qs).map(shuffleOpts), { setId: ses.setId }); }
      case 'rewrong': { const ses = session; stack.pop(); return startQuiz(ses.title + ' · 오답', shuffle(ses.wrongIdx.map(i => ses.qs[i])).map(shuffleOpts)); }
      case 'mock': return mockQuiz();
      case 'ptype': return ptypeQuiz(d.type);
      case 'pwrong': return wrongProbQuiz();
      case 'lcards': { const L = cur().L; let ids = lessonIds(L); if (L === 15 && lcat !== 'all') ids = N.VOCAB.filter(v => v.L.includes(15) && v.c === lcat).map(v => v.id); return startCards(shuffle(ids), `${L}과 카드`); }
      case 'lq': return lessonQuiz(cur().L, d.mode);
      case 'wcards': return wrongCards();
      case 'clearwrong': S.wrong = {}; save(); toast('오답노트를 비웠습니다'); return render();
      case 'confuse': return go({ v: 'confuse' });
      case 'homo': return go({ v: 'homo' });
      case 'cquiz': return confuseQuiz();
      case 'copybk': { const ta = $('#s-backup'); const done = () => toast('복사했습니다'); if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); toast('텍스트를 선택했습니다. 직접 복사하세요'); }); else { ta.select(); } return; }
      case 'loadbk': { try { const o = JSON.parse($('#s-backup').value); ['srs', 'wrong', 'best', 'log'].forEach(k => { if (o[k]) S[k] = o[k]; }); save(); toast('기록을 불러왔습니다'); } catch (err) { toast('형식이 올바르지 않습니다. 복사한 내용을 그대로 붙여 넣으세요'); } return render(); }
      case 'reset': if (!S._confirmReset) { S._confirmReset = true; render(); setTimeout(() => { S._confirmReset = false; }, 4000); return; } S.srs = {}; S.wrong = {}; S.best = {}; S.log = {}; S._confirmReset = false; save(); toast('모든 기록을 지웠습니다'); return render();
    }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'vsearch') { vSearch = t.value.trim(); const pos = t.selectionStart; render(); const n = $('#vsearch'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (err) { } return; }
    if (t.id === 's-rate') { S.set.rate = +t.value; save(); const d = t.parentElement.querySelector('.d'); if (d) d.textContent = '현재 ' + S.set.rate.toFixed(2) + '배'; }
  });
  document.addEventListener('change', e => {
    const t = e.target; const m = { 's-mode': 'mode', 's-voice': 'voice', 's-auto': 'auto', 's-furi': 'furi', 's-timer': 'timer', 's-daily': 'daily', 's-exam': 'exam', 's-theme': 'theme' }[t.id];
    if (!m) return;
    S.set[m] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Math.max(0, Math.min(50, +t.value || 0)) : t.value;
    save(); if (m === 'theme') applyTheme(); if (m === 'voice') TTS.say('こんにちは');
  });
  document.addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const v = cur(); if (!v) return;
    if (v.v === 'cards' && session && session.i < session.ids.length) {
      if ((e.key === ' ' || e.key === 'Enter') && !session.flip) { e.preventDefault(); session.flip = true; render(); }
      else if (session.flip && ['1', '2', '3'].includes(e.key)) cardGrade(+e.key);
    } else if (v.v === 'quiz' && session && session.i < session.qs.length) {
      if (session.picked == null && ['1', '2', '3', '4'].includes(e.key)) answer(+e.key - 1);
      else if (session.picked != null && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); session.i++; session.picked = null; render(); }
    }
  });

  const startTab = (location.hash || '').replace('#', '');
  setTab(['home', 'plan', 'kanji', 'vocab', 'prob', 'wrong'].includes(startTab) ? startTab : 'home');
})();
