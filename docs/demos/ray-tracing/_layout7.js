/* §7 布局构造器（解析反推 + 真实 trace 校验）
 *
 * 构造思路（自由度全部用上，不再盲扫）：
 *   给定 眼睛 E、相机射线角 α、眼睛到命中点距离 t、目标反射角 β，
 *   则 命中点 P1 = E + t·d，镜面法线由反射定律唯一确定：
 *       反射定律等价于 dOut − d = −2(d·n)n
 *       故 n ∝ (dOut − d)（符号取 d·n<0 的那一支，即光线入射一侧）
 *   球心 M = P1 − r·n（r 任意：球面过 P1 且法线为 n 的球心必定在 P1 − r·n 上）
 *   于是金属球的入射角 θ = acos(−d·n)，偏折角 = 180 − 2θ，全部可解析求出。
 *
 * 玻璃球落位用同一套：反射光线方向 R1，法向 perp = (−R1.y, R1.x)。
 *   G = P1 + s·R1 + o·perp。o 决定了光线偏离球心的距离，即入场入射角
 *   sinθ_in = o / r_glass —— 直接控制折射偏折量，不再是黑盒搜索。
 *
 * 最后用真实的反射 / Snell 折射例程跑完整 trace 做客观校验。
 */
const DEG = 180 / Math.PI;
const IOR = 1.5, SKY = 7.0, W = 8.6;
const norm = v => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const dir = deg => ({ x: Math.cos(deg / DEG), y: Math.sin(deg / DEG) });

function hitSphere(o, p, d) {
  const ox = p.x - o.c.x, oy = p.y - o.c.y;
  const a = d.x * d.x + d.y * d.y;
  const h = d.x * (-ox) + d.y * (-oy);
  const c = ox * ox + oy * oy - o.r * o.r;
  const disc = h * h - a * c; if (disc <= 1e-12) return null;
  const sq = Math.sqrt(disc);
  let t = (h - sq) / a; if (t <= 1e-9) t = (h + sq) / a; if (t <= 1e-9) return null;
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
  const segs = [];
  for (let k = 0; k < 8; k++) {
    const h = hitNearest(objs, p, d);
    const tSky = d.y > 1e-9 ? (SKY - p.y) / d.y : Infinity;
    if (tSky > 1e-9 && (!h || tSky < h.t)) {
      segs.push({ kind: '到达天光', len: tSky, from: p, to: { x: p.x + tSky * d.x, y: p.y + tSky * d.y }, d });
      return segs;
    }
    if (!h) { segs.push({ kind: '逃逸', len: 12, from: p, to: { x: p.x + 12 * d.x, y: p.y + 12 * d.y }, d, esc: true }); return segs; }
    const n = h.n;
    if (h.obj.type === 'metal') {
      const dn = d.x * n.x + d.y * n.y;
      const dOut = norm({ x: d.x - 2 * dn * n.x, y: d.y - 2 * dn * n.y });
      segs.push({ kind: '反射', obj: h.obj.name, len: h.t, from: p, to: h.P, d, dOut, n, inc: Math.acos(Math.min(1, Math.abs(dn))) * DEG });
      p = h.P; d = dOut;
    } else {
      const entering = !h.wasInside;
      const eta = entering ? 1 / IOR : IOR;
      const nf = entering ? n : { x: -n.x, y: -n.y };
      const cosi = -(d.x * nf.x + d.y * nf.y);
      const k2 = 1 - eta * eta * (1 - cosi * cosi);
      const inc = Math.acos(Math.min(1, Math.max(-1, cosi))) * DEG;
      let dOut, kind;
      if (k2 < 0) { const dn = d.x * n.x + d.y * n.y; dOut = norm({ x: d.x - 2 * dn * n.x, y: d.y - 2 * dn * n.y }); kind = '全内反射'; }
      else { const sq = Math.sqrt(k2); dOut = norm({ x: eta * d.x + (eta * cosi - sq) * nf.x, y: eta * d.y + (eta * cosi - sq) * nf.y }); kind = entering ? '折射进入' : '折射出射'; }
      segs.push({ kind, obj: h.obj.name, len: h.t, from: p, to: h.P, d, dOut, n, inc });
      p = h.P; d = dOut;
    }
  }
  return segs;
}

/* ---------------- 布局参数（解析构造） ---------------- */
const EYE = { x: 0.70, y: 4.40 };
const ALPHA = -38;                 // 相机射线角：向下偏右
const T_EYE = 2.70;                // 眼睛到金属命中点距离
const BETA = 25;                   // 目标反射角
const R_METAL = 1.00;
const R_GLASS = 1.20;
const O_OFF = R_GLASS * Math.sin(50 / DEG);   // 玻璃入场入射角定为 50°
const G_TARGET_X = 5.90;           // 玻璃球心目标横坐标

const d = dir(ALPHA);
const R1 = dir(BETA);
const P1 = { x: EYE.x + T_EYE * d.x, y: EYE.y + T_EYE * d.y };
// 镜面法线：n ∝ (dOut − d)，取 d·n<0 的分支
let n1 = norm({ x: R1.x - d.x, y: R1.y - d.y });
if (d.x * n1.x + d.y * n1.y > 0) n1 = { x: -n1.x, y: -n1.y };
const M = { x: P1.x - R_METAL * n1.x, y: P1.y - R_METAL * n1.y };
const THETA = Math.acos(Math.min(1, Math.abs(d.x * n1.x + d.y * n1.y))) * DEG;

const perp = { x: -R1.y, y: R1.x };
const sSolve = (G_TARGET_X - P1.x + O_OFF * R1.y) / R1.x;
const G = { x: P1.x + sSolve * R1.x + O_OFF * perp.x, y: P1.y + sSolve * R1.y + O_OFF * perp.y };

const METAL = { name: '金属球', type: 'metal', c: M, r: R_METAL };
const GLASS = { name: '玻璃球', type: 'glass', c: G, r: R_GLASS, ior: IOR };

console.log('======== 解析构造结果 ========');
console.log('眼睛 E = (' + EYE.x + ', ' + EYE.y + ')   相机射线角 α = ' + ALPHA + '°  →  方向 (' + d.x.toFixed(4) + ', ' + d.y.toFixed(4) + ')');
console.log('金属命中点 P1 = (' + P1.x.toFixed(3) + ', ' + P1.y.toFixed(3) + ')   距离 t = ' + T_EYE);
console.log('镜面法线 n1 = (' + n1.x.toFixed(4) + ', ' + n1.y.toFixed(4) + ')');
console.log('金属球心 M = (' + M.x.toFixed(3) + ', ' + M.y.toFixed(3) + ')  r=' + R_METAL
  + '   镜面入射角 θ = ' + THETA.toFixed(2) + '°   偏折 = ' + (180 - 2 * THETA).toFixed(2) + '°');
console.log('玻璃球心 G = (' + G.x.toFixed(3) + ', ' + G.y.toFixed(3) + ')  r=' + R_GLASS
  + '   垂向偏移 o = ' + O_OFF.toFixed(3) + '  → 入场入射角 ≈ ' + (Math.asin(O_OFF / R_GLASS) * DEG).toFixed(2) + '°');
console.log('  s（沿反射光线距离）= ' + sSolve.toFixed(3));
console.log('  金属球占位 x[' + (M.x - R_METAL).toFixed(2) + ',' + (M.x + R_METAL).toFixed(2) + ']  y[' + (M.y - R_METAL).toFixed(2) + ',' + (M.y + R_METAL).toFixed(2) + ']');
console.log('  玻璃球占位 x[' + (G.x - R_GLASS).toFixed(2) + ',' + (G.x + R_GLASS).toFixed(2) + ']  y[' + (G.y - R_GLASS).toFixed(2) + ',' + (G.y + R_GLASS).toFixed(2) + ']');

const segs = trace([METAL, GLASS], EYE, d);
console.log('\n======== 真实 trace 校验 ========');
console.log('段数 = ' + segs.length + '   序列 = ' + segs.map(s => s.kind).join(' → '));
const TARGET = ['反射', '折射进入', '折射出射', '到达天光'];
const okSeq = segs.length === 4 && segs.every((s, i) => s.kind === TARGET[i]);
segs.forEach((s, i) => {
  const dd = s.dOut ? '  出射向(' + s.dOut.x.toFixed(3) + ', ' + s.dOut.y.toFixed(3) + ') 角 ' + (Math.atan2(s.dOut.y, s.dOut.x) * DEG).toFixed(2) + '°' : '';
  const ic = s.inc !== undefined ? '  入射角 ' + s.inc.toFixed(2).padStart(6) + '°' : '                 ';
  console.log('  段' + (i + 1) + ' ' + s.kind.padEnd(5)
    + ' 长 ' + s.len.toFixed(3).padStart(6) + ic + dd
    + '   (' + s.from.x.toFixed(2) + ',' + s.from.y.toFixed(2) + ') → (' + s.to.x.toFixed(2) + ',' + s.to.y.toFixed(2) + ')');
});

const MARGIN = 0.32;
const inF = q => q.x > MARGIN && q.x < W - MARGIN && q.y > MARGIN && q.y < SKY - 0.10;
const checks = [
  ['四段序列正确', okSeq],
  ['各段长度 ≥ 0.5', segs.every(s => s.len >= 0.5)],
  ['中间顶点在画面内', segs.slice(0, 3).every(s => inF(s.to))],
  ['天光端点横向在画面内', segs.length === 4 && segs[3].to.x > MARGIN && segs[3].to.x < W - MARGIN],
  ['金属球整体在画面内', inF({ x: M.x - R_METAL, y: M.y - R_METAL }) && inF({ x: M.x + R_METAL, y: M.y + R_METAL })],
  ['玻璃球整体在画面内', inF({ x: G.x - R_GLASS, y: G.y - R_GLASS }) && inF({ x: G.x + R_GLASS, y: G.y + R_GLASS })],
  ['两球不重叠', Math.hypot(G.x - M.x, G.y - M.y) > R_METAL + R_GLASS + 0.30],
  ['镜面入射角 ≤ 74°（非掠射）', THETA <= 74],
  ['玻璃入场入射角 ≥ 40°（偏折明显）', segs.length === 4 && segs[1].inc >= 40],
];
console.log('\n======== 判定 ========');
checks.forEach(([n, v]) => console.log('  ' + (v ? 'PASS' : 'FAIL') + '  ' + n));
console.log('\n总体：' + (checks.every(c => c[1]) ? '通过 ✅' : '未通过 ❌'));
