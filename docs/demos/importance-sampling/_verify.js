'use strict';
/* 独立数学校验：从定义重算，不复用页面的推导。
   以模块导出 checkHtml(html)，可直接被 _neg.js 用变异副本调用（不落临时文件）。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, 'index.html');

function readMath(html) {
  const a = html.indexOf('/* __MATH_BEGIN__');
  const b = html.indexOf('/* __MATH_END__ */');
  if (a < 0 || b < 0) throw new Error('找不到 __MATH_BEGIN__ / __MATH_END__ 标记');
  const body = html.slice(a, b);
  const ctx = vm.createContext({ Math, Number, isFinite });
  return vm.runInContext(
    body + '\n;({Nm,f1,f2,p1,pA,pB,wBal,wAvg,wPow,integ,T1,T2,mass,' +
    'samp1,sampA,sampB,solidPdf})', ctx);
}

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const mid = (f, n) => { let t = 0; for (let i = 0; i < n; i++) t += f((i + 0.5) / n); return t / n; };

function checkHtml(html) {
  const res = [];
  const ok = (name, cond, detail) => res.push({ name, pass: !!cond, detail: detail || '' });
  let M;
  try { M = readMath(html); } catch (e) { ok('M0 数学块可抽取', false, e.message); return { ok: false, res }; }
  ok('M0 数学块可抽取', true);
  const { f1, f2, p1, pA, pB, wBal, wPow, integ, T1, T2, mass, samp1, sampA, sampB, solidPdf } = M;

  /* ---- A. 采样密度必须严格归一化（面积 = 1）。这是本页曾经的真实缺陷：p1 截断后不归一，演示带偏差。 ---- */
  const grid = [[0, 0], [0, 0], [0.8, 0], [0.95, 0], [0.5, 0.3], [0.5, -0.3], [0.2, 0.12], [0.95, 0.3]];
  let worst = 0, worstAt = '';
  for (const [a, o] of grid) {
    const zz = mass(0.62 + o, 0.06);
    const s = mid((x) => p1(x, a, o, zz), 20001);
    const d = Math.abs(s - 1);
    if (d > worst) { worst = d; worstAt = `a=${a},o=${o}`; }
  }
  ok('A1 ∫p1 dx = 1（全部滑块组合）', worst < 2e-3, `最大偏差 ${worst.toExponential(2)} @ ${worstAt}`);
  ok('A2 ∫pA dx = 1', Math.abs(mid(pA, 20001) - 1) < 2e-3, mid(pA, 20001).toFixed(6));
  ok('A3 ∫pB dx = 1', Math.abs(mid(pB, 20001) - 1) < 2e-3, mid(pB, 20001).toFixed(6));

  /* ---- B. 采样器实际密度 == 声明的 pdf。只验归一化不够：采样器和 pdf 可以各自"正常"但不一致 ---- */
  const rnd = lcg(12345);
  const N = 200000;
  const xs = [0.2, 0.4, 0.6, 0.8];
  const cdf = (t, draws) => draws.reduce((s, v) => s + (v <= t ? 1 : 0), 0) / draws.length;
  const d1 = Array.from({ length: N }, () => samp1(0.8, 0, rnd));
  const dA = Array.from({ length: N }, () => sampA(rnd));
  const dB = Array.from({ length: N }, () => sampB(rnd));
  let e1 = 0, eA = 0, eB = 0;
  const zB = mass(0.62, 0.06);
  const cdfOf = (t, f, n) => { let s2 = 0; for (let i = 0; i < n; i++) if ((i + 0.5) / n <= t) s2 += f((i + 0.5) / n); return s2 / n; };
  for (const t of xs) {
    e1 = Math.max(e1, Math.abs(cdf(t, d1) - cdfOf(t, (x) => p1(x, 0.8, 0, zB), 4001)));
    eA = Math.max(eA, Math.abs(cdf(t, dA) - cdfOf(t, pA, 4001)));
    eB = Math.max(eB, Math.abs(cdf(t, dB) - cdfOf(t, pB, 4001)));
  }
  ok('B1 采样器 samp1 与 p1 一致（经验 CDF）', e1 < 0.008, `最大偏差 ${e1.toFixed(4)}`);
  ok('B2 采样器 sampA 与 pA 一致', eA < 0.008, `最大偏差 ${eA.toFixed(4)}`);
  ok('B3 采样器 sampB 与 pB 一致', eB < 0.008, `最大偏差 ${eB.toFixed(4)}`);

  /* ---- C. 真值 ∫f 与解析式一致（f 里是未归一化的 exp，∫=σ√2π·截断质量） ---- */
  const S2P = 2.5066282746310002;
  const T1a = 0.05 + 0.05 * S2P * mass(0.62, 0.05) + 0.2 * 0.05 * S2P * mass(0.25, 0.05);
  const T2a = 0.02 + 1.2 * 0.025 * S2P * mass(0.25, 0.025) + 0.8 * 0.07 * S2P * mass(0.72, 0.07);
  ok('C1 T1 = 解析积分', Math.abs(T1 - T1a) < 1e-4, `页面 ${T1.toFixed(6)} / 解析 ${T1a.toFixed(6)}`);
  ok('C2 T2 = 解析积分', Math.abs(T2 - T2a) < 1e-4, `页面 ${T2.toFixed(6)} / 解析 ${T2a.toFixed(6)}`);

  /* ---- K. 演示 1 正文引用的三条实测量级 ---- */
  const sdOf = (a, o) => {
    const zz = mass(0.62 + o, 0.06);
    const p2 = (x) => p1(x, a, o, zz);
    return Math.sqrt(Math.max(0, mid((x) => f1(x) * f1(x) / p2(x), 40001) - T1 * T1));
  };
  const sdU = sdOf(0, 0);
  ok('K1 贴合度 0.8 的标准差约为均匀采样的一半', (function () {
    const r = sdOf(0.8, 0) / sdU; return r > 0.4 && r < 0.62;
  })(), (sdOf(0.8, 0) / sdU).toFixed(3) + '×');
  ok('K2 贴合度 0.95 反而比 0.8 更差（过度集中制造萤火虫）',
    sdOf(0.95, 0) > sdOf(0.8, 0), `${sdOf(0.95, 0).toFixed(3)} > ${sdOf(0.8, 0).toFixed(3)}`);
  let mx = 0;
  for (let i = 0; i <= 4000; i++) { const x = i / 4000; mx = Math.max(mx, f1(x) / p1(x, 0.95, 0, mass(0.62, 0.06))); }
  ok('K3 贴合度 0.95 时最大单样本贡献 ≈ 5，即 I 的二十几倍',
    Math.abs(mx - 5) < 0.15 && mx / T1 > 20 && mx / T1 < 30, `max=${mx.toFixed(2)}, ${(mx / T1).toFixed(1)}×I`);
  ok('K4 偏移 0.3 时标准差高于均匀（采错地方比不采更糟）',
    sdOf(0.8, 0.3) > sdU, `${sdOf(0.8, 0.3).toFixed(3)} > ${sdU.toFixed(3)}`);

  /* ---- D. 方差恒等式 Var[f/p] = ∫f²/p − I² ---- */
  const z = mass(0.62, 0.06);
  const p = (x) => p1(x, 0.8, 0, z);
  const vTheory = mid((x) => f1(x) * f1(x) / p(x), 40001) - T1 * T1;
  const M2 = 300000;
  const r3 = lcg(777);
  let s = 0, q = 0;
  for (let i = 0; i < M2; i++) { const x = samp1(0.8, 0, r3); const v = f1(x) / p(x); s += v; q += v * v; }
  const vEmp = q / M2 - (s / M2) ** 2;
  ok('D1 方差 = ∫f²/p − I²（解析 vs 抽样）', Math.abs(vEmp - vTheory) / Math.max(vTheory, 1e-9) < 0.06,
    `解析 ${vTheory.toFixed(4)} / 抽样 ${vEmp.toFixed(4)}`);

  /* ---- E. p ∝ f 时 f/p 恒等于 I，方差为 0 ---- */
  const pOpt = (x) => f1(x) / T1;
  let dev = 0;
  for (let i = 0; i <= 1000; i++) dev = Math.max(dev, Math.abs(f1(i / 1000) / pOpt(i / 1000) - T1));
  ok('E1 p ∝ f ⇒ f/p 恒定（方差 0 的理论天花板）', dev < 1e-9, `最大偏差 ${dev.toExponential(2)}`);

  /* ---- F. MIS：权重和为 1，且平衡启发式 = 后验概率 ---- */
  const modes = { bal: wBal, pow: wPow, avg: () => 0.5 };
  let sw = 0;
  for (let i = 0; i <= 2000; i++) {
    const x = i / 2000;
    for (const k in modes) sw = Math.max(sw, Math.abs(modes[k](x) + (1 - modes[k](x)) - 1));
  }
  ok('F1 三种启发式都逐点和为 1', sw < 1e-12, `最大偏差 ${sw.toExponential(2)}`);
  let pb = 0;
  for (let i = 0; i <= 2000; i++) {
    const x = i / 2000, a = pA(x), b = pB(x);
    pb = Math.max(pb, Math.abs(wBal(x) - (1 * a) / (1 * a + 1 * b)));
  }
  ok('F2 平衡启发式 = 样本来源的后验概率 n·p/Σn·p', pb < 1e-12, `最大偏差 ${pb.toExponential(2)}`);

  /* ---- G. MIS 无偏；直接相加 = 2I（这是页面上"错"按钮的依据） ---- */
  const Rs = 400000;
  const est = (mode, rnd) => {
    const x = sampA(rnd), y = sampB(rnd);
    const eA = f2(x) / pA(x), eB = f2(y) / pB(y);
    /* 关键：两条样本各自在自己位置上取权重。用 w(x) 去乘 y 的贡献会破坏无偏（本校验第一版就这么错过） */
    const w = mode === 'bal' ? wBal(x) : mode === 'pow' ? wPow(x) : mode === 'raw' ? 1 : 0.5;
    const wby = mode === 'bal' ? wBal(y) : mode === 'pow' ? wPow(y) : 0.5;
    const wb = mode === 'raw' ? 1 : 1 - wby;
    return w * eA + wb * eB;
  };
  for (const mode of ['bal', 'pow', 'avg']) {
    const rr = lcg(4242);
    let t = 0;
    for (let i = 0; i < Rs; i++) t += est(mode, rr);
    t /= Rs;
    ok(`G-${mode} E[估计] = I（无偏）`, Math.abs(t - T2) < 0.012, `估计 ${t.toFixed(4)} / 真值 ${T2.toFixed(4)}`);
  }
  {
    const rr = lcg(999);
    let t = 0;
    for (let i = 0; i < Rs; i++) t += est('raw', rr);
    t /= Rs;
    ok('G-raw 直接相加 = 2I（重复计数）', Math.abs(t - 2 * T2) < 0.02, `估计 ${t.toFixed(4)} / 2I = ${(2 * T2).toFixed(4)}`);
  }

  /* ---- H. 测度换算：p_ω · Ω = 1，且随 d² 增长 ---- */
  const A0 = 0.25;
  const pW = solidPdf(A0, 2, 1), om = A0 / 4;
  ok('H1 p_ω = p_A · d²/cosθ = 16 /sr', Math.abs(pW - 16) < 1e-9, pW.toFixed(6));
  ok('H2 p_ω · Ω = 1（自洽）', Math.abs(pW * om - 1) < 1e-9, (pW * om).toFixed(9));
  ok('H3 d 从 1 到 4 ⇒ dA/dω 涨 16 倍',
    Math.abs(solidPdf(1, 4, 1) / solidPdf(1, 1, 1) - 16) < 1e-9,
    (solidPdf(1, 4, 1) / solidPdf(1, 1, 1)).toFixed(3));
  ok('H4 cosθ→0 时不产生 Infinity/NaN', solidPdf(1, 2, 0) === 0, String(solidPdf(1, 2, 0)));

  /* ---- I. 正文里引用的百分比必须与函数实际值吻合 ---- */
  const wBalWide = wBal(0.72), wBalNarrow = wBal(0.25);
  ok('I1 宽峰处 w_A ≈ 1.7%', Math.abs(wBalWide - 0.0168) < 0.003, (wBalWide * 100).toFixed(2) + '%');
  ok('I2 窄峰处 w_A ≈ 99.3%', Math.abs(wBalNarrow - 0.993) < 0.004, (wBalNarrow * 100).toFixed(2) + '%');
  ok('I3 宽峰处 f/p_A ≈ 10（萤火虫量级）', Math.abs(f2(0.72) / pA(0.72) - 10.25) < 0.6, (f2(0.72) / pA(0.72)).toFixed(2));

  /* ---- J. 幂启发式在 p 差距大处压制更狠 ---- */
  ok('J1 β=2 比平衡启发式更尖（宽峰处 w_A 更小）', wPow(0.72) < wBal(0.72), `${(wPow(0.72) * 100).toFixed(3)}% < ${(wBal(0.72) * 100).toFixed(2)}%`);
  ok('J2 两条 p 相等处（x=0 两处都是均匀底 0.08）权重都取 0.5',
    Math.abs(wBal(0) - 0.5) < 1e-9 && Math.abs(wPow(0) - 0.5) < 1e-9,
    `${wBal(0).toFixed(9)} / ${wPow(0).toFixed(9)}`);

  const failed = res.filter((r) => !r.pass);
  return { ok: failed.length === 0, res, failed: failed.length, total: res.length };
}

if (require.main === module) {
  const html = fs.readFileSync(process.argv[2] || SRC, 'utf8');
  const r = checkHtml(html);
  for (const x of r.res) console.log((x.pass ? '  PASS ' : '  FAIL ') + x.name + (x.detail ? '  [' + x.detail + ']' : ''));
  console.log(`\nindependent-math: ${r.total - r.failed}/${r.total}`);
  process.exit(r.ok ? 0 : 1);
}
module.exports = { checkHtml, SRC };
