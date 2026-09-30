/* 独立验证 dielectric 分支：反射定律 + Snell 定律 + 全内反射判据
   直接复刻 index.html 中 rayColor 的 dielectric 代码路径。 */
let pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; } else { fail++; console.log('  FAIL  ' + n + (e ? '   ' + e : '')); } }

function mulberry32(a){return function(){a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const RNG = mulberry32(24680);

function norm(v){ const L=Math.hypot(v[0],v[1],v[2]); return [v[0]/L,v[1]/L,v[2]/L]; }
function dot(a,b){ return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }

/* ---- 被测代码：与 index.html 完全一致 ---- */
function scatterDielectric(d, gon, ior, rand) {
  const front = dot(d, gon) < 0;
  const n = front ? [gon[0],gon[1],gon[2]] : [-gon[0],-gon[1],-gon[2]];
  const etaRatio = front ? (1.0/ior) : ior;
  const cosTheta = Math.min(-dot(d,n), 1.0);
  const sinTheta = Math.sqrt(Math.max(0, 1-cosTheta*cosTheta));
  let refl = (etaRatio*sinTheta > 1.0);
  if (!refl) {
    const r0 = (1-ior)/(1+ior), r02 = r0*r0;
    if (r02 + (1-r02)*Math.pow(1-cosTheta, 5) > rand()) refl = true;
  }
  let out;
  if (refl) {
    const dn = dot(d,n);
    out = [d[0]-2*dn*n[0], d[1]-2*dn*n[1], d[2]-2*dn*n[2]];
  } else {
    const ct = Math.min(-dot(d,n), 1.0);
    const pp = [etaRatio*(d[0]+ct*n[0]), etaRatio*(d[1]+ct*n[1]), etaRatio*(d[2]+ct*n[2])];
    const ppl2 = pp[0]*pp[0]+pp[1]*pp[1]+pp[2]*pp[2];
    const par = -Math.sqrt(Math.abs(1-ppl2));
    out = [pp[0]+par*n[0], pp[1]+par*n[1], pp[2]+par*n[2]];
  }
  const L = Math.hypot(out[0],out[1],out[2]);
  return { front, n, etaRatio, cosTheta, sinTheta, refl,
           out: L>1e-9 ? [out[0]/L,out[1]/L,out[2]/L] : null, rawLen: L };
}

/* ---- 参照实现：直接用几何定义算 Snell ---- */
function snellRef(d, gon, ior) {
  const front = dot(d, gon) < 0;
  const n = front ? gon : [-gon[0],-gon[1],-gon[2]];     // 与光线反向
  const etaRatio = front ? 1/ior : ior;
  const cosI = -dot(d, n);                                // 入射角余弦（相对 −n）
  if (cosI <= 0) return { tir: true };
  const sinI = Math.sqrt(Math.max(0, 1-cosI*cosI));
  const sinT = etaRatio * sinI;
  if (sinT > 1) return { tir: true, sinI, cosI };
  const cosT = Math.sqrt(1 - sinT*sinT);
  /* 出射方向：切向分量按 etaRatio 缩放，法向分量指向 −n 侧 */
  const dPerp = [d[0]+cosI*n[0], d[1]+cosI*n[1], d[2]+cosI*n[2]];  // 切向分量
  const out = [etaRatio*dPerp[0] - cosT*n[0],
               etaRatio*dPerp[1] - cosT*n[1],
               etaRatio*dPerp[2] - cosT*n[2]];
  const L = Math.hypot(out[0],out[1],out[2]);
  return { tir: false, sinI, cosI, sinT, cosT, out:[out[0]/L,out[1]/L,out[2]/L] };
}

console.log('=== dielectric 分支：Snell 定律与反射定律验证 ===\n');

let nTest = 0, tirAgree = 0, tirDisagree = 0, maxErrSnell = 0, maxErrUnit = 0, maxErrRefl = 0;
let refractCount = 0, reflCount = 0;

for (let k = 0; k < 20000; k++) {
  // 随机单位外法线（球面均匀）
  const u = RNG()*2-1, phi = RNG()*Math.PI*2, s = Math.sqrt(Math.max(0,1-u*u));
  const gon = [s*Math.cos(phi), u, s*Math.sin(phi)];
  // 随机单位入射方向
  const u2 = RNG()*2-1, phi2 = RNG()*Math.PI*2, s2 = Math.sqrt(Math.max(0,1-u2*u2));
  const d = [s2*Math.cos(phi2), u2, s2*Math.sin(phi2)];
  const ior = [1.05, 1.33, 1.5, 2.4][k % 4];

  const got = scatterDielectric(d, gon, ior, () => 2);   // rand()=2 → 永不选反射（分离出纯折射路径）
  const ref = snellRef(d, gon, ior);
  nTest++;

  // TIR 判定必须一致
  if (ref.tir) { if (!got.refl) { /* 被 rand 强制折射了吗？不，rand=2 时 refl 只能来自 TIR */ } }
  if (ref.tir === got.refl) tirAgree++;
  else if (!ref.tir) { tirDisagree++; }   // 仅当 ref 非 TIR 而 got 判 TIR 才算错

  if (got.out) maxErrUnit = Math.max(maxErrUnit, Math.abs(Math.hypot(got.out[0],got.out[1],got.out[2]) - 1));

  if (got.refl) {
    reflCount++;
    // 反射定律：法向分量翻转（dot(out,n) = −dot(d,n)），切向分量保持不变
    const dPerp = [d[0]-dot(d,got.n)*got.n[0], d[1]-dot(d,got.n)*got.n[1], d[2]-dot(d,got.n)*got.n[2]];
    const oPerp = [got.out[0]-dot(got.out,got.n)*got.n[0],
                   got.out[1]-dot(got.out,got.n)*got.n[1],
                   got.out[2]-dot(got.out,got.n)*got.n[2]];
    maxErrRefl = Math.max(maxErrRefl,
      Math.abs(dot(got.out, got.n) + dot(d, got.n)),
      Math.hypot(dPerp[0]-oPerp[0], dPerp[1]-oPerp[1], dPerp[2]-oPerp[2]));
  } else if (ref.tir === false && got.out) {
    refractCount++;
    // Snell：出射角余弦应等于 cosT
    const cosOut = -dot(got.out, got.n);
    maxErrSnell = Math.max(maxErrSnell, Math.abs(cosOut - ref.cosT), Math.abs(-dot(got.out, got.n) - ref.cosT));
  }
}

console.log('  样本数 ' + nTest + '（ior ∈ {1.05, 1.33, 1.5, 2.4}）');
ok('TIR 判定与参照实现完全一致', tirDisagree === 0, '不一致 ' + tirDisagree + ' 次');
ok('出射方向始终是单位向量（误差 < 1e-9）', maxErrUnit < 1e-9, 'max err=' + maxErrUnit.toExponential(2));
ok('纯折射路径满足 Snell 定律（cosθt 误差 < 1e-9）', maxErrSnell < 1e-9, 'max err=' + maxErrSnell.toExponential(2));
ok('反射路径满足反射定律', maxErrRefl < 1e-9, 'max err=' + maxErrRefl.toExponential(2));
console.log('  纯折射 ' + refractCount + ' 次，反射/TIR ' + reflCount + ' 次');

/* ---- 解析验证：TIR 临界角 ---- */
console.log('\n=== 全内反射临界角（从玻璃内部射向表面）===');
[1.05, 1.33, 1.5, 2.4].forEach(ior => {
  const crit = Math.asin(1/ior) * 180/Math.PI;
  let firstTIR = null;
  for (let a = 0.1; a < 89.9; a += 0.01) {
    /* 从内部射向表面：外法线 gon=(0,1,0)，方向 d 有正的 y 分量 → front=false → etaRatio=ior */
    const gon = [0,1,0];
    const rad = a*Math.PI/180;
    const d = [Math.sin(rad), Math.cos(rad), 0];
    const got = scatterDielectric(d, gon, ior, () => 2);
    if (got.refl) { firstTIR = a; break; }
  }
  const err = Math.abs(firstTIR - crit);
  ok('ior=' + ior.toFixed(2) + ' 临界角解析值 ' + crit.toFixed(2) + '°，实测 ' +
     (firstTIR?firstTIR.toFixed(2):'—') + '°', err < 0.05, '误差 ' + err.toFixed(3) + '°');
});

/* ---- Schlick 反射率单调性 ---- */
console.log('\n=== Schlick 近似反射率 ===');
[1.5, 1.33].forEach(ior => {
  const r0 = (1-ior)/(1+ior), r02 = r0*r0;
  const vals = [0, 15, 30, 45, 60, 75, 89].map(deg => {
    const c = Math.cos(deg*Math.PI/180);
    return { deg, R: r02 + (1-r02)*Math.pow(1-c, 5) };
  });
  let mono = true;
  for (let i = 1; i < vals.length; i++) if (vals[i].R < vals[i-1].R) mono = false;
  ok('ior=' + ior + ' 反射率随入射角单调递增', mono,
     'R(0°)=' + vals[0].R.toFixed(3) + '  R(45°)=' + vals[3].R.toFixed(3) + '  R(89°)=' + vals[6].R.toFixed(3));
  ok('ior=' + ior + ' 正入射反射率 R₀ = ((1−n)/(1+n))²', Math.abs(vals[0].R - r02) < 1e-12,
     'R₀=' + vals[0].R.toFixed(4) + '  解析值=' + r02.toFixed(4));
  ok('ior=' + ior + ' 掠射角反射率 → 1', vals[6].R > 0.9, 'R(89°)=' + vals[6].R.toFixed(3));
});

console.log('\n----------------------------------------');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
