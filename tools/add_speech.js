// 음성(TTS)용 텍스트를 미리 만들어 data 에 넣는다.
// 원칙: 브라우저 음성은 한자를 스스로 읽으므로 잘못 읽을 수 있다.
//  - 형태소 분석기(kuromoji)로 읽어 본 결과가 교재의 읽기(후리가나)와 같으면 → 한자 그대로(억양이 자연스러움)
//  - 다르거나 확인할 수 없으면 → 교재의 히라가나로 바꿔서 읽힌다(발음 정확성 우선)
const path = require('path');
const kuromoji = require('kuromoji');
const k2h = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const isK = c => /[一-鿿々]/.test(c);
const FURI = /\{([^|{}]+)\|([^|{}]+)\}/g;
const BLANK = /[（(]\s*[　 ]*\s*[)）]/;

module.exports = function addSpeech(out, done) {
  kuromoji.builder({ dicPath: path.join(path.dirname(require.resolve('kuromoji')), '..', 'dict') }).build((err, tk) => {
    if (err) throw err;
    const reading = s => k2h(tk.tokenize(s).map(t => t.reading || t.surface_form).join(''));
    const report = { word: [], furi: [] };

    // 단어: 분석 결과가 교재 읽기와 같으면 한자로, 아니면 히라가나로
    function spWord(w, r) {
      if (![...w].some(isK)) return r;
      const rr = reading(w.replace(/\s/g, ''));
      if (rr === r.replace(/\s/g, '')) return w;
      report.word.push(`${w} (교재 ${r} / 기계 ${rr})`);
      return r;
    }
    // 문장: {漢字|かな} 구간마다 검사해서 필요한 곳만 히라가나로 바꾼다
    function spSent(s, tag) {
      s = String(s);
      const spans = []; let plain = '', last = 0;
      s.replace(FURI, (all, a, b, off) => {
        plain += s.slice(last, off); spans.push({ st: plain.length, en: plain.length + a.length, a, b }); plain += a; last = off + all.length; return all;
      });
      plain += s.slice(last);
      if (!spans.length) return plain;
      const toks = []; let c = 0; tk.tokenize(plain).forEach(t => { toks.push({ st: c, en: c + t.surface_form.length, t }); c += t.surface_form.length; });
      const useKana = new Set();
      spans.forEach((sp, i) => {
        const cov = toks.filter(x => x.en > sp.st && x.st < sp.en);
        if (!cov.length) { useKana.add(i); return; }
        const st = cov[0].st, en = cov[cov.length - 1].en;
        // 덮는 토큰 전체의 '기대 읽기'를 만든다
        let exp = '', ok = true;
        for (let p = st; p < en;) {
          const j = spans.findIndex(x => x.st === p);
          if (j >= 0) { exp += spans[j].b; p = spans[j].en; continue; }
          const ch = plain[p];
          if (isK(ch)) { ok = false; break; }
          exp += k2h(ch); p++;
        }
        const got = k2h(cov.map(x => x.t.reading || x.t.surface_form).join(''));
        if (!ok || exp.replace(/\s/g, '') !== got.replace(/\s/g, '')) { useKana.add(i); if (ok) report.furi.push(`${tag}: ${sp.a}=${sp.b} (기계 읽기 ${got})`); }
      });
      let o = '', pos = 0; let k = 0;
      s.replace(FURI, (all, a, b, off) => { o += s.slice(pos, off); o += useKana.has(k) ? b : a; k++; pos = off + all.length; return all; });
      return o + s.slice(pos);
    }
    function replaceTarget(s, u, rep) {
      if (s.includes(u)) return s.replace(u, rep);
      const esc = ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp([...u].map(ch => `(?:\\{${esc(ch)}\\|[^|{}]+\\}|${esc(ch)})`).join(''));
      return s.replace(re, rep);
    }

    out.VOCAB.forEach(v => { const s = spWord(v.w, v.r); if (s !== v.r) v.s = s; else if (v.s) delete v.s; });
    out.PROBS.forEach(p => p.qs.forEach((q, qi) => {
      const tag = `${p.title} ${qi + 1}번`;
      const ans = q.o[q.a][0];
      if (p.type === 'syn') { q.sb = spSent(q.s, tag); q.sa = ans; }
      else if (p.type === 'use') { q.sa = ans; }
      else if (p.type === 'read') { q.sa = spSent(replaceTarget(q.s, q.u, '{' + plainOf(q.u) + '|' + ans + '}'), tag); }
      else if (p.type === 'write') { q.sb = spSent(q.s, tag); q.sa = q.sb; }
      else if (p.type === 'ctx') { q.sa = spSent(q.s.replace(BLANK, ans), tag); }
    }));
    function plainOf(u) { return String(u).replace(FURI, '$1'); }
    done(report);
  });
};
