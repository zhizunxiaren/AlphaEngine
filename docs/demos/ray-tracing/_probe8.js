/* 可行性探测：同一场景、同一眼位，只改「发射方向 α」与「maxDepth」，
 * 能构造出哪些「命中次数」的终局？
 *
 * 目标：为「miss / 命中 1 次 / 命中 2 次 / 命中 3 次 / maxDepth 截断」找例子。
 * 几何常量全部照抄 §7 的解析反推结果（不重算，避免与页面不一致）。
 *
 * 用法: node _probe8.js
 */
const DEG = 180 / Math.PI;
const dir = d => ({ x: Math.cos(d / DEG), y: Math.sin(d / DEG) });
const nrm = v => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const dot = (a, b) => a.x * b.x + a.y * b.y;

/* ---- §7 的几何（照抄） ---- */
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

console.log('眼位      (' + EYE.x.toFixed(2) + ', ' + EYE.y.toFixed(2) + ')');
console.log('金属球心  (' + MC.x.toFixed(3) + ', ' + MC.y.toFixed(3) + ')  r = ' + R_METAL);
console.log('玻璃球心  (' + GC.x.toFixed(3) + ', ' + GC.y.toFixed(3) + ')  r = ' + R_GLASS);
const Dm = Math.hypot(MC.x - EYE.x, MC.y - EYE.y);
const Dg = Math.hypot(GC.x - EYE.x, GC.y - EYE.y);
const aM = Math.atan2(MC.y - EYE.y, MC.x - EYE.x) * DEG;
const aG = Math.atan2(GC.y - EYE.y, GC.x - EYE.x) * DEG;
console.log('眼→金属心 距离 ' + Dm.toFixed(3) + '  方向角 ' + aM.toFixed(2) + '°  切线半角 asin(r/D) = '
  + (Math.asin(R_METAL / Dm) * DEG).toFixed(2) + '°  ⇒ 切点 α = ' + (aM - Math.asin(R_METAL / Dm) * DEG).toFixed(2)
  + '° / ' + (aM + Math.asin(R_METAL / Dm) * DEG).toFixed(2) + '°');
console.log('眼→玻璃心 距离 ' + Dg.toFixed(3) + '  方向角 ' + aG.toFixed(2) + '°  切线半角 '
  + (Math.asin(R_GLASS / Dg) * DEG).toFixed(2) + '°');

/* ---- 求交与追踪 ---- */
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

/** 返回 {hits, term, log[]}；hits = 球面交互次数，term = 终止原因
 *  注意 eps：每次命中的新起点必须沿新方向挪开 1e-6，否则起点正落在球面上，
 *  判别式近根 t≈0 被丢弃后会取到「穿过球体后的远根」——把「出射」判成「再次进入」，
 *  于是一条本该 2 次命中的光线会被记成 8 次擦碰。这是标准的自相交问题。 */
function trace(alpha, maxDepth) {
  let p = { x: EYE.x, y: EYE.y }, d = dir(alpha);
  let hits = 0; const log = [];
  for (let k = 0; k < maxDepth; k++) {
    const h = hitNearest([METAL, GLASS], p, d);
    /* 注意：必须同时判 d.y > 0 与 tSky 有限。只写 `tSky > 1e-9` 会让 Infinity 通过，
       把「朝下、什么也没打中」误判成「到达天光」，并算出 NaN 坐标。 */
    const tSky = (d.y > 1e-9) ? (SKY_Y - p.y) / d.y : Infinity;
    if (isFinite(tSky) && tSky > 1e-9 && (!h || tSky < h.t)) { log.push('天光'); return { hits, term: '射向天空', log }; }
    if (!h) { log.push('逃出场景'); return { hits, term: '逃出场景', log }; }
    hits++;
    const n = h.n, dn = dot(d, n);
    if (h.obj.type === 'metal') {
      d = nrm({ x: d.x - 2 * dn * n.x, y: d.y - 2 * dn * n.y });
      log.push('金属:反射(' + (Math.acos(Math.min(1, Math.abs(dn))) * DEG).toFixed(1) + '°)');
      p = h.P;
    } else {
      const entering = !h.inside;
      const nf = entering ? n : { x: -n.x, y: -n.y };
      const cosi = -(d.x * nf.x + d.y * nf.y);
      const eta = entering ? 1 / IOR : IOR;
      const kk = 1 - eta * eta * (1 - cosi * cosi);
      if (kk < 0) { d = nrm({ x: d.x - 2 * dn * n.x, y: d.y - 2 * dn * n.y }); log.push('玻璃:全内反射'); }
      else {
        const sqr = Math.sqrt(kk);
        d = nrm({ x: eta * d.x + (eta * cosi - sqr) * nf.x, y: eta * d.y + (eta * cosi - sqr) * nf.y });
        log.push('玻璃:' + (entering ? '进入' : '出射') + '(' + (Math.acos(Math.min(1, Math.max(-1, cosi))) * DEG).toFixed(1) + '°)');
      }
      p = h.P;
    }
    p = { x: p.x + d.x * 1e-6, y: p.y + d.y * 1e-6 };      // 自相交偏移
  }
  return { hits, term: 'maxDepth 截断', log };
}

/* ---- 扫描：命中次数随 α 的分布 ---- */
/* 只扫「朝前的半圈」α ∈ [-90°, 90°]：朝后的方向没有讨论价值，会计入 miss 虚高占比。
   步长取 0.005°，把 1 次与 3 次之间的过渡边界钉到 0.01° 以内。 */
const A0 = -90, A1 = 90, STEP = 0.005;
console.log('\n=== 扫描 α ∈ [' + A0 + '°, ' + A1 + '°]，maxDepth = 8，步长 ' + STEP + '° ===');
const buckets = new Map();
let n = 0;
for (let a = A0; a <= A1 + 1e-9; a += STEP) {
  const r = trace(a, 8);
  const key = r.hits + '|' + r.term;
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(a);
  n++;
}
const spanTable = [];
for (const [key, list] of [...buckets.entries()].sort((x, y) => Number(x[0].split('|')[0]) - Number(y[0].split('|')[0]))) {
  const spans = [];
  let s = list[0], prev = list[0];
  for (let i = 1; i < list.length; i++) {
    if (list[i] - prev > STEP * 1.5) { spans.push([s, prev]); s = list[i]; }
    prev = list[i];
  }
  spans.push([s, prev]);
  const hits = Number(key.split('|')[0]);
  spans.forEach(([x, y]) => spanTable.push({ hits, term: key.split('|')[1], a0: x, a1: y }));
  const pct = list.length / n * 100;
  console.log('  命中 ' + key.padEnd(16) + ' 占方向 ' + pct.toFixed(1).padStart(5) + '%   '
    + spans.map(([x, y]) => x.toFixed(2) + '°~' + y.toFixed(2) + '°').join(', '));
}
console.log('\n=== 区间表（按 α 排序，用于绘制扫描带） ===');
spanTable.sort((x, y) => x.a0 - y.a0).forEach(sp => {
  console.log('  ' + sp.a0.toFixed(2).padStart(7) + '° ~ ' + sp.a1.toFixed(2).padStart(6) + '°  宽 '
    + (sp.a1 - sp.a0).toFixed(2).padStart(6) + '°  ' + (100 * (sp.a1 - sp.a0) / (A1 - A0)).toFixed(1).padStart(5) + '%  命中 '
    + sp.hits + ' 次 · ' + sp.term);
});

/* ---- 切线角（与区间边界对照） ---- */
console.log('\n=== 切线角（区间边界必须落在这些值上） ===');
const TAN = [
  ['金属球 上切点', aM - Math.asin(R_METAL / Dm) * DEG],
  ['金属球 下切点', aM + Math.asin(R_METAL / Dm) * DEG],
  ['玻璃球 上切点', aG - Math.asin(R_GLASS / Dg) * DEG],
  ['玻璃球 下切点', aG + Math.asin(R_GLASS / Dg) * DEG],
];
TAN.forEach(([k, v]) => console.log('  ' + k.padEnd(14) + v.toFixed(4) + '°'));


/* ---- 候选例子 ---- */
console.log('\n=== 候选例子（每个命中次数取一个代表 α） ===');
const CANDS = [
  ['m0 miss 射向天空', 60, 8],
  ['m0 miss 缝隙穿过', -20, 8],
  ['m1 1 次（候选）', -43, 8],
  ['m1 1 次（候选）', -58, 8],
  ['m1 1 次（候选）', -62, 8],
  ['m2 2 次（候选）', 0, 8],
  ['m2 2 次（候选）', 20, 8],
  ['m3 3 次（§7 那条）', -38, 8],
  ['mx maxDepth=2', -38, 2],
  ['mx maxDepth=1', -38, 1],
];
for (const [name, a, md] of CANDS) {
  const r = trace(a, md);
  console.log('  ' + name.padEnd(18) + ' α=' + String(a).padStart(4) + '°  maxDepth=' + md
    + '  → 命中 ' + r.hits + ' 次, 终止=' + r.term);
  console.log('        ' + r.log.join(' → '));
}
