/* ==================================================================
   光栅化教学页 · 独立校验套件
   ------------------------------------------------------------------
   与页面自带的 verify()（①–⑬）是两回事：
   页面自检在页面内部跑，用的是页面自己的中间量；这一份在页面**外面**跑，
   凡是能自己重算的都不调用页面函数（射线与平面求交、位级 ULP、
   覆盖次数统计、w 的线性性 …），只在必要处借页面出口。
   两边独立算出的数对得上，才算真的对。

   断言分九组 A–I，每组都有失败即退出的能力。
   运行：node verify.raster.js
   ================================================================== */
const { load } = require('./_stub.js');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); }
  else { fail++; failures.push(name + (detail !== undefined ? '   [' + detail + ']' : '')); console.log('  ❌ ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }
function group(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 62 - t.length))); }

/* 独立实现：2 维叉积（= 两倍有向面积），**不调用**页面的 Efun */
function x2(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
/* 独立实现：位级 float32 ULP。
   参考值必须**锚定在 x 的 float32 舍入值**上：ULP 是「相邻两个可表示数」
   的间距，如果拿原 float64 值去减，差值里会混进「x 自己的舍入误差」，
   于是对 7.3 这种非二进制分数会得到 6.68e-7 这种根本不是 2 的幂的数。
   这个坑值得写下来 —— 第一版就是这样，把 eps32 误判成错的。 */
const _dv = new DataView(new ArrayBuffer(4));
function fl32(x) { _dv.setFloat32(0, x, false); return _dv.getFloat32(0, false); }
function nextUp32(x) {
  _dv.setFloat32(0, x, false);
  let bits = _dv.getUint32(0, false);
  if (bits === 0x7f800000) return x;
  bits = (bits + 1) >>> 0;
  _dv.setUint32(0, bits, false);
  return _dv.getFloat32(0, false);
}
function ulp32(x) { const f = fl32(x); return nextUp32(f) - f; }
function V(x, y, z) { return { x: x, y: y, z: (z === undefined ? 0.5 : z), w: 1, u: 0, nx: 0, ny: 0, nz: 1, r: 0.8, g: 0.8, b: 0.8 }; }

/* 确定性伪随机：避免每次跑出来的失败点都不一样 */
let seed = 20260923;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

/* 允许用命令行指定待校验的 HTML 路径（_neg.js 的变异测试要靠这个：
   它把改坏的源码写到系统临时目录，再让本脚本去跑那份副本）。 */
const S = load({ clientWidth: 720, clientHeight: 420, html: process.argv[2] || undefined });
if (S.topError) {
  console.log('❌ 页面顶层执行就抛异常，无法继续：\n' + S.topError.stack);
  process.exit(1);
}
const R = S.window.__rast;
if (!R) { console.log('❌ window.__rast 缺失'); process.exit(1); }
const SEC = R.sections;
console.log('页面加载完成：脚本 ' + S.code.split('\n').length + ' 行，' +
            'HTML id ' + S.ids.length + ' 个，画布 ' + S.ids.filter(i => /^cv-/.test(i)).length + ' 个');

/* ================================================================== */
group('A 数学内核（独立重算）');

/* A1 边缘函数 = 两倍有向面积 */
{
  let worst = 0;
  for (let k = 0; k < 200; k++) {
    const a = V(rnd() * 200 - 100, rnd() * 200 - 100);
    const b = V(rnd() * 200 - 100, rnd() * 200 - 100);
    const c = V(rnd() * 200 - 100, rnd() * 200 - 100);
    worst = Math.max(worst, Math.abs(R.Efun(a.x, a.y, b.x, b.y, c.x, c.y) - x2(a, b, c)));
  }
  ok('A1 边缘函数 E(a,b,p) = 2×有向面积（200 组随机）', worst < 1e-9, '最大偏差 ' + worst.toExponential(2));
}
/* A2 共线 => E = 0 */
{
  const a = V(3, 7), b = V(11, 19);
  const t = 0.37, p = V(3 + 8 * t, 7 + 12 * t);
  ok('A2 p 在直线 ab 上时 E(a,b,p) = 0', Math.abs(R.Efun(a.x, a.y, b.x, b.y, p.x, p.y)) < 1e-12);
}
/* A3 重心坐标能重建点；A4 未归一化权重之和 = area2 */
{
  const a = V(12, 9), b = V(180, 40), c = V(64, 150);
  let worstP = 0, worstS = 0;
  for (let k = 0; k < 300; k++) {
    /* 在三角形内取点：用三正数加权 */
    let u0 = rnd() + 1e-6, u1 = rnd() + 1e-6, u2 = rnd() + 1e-6;
    const s = u0 + u1 + u2; u0 /= s; u1 /= s; u2 /= s;
    const px = u0 * a.x + u1 * b.x + u2 * c.x;
    const py = u0 * a.y + u1 * b.y + u2 * c.y;
    const l = R.baryScreen(a, b, c, px, py);
    /* 用页面给出的权重重建 */
    const rx = l.l0 * a.x + l.l1 * b.x + l.l2 * c.x;
    const ry = l.l0 * a.y + l.l1 * b.y + l.l2 * c.y;
    worstP = Math.max(worstP, Math.hypot(rx - px, ry - py));
    worstS = Math.max(worstS, Math.abs(l.sum - R.area2(a, b, c)));
    /* 独立重算未归一化权重 = 对边 + 该点构成的三角形面积 */
    const w0 = x2(b, c, { x: px, y: py });
    if (Math.abs(l.w0 - w0) > 1e-6) worstS = 1e9;
  }
  ok('A3 λ0·v0 + λ1·v1 + λ2·v2 精确重建原点（300 组）', worstP < 1e-9, '最大偏差 ' + worstP.toExponential(2));
  ok('A4 未归一化权重之和 = area2(v0,v1,v2)，且 wᵢ 等于对边与 p 构成的两倍面积',
     worstS < 1e-9, '最大偏差 ' + worstS.toExponential(2));
}
/* A5 本节的核心不变量：不归一化 = 正确值 × Σ */
{
  const a = V(12, 9), b = V(180, 40), c = V(64, 150);
  a.u = 1.0; b.u = 0.0; c.u = 0.25;
  let worstAbs = 0, worstRel = 0, worstRatio = 0;
  for (let k = 0; k < 300; k++) {
    let u0 = rnd() + 1e-6, u1 = rnd() + 1e-6, u2 = rnd() + 1e-6;
    const s = u0 + u1 + u2; u0 /= s; u1 /= s; u2 /= s;
    const px = u0 * a.x + u1 * b.x + u2 * c.x, py = u0 * a.y + u1 * b.y + u2 * c.y;
    const l = R.baryScreen(a, b, c, px, py);
    const good = l.l0 * a.u + l.l1 * b.u + l.l2 * c.u;
    const bad = l.w0 * a.u + l.w1 * b.u + l.w2 * c.u;
    const ref = l.sum * good;
    worstAbs = Math.max(worstAbs, Math.abs(bad - ref));
    /* 绝对值本身是 ~2e4 量级（未归一化权重~两倍面积），必须按量级归一化再判 */
    worstRel = Math.max(worstRel, Math.abs(bad - ref) / Math.max(1e-300, Math.abs(ref)));
    worstRatio = Math.max(worstRatio, Math.abs(bad / good - l.sum) / Math.abs(l.sum));
  }
  ok('A5 不归一化插值 = 正确值 × Σ（相对误差在 8·eps 内，且比值恒为 Σ）',
     worstRel < 8 * Number.EPSILON && worstRatio < 8 * Number.EPSILON,
     '相对 ' + worstRel.toExponential(2) + ' · 比值相对 ' + worstRatio.toExponential(2) +
     ' · 绝对量级 ' + worstAbs.toExponential(2));
}
/* A6 归一化权重与绕序无关 */
{
  const a = V(12, 9), b = V(180, 40), c = V(64, 150);
  let worst = 0;
  for (let k = 0; k < 120; k++) {
    let u0 = rnd() + 1e-6, u1 = rnd() + 1e-6, u2 = rnd() + 1e-6;
    const s = u0 + u1 + u2; u0 /= s; u1 /= s; u2 /= s;
    const px = u0 * a.x + u1 * b.x + u2 * c.x, py = u0 * a.y + u1 * b.y + u2 * c.y;
    const l1 = R.baryScreen(a, b, c, px, py);
    const l2 = R.baryScreen(a, c, b, px, py);
    /* 交换 v1/v2 后，λ1 与 λ2 互换，λ0 不变 */
    worst = Math.max(worst, Math.abs(l1.l0 - l2.l0), Math.abs(l1.l1 - l2.l2), Math.abs(l1.l2 - l2.l1));
  }
  ok('A6 交换两个顶点 ⇒ 对应两个 λ 互换、λ0 不变（权重与绕序无关）', worst < 1e-12, worst.toExponential(2));
}
/* A7 perspWeights 的两条性质 */
{
  const a = V(12, 9), b = V(180, 40), c = V(64, 150);
  const l = R.baryScreen(a, b, c, 70, 60);
  const same = R.perspWeights(l, 3, 3, 3);
  ok('A7a 三个 w 相等时，透视校正权重 = 仿射权重（前向平行面退化为仿射）',
     near(same.l0, l.l0, 1e-12) && near(same.l1, l.l1, 1e-12) && near(same.l2, l.l2, 1e-12));
  let worst = 0;
  for (let k = 0; k < 200; k++) {
    const p = R.perspWeights(l, rnd() * 9 + 0.1, rnd() * 9 + 0.1, rnd() * 9 + 0.1);
    worst = Math.max(worst, Math.abs(p.l0 + p.l1 + p.l2 - 1));
  }
  ok('A7b 透视校正权重之和恒为 1（200 组随机 w）', worst < 1e-12, worst.toExponential(2));
}
/* A14 attrAt 的三个颜色通道必须各自独立取自 v0/v1/v2。
   曾经的写法把 r/g/b 都从 v2 取，结果红绿蓝三个通道全部来自同一个顶点，
   画面只剩下「一个颜色渐变」—— 看上去仍然像一次正常的插值。 */
{
  const mk = (r, g, b) => ({ x: 0, y: 0, u: 0, nx: 0, ny: 0, nz: 1, r: r, g: g, b: b });
  const v0 = mk(1, 0, 0), v1 = mk(0, 1, 0), v2 = mk(0, 0, 1);
  const at0 = R.attrAt(v0, v1, v2, { l0: 1, l1: 0, l2: 0 });
  const at1 = R.attrAt(v0, v1, v2, { l0: 0, l1: 1, l2: 0 });
  const at2 = R.attrAt(v0, v1, v2, { l0: 0, l1: 0, l2: 1 });
  ok('A14a 权重落在 v0 时，r/g/b 恰好是 v0 自己的 (1,0,0)',
     at0.r === 1 && at0.g === 0 && at0.b === 0, [at0.r, at0.g, at0.b].join(','));
  ok('A14b 权重落在 v1 时是 (0,1,0)', at1.r === 0 && at1.g === 1 && at1.b === 0, [at1.r, at1.g, at1.b].join(','));
  ok('A14c 权重落在 v2 时是 (0,0,1)', at2.r === 0 && at2.g === 0 && at2.b === 1, [at2.r, at2.g, at2.b].join(','));
  const mid = R.attrAt(v0, v1, v2, { l0: 1 / 3, l1: 1 / 3, l2: 1 / 3 });
  ok('A14d 三通道各自独立插值（等权时是 (1/3,1/3,1/3)，若三通道共用同一顶点则退化成单色）',
     near(mid.r, 1 / 3, 1e-12) && near(mid.g, 1 / 3, 1e-12) && near(mid.b, 1 / 3, 1e-12),
     [mid.r.toFixed(4), mid.g.toFixed(4), mid.b.toFixed(4)].join(','));
}
/* A8 透视校正插值 = 射线与平面求交得到的真值（完全独立） */
{
  const aspect = 1, fov = 58, tanH = Math.tan(fov * Math.PI / 360);
  const W3 = [V(0, 0, -2), V(4, 2, -4), V(-2, 3, -6)];
  /* 一个 3 维仿射属性 u(P) = 1.7·Px − 0.9·Py + 2.3·Pz + 0.4 */
  const uf = P => 1.7 * P.x - 0.9 * P.y + 2.3 * P.z + 0.4;
  /* 自己把 3D 投到 NDC，不经过 makeProj */
  const ndc = P => ({ x: (P.x / (-P.z)) / tanH / aspect, y: (P.y / (-P.z)) / tanH, w: -P.z });
  const sv = W3.map(P => {
    const s = ndc(P);
    return { x: s.x, y: s.y, w: s.w, u: uf(P) };
  });
  /* 平面法线用于射线求交 */
  const n = {
    x: (W3[1].y - W3[0].y) * (W3[2].z - W3[0].z) - (W3[1].z - W3[0].z) * (W3[2].y - W3[0].y),
    y: (W3[1].z - W3[0].z) * (W3[2].x - W3[0].x) - (W3[1].x - W3[0].x) * (W3[2].z - W3[0].z),
    z: (W3[1].x - W3[0].x) * (W3[2].y - W3[0].y) - (W3[1].y - W3[0].y) * (W3[2].x - W3[0].x),
  };
  const d0 = n.x * W3[0].x + n.y * W3[0].y + n.z * W3[0].z;
  let worstCorr = 0, minGap = Infinity, nTested = 0;
  for (let k = 0; k < 400; k++) {
    let u0 = rnd() + 1e-6, u1 = rnd() + 1e-6, u2 = rnd() + 1e-6;
    const s = u0 + u1 + u2; u0 /= s; u1 /= s; u2 /= s;
    const px = u0 * sv[0].x + u1 * sv[1].x + u2 * sv[2].x;
    const py = u0 * sv[0].y + u1 * sv[1].y + u2 * sv[2].y;
    /* 地面真值：从眼睛沿该方向射一条线，与三角面所在平面求交 */
    const dir = { x: px * tanH * aspect, y: py * tanH, z: -1 };
    const denom = n.x * dir.x + n.y * dir.y + n.z * dir.z;
    if (Math.abs(denom) < 1e-9) continue;
    const t = d0 / denom;
    if (!(t > 0)) continue;
    const Q = { x: t * dir.x, y: t * dir.y, z: t * dir.z };
    const uTrue = uf(Q);
    /* 页面路径：仿射权重 → 透视校正 → 取属性 */
    const l = R.baryScreen({ x: sv[0].x, y: sv[0].y }, { x: sv[1].x, y: sv[1].y }, { x: sv[2].x, y: sv[2].y }, px, py);
    const Pw = R.perspWeights(l, sv[0].w, sv[1].w, sv[2].w);
    const at = R.attrAt(
      { x: 0, y: 0, u: sv[0].u, nx: 0, ny: 0, nz: 1, r: 0, g: 0, b: 0 },
      { x: 0, y: 0, u: sv[1].u, nx: 0, ny: 0, nz: 1, r: 0, g: 0, b: 0 },
      { x: 0, y: 0, u: sv[2].u, nx: 0, ny: 0, nz: 1, r: 0, g: 0, b: 0 }, Pw);
    const uAff = l.l0 * sv[0].u + l.l1 * sv[1].u + l.l2 * sv[2].u;
    nTested++;
    worstCorr = Math.max(worstCorr, Math.abs(at.u - uTrue));
    minGap = Math.min(minGap, Math.abs(uAff - uTrue));
  }
  ok('A8a 透视校正插值 = 射线/平面求交的真值（' + nTested + ' 个屏幕点，独立求交）',
     worstCorr < 1e-9, '最大偏差 ' + worstCorr.toExponential(2));
  ok('A8b 同一批点上，不校正的仿射插值确实错（否则 A8a 是空转）',
     minGap > 1e-3, '最小误差 ' + minGap.toExponential(2));
}
/* A9 z01 是 1/w 的仿射函数 */
{
  let worst = 0;
  for (let k = 0; k < 300; k++) {
    const nn = 0.1 + rnd() * 3, ff = 20 + rnd() * 600;
    const w1 = nn + rnd() * (ff - nn) * 0.5, w2 = nn + rnd() * (ff - nn) * 0.5, w3 = nn + rnd() * (ff - nn) * 0.5;
    const z = w => R.z01of(w, nn, ff);
    const inv = w => 1 / w;
    /* 二阶差分为 0 ⇔ 仿射 */
    const d1 = (z(w2) - z(w1)) / (inv(w2) - inv(w1));
    const d2 = (z(w3) - z(w2)) / (inv(w3) - inv(w2));
    worst = Math.max(worst, Math.abs(d1 - d2) / Math.max(1e-12, Math.abs(d1)));
  }
  ok('A9 z01 对 1/w 的二阶差分恒为 0（即仿射）⇒ 可在屏幕空间线性插值',
     worst < 1e-9, '最大相对偏差 ' + worst.toExponential(2));
}
/* A10 z01 的端点与单调性 */
{
  const nn = 0.5, ff = 120;
  const zN = R.z01of(nn, nn, ff), zF = R.z01of(ff, nn, ff);
  let mono = true;
  for (let i = 1; i <= 200; i++) {
    const w1 = nn + (ff - nn) * (i - 1) / 200, w2 = nn + (ff - nn) * i / 200;
    if (!(R.z01of(w2, nn, ff) > R.z01of(w1, nn, ff))) mono = false;
  }
  ok('A10a z01(near) = 0、z01(far) = 1', near(zN, 0, 1e-12) && near(zF, 1, 1e-12), zN + ' / ' + zF);
  ok('A10b z01 随 w 单调递增（近处小、远处大）', mono);
}
/* A11 eps32 = 真正的 float32 ULP */
{
  let worst = 0, n = 0;
  const probes = [1, 1.5, 2, 3, 0.5, 0.1, 0.99999, 1.00001, 7.3, 123.456, 1e-3, 1e3, 0.3333333];
  for (let k = 0; k < 120; k++) probes.push(Math.pow(10, rnd() * 12 - 8));
  probes.forEach(function (x) {
    const a = R.eps32(x), b = ulp32(x);
    worst = Math.max(worst, Math.abs(a - b) / b); n++;
  });
  ok('A11 eps32(x) 与位级 nextafter 得到的 ULP 一致（' + n + ' 个采样点）',
     worst < 1e-6, '最大相对偏差 ' + worst.toExponential(2));
  ok('A11b eps32(1) = 2^-23 ≈ 1.1921e-7', near(R.eps32(1), Math.pow(2, -23), 1e-20),
     R.eps32(1).toExponential(4));
  ok('A11c eps32(0) 取最小规格化数 2^-149（不返回 0，否则精度曲线会出现 -Inf）',
     near(R.eps32(0), Math.pow(2, -149), 1e-60), R.eps32(0).toExponential(3));
}
/* A12/A13 可分辨距离 = d²/n；reverse-Z 把精度推到远端 */
{
  const D = SEC.depth;
  if (D && D.resAt) {
    const nn = 0.5, ff = 120;
    /* 页面自己写的判据就是对的：「可分辨的世界距离 = 表示间距 / |d(stored)/dd|」。
       这里独立地把三个量都重算一遍：
         stored  = (f/(f−n))·(1 − n/d)        —— 直接按定义
         表示间距 = 位级 ULP（上面那个 ulp32）
         |dz/dd| = 中心差分（用定义式做数值微分，不引用页面的 slope）
       注：曾经我把结论写成「分辨率 = d²/n」，那是错的（差 2^23 倍）。
           正确的经典形式要到「z01 落在 [0.5,1) 这一档」时才成立，
           也就是远场：分母上多一个 2^24，而近场因为 z01 指数更小而精细得多。 */
    let worst = 0, checked = 0;
    for (let k = 0; k < 120; k++) {
      const d = nn + rnd() * (ff - nn);
      const A = ff / (ff - nn);
      const stored = A * (1 - nn / d);
      const h = d * 1e-6;
      const dz = (A * (1 - nn / (d + h)) - A * (1 - nn / (d - h))) / (2 * h);
      const pred = ulp32(stored) / Math.abs(dz);
      const got = D.resAt(nn, ff, false, d);
      worst = Math.max(worst, Math.abs(got / pred - 1));
      checked++;
    }
    ok('A12 可分辨距离 = 表示间距 / |dz01/dd|（' + checked + ' 点，ULP 与导数都独立重算）',
       worst < 1e-5, '最大相对偏差 ' + worst.toExponential(2));
    /* 远场退化为经典形式 d²/(n·2²⁴)：z01 落在 [0.5,1) 时每档间距是 2⁻²⁴ */
    const dFar2 = ff * 0.98;
    const predClassic = dFar2 * dFar2 / (nn * Math.pow(2, 24));
    const gotFar = D.resAt(nn, ff, false, dFar2);
    ok('A12b 远场的可分辨距离 ≈ d²/(n·2²⁴)，即在 2 倍以内（经典深度精度公式）',
       gotFar / predClassic > 0.5 && gotFar / predClassic < 2,
       gotFar.toExponential(3) + ' vs ' + predClassic.toExponential(3));
    /* 单调：随距离单调变差（双曲线） */
    let mono = true, prev = -Infinity;
    for (let i = 1; i <= 200; i++) {
      const d = nn + (ff - nn) * i / 200;
      const r = D.resAt(nn, ff, false, d);
      if (!(r > prev)) mono = false;
      prev = r;
    }
    ok('A12c 可分辨距离随 d 单调变差（近端精细、远端崩溃）', mono);
    const dNear = nn * 1.02, dFar = ff * 0.98;
    const fwdFar = D.resAt(nn, ff, false, dFar), revFar = D.resAt(nn, ff, true, dFar);
    const fwdNear = D.resAt(nn, ff, false, dNear), revNear = D.resAt(nn, ff, true, dNear);
    ok('A13a 远场：reverse-Z 的可分辨距离远小于标准 Z（精度被拉平）',
       revFar < fwdFar * 1e-3, 'reverse ' + revFar.toExponential(2) + ' vs 标准 ' + fwdFar.toExponential(2));
    ok('A13b 近场：标准 Z 反而更精细（reverse-Z 把精度从近端挪走了）',
       revNear > fwdNear, 'reverse ' + revNear.toExponential(2) + ' vs 标准 ' + fwdNear.toExponential(2));
    ok('A13c reverse-Z 的精度沿距离的变化被压平（两端之比远小于标准 Z）',
       (revFar / revNear) < (fwdFar / fwdNear) * 1e-3,
       'reverse 比 ' + (revFar / revNear).toExponential(2) + ' · 标准比 ' + (fwdFar / fwdNear).toExponential(2));
  } else { ok('A12/A13 depth 模块缺失', false); }
}

/* ================================================================== */
group('B 覆盖范围收缩（full / bbox / scan 必须给出同一批像素）');
{
  const C = SEC.cover;
  if (C && C.stats) {
    const st = {};
    ['full', 'bbox', 'scan'].forEach(m => { C.setMode(m); st[m] = C.stats(); });
    ok('B1 三种策略的 covered 完全相同（像素集一致）',
       st.full.covered === st.bbox.covered && st.bbox.covered === st.scan.covered,
       'full ' + st.full.covered + ' · bbox ' + st.bbox.covered + ' · scan ' + st.scan.covered);
    ok('B2 full 的 tested = 整屏像素数', st.full.tested === st.full.total,
       st.full.tested + ' / ' + st.full.total);
    ok('B3 bbox 的 tested 显著小于整屏，且覆盖了扫描线',
       st.bbox.tested < st.full.tested && st.scan.tested <= st.bbox.tested,
       'full ' + st.full.tested + ' ≥ bbox ' + st.bbox.tested + ' ≥ scan ' + st.scan.tested);
    ok('B4 tested ≥ covered（不可能覆盖到没测过的像素）',
       st.scan.tested >= st.scan.covered, st.scan.tested + ' ≥ ' + st.scan.covered);
    C.setMode('bbox');
  } else { ok('B cover 模块缺失', false); }

  /* 独立重算：三种模式在任意三角形上都应给出同一覆盖集 */
  const box = { W: 64, H: 48 };
  function coverSet(mode, tri) {
    const fb = R.makeFB(box.W, box.H);
    R.fbClear(fb, 0, 0, 0, false);
    R.rasterTri(fb, tri[0], tri[1], tri[2], { mode, rule: 'tl', ztest: false, shade: function () { return [0, 0, 0]; } });
    const set = [];
    for (let i = 0; i < box.W * box.H; i++) if (fb.cover[i]) set.push(i);
    return set.join(',');
  }
  let worstMsg = null, cases = 0;
  for (let k = 0; k < 60; k++) {
    const tri = [V(rnd() * 70 - 3, rnd() * 54 - 3), V(rnd() * 70 - 3, rnd() * 54 - 3), V(rnd() * 70 - 3, rnd() * 54 - 3)];
    const a = coverSet('full', tri), b = coverSet('bbox', tri), c = coverSet('scan', tri);
    cases++;
    if (a !== b) { worstMsg = 'full ≠ bbox @case' + k; break; }
    if (b !== c) { worstMsg = 'bbox ≠ scan @case' + k; break; }
  }
  ok('B5 独立重算：60 个随机三角形上 full / bbox / scan 的覆盖集逐像素相同（含负坐标越界）',
     worstMsg === null, worstMsg || '60/60 通过');

  /* B6 绕序无关：内部判定靠 sgn 把 E 折正，交换顶点顺序后覆盖集必须一模一样。
     如果哪次改动把 sgn 去掉（以为「反正三角形都是逆时针」），
     所有顺时针三角形会整块消失 —— 而画面看上去只是「少画了几个面」。 */
  {
    let bad = null, cases = 0;
    for (let k = 0; k < 60; k++) {
      const a = V(rnd() * 70 - 3, rnd() * 54 - 3), b = V(rnd() * 70 - 3, rnd() * 54 - 3),
            c = V(rnd() * 70 - 3, rnd() * 54 - 3);
      const f1 = R.makeFB(box.W, box.H), f2 = R.makeFB(box.W, box.H);
      R.fbClear(f1, 0, 0, 0, false); R.fbClear(f2, 0, 0, 0, false);
      R.rasterTri(f1, a, b, c, { mode: 'bbox', rule: 'tl', ztest: false, shade: function () { return [0, 0, 0]; } });
      /* 交换 v1/v2 ⇒ 有向面积变号 ⇒ 必须靠 windingSign 折回来 */
      R.rasterTri(f2, a, c, b, { mode: 'bbox', rule: 'tl', ztest: false, shade: function () { return [0, 0, 0]; } });
      for (let i = 0; i < box.W * box.H; i++) {
        if (!!f1.cover[i] !== !!f2.cover[i]) { bad = 'case' + k + ' @px' + i; break; }
      }
      if (bad) break;
      cases++;
    }
    ok('B6 交换两个顶点（= 反转绕序）后覆盖集逐像素不变（' + cases + '/60）',
       bad === null, bad || '绕序无关 ✅');
  }

  /* B7 mask 语义：1 = 测过但没盖住，2 = 盖住了 */
  {
    const W = 48, H = 36;
    const fb = R.makeFB(W, H);
    R.fbClear(fb, 0, 0, 0, false);
    const mask = new Uint8Array(W * H);
    const mk2 = (dx, dy) => [V(8 + dx, 6 + dy), V(40 + dx, 10 + dy), V(20 + dx, 30 + dy)];
    /* 两个部分重叠的三角形：第二个只「测过」的像素必须留在 1，不能被改回 2 也不该被抹掉 */
    const t1 = mk2(0, 0), t2 = mk2(6, 4);
    [t1, t2].forEach(t => R.rasterTri(fb, t[0], t[1], t[2],
      { mode: 'bbox', rule: 'tl', mask, shade: function () { return [0.2, 0.2, 0.2]; } }));
    let coveredBad = 0, testedCount = 0, coveredCount = 0;
    for (let i = 0; i < W * H; i++) {
      if (fb.cover[i] > 0) { coveredCount++; if (mask[i] !== 2) coveredBad++; }
      if (mask[i] === 1) testedCount++;
    }
    ok('B7 mask = 2 恰好标在被覆盖像素上（' + coveredCount + ' 个）', coveredBad === 0, '错标 ' + coveredBad + ' 个');
    ok('B7b mask = 1 记录「测过但没盖住」的像素（' + testedCount + ' 个）—— 这是「收缩覆盖范围」的可视化依据',
       testedCount > 0);
  }
}

/* ================================================================== */
group('C 填充规则与水密性（§5 的核心结论）');
{
  const F = SEC.fill;
  if (F) {
    const W = F.W, H = F.H;
    function coverage(rule) {
      const fb = R.makeFB(W, H);
      R.fbClear(fb, 0, 0, 0, false);
      for (const g of F.GROUPS) for (const tri of g) {
        const v = [0, 1, 2].map(i => V(tri[i][0], tri[i][1]));
        R.rasterTri(fb, v[0], v[1], v[2], { mode: 'bbox', rule, ztest: false, shade: function () { return [0, 0, 0]; } });
      }
      return fb.cover;
    }
    const cTL = coverage('tl'), cAll = coverage('all'), cNone = coverage('none');
    let interior = 0, tlZero = 0, tlTwo = 0, allTwo = 0, noneZero = 0;
    for (let i = 0; i < W * H; i++) {
      if (cAll[i] === 0) continue;            /* 不在并集内 */
      interior++;
      if (cTL[i] === 0) tlZero++;
      if (cTL[i] >= 2) tlTwo++;
      if (cAll[i] >= 2) allTwo++;
      if (cNone[i] === 0) noneZero++;
    }
    ok('C1 top-left：并集内 ' + interior + ' 个像素，0 缝 / 0 重复 ⇒ 水密',
       tlZero === 0 && tlTwo === 0, '缝 ' + tlZero + ' 重复 ' + tlTwo);
    ok('C2 边界全收 ⇒ 出现重复覆盖（错误可被检出）', allTwo > 0, '重复 ' + allTwo);
    ok('C3 边界全弃 ⇒ 出现裂缝（错误可被检出）', noneZero > 0, '缝 ' + noneZero);
    ok('C4 裂缝数与重复数相等（同一批边界像素，只是归属反了）',
       noneZero === allTwo, noneZero + ' vs ' + allTwo);

    /* 独立推演：这批像素为什么正好是这些 —— 共享边是否穿过像素中心 */
    let onEdge = 0;
    F.GROUPS.forEach(function (g) {
      const t0 = g[0], t1 = g[1], key = p => p[0] + ',' + p[1];
      const sA = new Set(t0.map(key));
      const sh = t1.filter(p => sA.has(key(p)));
      if (sh.length !== 2) return;
      const [p, q] = sh, dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const cx = i + 0.5, cy = j + 0.5;
        if (Math.abs(dy * (cx - p[0]) - dx * (cy - p[1])) / len > 1e-9) continue;
        const t = ((cx - p[0]) * dx + (cy - p[1]) * dy) / (len * len);
        if (t >= 0 && t <= 1) onEdge++;
      }
    });
    ok('C5 由几何独立推出「穿过共享边像素中心」的像素数 = ' + onEdge + '，与裂缝/重复数一致',
       onEdge === noneZero && onEdge === allTwo, onEdge + ' / ' + noneZero + ' / ' + allTwo);
    /* 那批像素在三种规则下的取值分布 */
    const hist = r => { const h = {}; for (let i = 0; i < W * H; i++) if (cAll[i] > 0 && (cNone[i] === 0 || cAll[i] >= 2)) h[r[i]] = (h[r[i]] || 0) + 1; return h; };
    const hN = hist(cNone), hT = hist(cTL), hA = hist(cAll);
    ok('C6 同一批边界像素：全弃→全 0、top-left→全 1、全收→全 2（三态整齐）',
       hN['0'] === onEdge && hT['1'] === onEdge && hA['2'] === onEdge,
       JSON.stringify(hN) + ' ' + JSON.stringify(hT) + ' ' + JSON.stringify(hA));
    /* 页面自报要与独立重算一致 */
    F.setRule('tl'); const ps = F.stat();
    ok('C7 页面自报的 0/1/2 与独立重算一致',
       ps.zero === tlZero && ps.two === tlTwo, ps.zero + '/' + ps.one + '/' + ps.two);
  } else { ok('C fill 模块缺失', false); }

  /* top-left 的四个规范情形（自造，不依赖页面用例） */
  {
    const sgn = 1;
    /* 屏幕 y 朝下：水平且指向左 ⇒ top；非水平且指向下 ⇒ left */
    ok('C8a 水平边指向左 ⇒ 算 top（接受边界像素）',
       R.edgeIsTopLeft(sgn, { x: 20, y: 5 }, { x: 5, y: 5 }) === true);
    ok('C8b 水平边指向右 ⇒ 不算 top',
       R.edgeIsTopLeft(sgn, { x: 5, y: 5 }, { x: 20, y: 5 }) === false);
    ok('C8c 非水平边指向下 ⇒ 算 left',
       R.edgeIsTopLeft(sgn, { x: 5, y: 5 }, { x: 5, y: 20 }) === true);
    ok('C8d 非水平边指向上 ⇒ 不算 left',
       R.edgeIsTopLeft(sgn, { x: 5, y: 20 }, { x: 5, y: 5 }) === false);
    /* 关键：共享边在两侧三角形眼里恰好一个 top/left、一个不是 */
    const a = { x: 0, y: 0 }, b = { x: 10, y: 10 };
    const s0 = Math.sign(R.area2(a, b, { x: 5, y: 0 })), s1 = Math.sign(R.area2(b, a, { x: 5, y: 0 }));
    ok('C9 同一条共享边，绕序相反的两个三角形里恰好一方判为 top/left（不会两边都收/都弃）',
       s0 === -s1 && R.edgeIsTopLeft(s0, a, b) !== R.edgeIsTopLeft(s1, a, b),
       'sgn ' + s0 + '/' + s1);
  }
}

/* ================================================================== */
group('D 深度缓冲');
{
  /* D1 深度测试保留最近的片元（自造两个重叠三角形） */
  {
    const fb = R.makeFB(32, 32);
    R.fbClear(fb, 0, 0, 0, false);
    const mk = (x0, y0, z, rr) => {
      const a = V(x0, y0, z), b = V(x0 + 20, y0, z), c = V(x0, y0 + 20, z);
      [a, b, c].forEach(v => { v.r = rr; });
      return [a, b, c];
    };
    const nearTri = mk(4, 4, 0.3, 1.0), farTri = mk(4, 4, 0.7, 0.0);   /* 不要叫 near/far：会遮住上面的 near() 断言助手 */
    /* 先画远的再画近的 —— 无论顺序，结果都应是近的 z */
    R.rasterTri(fb, farTri[0], farTri[1], farTri[2], { mode: 'bbox', rule: 'tl', shade: function (px, py, P, at) { return [at.r, at.g, at.b]; } });
    R.rasterTri(fb, nearTri[0], nearTri[1], nearTri[2], { mode: 'bbox', rule: 'tl', shade: function (px, py, P, at) { return [at.r, at.g, at.b]; } });
    const idx = 10 * 32 + 10;
    ok('D1 先远后近绘制 ⇒ 缓冲里留下近的那个 z，颜色也是近的',
       near(fb.z[idx], 0.3, 1e-6) && fb.col[idx * 3] > 0.9, 'z=' + fb.z[idx].toFixed(4));
    /* 反过来画，结果一样（深度测试与顺序无关） */
    const fb2 = R.makeFB(32, 32);
    R.fbClear(fb2, 0, 0, 0, false);
    R.rasterTri(fb2, nearTri[0], nearTri[1], nearTri[2], { mode: 'bbox', rule: 'tl', shade: function (px, py, P, at) { return [at.r, at.g, at.b]; } });
    R.rasterTri(fb2, farTri[0], farTri[1], farTri[2], { mode: 'bbox', rule: 'tl', shade: function (px, py, P, at) { return [at.r, at.g, at.b]; } });
    ok('D2 交换绘制顺序，结果完全相同（ztest 与顺序无关）',
       near(fb2.z[idx], 0.3, 1e-6) && near(fb2.col[idx * 3], fb.col[idx * 3], 1e-9));
    /* 关掉深度测试 ⇒ 后画的（远的）会盖住 */
    const fb3 = R.makeFB(32, 32);
    R.fbClear(fb3, 0, 0, 0, false);
    R.rasterTri(fb3, nearTri[0], nearTri[1], nearTri[2], { mode: 'bbox', rule: 'tl', ztest: false, shade: function (px, py, P, at) { return [at.r, at.g, at.b]; } });
    R.rasterTri(fb3, farTri[0], farTri[1], farTri[2], { mode: 'bbox', rule: 'tl', ztest: false, shade: function (px, py, P, at) { return [at.r, at.g, at.b]; } });
    ok('D3 关闭深度测试 ⇒ 远的覆盖近的（说明 D1 的「近者胜」确实来自测试）',
       near(fb3.z[idx], 0.7, 1e-6) && fb3.col[idx * 3] < 0.1, 'z=' + fb3.z[idx].toFixed(4));
  }
  /* D4/D5 forward vs reverse：覆盖集相同、存储值互补 */
  {
    const D = SEC.depth;
    if (D && D.getScene) {
      const tris = D.getScene();
      const W = D.W, H = D.H;
      function render(reverse) {
        const fb = R.makeFB(W, H);
        R.fbClear(fb, 0, 0, 0, reverse);
        tris.forEach(t => R.rasterTri(fb, t[0], t[1], t[2],
          { mode: 'bbox', rule: 'tl', reverse, ztest: true, shade: function () { return [0.2, 0.3, 0.4]; } }));
        return fb;
      }
      const fwd = render(false), rev = render(true);
      let covSame = true, compOk = true, worst = 0, written = 0;
      for (let i = 0; i < W * H; i++) {
        if ((fwd.cover[i] > 0) !== (rev.cover[i] > 0)) { covSame = false; break; }
        if (fwd.cover[i] > 0) {
          written++;
          const d = Math.abs(rev.z[i] - (1 - fwd.z[i]));
          worst = Math.max(worst, d);
          if (d > 1e-7) compOk = false;
        }
      }
      ok('D4 reverse-Z 与标准 Z 的覆盖像素集完全相同（' + written + ' 个已写像素）', covSame);
      ok('D5 reverse-Z 存的就是 1 − z01（逐像素互补）', compOk, '最大偏差 ' + worst.toExponential(2));
      /* 场景里应当确实有多层重叠，否则 D4/D5 太弱 */
      let layered = 0;
      for (let i = 0; i < W * H; i++) if (fwd.cover[i] > 1) layered++;
      ok('D6 场景里确实有重叠（被写 >1 次的像素 ' + layered + ' 个），D4/D5 不是空转', layered > 0);

      /* D7 开启「对深度做透视校正」这个错误开关，画面必须变（否则开关是死的） */
      const bad = R.makeFB(W, H);
      R.fbClear(bad, 0, 0, 0, false);
      tris.forEach(t => R.rasterTri(bad, t[0], t[1], t[2],
        { mode: 'bbox', rule: 'tl', ztest: true, depthPersp: true, shade: function () { return [0.2, 0.3, 0.4]; } }));
      let diff = 0;
      for (let i = 0; i < W * H; i++) if (Math.abs(bad.z[i] - fwd.z[i]) > 1e-9) diff++;
      ok('D7 把深度也做透视校正（错误做法）会改变 ' + diff + ' 个像素的深度值 ⇒ 开关有效',
         diff > 0);
    } else { ok('D getScene 缺失', false); }
  }

  /* D8 深度的插值方式必须与 §6 的结论一致。
     §6 说「z01 是 1/w 的仿射函数 ⇒ 屏幕空间线性插值就是对的，再校正一次反而错」。
     这里把两种值都独立算出来逐像素比对：
       zLin = λ0·z0 + λ1·z1 + λ2·z2                       （屏幕空间线性）
       zPer = λ′0·z0 + λ′1·z1 + λ′2·z2，λ′ 为透视校正权重
     并断言「默认走 zLin」、「depthPersp 走 zPer」、「两者确实不同」。
     缺了这条，把默认改成透视校正也检不出来 —— 因为 D1 用的两个三角形
     三个顶点 z 相同，对常量做任何校正都是恒等变换。 */
  {
    const NN = 0.5, FF = 120, W2 = 64, H2 = 64;
    const mk2 = (x, y, w) => { const v = V(x, y); v.w = w; v.z = R.z01of(w, NN, FF); return v; };
    const v0 = mk2(10, 10, 1), v1 = mk2(70, 20, 4), v2 = mk2(30, 60, 2);
    const fbA = R.makeFB(W2, H2), fbB = R.makeFB(W2, H2);
    R.fbClear(fbA, 0, 0, 0, false); R.fbClear(fbB, 0, 0, 0, false);
    const base = { mode: 'bbox', rule: 'tl', ztest: false, shade: function () { return [0, 0, 0]; } };
    R.rasterTri(fbA, v0, v1, v2, base);
    R.rasterTri(fbB, v0, v1, v2, Object.assign({}, base, { depthPersp: true }));
    let worstLin = 0, worstPer = 0, maxDiff = 0, np = 0;
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const i = y * W2 + x;
      if (fbA.cover[i] === 0) continue;
      const l = R.baryScreen(v0, v1, v2, x + 0.5, y + 0.5);
      const zLin = l.l0 * v0.z + l.l1 * v1.z + l.l2 * v2.z;
      const q = R.perspWeights(l, v0.w, v1.w, v2.w);
      const zPer = q.l0 * v0.z + q.l1 * v1.z + q.l2 * v2.z;
      worstLin = Math.max(worstLin, Math.abs(fbA.z[i] - zLin));
      worstPer = Math.max(worstPer, Math.abs(fbB.z[i] - zPer));
      maxDiff = Math.max(maxDiff, Math.abs(zLin - zPer));
      np++;
    }
    ok('D8a 默认：深度 = 屏幕空间线性插值的 z01（' + np + ' 个像素，独立算 λ）',
       np > 100 && worstLin < 1e-6, '最大偏差 ' + worstLin.toExponential(2) + '（约占 float32 一个 ULP）');
    ok('D8b depthPersp 开关下：深度 = 透视校正插值（那个错误做法）',
       worstPer < 1e-6, '最大偏差 ' + worstPer.toExponential(2));
    /* 注意容差：缓冲是 Float32Array，写进去会被舍入到 2^-24 量级，
       所以这里不可能比「一个 ULP」更严 —— 1e-9 会把正确的实现判成错的。 */
    ok('D8c 两种插值确实不同（否则 D8a/D8b 都是空转；这也说明顶点 w 真的不相等）',
       maxDiff > 1e-3, '最大差 ' + maxDiff.toExponential(2));
  }

  /* D9 fbClear 必须把 col / z / cover 三块都复位。
     只测「清空之后是空的」是空转：新建的缓冲本来就是干净的，
     而 cover 是 Uint16Array、初值天然为 0 —— 漏清也测不出来。
     所以这里**手工弄脏**三块再清，逐字段核对。 */
  {
    const N = 24 * 24;
    const fb = R.makeFB(24, 24);
    /* 刻意不走 fbClear 弄脏：直接写三个字段，模拟「上一帧留下的状态」 */
    for (let i = 0; i < N; i++) {
      fb.col[i * 3] = 0.9; fb.col[i * 3 + 1] = 0.8; fb.col[i * 3 + 2] = 0.7;
      fb.z[i] = 0.5; fb.cover[i] = 3;
    }
    let dirty = 0;
    for (let i = 0; i < N; i++) if (fb.cover[i] !== 0 && fb.z[i] !== 0 && fb.col[i * 3] !== 0) dirty++;
    ok('D9a 前置：三块缓冲都已弄脏（' + dirty + ' / ' + N + ' 个像素）', dirty === N);

    R.fbClear(fb, 0.1, 0.2, 0.3, false);
    let covBad = 0, zBad = 0, colBad = 0;
    for (let i = 0; i < N; i++) {
      if (fb.cover[i] !== 0) covBad++;
      if (Math.abs(fb.z[i] - 1) > 1e-7) zBad++;
      if (Math.abs(fb.col[i * 3] - 0.1) > 1e-7 ||
          Math.abs(fb.col[i * 3 + 1] - 0.2) > 1e-7 ||
          Math.abs(fb.col[i * 3 + 2] - 0.3) > 1e-7) colBad++;
    }
    /* 0.1/0.2/0.3 存进 Float32Array 会舍入到 1e-9 量级，所以容差不能取 1e-9 */
    ok('D9b fbClear 把 cover 清零（残留 ' + covBad + ' 个）', covBad === 0);
    ok('D9c fbClear 把 z 复位到 1（正 Z 情形）（异常 ' + zBad + ' 个）', zBad === 0);
    ok('D9d fbClear 把颜色复位到背景（异常 ' + colBad + ' 个）', colBad === 0);
    const fr = R.makeFB(8, 8);
    for (let i = 0; i < 64; i++) fr.z[i] = 0.5;
    R.fbClear(fr, 0, 0, 0, true);
    let revBad = 0;
    for (let i = 0; i < 64; i++) if (fr.z[i] !== 0) revBad++;
    ok('D9e reverse 时 z 的初值是 0（若固定填 1，第一帧所有片元都被判成「更远」而丢弃）',
       revBad === 0, '异常 ' + revBad);
  }
}

/* ================================================================== */
group('E 透视校正：屏幕空间里线性的是什么');
{
  const P = SEC.persp;
  if (P) {
    /* v3 没有从 __rast 导出 —— 这里就是普通对象，别借用页面内部构造器 */
    const rows = P.wProfile({ x: 0, y: 1.55, z: -0.2 }, -0.28);
    ok('E0 wProfile 采到 ' + rows.length + ' 行地面采样', rows.length > 10);
    const rInv = P.linResidual(rows.map(r => r.inv));
    const rW = P.linResidual(rows.map(r => r.w));
    ok('E1 1/w 在屏幕空间是线性的（残差接近 0）', rInv < 1e-9, rInv.toExponential(2));
    ok('E2 w 本身在屏幕空间明显非线性（这就是不能用 w 插值的原因）', rW > 1e-3, rW.toExponential(2));
    ok('E3 两者的比值至少 1e6 倍（差别悬殊，不是巧合）', rW / Math.max(1e-30, rInv) > 1e6,
       '×' + (rW / Math.max(1e-30, rInv)).toExponential(1));
    /* linResidual 必须能报出「不线性」—— 否则 E1 可能是恒 0 的空转函数 */
    const nl = [];
    for (let i = 0; i < 40; i++) nl.push(i * i * 0.01);
    ok('E4 linResidual 对二次序列返回显著非 0（证明 E1 的「接近 0」不是恒真）',
       P.linResidual(nl) > 1e-3, P.linResidual(nl).toExponential(2));
    const linNoise = [];
    for (let i = 0; i < 40; i++) linNoise.push(3 + 0.5 * i + (i === 20 ? 0.01 : 0));
    ok('E5 linResidual 能察觉出直线上的一个 0.01 扰动', P.linResidual(linNoise) > 1e-5,
       P.linResidual(linNoise).toExponential(2));
    /* 阈值：残差应该约等于 noise/scale */
    ok('E6 残差量级与扰动/量级一致', near(P.linResidual(linNoise), 0.01 / (3 + 0.5 * 39), 2e-3),
       P.linResidual(linNoise).toExponential(2) + ' vs ' + (0.01 / (3 + 0.5 * 39)).toExponential(2));
    /* 纹理：persp 与 affine 两张图必须有可见差别 */
    const t = P.TEX();
    ok('E7 纹理密度参数可从出口读到（' + t + '）', t >= 4);
  } else { ok('E persp 模块缺失', false); }
}

/* ================================================================== */
group('F 背面剔除：判据必须活在与绕序同一个空间里');
{
  const C = SEC.cull;
  if (C && C.countFront) {
    const N = C.N || 12;
    /* 屏幕空间绕序（面积符号）与 frontFace 组合，两种绕序应当互补 */
    const ccw = C.countFront('screen', 'ccw'), cw = C.countFront('screen', 'cw');
    ok('F1 screen 模式下 ccw 与 cw 的「正面」数互补 = 总面数 ' + N,
       ccw + cw === N, ccw + ' + ' + cw + ' = ' + (ccw + cw));
    ok('F2 关闭剔除 ⇒ 全部面都算正面', C.countFront('off', 'ccw') === N, C.countFront('off', 'ccw'));
    ok('F3 被剔掉的面确实非空（否则整节没有内容可看）',
       C.countFront('screen', 'ccw') < N, C.countFront('screen', 'ccw') + ' < ' + N);
    /* F4 object 模式的判据与屏幕坐标完全无关 —— 这就是它错的原因 */
    const T = C.build().tris;
    let invariant = true, nChecked = 0;
    T.forEach(function (t) {
      const v = t.v;
      const scr = v.map(p => Object.assign({}, p, { x: p.x * 3.7 + 91, y: -p.y * 2.1 - 13 }));
      if (C.isFront(v, 'object', 'ccw') !== C.isFront(scr, 'object', 'ccw')) invariant = false;
      /* 而 screen 模式必须跟着屏幕坐标变（只要做一次非仿射的扰动） */
      nChecked++;
    });
    ok('F4 object 模式的正面判据对屏幕坐标完全免疫（' + nChecked + ' 个面）——模型怎么转它都不变，所以是错的',
       invariant);
    /* screen 模式对屏幕坐标敏感：把某个面镜像之后判定必须翻转 */
    let flips = 0;
    T.forEach(function (t) {
      const v = t.v;
      const mir = [v[0], v[2], v[1]];
      if (C.isFront(v, 'screen', 'ccw') !== C.isFront(mir, 'screen', 'ccw')) flips++;
    });
    ok('F5 screen 模式：交换两个顶点（等价于镜像绕序）后判定翻转（' + flips + '/' + T.length + ' 个面）',
       flips === T.length, flips + '/' + T.length);
    /* F6 顶面绕序写反这个陷阱：打开后，开剔除会少掉恰好 2 个面 */
    const before = C.countFront('screen', 'ccw');
    S.fire('cb-wind-bad', 'change', {}, true);
    const after = C.countFront('screen', 'ccw');
    S.fire('cb-wind-bad', 'change', {}, false);
    const back = C.countFront('screen', 'ccw');
    ok('F6 把顶面两个三角形的绕序写反 ⇒ 开剔除时正面数减少（' + before + ' → ' + after + '）',
       after !== before, 'Δ=' + (after - before));
    ok('F6b 关闭该开关后正面数恢复（开关可逆，不是一次性破坏）', back === before, back + ' vs ' + before);
  } else { ok('F cull 模块缺失', false); }
}

/* ================================================================== */
group('G 着色频率：成本结构');
{
  const Sh = SEC.shade;
  if (Sh && Sh.setState) {
    Sh.setState({ mode: 'gouraud', spin: false });
    const g = Sh.stat();
    Sh.setState({ mode: 'phong', spin: false });
    const p = Sh.stat();
    Sh.setState({ mode: 'flat', spin: false });
    const fl = Sh.stat();
    ok('G1 Gouraud 的片元着色调用恒为 0（片元阶段只插值顶点颜色）', g.fs === 0, g.fs);
    ok('G2 Phong 的片元着色调用 = 被覆盖像素数', p.fs === p.px && p.px > 0, p.fs + ' vs ' + p.px);
    ok('G3 Flat 也是逐片元着色（面法线已烘进顶点，但着色仍发生在片元阶段）',
       fl.fs === fl.px && fl.px > 0, fl.fs + ' vs ' + fl.px);
    ok('G4 三种模式的被覆盖像素数一致（几何没变，只是着色位置不同）',
       g.px === p.px && p.px === fl.px, g.px + ' / ' + p.px + ' / ' + fl.px);
    ok('G5 插值后法线长度严格小于 1（离开顶点后 |lerp(N0,N1)| = cos(θ/2) < 1）',
       p.nMax < 1 + 1e-9 && p.nMin < 0.9999, p.nMin.toFixed(6) + ' … ' + p.nMax.toFixed(6));
    ok('G5b Flat 的面法线是常量 ⇒ 插值后长度恰好为 1（所以 flat 不需要重新归一化）',
       near(fl.nMax, 1, 1e-6) && near(fl.nMin, 1, 1e-6), fl.nMin.toFixed(6) + ' … ' + fl.nMax.toFixed(6));
    /* G6 不归一化的错误开关必须真的改变画面 */
    Sh.setState({ mode: 'phong', noNorm: false, spin: false });
    const okN = Sh.stat();
    Sh.setState({ mode: 'phong', noNorm: true, spin: false });
    const badN = Sh.stat();
    Sh.setState({ mode: 'phong', noNorm: false, spin: false });
    ok('G6 关掉归一化后高光峰值与高光像素数都变了（错误开关有效）',
       Math.abs(badN.peak - okN.peak) > 1e-6 || badN.hl !== okN.hl,
       '峰值 ' + okN.peak.toFixed(4) + ' → ' + badN.peak.toFixed(4) +
       ' · 高光像素 ' + okN.hl + ' → ' + badN.hl);
    /* G7 高光像素数必须为正，否则「高光被洗掉」这个观察无从谈起 */
    ok('G7 正常情况下存在高光像素（' + okN.hl + ' 个）', okN.hl > 0);
  } else { ok('G shade 模块缺失', false); }
}

/* ================================================================== */
group('H MSAA / SSAA 的成本结构');
{
  const M = SEC.msaa;
  if (M && M.setState) {
    const snap = (N, ss) => { M.setState({ N: N, ssaaLike: ss }); return M.stat(); };
    const m4 = snap(4, false), m8 = snap(8, false), s4 = snap(4, true), s8 = snap(8, true);
    M.setState({ N: 4, ssaaLike: false });
    const rgMS = m8.shadeCount / m4.shadeCount, rgCV = m8.coveredSamples / m4.coveredSamples;
    const rgSS = s8.ssaaCount / s4.ssaaCount;
    ok('H1 覆盖样本数随 N 严格线性（N 翻倍 ⇒ 样本翻倍）', rgCV > 1.9 && rgCV < 2.1, '×' + rgCV.toFixed(4));
    ok('H2 MSAA 的着色次数几乎不随 N 变（只多出「新出现的部分覆盖像素」）',
       rgMS > 1 && rgMS < 1.10, '×' + rgMS.toFixed(4));
    ok('H3 SSAA 的着色次数随 N 线性', rgSS > 1.9 && rgSS < 2.1, '×' + rgSS.toFixed(4));
    ok('H4 SSAA 的成本增长远快于 MSAA（这才是 MSAA 存在的理由）',
       rgSS > rgMS * 1.5, 'SSAA ×' + rgSS.toFixed(3) + ' vs MSAA ×' + rgMS.toFixed(3));
    ok('H5 SSAA 的着色次数 = 被覆盖样本数（逐样本各着一次）',
       s4.ssaaCount === s4.coveredSamples && s8.ssaaCount === s8.coveredSamples,
       s4.ssaaCount + '/' + s4.coveredSamples + ' · ' + s8.ssaaCount + '/' + s8.coveredSamples);
    ok('H6 同一 N=4 下 SSAA 的成本显著高于 MSAA',
       s4.ssaaCount > m4.shadeCount * 2, s4.ssaaCount + ' vs ' + m4.shadeCount);
    /* H7 逐样本掩码与计数自洽 */
    let maskOk = true, maskSum = 0;
    const N = m4.N, NP = M.W * M.H;
    for (let i = 0; i < NP; i++) {
      let cnt = 0;
      for (let s = 0; s < N; s++) if (m4.covSample[i * N + s]) cnt++;
      maskSum += cnt;
      if (cnt !== m4.covS[i]) { maskOk = false; break; }
    }
    ok('H7 逐样本掩码之和 = 每像素覆盖计数（放大窗画的圆点与数字对得上）',
       maskOk && maskSum === m4.coveredSamples, maskSum + ' vs ' + m4.coveredSamples);
    ok('H8 存在部分覆盖像素（否则抗锯齿无内容可讲）', m4.partial > 0, m4.partial + ' 个');
    /* H9 表外的 N 必须被归一化，而不是把整个模块搞崩 */
    let crashed = false, normed = null;
    try { const bad = snap(7, false); normed = bad.N; } catch (e) { crashed = true; }
    ok('H9 传入 MSAA_POS 表外的 N 时被归一化到 4，而不是抛异常',
       !crashed && normed === 4, crashed ? '抛异常' : ('N=' + normed));
    M.setState({ N: 4, ssaaLike: false });
    /* H10 MSAA 的像素着色数应当接近「被覆盖像素数」，而不是被覆盖样本数 */
    ok('H10 MSAA 的着色次数与被覆盖像素同量级，远小于被覆盖样本数',
       m4.shadeCount < m4.coveredSamples, m4.shadeCount + ' < ' + m4.coveredSamples);

    /* H11 抗锯齿必须真的发生 —— 直接量画面，而不是量计数器。
       判据：把每个像素的 N 个样本色平均（就是页面 resolve 的做法），
       数一数整张图里出现了多少种不同颜色。
       N=1 时边缘非黑即白（两色），N 变大后边缘会出现「一定比例的混合」，
       颜色种类必然增加。只断言计数的话，就算 resolve 写错了、
       子采样位置全都重叠在同一个点，计数照样好看。 */
    function distinctColors(stat) {
      const NP = M.W * M.H, n = stat.N;
      const seen = Object.create(null);
      for (let i = 0; i < NP; i++) {
        let r = 0, g = 0, b = 0;
        for (let s = 0; s < n; s++) {
          const q = (i * n + s) * 3;
          r += stat.cS[q]; g += stat.cS[q + 1]; b += stat.cS[q + 2];
        }
        /* 量化到 1/512，避免浮点末位噪声把「同一种颜色」算成很多种 */
        const key = Math.round(r / n * 512) + ',' + Math.round(g / n * 512) + ',' + Math.round(b / n * 512);
        seen[key] = 1;
      }
      return Object.keys(seen).length;
    }
    const c1 = distinctColors(snap(1, false));
    const c4 = distinctColors(m4);
    const c8 = distinctColors(m8);
    M.setState({ N: 4, ssaaLike: false });
    ok('H11 抗锯齿真的发生了：画面颜色种类随 N 增加（N=1 → ' + c1 + '，N=4 → ' + c4 + '，N=8 → ' + c8 + '）',
       c4 > c1 && c8 > c4, '三类计数呈单调增');
  } else { ok('H msaa 模块缺失', false); }
}

/* ================================================================== */
group('I 相机与投影（最容易整体翻面的地方）');
{
  const Pr = SEC.proj;
  if (Pr && Pr.tris) {
    const view = R.makeView({ x: 0, y: 0, z: 0 }, 0, -0.06);
    const wv = Pr.tris().map(view);
    ok('I1 三个顶点的 w = −z_view 全部为正（写成 +d 就会全为负、画面翻面）',
       wv.every(p => -p.z > 0), wv.map(p => (-p.z).toFixed(2)).join(' / '));
    const pr = R.makeProj(128, 90, 62, 0.5, 200);
    const sv = wv.map(pr);
    ok('I2 投影结果全部有限', sv.every(s => isFinite(s.x) && isFinite(s.y) && isFinite(s.w)));
    const inBox = sv.every(s => s.x >= -2 && s.x <= 130 && s.y >= -2 && s.y <= 92);
    ok('I3 投影落在 NDC 画布内（越界说明相机或投影符号错了）', inBox,
       sv.map(s => '(' + s.x.toFixed(1) + ',' + s.y.toFixed(1) + ')').join(' '));
    ok('I4 z01 ∈ (0,1) 且 w 落在 near..far 之间',
       sv.every(s => s.z > 0 && s.z < 1) && sv.every(s => s.w > 0.5 && s.w < 200),
       sv.map(s => s.z.toFixed(3)).join(' / '));

    /* I5 面积收缩：把三角形沿视线推远一倍，屏幕面积应缩小约 4 倍（1/w²） */
    const triAt = d => {
      const f = R.makeView({ x: 0, y: 0, z: 0 }, 0, 0);
      const a = f({ x: -1, y: -1, z: -d }), b = f({ x: 1, y: -1, z: -d }), c = f({ x: 0, y: 1, z: -d });
      const p = R.makeProj(128, 90, 62, 0.5, 9000);
      return [a, b, c].map(p);
    };
    const s1 = triAt(5), s2 = triAt(10);
    const A1 = Math.abs(R.area2(s1[0], s1[1], s1[2])) / 2, A2 = Math.abs(R.area2(s2[0], s2[1], s2[2])) / 2;
    ok('I5 距离翻倍 ⇒ 屏幕面积变为 1/4（透视投影的 1/w² 缩放）',
       near(A1 / A2, 4, 0.02), '比 ' + (A1 / A2).toFixed(4));
    /* I6 屏幕 y 朝下：世界 +y 必须映射到更小的屏幕 y */
    const up = R.makeProj(128, 90, 62, 0.5, 200)(view({ x: 0, y: 1, z: -5 }));
    const dn = R.makeProj(128, 90, 62, 0.5, 200)(view({ x: 0, y: -1, z: -5 }));
    ok('I6 世界 +y（上）映射到更小的屏幕 y（屏幕 y 朝下）', up.y < dn.y,
       up.y.toFixed(2) + ' < ' + dn.y.toFixed(2));

    /* I7 §2 左图用的斜投影：上就是上、前方往右 —— 用页面里那条式子重算并断言方向 */
    const s3 = 1;
    const X3 = p => p.x * s3 - p.z * s3 * 0.55, Y3 = p => -p.y * s3;
    ok('I7 §2 左图斜投影：+y 画出后更靠上（若 Y3 带正号就上下镜像了）',
       Y3({ x: 0, y: 1, z: -7 }) < Y3({ x: 0, y: -1, z: -7 }),
       Y3({ x: 0, y: 1, z: -7 }).toFixed(3) + ' < ' + Y3({ x: 0, y: -1, z: -7 }).toFixed(3));
    ok('I7b §2 左图斜投影：越靠前（z 越负）越往右',
       X3({ x: 0, y: 0, z: -8 }) > X3({ x: 0, y: 0, z: -4 }),
       X3({ x: 0, y: 0, z: -8 }).toFixed(3) + ' > ' + X3({ x: 0, y: 0, z: -4 }).toFixed(3));
    /* I8 三个顶点用页面里的斜投影是否都落在画布内 */
    let inside = 0;
    wv.forEach(p => {
      const px = 234 + X3(p), py = 222 + Y3(p);
      if (px >= 0 && px <= 480 && py >= 0 && py <= 300) inside++;
    });
    ok('I8 用 §2 的斜投影，三个顶点都落在 480×300 画布内（' + inside + '/3）', inside === 3);
  } else { ok('I proj 模块缺失或未导出 tris', false); }
}

/* ================================================================== */
group('J §6 的场景必须是良定的：共面重叠会被浮点舍入分胜负');
{
  /* 这一组是补一个真实漏掉的缺陷。
     §6 的场景原本让四块板全部躺在 y=0 上（互相重叠），于是重叠处的深度**完全相等**，
     「谁赢」就由 float 舍入决定。实测：标准 Z 与反 Z 会把同一处平局判给不同的板，
     两幅画面 3637 / 17600 个像素颜色不同（橙 vs 青，肉眼一眼可见）——
     而 §6 的结论恰恰是「反 Z 只改精度不改结果」。画面上看起来是反的。

     为什么原来的 D4/D5 没发现：它们的 shade 返回**常量色** [0.2,0.3,0.4]。
     赢家换了，颜色还是一样的，只有 cover 和 z 会动，而 cover 确实相同、z 只差舍入。
     所以断言看起来在验「反 Z 等价」，实际上根本没在验「谁赢了」。
     教训：用常量色当探针验不了任何与「选谁」有关的性质 —— 这里全部改成顶点色。 */
  const D = SEC.depth;
  if (D && D.getScene) {
    const W = D.W, H = D.H, NP = W * H;
    const tris = D.getScene();

    function render(reverse) {
      const fb = R.makeFB(W, H);
      R.fbClear(fb, 0, 0, 0, reverse);
      tris.forEach(t => R.rasterTri(fb, t[0], t[1], t[2], {
        mode: 'bbox', rule: 'tl', reverse: reverse, ztest: true,
        shade: function (px, py, P, at) { return [at.r, at.g, at.b]; },
      }));
      return fb;
    }
    const fwd = render(false), rev = render(true);

    let colBad = 0, covBad = 0, zBad = 0;
    for (let i = 0; i < NP; i++) {
      if (fwd.col[i * 3] !== rev.col[i * 3] ||
          fwd.col[i * 3 + 1] !== rev.col[i * 3 + 1] ||
          fwd.col[i * 3 + 2] !== rev.col[i * 3 + 2]) colBad++;
      if ((fwd.cover[i] > 0) !== (rev.cover[i] > 0)) covBad++;
      if (fwd.cover[i] > 0 && !near(fwd.z[i], 1 - rev.z[i], 1e-7)) zBad++;
    }
    ok('J1 反 Z 与标准 Z 的画面**逐位相同**（' + NP + ' 像素，以顶点色为探针）',
       colBad === 0, '不同 ' + colBad + ' 个');
    ok('J2 覆盖集合同样相同', covBad === 0, '不同 ' + covBad + ' 个');
    ok('J3 缓冲里存的值互补：z_fwd ≈ 1 − z_rev', zBad === 0, '异常 ' + zBad + ' 个');

    /* J4 每个三角形单独渲一遍，就能反过来问「这个像素上到底有谁在争」。
       这样不必复刻填充规则（那是 §5 的事，C 组已经验过），
       只把「深度怎么裁决」单独拎出来验 —— 关注点分离。 */
    const solo = tris.map(function (t) {
      const fb = R.makeFB(W, H);
      R.fbClear(fb, 0, 0, 0, false);
      R.rasterTri(fb, t[0], t[1], t[2], {
        mode: 'bbox', rule: 'tl', ztest: false,
        shade: function (px, py, P, at) { return [at.r, at.g, at.b]; },
      });
      return fb;
    });

    /* J5 深度缓冲的赢家必须等于「独立求最小 z01」的结果。
       这是「深度测试选出最近片元」这句话最直接的机器可验证形式，
       也顺带说明 J1 的逐位相同不是巧合。 */
    let winnerBad = 0, multi = 0, ties = 0, minGap = Infinity;
    const tieList = [];
    for (let i = 0; i < NP; i++) {
      const here = [];
      for (let t = 0; t < solo.length; t++) if (solo[t].cover[i] > 0) here.push(t);
      if (!here.length) continue;
      if (here.length > 1) multi++;
      let win = here[0];
      for (const t of here) if (solo[t].z[i] < solo[win].z[i]) win = t;
      /* 用赢家单独渲的那个像素的颜色与总渲染比 —— 相同即说明赢家选对了 */
      if (Math.abs(fwd.col[i * 3] - solo[win].col[i * 3]) > 1e-9) winnerBad++;
      let g2 = Infinity;
      for (let a = 0; a < here.length; a++) for (let b = a + 1; b < here.length; b++) {
        const g = Math.abs(solo[here[a]].z[i] - solo[here[b]].z[i]);
        if (g < minGap) minGap = g;
        if (g < g2) g2 = g;
      }
      /* 两值相距在一个 ULP 量级内 ⇒ 这次比较的胜负是舍入决定的 */
      if (here.length > 1 && g2 < 64 * ulp32(fwd.z[i])) {
        ties++;
        tieList.push({ x: i % W, y: Math.floor(i / W), gap: g2, n: here.length });
      }
    }
    ok('J4 场景里确实有重叠（' + multi + ' 个像素上有 ≥2 个三角形在争）⇒ J5 不是空转', multi > 0);
    ok('J5 深度缓冲选出的赢家 = 独立求最小 z01 的那个（异常 ' + winnerBad + ' 个像素）',
       winnerBad === 0);
    /* J6 判据要区分两种「深度很接近」，它们的性质完全不同：
         · 两块**共面**的板 —— 重叠区域内**每一处**都平局，成百上千个像素，
           胜负完全由 1−z 的舍入决定。这是病态的输入，抗不过换一种深度编码。
         · 一块**斜插**的板与地面相交 —— 只在交线那一条线上平局，几个像素，
           而且那是几何上真的相等，任何深度缓冲都只能任选一边。
       所以判据不能是「一个都不许有」（会把正常的相交判成错的），
       而是「平局必须只是交线，不能是一片区域」。用一个远小于重叠面积的
       上界来区分：交线最多覆盖画面对角线的两倍长度。
       共面时这里会是几千（实测 8207 个重叠像素几乎全是平局）。 */
    const tieBound = 2 * (W + H);
    ok('J6 平局只出现在交线上，不是一片区域（' + ties + ' 个像素 < 上界 ' + tieBound +
       '；全场景最小间距 ' + minGap.toExponential(2) + '）',
       ties <= tieBound,
       tieList.slice(0, 4).map(t => '(' + t.x + ',' + t.y + ') gap=' + t.gap.toExponential(2)).join(' '));

    /* J7 五块板都得**看得见**（不是「没被完全挡住」就算数）。
       为什么门槛取 200 而不是 1：这里出过真事 —— 斜板原本在屏幕中段横跨 x≈43..149，
       恰好压住蓝板所在的那条横带，蓝板只剩 32 个可见像素。
       门槛定成 1 的话它会「通过」，而图上那块板其实已经没了。
       200 像素 ≈ 画布面积的 1%，是这个尺寸的图上一眼能认出来的下限。 */
    const quadWin = [0, 0, 0, 0, 0];
    for (let i = 0; i < NP; i++) {
      const here = [];
      for (let t = 0; t < solo.length; t++) if (solo[t].cover[i] > 0) here.push(t);
      if (!here.length) continue;
      let win = here[0];
      for (const t of here) if (solo[t].z[i] < solo[win].z[i]) win = t;
      quadWin[Math.floor(win / 2)]++;
    }
    ok('J7 五块四边形各自都有可见面积，且都够看得见（' + quadWin.join(' / ') + ' 像素）',
       quadWin.every(n => n >= 200),
       '最少的一块 ' + Math.min.apply(null, quadWin) + ' 像素');

    /* J8 结构性的因：不许有**共面重叠**的两块板。
       从投影后的 x/y/w 可以把观察空间坐标精确还原回来（makeProj 的式子可逆），
       于是能直接比较两块板所在平面是否重合。J1 抓的是病症，这一条抓的是病因 ——
       以后谁再把某块板的 y 改回 0，这里会先炸，而不是等到肉眼看图才发现。 */
    const tanH = Math.tan(60 * Math.PI / 360), aspect = W / H;
    function vpos(v) {
      const ndcX = (v.x / W) * 2 - 1, ndcY = 1 - (v.y / H) * 2;
      return { x: ndcX * v.w * tanH * aspect, y: ndcY * v.w * tanH, z: -v.w };
    }
    const jsub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
    const jcrs = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
    const jdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    function quadPlane(qi) {
      const a = vpos(tris[qi * 2][0]), b = vpos(tris[qi * 2][1]), c = vpos(tris[qi * 2][2]);
      let n = jcrs(jsub(b, a), jsub(c, a));
      const L = Math.sqrt(jdot(n, n)) || 1;
      n = { x: n.x / L, y: n.y / L, z: n.z / L };
      let d = jdot(n, a);
      /* 法线朝向由绕序决定，先规范化到同一个半球，否则「共面」会被判成不共面 */
      if (n.y < 0 || (n.y === 0 && n.z < 0)) { n = { x: -n.x, y: -n.y, z: -n.z }; d = -d; }
      return { n: n, d: d };
    }
    const planes = [0, 1, 2, 3, 4].map(quadPlane);
    const coincident = [];
    for (let a = 0; a < planes.length; a++) for (let b = a + 1; b < planes.length; b++) {
      const cr = jcrs(planes[a].n, planes[b].n);
      const par = Math.sqrt(jdot(cr, cr)) < 1e-6;          /* 法线平行 */
      const same = Math.abs(planes[a].d - planes[b].d) < 1e-5;
      if (par && same) coincident.push('#' + a + '≡#' + b);
    }
    ok('J8 没有任何两块板共面（共面重叠会让深度平局退化到浮点舍入）',
       coincident.length === 0, coincident.length ? coincident.join(' ') : '5 个平面互不重合');
  } else { ok('J depth 模块缺失或未导出 getScene', false); }
}

/* ================================================================== */
console.log('\n' + '='.repeat(68));
console.log('独立校验：' + pass + ' 项通过，' + fail + ' 项失败');
if (fail) {
  console.log('\n失败清单：');
  failures.forEach((f, i) => console.log('  [' + (i + 1) + '] ' + f));
  process.exit(1);
} else {
  console.log('全部通过 ✅');
}
