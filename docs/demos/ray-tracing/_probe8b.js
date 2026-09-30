/* §8 缺口量化：玻璃表面的 Fresnel 反射分支到底带走了多少光、命中次数会变成几。
 *
 * 背景：§8 现在只用「折射分支」这一条确定性路径统计命中次数，
 * 玻璃表面被反射掉的那部分光完全没进画面、也没进统计。
 * 本脚本枚举每个方向的完整分支树（金属 1 分支 / 玻璃 2 分支），
 * 给出每条路径的概率与命中次数，并算出「期望命中次数」。
 *
 * 用法: node _probe8b.js
 */
const DEG = 180 / Math.PI;
const dir = d => ({ x: Math.cos(d / DEG), y: Math.sin(d / DEG) });
const nrm = v => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const dot = (a, b) => a.x * b.x + a.y * b.y;

/* ---- §7 的几何（照抄，不重算） ---- */
const SKY_Y = 7.0;
const EYE = { x: 0.70, y: 4.40 };
const R_METAL = 1.00, R_GLASS = 1.20, IOR = 1.5;
const ALPHA = -38, T_EYE = 2.70, BETA = 25, TH_GLASS_IN = 50, G_TARGET_X = 5.90;

const d0 = dir(ALPHA), RDIR = dir(BETA);
const P1 = { x: EYE.x + T_EYE * d0.x, y: EYE.y + T_EYE * d0.y };
let n1 = nrm({ x: RDIR.x - d0.x, y: RDIR.y - d0.y });
if (dot(d0, n1) > 0) n1 = { x: -n1.x, y: -n1.y };
const MC = { x: P1.x - R_METAL * n1.x, y: P1.y - R_METAL * n1.y };
const perp = { x: -RDIR.y, y: RDIR.x };
const O_OFF = R_GLASS * Math.sin(TH_GLASS_IN / DEG);
const sG = (G_TARGET_X - P1.x + O_OFF * RDIR.y) / RDIR.x;
const GC = { x: P1.x + sG * RDIR.x + O_OFF * perp.x, y: P1.y + sG * RDIR.y + O_OFF * perp.y };

const METAL = { name: '金属', type: 'metal', c: MC, r: R_METAL };
const GLASS = { name: '玻璃', type: 'glass', c: GC, r: R_GLASS };

function hitSphere(o, p, d) {
  const ox = p.x - o.c.x, oy = p.y - o.c.y;
  const a = d.x * d.x + d.y * d.y;
  const h = d.x * (-ox) + d.y * (-oy);
  const c = ox * ox + oy * oy - o.r * o.r;
  const disc = h * h - a * c;
  if (disc <= 1e-12) return null;
  const sq = Math.sqrt(disc);
  let t = (h - sq) / a; if (t <= 1e-9) t = (h + sq) / a; if (t <= 1e-9) return null;
  const P = { x: p.x + t * d.x, y: p.y + t * d.y };
  return { t, obj: o, P, n: { x: (P.x - o.c.x) / o.r, y: (P.y - o.c.y) / o.r }, inside: c < 0 };
}
function hitNearest(objs, p, d) {
  let b = null;
  for (const o of objs) { const h = hitSphere(o, p, d); if (h && (!b || h.t < b.t)) b = h; }
  return b;
}
function fresnel(cosI, eta) {
  const s2 = eta * eta * (1 - cosI * cosI);
  if (s2 >= 1) return 1;
  const cosT = Math.sqrt(1 - s2);
  const rs = (cosI - eta * cosT) / (cosI + eta * cosT);
  const rp = (eta * cosI - cosT) / (eta * cosI + cosT);
  return (rs * rs + rp * rp) / 2;
}
const EPS = 1e-6;

/* 一步：给定 (p,d)，返回该次交互能走的所有分支 */
function branches(p, d, depth) {
  const h = hitNearest([METAL, GLASS], p, d);
  const tSky = (d.y > 1e-9) ? (SKY_Y - p.y) / d.y : Infinity;
  if (isFinite(tSky) && tSky > 1e-9 && (!h || tSky < h.t)) return [{ p: 1, n: 0, term: '射向天空', leaf: true }];
  if (!h) return [{ p: 1, n: 0, term: '逃出场景', leaf: true }];
  const n = h.n, dn = dot(d, n);
  if (h.obj.type === 'metal') {
    const dOut = nrm({ x: d.x - 2 * dn * n.x, y: d.y - 2 * dn * n.y });
    return [{ p: 1, n: 1, dOut, h, kind: '反射' }];
  }
  const entering = !h.inside;
  const nf = entering ? n : { x: -n.x, y: -n.y };
  const cosi = Math.min(1, Math.max(0, -(d.x * nf.x + d.y * nf.y)));
  const eta = entering ? 1 / IOR : IOR;
  const R = fresnel(cosi, eta);
  const dRefl = nrm({ x: d.x - 2 * dn * n.x, y: d.y - 2 * dn * n.y });
  const kk = 1 - eta * eta * (1 - cosi * cosi);
  const out = [];
  if (kk >= 0) {
    const sqr = Math.sqrt(kk);
    const dRefr = nrm({ x: eta * d.x + (eta * cosi - sqr) * nf.x, y: eta * d.y + (eta * cosi - sqr) * nf.y });
    out.push({ p: 1 - R, n: 1, dOut: dRefr, h, kind: entering ? '折射进入' : '折射出射', inc: Math.acos(cosi) * DEG });
  }
  out.push({ p: R, n: 1, dOut: dRefl, h, kind: (entering ? '入场面反射' : '出场面内反射'), inc: Math.acos(cosi) * DEG, refl: true });
  return out;
}

/* 完整分支树（只保留概率 > 1e-6 的枝），返回叶子列表 */
function tree(alpha, maxDepth) {
  const leaves = [];
  (function walk(p, d, hits, prob, path, depth) {
    if (prob < 1e-9 || leaves.length > 400) return;
    if (depth >= maxDepth) { leaves.push({ hits, prob, path, term: 'maxDepth 截断' }); return; }
    for (const b of branches(p, d, depth)) {
      const np = prob * b.p;
      const npath = path.concat(b.leaf ? [] : [b.kind]);
      if (b.leaf) { leaves.push({ hits, prob: np, path: npath, term: b.term }); continue; }
      const to = b.h.P;
      const q = { x: to.x + b.dOut.x * EPS, y: to.y + b.dOut.y * EPS };
      walk(q, b.dOut, hits + b.n, np, npath, depth + 1);
    }
  })({ x: EYE.x, y: EYE.y }, dir(alpha), 0, 1, [], 0);
  return leaves;
}

const MODES = [
  ['m0 0 次（miss）', 60, 8],
  ['m1 命中 1 次', -43, 8],
  ['m2 命中 2 次', 0, 8],
  ['m3 命中 3 次', -38, 8],
  ['mx maxDepth 截断', -38, 2],
  ['me 0 次（朝下逃逸）', -75, 8],
];

for (const [name, a, depth] of MODES) {
  const L = tree(a, depth);
  const byHit = new Map();
  for (const l of L) byHit.set(l.hits, (byHit.get(l.hits) || 0) + l.prob);
  const exp = L.reduce((s, l) => s + l.hits * l.prob, 0);
  console.log('\n=== ' + name + '   α = ' + a + '°  max_depth = ' + depth + ' ===');
  console.log('  分支数 ' + L.length + '   期望命中次数 = ' + exp.toFixed(3));
  const keys = [...byHit.keys()].sort((x, y) => x - y);
  console.log('  命中次数分布: ' + keys.map(k => k + ' 次 ' + (byHit.get(k) * 100).toFixed(2) + '%').join('   '));
  /* 折射分支的占比（用于确认现有 §8 只覆盖了多少） */
  const refrOnly = L.filter(l => l.path.every(k => k.indexOf('反射') < 0));
  console.log('  纯折射分支（= §8 现在画的那条）概率合计 '
    + (refrOnly.reduce((s, l) => s + l.prob, 0) * 100).toFixed(2) + '%');
  L.sort((x, y) => y.prob - x.prob).slice(0, 5)
    .forEach(l => console.log('    p=' + (l.prob * 100).toFixed(2).padStart(6) + '%  '
      + l.hits + ' 次  ' + l.term + '   ' + l.path.join(' → ')));
}

/* m3 的逐面反射率明细 */
console.log('\n=== m3（α = −38°）沿折射分支的逐面反射率 ===');
{
  let p = { x: EYE.x, y: EYE.y }, d = dir(-38);
  for (let k = 0; k < 6; k++) {
    const h = hitNearest([METAL, GLASS], p, d);
    const tSky = (d.y > 1e-9) ? (SKY_Y - p.y) / d.y : Infinity;
    if (isFinite(tSky) && tSky > 1e-9 && (!h || tSky < h.t)) { console.log('  第 ' + (k + 1) + ' 步：到达天光'); break; }
    if (!h) { console.log('  第 ' + (k + 1) + ' 步：逃出场景'); break; }
    const n = h.n, dn = dot(d, n);
    if (h.obj.type === 'metal') {
      console.log('  第 ' + (k + 1) + ' 步：金属反射（无分支，反射率 100% 的理想镜面）');
      d = nrm({ x: d.x - 2 * dn * n.x, y: d.y - 2 * dn * n.y });
    } else {
      const entering = !h.inside;
      const nf = entering ? n : { x: -n.x, y: -n.y };
      const cosi = Math.min(1, Math.max(0, -(d.x * nf.x + d.y * nf.y)));
      const eta = entering ? 1 / IOR : IOR;
      const R = fresnel(cosi, eta);
      const inc = Math.acos(cosi) * DEG;
      console.log('  第 ' + (k + 1) + ' 步：玻璃' + (entering ? '入场面' : '出场面')
        + '  入射角 ' + inc.toFixed(2) + '°  → 反射率 R = ' + (R * 100).toFixed(2)
        + '%   折射率 ' + ((1 - R) * 100).toFixed(2) + '%');
      const dRefl = nrm({ x: d.x - 2 * dn * n.x, y: d.y - 2 * dn * n.y });
      const kk = 1 - eta * eta * (1 - cosi * cosi);
      d = kk < 0 ? dRefl
        : nrm({ x: eta * d.x + (eta * cosi - Math.sqrt(kk)) * nf.x, y: eta * d.y + (eta * cosi - Math.sqrt(kk)) * nf.y });
    }
    p = { x: h.P.x + d.x * EPS, y: h.P.y + d.y * EPS };
  }
}

/* 掠射角：玻璃轮廓附近的反射率会飙到多少 */
console.log('\n=== 掠射：入射角 → Fresnel 反射率（空气→玻璃 ior 1.5）===');
for (const deg of [0, 20, 40, 50, 60, 70, 80, 85, 89]) {
  console.log('  入射 ' + String(deg).padStart(2) + '°  →  R = '
    + (fresnel(Math.cos(deg / DEG), 1 / IOR) * 100).toFixed(2) + '%');
}

/* 扫描轴：确认「期望命中次数 == 只走折射分支的命中次数」是否严格恒等，
 * 以及首次玻璃入射的反射率剖面到底长什么样（这就是扫描带要叠的那条曲线）。 */
console.log('\n=== 全程扫描（步长 0.25°）：恒等式与反射率剖面 ===');
{
  let maxDev = 0, worstA = null, nGlassSpan = 0, rMax = 0, rMaxA = null;
  const prof = [];
  for (let a = -90; a <= 90 + 1e-9; a += 0.25) {
    const L = tree(a, 8);
    const exp = L.reduce((s, l) => s + l.hits * l.prob, 0);
    /* 只走折射分支的那条：路径里不含任何「反射」（金属反射是主线的一部分，不算分枝） */
    const main = L.filter(l => l.path.every(k => k.indexOf('场') < 0 && k.indexOf('入场面') < 0))[0]
              || L.filter(l => l.path.every(k => k.indexOf('反射') < 0))[0];
    /* 直接跑一遍确定性折射路径，得到「§8 现在标称的命中次数」 */
    let p = { x: EYE.x, y: EYE.y }, d = dir(a), hits = 0, R1 = 0, rSeen = [];
    for (let k = 0; k < 8; k++) {
      const h = hitNearest([METAL, GLASS], p, d);
      const tSky = (d.y > 1e-9) ? (SKY_Y - p.y) / d.y : Infinity;
      if (isFinite(tSky) && tSky > 1e-9 && (!h || tSky < h.t)) break;
      if (!h) break;
      hits++;
      const n = h.n, dn = dot(d, n);
      if (h.obj.type === 'metal') { d = nrm({ x: d.x - 2 * dn * n.x, y: d.y - 2 * dn * n.y }); }
      else {
        const entering = !h.inside;
        const nf = entering ? n : { x: -n.x, y: -n.y };
        const cosi = Math.min(1, Math.max(0, -(d.x * nf.x + d.y * nf.y)));
        const eta = entering ? 1 / IOR : IOR;
        R1 = fresnel(cosi, eta); rSeen.push(R1);
        const kk = 1 - eta * eta * (1 - cosi * cosi);
        d = kk < 0 ? nrm({ x: d.x - 2 * dn * n.x, y: d.y - 2 * dn * n.y })
          : nrm({ x: eta * d.x + (eta * cosi - Math.sqrt(kk)) * nf.x, y: eta * d.y + (eta * cosi - Math.sqrt(kk)) * nf.y });
      }
      p = { x: h.P.x + d.x * EPS, y: h.P.y + d.y * EPS };
    }
    const dev = Math.abs(exp - hits);
    if (dev > maxDev) { maxDev = dev; worstA = a; }
    if (rSeen.length) {
      nGlassSpan++;
      if (R1 > rMax) { rMax = R1; rMaxA = a; }
      prof.push({ a, r: R1, all: 1 - rSeen.reduce((s, r) => s * (1 - r), 1) });
    }
  }
  console.log('  玻璃覆盖方向数 ' + nGlassSpan + ' / 721');
  console.log('  |期望命中次数 − 确定性命中次数| 最大偏差 = ' + maxDev.toExponential(2)
    + '  (α = ' + worstA + '°)');
  console.log('  首次玻璃入射反射率 最大 ' + (rMax * 100).toFixed(2) + '%  (α = ' + rMaxA
    + '°)  ← 出现在玻璃轮廓切线附近');
  console.log('  采样剖面（每 6° 取一点，R 单调上升说明掠射效应）:');
  console.log('    ' + prof.filter((_, i) => i % 24 === 0)
    .map(o => o.a.toFixed(0) + '°:' + (o.r * 100).toFixed(1) + '%').join('  '));
  console.log('  玻璃区间的两端（切线处）:');
  console.log('    ' + prof.slice(0, 3).map(o => o.a.toFixed(2) + '°:' + (o.r * 100).toFixed(1) + '%').join('  ')
    + '   …   ' + prof.slice(-3).map(o => o.a.toFixed(2) + '°:' + (o.r * 100).toFixed(1) + '%').join('  '));
}
