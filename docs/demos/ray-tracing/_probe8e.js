/* §8 反射率剖面「采样对称性」探针。
   起因：扫描带下面那条 R 曲线，两个掠射尖峰画出来不一样高（左 80.87% / 右 92.12%）。
   这可能是两件事之一，而它们的修法完全不同：
     ① 物理不对称（左边的掠射条件真的和右边不同）
     ② 采样不对称（同一个物理现象，两个采样点离切线的距离不一样）
   本探针不改页面，只做判定。判据是：R 只依赖「第一次打中玻璃那一面的入射角余弦」，
   而入射角余弦只依赖撞击参数 b = D_G·sin|α−A_G| —— 对 ±δ 完全同值。
   所以只要把采样点取成关于 A_G 对称，两个峰就必然等高。 */

const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, 'index.html'), 'utf8');
const code = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

const START = '  var DEG = 180/Math.PI;';
const END = '  var LBL = {';
const i0 = code.lastIndexOf(START), i1 = code.indexOf(END, i0);
if (i0 < 0 || i1 < 0) { console.log('❌ 抓不到 §8 几何块'); process.exit(1); }
const body = code.slice(i0, i1);

const run = new Function(body + `
  return {trace:trace, interact:interact, fresnel:fresnel,
    EYE:{x:EYE.x,y:EYE.y}, GC:{x:GC.x,y:GC.y}, MC:{x:MC.x,y:MC.y},
    rG:R_GLASS, rM:R_METAL, A0:A0, A1:A1,
    A_G:A_G, HLF_G:HLF_G, TAN_G:{lo:TAN_G.lo, hi:TAN_G.hi},
    A_M:A_M, HLF_M:HLF_M};
`);
const P = run();

const DEG = 180 / Math.PI;
/* 某个方向「第一次打中玻璃那一面」的 Fresnel R；没碰到玻璃则为 0 */
const Rof = a => { const t = P.trace(a, 8); return t.rs.length ? t.rs[0] : 0; };

/* 断言记录器（这个探针原先只打印不断言，第 ④ 节起改为一并断言） */
const fails = [];
function ok(c, name, extra) {
  console.log('  ' + (c ? '✅' : '❌') + '  ' + name + (extra ? '  ' + extra : ''));
  if (!c) fails.push(name);
}

console.log('=== §8 反射率剖面：采样对称性判定 ===\n');
console.log('眼位 (' + P.EYE.x + ', ' + P.EYE.y + ')');
console.log('玻璃球心方向 A_G = ' + P.A_G.toFixed(4) + '°，切线半角 = ' + P.HLF_G.toFixed(4) + '°');
console.log('切线：' + P.TAN_G.lo.toFixed(4) + '°（下） / ' + P.TAN_G.hi.toFixed(4) + '°（上）\n');

/* ---------- ① 物理到底对不对称 ---------- */
console.log('--- ① 物理对称性（R 是否只依赖 |α−A_G|）---');
let maxAsym = 0, argAsym = 0;
const ideal = [];
for (let d = 0; d <= 13.2; d += 0.005) {
  const rp = Rof(P.A_G + d), rm = Rof(P.A_G - d);
  ideal.push({ d, r: rp });
  const e = Math.abs(rp - rm);
  if (e > maxAsym) { maxAsym = e; argAsym = d; }
}
console.log('  对称轴两侧 |R(+δ) − R(−δ)| 最大值 = ' + (maxAsym * 100).toFixed(6)
  + ' 个百分点（δ=' + argAsym.toFixed(3) + '°）');
console.log(maxAsym < 1e-9 ? '  ⇒ 物理严格对称。曲线画得不一样高，只能是采样的问题。\n'
  : '  ⇒ 物理本身不对称，需要看几何。\n');

/* ---------- ② 真实物理剖面长什么样（关于 A_G 对称地细采）--- */
console.log('--- ② 真实物理剖面（0.005° 对称细采，只看玻璃占位区间内）---');
console.log('   α(相对 A_G)      入射角       R');
for (const d of [0, 0.1, 0.2, 0.5, 1, 2, 5, 8, 11, 12, 12.5, 12.9, 13.0, 13.1, 13.19]) {
  const a = P.A_G + d;
  const t = P.trace(a, 8);
  /* first.obj 是球对象本身（名字在 .name、类型在 .type）；inc 已经是「度」 */
  const gl = !!(t.first && t.first.obj && t.first.obj.type === 'glass');
  console.log('   +' + d.toFixed(2).padStart(6) + '°   '
    + (gl ? t.first.inc.toFixed(2).padStart(7) + '°' : '   miss ') + '   '
    + (Rof(a) * 100).toFixed(2).padStart(6) + '%');
}

/* ---------- ③ 两种采样轴各自的峰高 ---------- */
function peakOver(axis) {
  let lo = 0, loA = 0, hi = 0, hiA = 0, near = 0, nearA = 0, nearD = Infinity;
  for (const a of axis) {
    const r = Rof(a);
    if (r <= 0) continue;
    if (a < P.A_G) { if (r > lo) { lo = r; loA = a; } }
    else { if (r > hi) { hi = r; hiA = a; } }
    const d = Math.min(Math.abs(a - P.TAN_G.lo), Math.abs(a - P.TAN_G.hi));
    if (d < nearD) { nearD = d; nearA = a; near = r; }
  }
  return { lo, loA, hi, hiA, near, nearA, nearD };
}
const uniformAxis = [];
for (let a = P.A0; a <= P.A1 + 1e-9; a += 0.01) uniformAxis.push(a);
/* 关于 A_G 对称的采样轴：k 的范围必须随步长放大，否则粗步长够得到切线、细步长够不到 */
const symAxis = step => {
  const N = Math.ceil(Math.max(P.A_G - P.A0, P.A1 - P.A_G) / step);
  const o = [];
  for (let k = -N; k <= N; k++) { const a = P.A_G + k * step; if (a >= P.A0 && a <= P.A1) o.push(a); }
  return o;
};

function report(name, axis, tag) {
  const pk = peakOver(axis);
  const gapL = Math.abs(pk.loA - P.TAN_G.lo), gapH = Math.abs(pk.hiA - P.TAN_G.hi);
  console.log('  ' + name.padEnd(30)
    + ' 左峰 ' + (pk.lo * 100).toFixed(2).padStart(6) + '% @ ' + pk.loA.toFixed(2).padStart(7) + '°'
    + '   右峰 ' + (pk.hi * 100).toFixed(2).padStart(6) + '% @ ' + pk.hiA.toFixed(2).padStart(7) + '°'
    + '   |差| ' + (Math.abs(pk.lo - pk.hi) * 100).toFixed(2) + ' pp'
    + '   点数 ' + String(axis.length).padStart(6)
    + (tag || ''));
  return { pk, gapL, gapH };
}

console.log('\n--- ③ 不同采样轴下，两个掠射峰各有多高 ---');
console.log('  （左峰 = 下切线 ' + P.TAN_G.lo.toFixed(4) + '° 附近，右峰 = 上切线 '
  + P.TAN_G.hi.toFixed(4) + '° 附近）');
const A = report('现值：从 A0 起均匀 0.01°', uniformAxis, '   ← 页面现在的做法');
const B = report('对称：以 A_G 为心 0.01°', symAxis(0.01));
const C = report('对称：以 A_G 为心 0.005°', symAxis(0.005));
const D = report('对称：以 A_G 为心 0.001°', symAxis(0.001));
/* 网格点到各自切线的距离 —— 这正是两个峰不等高的直接原因 */
console.log('\n  采样点离切线的距离（越小采到的峰越高）：');
console.log('    均匀 0.01°：下 ' + A.gapL.toFixed(4) + '°，上 ' + A.gapH.toFixed(4) + '°');
console.log('    对称 0.01°：下 ' + B.gapL.toFixed(4) + '°，上 ' + B.gapH.toFixed(4) + '°');

/* ---------- ④ 页面自己那份 RPROF / RPROF_DRAW 是否满足同样的对称性 ----------
   上面 ①②③ 用几何常量独立复算了一遍物理；这一节换一支枪：
   把页面里真正的 buildProf / RPROF_DRAW 代码原样摘出来执行，检查它产出的数据。
   两者必须一致 —— 独立复算说「物理对称」，页面数据说「画出来的两峰等高」，缺一不可：
   光有前者只能证明「物理是对的」，证明不了「页面画对了」。 */
const B2_START = '  var RSTEP = 0.01;';
const B2_END = '  /* 每一类结局占掉的方向比例';
const j0 = code.indexOf(B2_START), j1 = code.indexOf(B2_END, j0);
if (j0 < 0 || j1 < 0) { console.log('❌ 抓不到 §8 剖面采样块'); process.exit(1); }
const run2 = new Function(body + code.slice(j0, j1) + `
  return {RPROF:RPROF, RPROF_DRAW:RPROF_DRAW, K_TAN:K_TAN, RSTEP:RSTEP,
          A_G:A_G, HLF_G:HLF_G, TL:TAN_G.lo, TH:TAN_G.hi};
`);
const Q = run2();

console.log('--- ④ 页面自身的剖面数据 ---');
console.log('   RPROF ' + Q.RPROF.length + ' 点（步长 ' + Q.RSTEP + '°，以 A_G=' + Q.A_G.toFixed(4) + '° 为心）'
  + '，抽样折线 ' + Q.RPROF_DRAW.length + ' 点；切线落在第 ±' + Q.K_TAN + ' 个采样点');
/* 采样轴是否真的以 A_G 为心：k 与 (a−A_G)/step 必须逐一相符 */
let axisOK = true, axisMsg = '';
for (const p of Q.RPROF) {
  if (Math.abs(Math.round((p.a - Q.A_G) / Q.RSTEP) - p.k) > 1e-9) {
    axisOK = false; axisMsg = 'α=' + p.a + ' 的 k=' + p.k + ' 与 (α−A_G)/step 不符'; break;
  }
}
ok(axisOK, '④a 采样点的 k 就是以球心方向 A_G 为原点数的（栅格以 A_G 为心）', axisMsg);
/* 独立复算的峰值角与页面 k=±K_TAN 对应的角必须一致 */
const kAngLo = Q.A_G - Q.K_TAN * Q.RSTEP, kAngHi = Q.A_G + Q.K_TAN * Q.RSTEP;
ok(Math.abs(kAngLo - Q.TL) < 0.01 && Math.abs(kAngHi - Q.TH) < 0.01,
  '④b 第 ±K_TAN 个采样点正落在两条切线角上（误差 < 0.01°）',
  kAngLo.toFixed(4) + ' / ' + kAngHi.toFixed(4) + ' vs 切线 ' + Q.TL.toFixed(4) + ' / ' + Q.TH.toFixed(4));

const sideMax = (pts, left) => pts.reduce((m, p) => {
  const s = left ? (p.a < Q.A_G) : (p.a >= Q.A_G);
  return (s && p.r > m.r) ? p : m;
}, { r: 0, a: 0 });
const fullL = sideMax(Q.RPROF, true), fullR = sideMax(Q.RPROF, false);
const drawL = sideMax(Q.RPROF_DRAW, true), drawR = sideMax(Q.RPROF_DRAW, false);
console.log('   全量 RPROF：左峰 ' + (fullL.r * 100).toFixed(4) + '% @ ' + fullL.a.toFixed(3)
  + '° / 右峰 ' + (fullR.r * 100).toFixed(4) + '% @ ' + fullR.a.toFixed(3) + '°');
console.log('   抽样折线：左峰 ' + (drawL.r * 100).toFixed(4) + '% @ ' + drawL.a.toFixed(3)
  + '° / 右峰 ' + (drawR.r * 100).toFixed(4) + '% @ ' + drawR.a.toFixed(3) + '°');
ok(Math.abs(fullL.r - fullR.r) < 1e-12, '④c 页面的 RPROF 两侧峰值相等（采样轴对称）',
  (fullL.r * 100).toFixed(4) + '% = ' + (fullR.r * 100).toFixed(4) + '%');
ok(Math.abs(drawL.r - drawR.r) < 1e-12, '④d 真正画出来的折线两侧峰值也相等（抽稀没有破坏对称）',
  (drawL.r * 100).toFixed(4) + '% = ' + (drawR.r * 100).toFixed(4) + '%');
ok(Math.abs(drawL.r - fullL.r) < 1e-12 && Math.abs(drawR.r - fullR.r) < 1e-12,
  '④e 抽样折线保留了全量采样的峰值（两个掠射峰那一点没被抽掉）');
/* 绘制折线必须按 |k| 选点：k 与 −k 的取舍必须一致，否则「左峰留下、右峰被抽掉」 */
const kSet = new Set(Q.RPROF_DRAW.map(p => p.k));
let headTail = true;
for (const k of kSet) if (k !== 0 && !kSet.has(-k) && Math.abs(k) <= Q.K_TAN) { headTail = false; break; }
ok(headTail, '④f 折线选点在切线邻域内对 ±k 成对出现（没有留下一边、抽掉另一边）');

/* ---------- ⑤ 结论 ---------- */
const okPhys = maxAsym < 1e-9;
const okSym = Math.abs(B.pk.lo - B.pk.hi) < 1e-9 && Math.abs(C.pk.lo - C.pk.hi) < 1e-9;
const okPage = axisOK && Math.abs(fullL.r - fullR.r) < 1e-12
  && Math.abs(drawL.r - drawR.r) < 1e-12;
console.log('\n----------------------------------------');
console.log((okPhys ? '✅' : '❌') + ' 物理关于 A_G 严格对称（峰值不等高与物理无关）');
console.log((Math.abs(A.pk.lo - A.pk.hi) > 0.01 ? '❗' : '✅')
  + ' 「从 A0 起均匀采样」这一做法的两峰差 ' + (Math.abs(A.pk.lo - A.pk.hi) * 100).toFixed(2)
  + ' 个百分点（页面的现值已不是这种做法）');
console.log((okSym ? '✅' : '❌') + ' 以 A_G 为心的对称采样轴 ⇒ 两峰严格等高');
console.log((okPage ? '✅' : '❌') + ' 页面自身的 RPROF / 折线数据两侧峰值相等，且峰值点被保留');
if (fails.length) console.log('  未通过：' + fails.join(' / '));
process.exit(okPhys && okSym && okPage && fails.length === 0 ? 0 : 1);
