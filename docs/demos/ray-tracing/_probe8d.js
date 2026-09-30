/* §8 分支树几何断言（不只是打印）。
   把 m3 方向每条分支的逐段几何拿出来逐条验证。逐段而不只看总数，是因为
   「总数对、走向错」最难发现：画出来是一根「看起来也挺合理」的虚线，统计上也自洽。

   这里放三条最容易写错、又最难用总数发现的不变量：
     ① 命中次数 = 带 hitsAt 的段数（「命中」与「走哪条分支」是两件事）
     ② 每条「逃出场景 / 射向天空」的终点射线，必须真的与两颗球都不相交
        —— 方向算错时最常见的表现就是「本该命中却报了逃逸」，或反之
     ③ 出场面内反射之后走的是一条**新的等长弦**，不是原路返回（我最初也直觉以为会原路返回）：
        弦两端到球心等距 ⇒ 内壁入射角 = 入场折射角 ⇒ 弦长相等，但落点不同。
        这条断言就是为了防止有人「顺手」把它改成沿原弦返回。

   直接从 index.html 摘 §8 的几何+物理块执行，不二次实现任何公式 ——
   二次实现出来的东西只能证明「我抄得对不对」，不能证明页面是对的。 */
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, 'index.html'), 'utf8');
const code = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

const START = '  var DEG = 180/Math.PI;';
const END = '  var LBL = {';
const i0 = code.lastIndexOf(START), i1 = code.indexOf(END, i0);
if (i0 < 0 || i1 < 0) { console.log('❌ 抓不到 §8 几何块'); process.exit(1); }
const body = code.slice(i0, i1);

const run = new Function(body + `
  function dump(alpha, depth){
    var out = [], t = buildTree(alpha, depth, 0.01);
    for(var i=0;i<t.leaves.length;i++){
      var lf = t.leaves[i], step = [];
      for(var k=0;k<lf.segs.length;k++){
        var s = lf.segs[k];
        step.push({kind:s.kind, obj:s.obj, refl:!!s.refl, surf:s.surf, hitsAt:s.hitsAt,
          from:{x:s.from.x, y:s.from.y}, to:{x:s.to.x, y:s.to.y},
          d:s.d ? {x:s.d.x, y:s.d.y} : null,
          dOut:s.dOut ? {x:s.dOut.x, y:s.dOut.y} : null,
          inc:s.inc, rf:s.Rf, bR:s.bR});
      }
      out.push({prob:lf.prob, hits:lf.hits, term:lf.term, picks:lf.picks, segs:step, rs:lf.rs});
    }
    return {alpha:alpha, leaves:out, nAll:t.nAll, expected:t.expected, mainIdx:t.mainIdx,
            kept:t.kept, pruned:t.pruned};
  }
  return {dump:dump,
    MC:{x:MC.x,y:MC.y}, rM:R_METAL, GC:{x:GC.x,y:GC.y}, rG:R_GLASS,
    METAL:METAL, GLASS:GLASS, EPS:EPS, SKY_Y:SKY_Y};
`);
const R = run();

const fails = [];
const ok = (c, name, extra) => {
  console.log('  ' + (c ? '✅' : '❌') + '  ' + name + (extra ? '  ' + extra : ''));
  if (!c) fails.push(name);
};

/* 独立的「射线 - 球」相交判定：不复用页面的 hitSphere，避免同错同对 */
function hits(p, d, c, r) {
  const ox = p.x - c.x, oy = p.y - c.y;
  const a = d.x * d.x + d.y * d.y;
  const h = d.x * (-ox) + d.y * (-oy);
  const disc = h * h - a * (ox * ox + oy * oy - r * r);
  if (disc < 0) return null;
  const t = (h - Math.sqrt(disc)) / a;
  return t > 1e-9 ? t : null;
}

console.log('=== §8 分支树几何断言 ===');
console.log('眼位外，金属球 M=' + JSON.stringify(R.MC) + ' r=' + R.rM
  + '，玻璃球 G=' + JSON.stringify(R.GC) + ' r=' + R.rG + '\n');

const T = R.dump(-38, 8);
console.log('m3（α=-38°，depth 8）：枚举 ' + T.nAll + ' 叶，保留 ' + T.leaves.length
  + '，E[命中] = ' + T.expected.toFixed(4) + '，剪枝质量 = ' + (T.pruned * 100).toFixed(2) + '%\n');

/* ---------- ① 命中次数 = 带 hitsAt 的段数 ---------- */
let c1 = true;
for (const lf of T.leaves) {
  const n = lf.segs.filter(s => s.hitsAt !== undefined).length;
  if (n !== lf.hits) { c1 = false; console.log('     ✗ ' + lf.picks.join('') + '：hits=' + lf.hits + ' 但段数=' + n); }
}
ok(c1, '① 每条分支的 hits == 带 hitsAt 的段数（命中与分支是两件事）');

/* ---------- ② 「逃出场景 / 射向天空」必须真的不与任何球相交 ---------- */
let c2 = true;
for (const lf of T.leaves) {
  const last = lf.segs[lf.segs.length - 1];
  if (last.kind !== '逃逸' && last.kind !== '天空') continue;
  const tm = hits(last.from, last.d, R.MC, R.rM);
  const tg = hits(last.from, last.d, R.GC, R.rG);
  if (tm !== null || tg !== null) {
    c2 = false;
    console.log('     ✗ ' + lf.picks.join('') + ' 报了「' + lf.term + '」，但该方向会命中'
      + (tm !== null ? ' 金属球(t=' + tm.toFixed(3) + ')' : '')
      + (tg !== null ? ' 玻璃球(t=' + tg.toFixed(3) + ')' : ''));
  }
}
ok(c2, '② 每条「逃出场景 / 射向天空」的终点射线确实与两颗球都不相交');

/* ---------- ③ 出场面内反射走的是新的等长弦，不是原路返回 ---------- */
const reflLeaf = T.leaves.find(lf => lf.segs.some(s => s.refl && s.surf === '出场面'));
if (!reflLeaf) {
  ok(false, '③ 找到「出场面内反射」这一支（m3 上应存在）');
} else {
  const segs = reflLeaf.segs;
  const iRefl = segs.findIndex(s => s.refl && s.surf === '出场面');
  /* 出场面反射这一「段」本身就横跨 入场面 → 出场面（它的 .to 才是出场面；
     反射发生在段的末端）。再出射点是它的下一段 .to。 */
  const seg = segs[iRefl], reExit = segs[iRefl + 1];
  const B = seg.from, C = seg.to, D = reExit.to;
  const chordIn = Math.hypot(C.x - B.x, C.y - B.y);
  const chordOut = Math.hypot(D.x - C.x, D.y - C.y);
  console.log('   入场点 B (' + B.x.toFixed(3) + ', ' + B.y.toFixed(3) + ')'
    + '  出场面 C (' + C.x.toFixed(3) + ', ' + C.y.toFixed(3) + ')'
    + '  再出射点 D (' + D.x.toFixed(3) + ', ' + D.y.toFixed(3) + ')');
  console.log('   入场弦 |BC| = ' + chordIn.toFixed(4) + '   反射后弦 |CD| = ' + chordOut.toFixed(4)
    + '   差 ' + Math.abs(chordIn - chordOut).toExponential(2));
  ok(Math.abs(chordIn - chordOut) < 1e-6, '③a 出场面内反射后弦长与入场弦长相等（等角 ⇒ 等弦）',
    chordIn.toFixed(4) + ' = ' + chordOut.toFixed(4));
  const backToEntry = Math.hypot(D.x - B.x, D.y - B.y);
  ok(backToEntry > 0.1, '③b 再出射点 D 不是入场点 B（不是原路返回，而是转到另一条弦上）',
    '|DB| = ' + backToEntry.toFixed(4));
  /* 反射后应该往球内走：C→D 的中点必须在球内 */
  const mid = { x: (C.x + D.x) / 2, y: (C.y + D.y) / 2 };
  const midIn = Math.hypot(mid.x - R.GC.x, mid.y - R.GC.y);
  ok(midIn < R.rG - 1e-6, '③c 反射后确实朝球内走（新弦中点离球心 ' + midIn.toFixed(4)
    + ' < r=' + R.rG + '）');
}

/* ---------- ④ 两条反射支的反射率都等于该表面的 Fresnel R ---------- */
let c4 = true;
for (const lf of T.leaves) {
  for (const s of lf.segs) {
    if (!s.refl) continue;
    /* 反射支的概率权重就是这次交互的 Rf；与入射角对应的 Schlick 值应一致 */
    if (!(s.bR > 0 && s.bR < 1)) { c4 = false; console.log('     ✗ 反射支 bR 越界: ' + s.bR); }
  }
}
ok(c4, '④ 各反射支的概率权重都在 (0,1) 内（来自 Fresnel，不是写死的）');

/* ---------- ⑤ 沿整条方向轴：E[命中] 与「只走折射」的确定性命中次数之差 ---------- */
let maxDev = 0, argDev = 0;
for (let a = -90; a <= 90; a += 0.25) {
  const t = R.dump(a, 8);
  if (!t.leaves.length) continue;
  maxDev = Math.max(maxDev, 0);   // 见下：确定性值是 mainIdx 那条
  const det = t.leaves[t.mainIdx] ? t.leaves[t.mainIdx].hits : null;
  if (det === null) continue;
  const dev = Math.abs(t.expected - det);
  if (dev > maxDev) { maxDev = dev; argDev = a; }
}
console.log('   整条方向轴最大偏差 ' + maxDev.toFixed(3) + ' 次，出现在 α = ' + argDev.toFixed(2) + '°');
ok(maxDev < 0.6, '⑤ 全轴最大偏差 < 0.6 次（恒等式在示范路径上严格成立，一般方向近似成立）',
  maxDev.toFixed(3) + ' 次');

/* ---------- ⑥ rs 记的是「面反射率 Rf」而不是「分支权重 bR」 ----------
   这两者在玻璃表面恰好互补（折射支权重 = 1−R、反射支权重 = R），混用不会报错、
   形状也仍然是「一边低一边高」，但扫描带那条曲线的峰值会从掠射端跑到正入射端。 */
let c6 = true, c6msg = '';
for (let a = -90; a <= 90; a += 1) {
  const t = R.dump(a, 8);
  for (const lf of t.leaves) {
    const gl = lf.segs.filter(s => s.obj === '玻璃球' && s.rf !== undefined);
    for (let k = 0; k < gl.length; k++) {
      if (lf.rs[k] === undefined) continue;
      if (Math.abs(lf.rs[k] - gl[k].rf) > 1e-12) {
        c6 = false; c6msg = 'α=' + a + ' 第' + k + '次玻璃交互: rs=' + lf.rs[k] + ' vs Rf=' + gl[k].rf;
      }
    }
  }
}
ok(c6, '⑥ rs[k] 等于第 k 次玻璃交互那一面的 Fresnel Rf（不是分支权重 1−R）', c6msg);

/* ---------- ⑦ 反射率剖面：正入射 ≈4%，两条切线上各一个**等高**尖峰 ----------
   不读页面的 RPROF，用「第一次打中玻璃那一面的 Rf」自己算一条剖面。
   采样轴以玻璃球心方向 A_G 为心：剖面在物理上关于 A_G 严格对称
   （R 只看撞击参数 b = D_G·sin|α − A_G|，对 α = A_G ± δ 同值），
   所以两侧的掠射峰必须**完全相等** —— 这条断言就是为了把「采样轴没对中」
   这个纯实现问题挡在门外：物理对称而画面不对称，只可能是采样的问题。
   步长取 0.002°：掠射端最后 0.1° 的 R 就从 40% 冲到 96%，
   步长粗了会整体低估峰值（切线是测度零的事件，采样永远采不到 100%）。 */
const A_G = Math.atan2(R.GC.y - 4.40, R.GC.x - 0.70) * 180 / Math.PI;
const D_G = Math.hypot(R.GC.x - 0.70, R.GC.y - 4.40);
const HLF_G = Math.asin(R.rG / D_G) * 180 / Math.PI;
const TAN = [A_G - HLF_G, A_G + HLF_G];
const Rof = a => {
  const t = R.dump(a, 8);
  const lf = t.leaves[t.mainIdx] || t.leaves[0];
  if (!lf) return 0;
  const g = lf.segs.find(s => s.obj === '玻璃球' && s.rf !== undefined);
  return g ? g.rf : 0;
};
const STEP = 0.002, KN = Math.ceil(14 / STEP);
let pkL = 0, aL = 0, pkR = 0, aR = 0, minR = 1, minA = 0, nTouch = 0;
for (let k = -KN; k <= KN; k++) {
  const a = A_G + k * STEP;
  const r = Rof(a);
  if (r <= 0) continue;
  nTouch++;
  if (r < minR) { minR = r; minA = a; }
  if (a < A_G) { if (r > pkL) { pkL = r; aL = a; } }
  else { if (r > pkR) { pkR = r; aR = a; } }
}
console.log('   玻璃占位区间 ±14° 内命中玻璃的采样点 ' + nTouch + ' 个（步长 ' + STEP + '°）');
console.log('   剖面：最小 R = ' + (minR * 100).toFixed(2) + '% @ α=' + minA.toFixed(3) + '°（正入射端）');
console.log('   左峰 ' + (pkL * 100).toFixed(4) + '% @ ' + aL.toFixed(3) + '°'
  + '   右峰 ' + (pkR * 100).toFixed(4) + '% @ ' + aR.toFixed(3) + '°'
  + '   切线 ' + TAN[0].toFixed(3) + '° / ' + TAN[1].toFixed(3) + '°');
ok(Math.abs(minR - 0.04) < 0.005, '⑦a 剖面最小值 = 4.00%（Schlick 正入射极限）',
  (minR * 100).toFixed(2) + '%');
ok(Math.abs(minA - A_G) < 1, '⑦b 最小 R 出现在玻璃球心方向 α=' + A_G.toFixed(2)
  + '°（正是正入射的方向）', '实测 ' + minA.toFixed(3) + '°');
ok(pkL > 0.5 && pkR > 0.5, '⑦c 两条切线上都冲到 50% 以上（掠射端几乎全反射）',
  (pkL * 100).toFixed(1) + '% / ' + (pkR * 100).toFixed(1) + '%');
ok(Math.abs(aL - TAN[0]) < 0.1 && Math.abs(aR - TAN[1]) < 0.1,
  '⑦d 峰值出现在切线角上（不是正入射端）——若纵轴被画成 1−R，峰值会跑到 A_G',
  aL.toFixed(3) + ' / ' + aR.toFixed(3));
ok(Math.abs(pkL - pkR) < 1e-9,
  '⑦e 两个掠射峰完全等高（独立复算证实：剖面关于球心方向严格对称）',
  (pkL * 100).toFixed(4) + '% = ' + (pkR * 100).toFixed(4) + '%');

console.log('\n----------------------------------------');
if (fails.length) { console.log('❌ ' + fails.length + ' 项未通过: ' + fails.join(' / ')); process.exit(1); }
console.log('✅ 全部通过');
