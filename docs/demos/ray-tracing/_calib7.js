/* §7 几何标定：用真实的反射定律 / Snell 定律 / 全内反射判据做双参数搜索。
 *
 * 关键几何约束（先说清楚，免得白扫）：
 *   1. 相机 → 金属球 的反射光线必须真的指向玻璃球；
 *   2. 玻璃球心【不能落在】反射光线上——若落在线上，光线穿过球心、入射角为 0，
 *      折射后沿直径直穿，永远不会发生全内反射；
 *   3. 入场点最好靠近玻璃球边缘（掠入射），这样折射后内部光线与法线夹角大，
 *      在下一个内壁上容易超过临界角 asin(1/1.5)=41.81°，从而出现全内反射。
 * 所以搜索变量是：相机入射角 φ、玻璃球心沿反射光线的距离 s、以及垂向偏移 o（带符号）。
 */
const W = 8.6, H = 7.6, SKY_Y = 7.0;
const E = { x:0.7, y:1.0 };
const METAL = { name:'金属球', type:'metal', c:{x:3.2, y:3.1}, r:1.05, albedo:0.90 };
const R_GLASS = 1.25, IOR = 1.5, GLASS_ALBEDO = 1.00;
const MAXDEPTH = 8;

const norm = (v) => { const l = Math.hypot(v.x, v.y) || 1; return { x:v.x/l, y:v.y/l }; };
const dist = (a, b) => Math.hypot(a.x-b.x, a.y-b.y);

function hitNearest(objs, p, d) {
  let best = null;
  for (const o of objs) {
    const ox = p.x - o.c.x, oy = p.y - o.c.y;
    const a = d.x*d.x + d.y*d.y;
    const h = d.x*(-ox) + d.y*(-oy);                 // h = D·(C−O)
    const c = ox*ox + oy*oy - o.r*o.r;
    const disc = h*h - a*c;
    if (disc <= 1e-12) continue;
    const s = Math.sqrt(disc);
    let t = (h - s)/a;
    if (t <= 1e-9) t = (h + s)/a;
    if (t <= 1e-9) continue;
    if (!best || t < best.t) best = { t, obj:o, wasInside: c < 0 };
  }
  if (!best) return null;
  best.p = { x: p.x + best.t*d.x, y: p.y + best.t*d.y };
  best.n = { x:(best.p.x-best.obj.c.x)/best.obj.r, y:(best.p.y-best.obj.c.y)/best.obj.r };
  return best;
}

function trace(objs, skyY, p0, d0) {
  let p = { x:p0.x, y:p0.y }, d = norm(d0);
  let albedo = 1, glassPasses = 0;
  const segs = [];
  for (let depth = 0; depth < MAXDEPTH; depth++) {
    const h = hitNearest(objs, p, d);
    const tSky = d.y > 1e-9 ? (skyY - p.y)/d.y : Infinity;
    if (tSky > 1e-9 && (!h || tSky < h.t)) {
      const to = { x:p.x + tSky*d.x, y:p.y + tSky*d.y };
      segs.push({ kind:'到达天光', obj:'天光', len:tSky, from:p, to, albedo });
      return { segs, terminal:'天光', albedo };
    }
    if (!h) {
      const to = { x:p.x + 12*d.x, y:p.y + 12*d.y };
      segs.push({ kind:'逃逸', obj:'—', len:12, from:p, to, albedo, escapedSideways:true });
      return { segs, terminal:'逃逸', albedo };
    }
    const n = h.n, entering = !h.wasInside;
    if (h.obj.type === 'metal') {
      const dn = d.x*n.x + d.y*n.y;
      albedo *= h.obj.albedo;
      const dOut = norm({ x:d.x - 2*dn*n.x, y:d.y - 2*dn*n.y });
      segs.push({ kind:'反射', obj:h.obj.name, len:h.t, from:p, to:h.p, albedo });
      p = h.p; d = dOut;
    } else {
      const eta = entering ? 1/IOR : IOR;
      const nf = entering ? n : { x:-n.x, y:-n.y };
      const cosi = -(d.x*nf.x + d.y*nf.y);
      const k = 1 - eta*eta*(1 - cosi*cosi);
      const incAngle = Math.acos(Math.min(1, Math.max(-1, cosi)))*180/Math.PI;
      let dOut, kind;
      if (k < 0) {
        const dn = d.x*n.x + d.y*n.y;
        dOut = norm({ x:d.x - 2*dn*n.x, y:d.y - 2*dn*n.y });
        kind = '全内反射';
      } else {
        const sq = Math.sqrt(k);
        dOut = norm({ x:eta*d.x + (eta*cosi - sq)*nf.x, y:eta*d.y + (eta*cosi - sq)*nf.y });
        kind = entering ? '折射进入' : '折射出射';
        albedo *= GLASS_ALBEDO;
        glassPasses++;
      }
      segs.push({ kind, obj:h.obj.name, len:h.t, from:p, to:h.p, incAngle, entering, albedo });
      p = h.p; d = dOut;
    }
  }
  return { segs, terminal:'保险丝', albedo };
}

const TARGET = ['反射','折射进入','折射出射','到达天光'];
const inBounds = (q) => q.x > 0.35 && q.x < W-0.35 && q.y > 0.35 && q.y < SKY_Y-0.15;

const found = [];
const reasons = Object.create(null);
const seqCount = new Map();
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
for (let phi = 18; phi <= 78; phi += 1) {
  const r = Math.PI*phi/180;
  const camD = { x:Math.cos(r), y:Math.sin(r) };
  const hMetal = hitNearest([METAL], E, camD);
  if (!hMetal) continue;
  const d1 = norm({ x:camD.x - 2*(camD.x*hMetal.n.x + camD.y*hMetal.n.y)*hMetal.n.x,
                    y:camD.y - 2*(camD.x*hMetal.n.x + camD.y*hMetal.n.y)*hMetal.n.y });
  const perp = { x:-d1.y, y:d1.x };
  for (let s = 1.9; s <= 5.2; s += 0.1) {
    for (let o = -1.5; o <= 1.5; o += 0.05) {
      if (Math.abs(o) < 0.12) continue;
      const gc = { x:hMetal.p.x + s*d1.x + o*perp.x, y:hMetal.p.y + s*d1.y + o*perp.y };
      const glass = { name:'玻璃球', type:'glass', c:gc, r:R_GLASS, ior:IOR, albedo:GLASS_ALBEDO };
      if (dist(gc, METAL.c) < METAL.r + R_GLASS + 0.30) { bump(reasons, '两球相交'); continue; }
      if (!inBounds({x:gc.x-R_GLASS, y:gc.y-R_GLASS}) || !inBounds({x:gc.x+R_GLASS, y:gc.y+R_GLASS})) { bump(reasons, '球出画面'); continue; }
      const res = trace([METAL, glass], SKY_Y, E, camD);
      const kinds = res.segs.map(x => x.kind);
      const key = kinds.join('→');
      seqCount.set(key, (seqCount.get(key) || 0) + 1);
      if (kinds.length !== TARGET.length) { bump(reasons, '段数≠' + TARGET.length + '（实际 ' + kinds.length + '）'); continue; }
      if (!kinds.every((k, i) => k === TARGET[i])) { bump(reasons, '序列不符'); continue; }
      if (res.segs.some(x => x.len < 0.42)) { bump(reasons, '有退化段(<0.42)'); continue; }
      if (res.segs.some(x => x.escapedSideways)) { bump(reasons, '横向逃逸'); continue; }
      const exit = res.segs[res.segs.length-1].to;
      if (!inBounds(exit)) { bump(reasons, '出射点出画面'); continue; }
      found.push({ phi, s:+s.toFixed(2), o:+o.toFixed(2), gc, res });
    }
  }
}

console.log('拒绝原因统计:');
Object.entries(reasons).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log('   ' + String(v).padStart(6) + '  ' + k));
console.log('');
console.log('出现过的光路序列（前 10）:');
[...seqCount].sort((a,b) => b[1]-a[1]).slice(0,10).forEach(([k,v]) => console.log('   ' + String(v).padStart(6) + '  ' + k));
console.log('');
console.log('候选组合数: ' + found.length);
if (!found.length) { console.log('没找到，需要调整球的位置/半径'); process.exit(1); }

/* 打分：偏好 ① 玻璃球在画面右上方（视觉旅程向右上走）② 各段长度均匀 ③ 出射点离顶边有余量 */
const score = (f) => {
  const lens = f.res.segs.map(s => s.len);
  const mean = lens.reduce((a,b) => a+b, 0)/lens.length;
  const spread = Math.max(...lens) - Math.min(...lens);
  return (f.gc.x - f.gc.y*0.55) * 0.6 - spread * 1.4 - Math.max(0, f.gc.x - (W-1.8))*2;
};
found.sort((a, b) => score(b) - score(a));

const seen = new Set();
let shown = 0;
for (const f of found) {
  const key = Math.round(f.phi) + '_' + Math.round(f.s*2) + '_' + Math.round(f.o*4);
  if (seen.has(key)) continue;
  seen.add(key);
  console.log('');
  console.log('φ=' + f.phi + '°  s=' + f.s + '  o=' + f.o
    + '   玻璃球心 (' + f.gc.x.toFixed(2) + ',' + f.gc.y.toFixed(2) + ')');
  f.res.segs.forEach((s, i) => {
    console.log('   段' + (i+1) + ' ' + s.kind.padEnd(5) + ' ' + s.obj.padEnd(4)
      + '  长 ' + s.len.toFixed(2).padStart(5)
      + (s.incAngle !== undefined ? '  入射角 ' + s.incAngle.toFixed(1).padStart(5) + '°' : '         ')
      + '  累计 ' + s.albedo.toFixed(2)
      + '   (' + s.from.x.toFixed(1) + ',' + s.from.y.toFixed(1) + ')→(' + s.to.x.toFixed(1) + ',' + s.to.y.toFixed(1) + ')');
  });
  if (++shown >= 5) break;
}
console.log('');
console.log('玻璃 ior=1.5 临界角 asin(1/1.5) = ' + (Math.asin(1/1.5)*180/Math.PI).toFixed(2) + '°');
