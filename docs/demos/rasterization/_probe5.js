/* §5 水密性的独立取证脚本。
   ------------------------------------------------------------------
   刻意**不读**页面自己的 stat.zero/one/two —— 那是被检验的对象。
   这里只用最原始的出口（GROUPS + makeFB + rasterTri）从头算一遍覆盖计数，
   再把共享边附近的像素打成 ASCII 位图。
   两边数字对得上，才说明页面上的「水密 ✅」不是自说自话。 */
const { load } = require('./_stub.js');
const S = load();

if (S.topError) { console.log('❌ 顶层执行失败: ' + S.topError.message); process.exit(1); }
const R = S.window.__rast, F = R.sections.fill;
if (!F) { console.log('❌ fill 模块缺失'); process.exit(1); }

const W = F.W, H = F.H;
const NOCOL = function () { return [0, 0, 0]; };

/* 从头算一遍：给定 rule，返回每像素的覆盖次数与并集归属 */
function coverage(rule) {
  const fb = R.makeFB(W, H);
  R.fbClear(fb, 0, 0, 0, false);
  for (const g of F.GROUPS) for (const tri of g) {
    const v = [0, 1, 2].map(i => ({ x: tri[i][0], y: tri[i][1], z: 0.5, w: 1,
                                    u: 0, nx: 0, ny: 0, nz: 1, r: 0, g: 0, b: 0 }));
    R.rasterTri(fb, v[0], v[1], v[2], { mode: 'bbox', rule: rule, ztest: false, shade: NOCOL });
  }
  return fb.cover;
}
function tally(cover, uni) {
  let zero = 0, one = 0, two = 0, more = 0;
  for (let i = 0; i < W * H; i++) {
    if (uni[i] === 0) continue;             /* 不在并集内，不计入 */
    if (cover[i] === 0) zero++;
    else if (cover[i] === 1) one++;
    else if (cover[i] === 2) two++;
    else more++;
  }
  return { zero, one, two, more };
}

const uniCover = coverage('all');           /* 并集：边界一律接受 → 真值 */
console.log('=== 独立重算：三种边界规则的总账（并集内像素）===');
console.log('rule     0次(缝)  1次(正常)  2次(重复)  >2次   页面自报        判定');
const mine = {};
for (const rule of ['tl', 'all', 'none']) {
  const cov = coverage(rule);
  const t = tally(cov, uniCover);
  mine[rule] = t;
  F.setRule(rule);
  const ps = F.stat();
  const agree = (ps.zero === t.zero && ps.one === t.one && ps.two === t.two);
  const verdict = (t.zero === 0 && t.two === 0 && t.more === 0) ? '水密 ✅' : '有缺陷 ❌';
  console.log(rule.padEnd(8) + String(t.zero).padStart(7) + String(t.one).padStart(11) +
              String(t.two).padStart(11) + String(t.more).padStart(7) + '   ' +
              (ps.zero + '/' + ps.one + '/' + ps.two).padEnd(14) +
              (agree ? '' : '⚠️ 两处不一致 ') + verdict);
}

/* 关键洞见：裂缝像素集与重复像素集应当**恰好是同一批像素**。
   对角边 y = x 穿过像素中心 (i+0.5,i+0.5)，那些像素就是边界像素；
   tl 把它们判给恰好一方（1 次），all 判给两方（2 次），none 谁都不判（0 次）。 */
const cTL = coverage('tl'), cAll = coverage('all'), cNone = coverage('none');
const crack = [], dup = [];
for (let i = 0; i < W * H; i++) {
  if (cNone[i] === 0 && uniCover[i] > 0) crack.push(i);
  if (cAll[i] >= 2) dup.push(i);
}
console.log('\n=== 裂缝集与重复集的关系 ===');
console.log('  全弃产生的裂缝像素 : ' + crack.length);
console.log('  全收产生的重复像素 : ' + dup.length);
const same = crack.length === dup.length && crack.every((v, i) => v === dup[i]);
console.log('  两个集合完全相同   : ' + (same ? '是 ✅（都是那条共享边穿过的边界像素）' : '否 ❌'));
console.log('  top-left 下这些像素的覆盖次数: ' +
  [...new Set(crack.map(i => cTL[i]))].join(','));

/* 共享边是否真的落在像素中心上？把判据算出来而不是「看着像」。
   注意两组各贡献一批边界像素：G1 的对角边 16 个 + G2 的水平边 16 个 = 32。
   只算 G1 会得到 16，只在整个栅格上找 i==j 会得到 40 —— 两个都错，
   因为后者把三角形范围之外的像素也算进去了。 */
console.log('\n=== 边界像素为什么正好在这一批 ===');
let onLineTotal = 0;
F.GROUPS.forEach(function (g, gi) {
  const t0 = g[0], t1 = g[1];
  const key = p => p[0] + ',' + p[1];
  const setA = new Set(t0.map(key));
  const shared = t1.filter(p => setA.has(key(p)));
  console.log('  第 ' + (gi + 1) + ' 组：三角 A = ' + JSON.stringify(t0));
  console.log('           三角 B = ' + JSON.stringify(t1));
  if (shared.length !== 2) { console.log('    ❌ 共享边端点不是 2 个：' + JSON.stringify(shared)); return; }
  const [p, q] = shared;
  console.log('           共享边 = ' + JSON.stringify(p) + ' → ' + JSON.stringify(q));
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const len = Math.hypot(dx, dy);
  /* 像素中心 (i+0.5, j+0.5)：到直线的距离为 0，且投影落在线段内 */
  let n = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const cx = i + 0.5, cy = j + 0.5;
    const d = Math.abs(dy * (cx - p[0]) - dx * (cy - p[1])) / len;
    if (d > 1e-9) continue;
    const t = ((cx - p[0]) * dx + (cy - p[1]) * dy) / (len * len);
    if (t >= 0 && t <= 1) n++;
  }
  console.log('           恰好穿过像素中心的个数 = ' + n);
  onLineTotal += n;
});
console.log('  两组合计 = ' + onLineTotal +
            (onLineTotal === crack.length ? '  ✅ 与裂缝/重复像素数一致' : '  ❌ 与 ' + crack.length + ' 不一致'));

/* 同一批像素在三种规则下的三态：0 / 1 / 2 —— 这就是本节的全部内容 */
console.log('\n=== 那 ' + crack.length + ' 个边界像素在三种规则下的覆盖次数 ===');
const hist = r => { const h = {}; crack.forEach(i => { h[r[i]] = (h[r[i]] || 0) + 1; }); return h; };
console.log('  边界全弃 (none): ' + JSON.stringify(hist(cNone)));
console.log('  top-left  (tl) : ' + JSON.stringify(hist(cTL)));
console.log('  边界全收 (all) : ' + JSON.stringify(hist(cAll)));

/* ASCII 位图：直接把数字打出来 */
const cTL2 = coverage('tl');
function dumpGrid(title, x0, x1, y0, y1) {
  console.log('\n=== ' + title + ' ===');
  console.log('        ' + Array.from({ length: x1 - x0 + 1 }, (_, k) => String(x0 + k).padStart(3)).join(''));
  for (let j = y0; j <= y1; j++) {
    let row = 'py=' + String(j).padStart(4) + '  ';
    for (let i = x0; i <= x1; i++) {
      const c = cTL2[j * W + i];
      row += (c === 0 ? ' ·' : String(c).padStart(3)) ;
    }
    console.log(row);
  }
  console.log('  （· = 未被任何三角形覆盖；数字 = 覆盖次数）');
}
dumpGrid('G1 对角共享边 y = x · top-left 规则', 8, 16, 8, 16);
dumpGrid('G2 水平共享边 y = 40.5 · top-left 规则', 4, 20, 38, 43);

/* 同样的两组，换成「边界全弃」看裂缝 */
const cN = coverage('none');
console.log('\n=== 同一区域，边界全弃（none）⇒ 裂缝 ===');
for (let j = 8; j <= 16; j++) {
  let row = 'py=' + String(j).padStart(4) + '  ';
  for (let i = 8; i <= 16; i++) row += (cN[j * W + i] === 0 ? ' ✗' : String(cN[j * W + i]).padStart(3));
  console.log(row);
}
console.log('  （✗ = 裂缝，本该属于并集却没有任何三角形认领）');
