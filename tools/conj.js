// 동사 활용 생성기. 표기(w)와 읽기(r)를 나란히 활용한다.
// 반환: [ます, て, た, ない, ば, 가능, 수동, 사역, 의지, 명령] 각 [표기, 읽기] 또는 null
const ROW = { う: 'わいえお', く: 'かきけこ', ぐ: 'がぎげご', す: 'さしせそ', つ: 'たちてと', ぬ: 'なにねの', ぶ: 'ばびべぼ', む: 'まみめも', る: 'らりれろ' };
const TE = { う: 'って', つ: 'って', る: 'って', む: 'んで', ぶ: 'んで', ぬ: 'んで', く: 'いて', ぐ: 'いで', す: 'して' };
const FORMS = ['ます형', 'て형', 'た형', 'ない형', 'ば형 (가정)', '가능형', '수동형', '사역형', '의지형', '명령형'];
function conj(w, r, g, flags = {}) {
  const both = (sw, sr, suf) => suf.map(x => (x == null ? null : [sw + x, sr + x]));
  let out;
  if (g === 3) {
    if (r.endsWith('する')) {
      const sw = w.slice(0, -2), sr = r.slice(0, -2);
      out = both(sw, sr, ['します', 'して', 'した', 'しない', 'すれば', 'できる', 'される', 'させる', 'しよう', 'しろ']);
    } else { // 来る
      const sw = w.slice(0, -1), pre = r.slice(0, -2);
      const kw = ['ます', 'て', 'た', 'ない', 'れば', 'られる', 'られる', 'させる', 'よう', 'い'];
      const kr = ['きます', 'きて', 'きた', 'こない', 'くれば', 'こられる', 'こられる', 'こさせる', 'こよう', 'こい'];
      const kanji = sw !== pre + 'く';
      out = kw.map((x, i) => [kanji ? sw + x : pre + kr[i], pre + kr[i]]);
    }
  } else if (g === 2) {
    const sw = w.slice(0, -1), sr = r.slice(0, -1);
    out = both(sw, sr, ['ます', 'て', 'た', 'ない', 'れば', 'られる', 'られる', 'させる', 'よう', w === 'くれる' ? '' : 'ろ']);
  } else {
    const e = r.slice(-1), sw = w.slice(0, -1), sr = r.slice(0, -1); const [a, i, ee, o] = ROW[e];
    const te = (r === 'いく' || r.endsWith('ていく') || w === '行く') ? 'って' : TE[e];
    const ta = te.replace(/て$/, 'た').replace(/で$/, 'だ');
    out = both(sw, sr, [(flags.sp ? 'い' : i) + 'ます', te, ta, a + 'ない', ee + 'ば', ee + 'る', a + 'れる', a + 'せる', o + 'う', flags.sp ? 'い' : ee]);
    if (r === 'ある') out[3] = ['ない', 'ない'];
  }
  if (flags.nv) [5, 6, 7, 8, 9].forEach(k => { out[k] = null; });
  if (flags.sp) [5, 6, 7, 8].forEach(k => { out[k] = null; });
  return out;
}
module.exports = { conj, FORMS };
