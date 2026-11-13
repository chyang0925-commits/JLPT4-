const fs = require('fs'), path = require('path'), kuromoji = require('kuromoji');
const { conj, FORMS } = require('./conj');
const k2h = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const rows = fs.readFileSync(__dirname + '/verbs.txt', 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('|'));
kuromoji.builder({ dicPath: path.join(path.dirname(require.resolve('kuromoji')), '..', 'dict') }).build((e, tk) => {
  const seen = new Set(); let nG = 0, nR = 0, nF = 0;
  rows.forEach(([w, r, m, g, tr, lv, fl]) => {
    const id = w + '|' + r; if (seen.has(id)) console.log('DUP', id); seen.add(id);
    if (!['1', '2', '3'].includes(g) || !['자', '타'].includes(tr) || !['N5', 'N4', 'N3'].includes(lv)) console.log('BAD ROW', id, g, tr, lv);
    const t = tk.tokenize(w); const last = t[t.length - 1];
    const kg = /五段/.test(last.conjugated_type) ? 1 : /一段/.test(last.conjugated_type) ? 2 : /サ変|カ変/.test(last.conjugated_type) ? 3 : 0;
    if (kg !== +g) { nG++; console.log('GROUP?', id, '내', g, '분석', last.conjugated_type); }
    const kr = k2h(t.map(x => x.reading || x.surface_form).join(''));
    if (kr !== r) { nR++; console.log('READ?', id, '분석', kr); }
    const f = conj(w, r, +g, { nv: fl === 'nv', sp: fl === 'sp' });
    // ます·て·た·ない 표기를 다시 분석해 기본형이 사전형으로 돌아오는지 확인
    [0, 1, 2, 3].forEach(k => {
      const tt = tk.tokenize(f[k][0]); const vt = tt.find(x => x.pos === '動詞') || tt[tt.length - 1];
      const base = +g === 3 && r.endsWith('する') && r !== 'する' ? tt.filter(x => x.pos !== '動詞' && x.pos !== '助動詞' && x.pos !== '助詞').map(x => x.surface_form).join('') + 'する' : vt.basic_form;
      const rr = k2h(tt.map(x => x.reading || x.surface_form).join(''));
      if (base !== w && !(w === 'ある' && k === 3)) { nF++; console.log('FORM?', id, FORMS[k], f[k][0], '→ 기본형', base); }
      else if (rr !== f[k][1] && kr === r) { console.log('FORM-READ?', id, FORMS[k], f[k].join(' '), '분석', rr); }
    });
  });
  console.log('rows', rows.length, 'group?', nG, 'read?', nR, 'form?', nF);
  const lv = {}; rows.forEach(x => lv[x[5]] = (lv[x[5]] || 0) + 1); console.log(lv);
  // 짝 확인
  fs.readFileSync(__dirname + '/verb_pairs.txt', 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).forEach(l => { const [n, nm, a, ar, b, br] = l.split('|'); if (!seen.has(a + '|' + ar)) console.log('PAIR missing 자', a, ar); if (!seen.has(b + '|' + br)) console.log('PAIR missing 타', b, br); });
});
