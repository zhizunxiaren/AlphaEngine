/* §7 几何标定（一维+粗扫精修版）
 *
 * 搜索变量（沿金属球反射光线参数化，避免二维笛卡尔网格的天量组合）：
 *   φ  相机射线仰角
 *   s  玻璃球心沿反射光线方向的距离
 *   o  玻璃球心相对反射光线的垂向偏移（>0 = 球心在光线【上方】）
 *
 * 为什么要求 o > 0：球面折射净偏折角 = 2(θ−θt)，光线从球心【下方】通过才会向上偏折。
 * 反射段是向上的，若玻璃球心压在光线上或在其下方，出射光线只会更平或向下，到不了天光。
 * 又必须 o < R，否则光线与玻璃球不相交。
 *
 * 物理修正记录：早期版本把「全内反射」列为目标之一，这是错的——从外部入射的光线在球内
 * 走弦，弦与两端法线夹角恒相等，故内壁入射角 == 入场折射角 ≤ asin(1/n) == 临界角，
 * 永远不会触发全内反射。已从目标序列中移除。
 */
const W = 8.6, H = 7.6, SKY_Y = 7.0;
const IOR = 1.5, MAXDEPTH = 8;

const EYE   = { x: 0.60, y: 1.10 };
const METAL = { name: '金属球', type: 'metal', c: { x: 3.05, y: 3.35 }, r: 1.05, albedo: 0.90 };
const GLASS_R = 1.25;

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
  const p2 = { x: p.x + t * d.x, y: p.y + t * d.y };
  return { t, obj: o, p: p2, n: { x: (p2.x - o.c.x) / o.r, y: (p2.y - o.c.y) / o.r }, wasInside: c < 0 };
}

function hitNearest(objs, p, d) {
  let best = null;
  for (const o of objs) { const h = hitSphere(o, p, d); if (h && (!best || h.t < best.t)) best = h; }
  return best;
}

function trace(objs, p0, d0) {
  let p = { x: p0.x, y: p0.y }, d = norm(d0);
  let albedo = 1, glassPasses = 0;
  const segs = [];
  for (let depth = 0; depth < MAXDEPTH; depth++) {
    const h = hitNearest(objs, p, d);
    const tSky = d.y > 1e-9 ? (SKY_Y - p.y) / d.y : Infinity;
    if (tSky > 1e-9 && (!h || tSky < h.t)) {
      segs.push({ kind: '到达天光', obj: '天光', len: tSky, from: p, to: { x: p.x + tSky * d.x, y: p.y + tSky * d.y }, albedo, d });
      return { segs, terminal: '天光', albedo };
    }
    if (!h) {
      segs.push({ kind: '逃逸', obj: '—', len: 12, from: p, to: { x: p.x + 12 * d.x, y: p.y + 12 * d.y }, albedo, d, escapedSideways: true });
      return { segs, terminal: '逃逸', albedo };
    }
    const n = h.n, entering = !h.wasInside;
    if (h.obj.type === 'metal') {
      albedo *= h.obj.albedo;
      const dn = d.x * n.x + d.y * n.y;
      const dOut = norm({ x: d.x - 2 * dn * n.x, y: d.y - 2 * dn * n.y });
      segs.push({ kind: '反射', obj: h.obj.name, len: h.t, from: p, to: h.p, albedo, d, dOut, n, incAngle: Math.acos(Math.min(1, Math.abs(dn))) * 180 / Math.PI });
      p = h.p; d = dOut;
    } else {
      const eta = entering ? 1 / IOR : IOR;
      const nf = entering ? n : { x: -n.x, y: -n.y };
      const cosi = -(d.x * nf.x + d.y * nf.y);
      const k = 1 - eta * eta * (1 - cosi * cosi);
      const incAngle = Math.acos(Math.min(1, Math.max(-1, cosi))) * 180 / Math.PI;
      let dOut, kind, tir = false;
      if (k < 0) {
        const dn = d.x * n.x + d.y * n.y;
        dOut = norm({ x: d.x - 2 * dn * n.x, y: d.y - 2 * dn * n.y });
        kind = '全内反射'; tir = true;
      } else {
        const sq = Math.sqrt(k);
        dOut = norm({ x: eta * d.x + (eta * cosi - sq) * nf.x, y: eta * d.y + (eta * cosi - sq) * nf.y });
        kind = entering ? '折射进入' : '折射出射';
        glassPasses++;
      }
      segs.push({ kind, obj: h.obj.name, len: h.t, from: p, to: h.p, albedo, d, dOut, n, incAngle, entering, tir });
      p = h.p; d = dOut;
    }
  }
  return { segs, terminal: '保险丝', albedo };
}

const TARGET = ['反射', '折射进入', '折射出射', '到达天光'];
const M = 0.32;
const inFrame = q => q.x > M && q.x < W - M && q.y > M && q.y < SKY_Y - 0.10;

function evaluate(phiDeg, s, o) {
  const r = phiDeg * Math.PI / 180;
  const camD = { x: Math.cos(r), y: Math.sin(r) };
  const hM = hitSphere(METAL, EYE, camD);
  if (!hM) return null;
  const dn = camD.x * hM.n.x + camD.y * hM.n.y;
  const d1 = norm({ x: camD.x - 2 * dn * hM.n.x, y: camD.y - 2 * dn * hM.n.y });
  const perp = { x: -d1.y, y: d1.x };
  const gc = { x: hM.p.x + s * d1.x + o * perp.x, y: hM.p.y + s * d1.y + o * perp.y };
  if (dist(gc, METAL.c) < METAL.r + GLASS_R + 0.30) return { bad: '两球太近' };
  if (!inFrame({ x: gc.x - GLASS_R, y: gc.y - GLASS_R }) || !inFrame({ x: gc.x + GLASS_R, y: gc.y + GLASS_R })) return { bad: '玻璃球出画面' };
  const glass = { name: '玻璃球', type: 'glass', c: gc, r: GLASS_R, ior: IOR };
  const res = trace([METAL, glass], EYE, camD);
  const kinds = res.segs.map(x => x.kind);
  if (kinds.length !== TARGET.length) return { bad: '段数≠4（' + kinds.length + '）' };
  if (!kinds.every((k, i) => k === TARGET[i])) return { bad: '序列=' + kinds.join('→') };
  if (res.segs.some(x => x.len < 0.45)) return { bad: '有退化段' };
  // 终段终点按构造必然落在 y = SKY_Y，不能套用通用画面内判定；只要求它横向不出画面。
  const n = res.segs.length;
  for (let i = 0; i < n - 1; i++) if (!inFrame(res.segs[i].to)) return { bad: '中间顶点出画面' };
  const tip = res.segs[n - 1].to;
  if (tip.x <= M || tip.x >= W - M) return { bad: '天光端点横向出画面' };
  return { ok: true, phiDeg, s, o, gc, camD, hM, d1, res };
}

/* 打分：段长均衡 + 相机段适中 + 出射点靠上 + 反射段够长 */
function score(f) {
  const L = f.res.segs.map(s => s.len);
  const spread = Math.max(...L) - Math.min(...L);
  const exitTop = f.res.segs[f.res.segs.length - 1].to.y;
  let sc = -spread * 2.0 - Math.abs(L[0] - 2.7) * 1.4 + exitTop * 0.85;
  if (L[1] < 1.5) sc -= (1.5 - L[1]) * 3.0;
  return sc;
}

/* ---------- 阶段 1：粗扫 ---------- */
let cands = [], reasons = Object.create(null);
const bump = k => { reasons[k] = (reasons[k] || 0) + 1; };
const t0 = Date.now();
for (let phi = 6; phi <= 80; phi += 0.1) {
  for (let s = 1.0; s <= 4.6; s += 0.06) {
    for (let o = 0.17; o <= GLASS_R - 0.10; o += 0.03) {
      const r = evaluate(phi, s, o);
      if (!r) { bump('未命中金属球'); continue; }
      if (r.bad) { bump(r.bad); continue; }
      cands.push(r);
    }
  }
}
const tCoarse = Date.now() - t0;
console.log('=== 阶段1 粗扫 === ' + tCoarse + ' ms   候选 ' + cands.length);
Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([k, v]) => console.log('  ' + String(v).padStart(8) + '  ' + k));
if (!cands.length) { console.log('\n粗扫无候选，需放宽约束。'); process.exit(1); }

cands.sort((a, b) => score(b) - score(a));

/* ---------- 阶段 2：以粗扫 Top 40 为中心做精修 ---------- */
let fine = [];
for (const c of cands.slice(0, 40)) {
  for (let dp = -0.12; dp <= 0.12; dp += 0.02) {
    for (let ds = -0.08; ds <= 0.08; ds += 0.01) {
      for (let doo = -0.04; doo <= 0.04; doo += 0.005) {
        const r = evaluate(c.phiDeg + dp, c.s + ds, c.o + doo);
        if (r && r.ok) fine.push(r);
      }
    }
  }
}
console.log('\n=== 阶段2 精修 === 候选 ' + fine.length);
const pool = fine.length ? fine : cands;
pool.sort((a, b) => score(b) - score(a));

console.log('\n=== Top 3 ===');
for (let i = 0; i < Math.min(3, pool.length); i++) {
  const f = pool[i];
  console.log('\n#' + (i + 1) + '  φ=' + f.phiDeg.toFixed(2) + '°   s=' + f.s.toFixed(3) + '   o=' + f.o.toFixed(3)
    + '   玻璃球心 (' + f.gc.x.toFixed(3) + ', ' + f.gc.y.toFixed(3) + ')   score ' + score(f).toFixed(3));
  console.log('    相机瞄点方向 (' + f.camD.x.toFixed(4) + ', ' + f.camD.y.toFixed(4) + ')  金属命中点 (' + f.hM.p.x.toFixed(3) + ', ' + f.hM.p.y.toFixed(3) + ')');
  f.res.segs.forEach((sg, k) => {
    console.log('    段' + (k + 1) + ' ' + sg.kind.padEnd(5) + ' ' + sg.obj.padEnd(4)
      + ' 长 ' + sg.len.toFixed(3).padStart(6)
      + (sg.incAngle !== undefined ? '  入射角 ' + sg.incAngle.toFixed(2).padStart(6) + '°' : '              ')
      + (sg.dOut ? '  出射向 (' + sg.dOut.x.toFixed(3) + ',' + sg.dOut.y.toFixed(3) + ')' : '')
      + '  (' + sg.from.x.toFixed(2) + ',' + sg.from.y.toFixed(2) + ')→(' + sg.to.x.toFixed(2) + ',' + sg.to.y.toFixed(2) + ')');
  });
}
console.log('\n临界角 asin(1/' + IOR + ') = ' + (Math.asin(1 / IOR) * 180 / Math.PI).toFixed(2) + '°');
