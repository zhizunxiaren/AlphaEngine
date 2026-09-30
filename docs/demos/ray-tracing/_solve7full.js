/* §7 完整光路求解器
 *
 * 两级搜索：
 *   阶段1  枚举「金属球几何」——眼睛高度 / 球心 / 半径 / 相机射线角，
 *          用球冠相对位置 rel、镜面入射角 θ、反射方向 β、相机段长做质量筛选。
 *   阶段2  对每个通过的金属几何，沿反射光线扫描玻璃球落位 (s, o)，
 *          用真实的反射 / Snell 折射 / 全内反射判据跑完整 trace，
 *          要求恰好四段：反射 → 折射进入 → 折射出射 → 到达天光。
 *
 * 硬性物理约束（曾经踩坑，务必保留）：
 *   从外部入射的光线在球内走弦，弦与两端法线夹角恒相等，
 *   故内壁入射角 == 入场折射角 ≤ asin(1/n) == 临界角，永远不会发生全内反射。
 *   所以「玻璃球内全内反射」不能作为目标，TARGET 里没有它。
 */
const DEG = 180 / Math.PI;
const W = 8.6, SKY = 7.0, PAD = 0.40;
const IOR = 1.5, MAXDEPTH = 8;
const GLASS_R = 1.15;

const norm = v => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function hitSphere(o, p, d) {
  const ox = p.x - o.c.x, oy = p.y - o.c.y;
  const a = d.x * d.x + d.y * d.y;
  const h = d.x * (-ox) + d.y * (-oy);
  const c = ox * ox + oy * oy - o.r * o.r;
  const disc = h * h - a * c;
  if (disc <= 1e-12) return null;
  const sq = Math.sqrt(disc);
  let t = (h - sq) / a;
  if (t <= 1e-9) t = (h + sq) / a;
  if (t <= 1e-9) return null;
  const P = { x: p.x + t * d.x, y: p.y + t * d.y };
  return { t, obj: o, P, n: { x: (P.x - o.c.x) / o.r, y: (P.y - o.c.y) / o.r }, wasInside: c < 0 };
}
function hitNearest(objs, p, d) {
  let best = null;
  for (const o of objs) { const h = hitSphere(o, p, d); if (h && (!best || h.t < best.t)) best = h; }
  return best;
}
function trace(objs, p0, d0) {
  let p = { x: p0.x, y: p0.y }, d = norm(d0);
  let albedo = 1;
  const segs = [];
  for (let depth = 0; depth < MAXDEPTH; depth++) {
    const h = hitNearest(objs, p, d);
    const tSky = d.y > 1e-9 ? (SKY - p.y) / d.y : Infinity;
    if (tSky > 1e-9 && (!h || tSky < h.t)) {
      segs.push({ kind: '到达天光', len: tSky, from: p, to: { x: p.x + tSky * d.x, y: p.y + tSky * d.y }, albedo });
      return { segs };
    }
    if (!h) {
      segs.push({ kind: '逃逸', len: 12, from: p, to: { x: p.x + 12 * d.x, y: p.y + 12 * d.y }, albedo, esc: true });
      return { segs };
    }
    const n = h.n, entering = !h.wasInside;
    if (h.obj.type === 'metal') {
      albedo *= h.obj.albedo;
      const dn = d.x * n.x + d.y * n.y;
      const dOut = norm({ x: d.x - 2 * dn * n.x, y: d.y - 2 * dn * n.y });
      segs.push({ kind: '反射', len: h.t, from: p, to: h.P, albedo, dOut, inc: Math.acos(Math.min(1, Math.abs(dn))) * DEG });
      p = h.P; d = dOut;
    } else {
      const eta = entering ? 1 / IOR : IOR;
      const nf = entering ? n : { x: -n.x, y: -n.y };
      const cosi = -(d.x * nf.x + d.y * nf.y);
      const k = 1 - eta * eta * (1 - cosi * cosi);
      const inc = Math.acos(Math.min(1, Math.max(-1, cosi))) * DEG;
      let dOut, kind;
      if (k < 0) {
        const dn = d.x * n.x + d.y * n.y;
        dOut = norm({ x: d.x - 2 * dn * n.x, y: d.y - 2 * dn * n.y });
        kind = '全内反射';
      } else {
        const sq = Math.sqrt(k);
        dOut = norm({ x: eta * d.x + (eta * cosi - sq) * nf.x, y: eta * d.y + (eta * cosi - sq) * nf.y });
        kind = entering ? '折射进入' : '折射出射';
      }
      segs.push({ kind, len: h.t, from: p, to: h.P, albedo, dOut, inc });
      p = h.P; d = dOut;
    }
  }
  return { segs };
}

const TARGET = ['反射', '折射进入', '折射出射', '到达天光'];
const inFrame = q => q.x > 0.32 && q.x < W - 0.32 && q.y > 0.32 && q.y < SKY - 0.10;

/* ---------------- 阶段 1：金属球几何 ---------------- */
const metalOK = [];
const stat = Object.create(null);
const bump = k => { stat[k] = (stat[k] || 0) + 1; };

for (let ey = 1.0; ey <= 5.00; ey += 0.2) {
  const EYE = { x: 0.65, y: ey };
  for (let mx = 2.2; mx <= 5.00; mx += 0.1) {
    for (let my = 1.60; my <= 3.60; my += 0.1) {
      for (let r = 0.75; r <= 1.30; r += 0.1) {
        if (mx - r < PAD || my - r < PAD || my + r > SKY - PAD) { bump('金属球出画面'); continue; }
        const vx = mx - EYE.x, vy = my - EYE.y, D = Math.hypot(vx, vy);
        if (D <= r * 1.10) { bump('眼睛贴球'); continue; }
        const a0 = Math.atan2(vy, vx) * DEG, gam = Math.asin(r / D) * DEG;
        const psiUp = a0 + 90 + gam, span = 180 - 2 * gam;
        for (let a = a0 - gam + 0.35; a <= a0 + gam - 0.35; a += 0.5) {
          if (a < -24 || a > 32) { bump('相机射线角不自然'); continue; }
          const rr = a / DEG, d = { x: Math.cos(rr), y: Math.sin(rr) };
          const H = hitSphere({ c: { x: mx, y: my }, r }, EYE, d); if (!H) continue;
          if (H.t < 2.0 || H.t > 3.6) { bump('相机段长不合适'); continue; }
          const dn = d.x * H.n.x + d.y * H.n.y;
          const dOut = norm({ x: d.x - 2 * dn * H.n.x, y: d.y - 2 * dn * H.n.y });
          const beta = Math.atan2(dOut.y, dOut.x) * DEG;
          const th = Math.acos(Math.min(1, Math.abs(dn))) * DEG;
          if (th > 74) { bump('镜面入射角过掠(θ>74)'); continue; }
          if (beta < 30 || beta > 68) { bump('反射方向不在 30~68'); continue; }
          const psi = Math.atan2(H.n.y, H.n.x) * DEG;
          let rel = (psi - psiUp) / span; if (rel < 0) rel += 180 / span; if (rel > 1) rel -= 180 / span;
          if (rel < 0.12 || rel > 0.88) { bump('命中点贴轮廓'); continue; }
          metalOK.push({ EYE, M: { x: mx, y: my }, r, a, t: H.t, P: H.P, n: H.n, dOut, beta, th, rel, dev: 180 - 2 * th });
        }
      }
    }
  }
}
console.log('阶段1 金属几何候选：' + metalOK.length);
Object.entries(stat).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([k, v]) => console.log('   ' + String(v).padStart(8) + '  ' + k));
if (!metalOK.length) process.exit(1);

/* 先粗排，只对最有希望的一批做阶段 2，控制耗时 */
metalOK.sort((a, b) => (Math.abs(a.rel - 0.30) + Math.abs(a.beta - 55) * 0.02) - (Math.abs(b.rel - 0.30) + Math.abs(b.beta - 55) * 0.02));
const batch = metalOK.slice(0, 1200);

/* ---------------- 阶段 2：玻璃球落位 + 完整 trace ---------------- */
const full = [];
const stat2 = Object.create(null);
const bump2 = k => { stat2[k] = (stat2[k] || 0) + 1; };

for (const m of batch) {
  const METAL = { name: '金属球', type: 'metal', c: m.M, r: m.r, albedo: 0.90 };
  const perp = { x: -m.dOut.y, y: m.dOut.x };
  for (let s = 1.2; s <= 5.6; s += 0.07) {
    for (let o = 0.15; o <= GLASS_R - 0.12; o += 0.04) {
      const gc = { x: m.P.x + s * m.dOut.x + o * perp.x, y: m.P.y + s * m.dOut.y + o * perp.y };
      if (gc.x - GLASS_R < PAD || gc.x + GLASS_R > W - PAD) { bump2('玻璃球横向出画面'); continue; }
      if (gc.y - GLASS_R < PAD || gc.y + GLASS_R > SKY - PAD) { bump2('玻璃球纵向出画面'); continue; }
      if (gc.y < 3.10 || gc.x < 5.30) { bump2('玻璃球位置不佳(应在右上)'); continue; }
      if (dist(gc, m.M) < m.r + GLASS_R + 0.32) { bump2('两球太近'); continue; }
      const glass = { name: '玻璃球', type: 'glass', c: gc, r: GLASS_R, ior: IOR };
      const res = trace([METAL, glass], m.EYE, m.d ? m.d : { x: Math.cos(m.a / DEG), y: Math.sin(m.a / DEG) });
      const kinds = res.segs.map(x => x.kind);
      if (kinds.length !== 4 || !kinds.every((k, i) => k === TARGET[i])) { bump2('光路序列不符(' + kinds.join('→') + ')'); continue; }
      if (res.segs.some(x => x.len < 0.50)) { bump2('有退化段'); continue; }
      if (res.segs.slice(0, 3).some(x => !inFrame(x.to))) { bump2('中间顶点出画面'); continue; }
      const tip = res.segs[3].to;
      if (tip.x <= 0.32 || tip.x >= W - 0.32) { bump2('天光端点横向出画'); continue; }
      const gIn = res.segs[1].inc, gOut = res.segs[2].inc;
      // 硬约束：玻璃入场角必须够大，否则折射偏折量 2(θ−θt) 太小，玻璃球形同透明直穿，
      // 演示就失去意义。θ=40° 时偏折约 29°，已经能看出明显拐弯。
      if (gIn < 40 || gIn > 76) { bump2('玻璃入场角偏折不足'); continue; }
      full.push({ m, gc, res, gIn, gOut, exit: res.segs[3].to, exitDir: res.segs[3] });
    }
  }
}
console.log('\n阶段2 完整四段光路候选：' + full.length);
Object.entries(stat2).sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([k, v]) => console.log('   ' + String(v).padStart(8) + '  ' + k));
if (!full.length) process.exit(1);

/* ---------------- 打分 ---------------- */
const score = c => {
  const L = c.res.segs.map(s => s.len);
  const spread = Math.max(...L) - Math.min(...L);
  // 玻璃偏折量：2(θ − asin(sinθ/1.5))，越大越能看出「折射拐弯」
  const dev = 2 * (c.gIn - Math.asin(Math.sin(c.gIn / DEG) / IOR) * DEG);
  return -Math.abs(c.m.rel - 0.30) * 2.0
    + c.m.dev * 0.02
    - spread * 0.70
    + dev * 0.06
    - Math.abs(L[1] - 1.8) * 0.40
    + c.exit.y * 0.30
    - Math.abs(c.gc.x - 5.9) * 0.40
    - Math.abs(c.gc.y - 4.3) * 0.40
    - Math.abs(c.m.M.x - 3.0) * 0.40
    - Math.abs(c.m.M.y - 2.35) * 0.40;
};
full.sort((a, b) => score(b) - score(a));

console.log('\n================ Top 4 完整解 ================');
for (let i = 0; i < Math.min(4, full.length); i++) {
  const c = full[i];
  console.log('\n──────── #' + (i + 1) + '   score ' + score(c).toFixed(3) + ' ────────');
  console.log('  EYE (' + c.m.EYE.x.toFixed(2) + ', ' + c.m.EYE.y.toFixed(2) + ')   相机射线 α=' + c.m.a.toFixed(2) + '°  段长 ' + c.m.t.toFixed(2));
  console.log('  金属球 球心(' + c.m.M.x.toFixed(2) + ', ' + c.m.M.y.toFixed(2) + ') r=' + c.m.r.toFixed(2)
    + '   命中点(' + c.m.P.x.toFixed(3) + ', ' + c.m.P.y.toFixed(3) + ')  球冠位置 ' + (c.m.rel * 100).toFixed(0) + '%');
  console.log('        镜面入射角 ' + c.m.th.toFixed(2) + '°  偏折 ' + c.m.dev.toFixed(1) + '°  反射 β=' + c.m.beta.toFixed(2) + '°  反射向(' + c.m.dOut.x.toFixed(4) + ', ' + c.m.dOut.y.toFixed(4) + ')');
  console.log('  玻璃球 球心(' + c.gc.x.toFixed(3) + ', ' + c.gc.y.toFixed(3) + ') r=' + GLASS_R + '  ior=' + IOR);
  c.res.segs.forEach((s, k) => {
    const dir = s.dOut ? ' 出射向(' + s.dOut.x.toFixed(3) + ', ' + s.dOut.y.toFixed(3) + ')' : '';
    const inc = s.inc !== undefined ? '  入射角 ' + s.inc.toFixed(2).padStart(6) + '°' : '                 ';
    console.log('    段' + (k + 1) + ' ' + s.kind.padEnd(5) + ' 长 ' + s.len.toFixed(3).padStart(6)
      + inc + dir
      + '   (' + s.from.x.toFixed(2) + ',' + s.from.y.toFixed(2) + ')→(' + s.to.x.toFixed(2) + ',' + s.to.y.toFixed(2) + ')');
  });
}
console.log('\n临界角 asin(1/' + IOR + ') = ' + (Math.asin(1 / IOR) * DEG).toFixed(2) + '°');
