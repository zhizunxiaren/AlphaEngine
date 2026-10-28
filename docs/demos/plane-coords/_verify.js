/*
 * _verify.js —— 平面坐标演示页的独立校验
 * 不依赖第三方包；用 node 直接执行。
 *
 * 三层：
 *   1. 静态：整段内联脚本语法可解析、无外部依赖、有错误横幅、有同步首帧
 *   2. 数学：从页面里抽出 __MATH_BEGIN__/__MATH_END__ 之间的纯函数，在本进程内执行
 *   3. 反向：确认关键断言不是空转（对称叉积必须得到 -α；默认参数下投影必须偏离）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, 'index.html');
const html = fs.readFileSync(FILE, 'utf8');

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); }
}

function near(a, b, eps) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= (eps === undefined ? 1e-9 : eps);
}

/* ---------------- 1. 静态层 ---------------- */
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
ok('页面含唯一内联脚本', !!scriptMatch);

let scriptCode = scriptMatch ? scriptMatch[1] : '';
try {
  new vm.Script(scriptCode, { filename: 'inline.js' });
  ok('内联脚本语法可解析', true);
} catch (e) {
  ok('内联脚本语法可解析', false, e.message);
}

ok('无外部 <script src>', !/<script[^>]+src=/i.test(html));
ok('无外部样式表', !/<link[^>]+rel=["']?stylesheet/i.test(html));
ok('无 http/https 资源引用', !/(src|href)=["']https?:\/\//i.test(html));
ok('有错误横幅挂载点', /id="err"/.test(html));
ok('注册了 window error 监听', /addEventListener\(\s*'error'/.test(html));

/* 启动序列必须是「同步 draw 紧接 rAF 注册」，不能只有 rAF 里的绘制 */
const startup = html.indexOf('resize();\ndraw(1);\nrequestAnimationFrame(frame);');
ok('启动处同步首帧紧接 rAF 注册', startup > 0,
  '未找到 resize();draw(1);requestAnimationFrame(frame); 的连续序列');
ok('rAF 回调内也绘制', /function frame\([\s\S]*?draw\(dt\);[\s\S]*?requestAnimationFrame\(frame\)/.test(html));

ok('数学块标记成对出现', html.indexOf('// __MATH_BEGIN__') > 0 && html.indexOf('// __MATH_END__') > 0);

/* 两个长度滑块的量程必须一致，否则「滑到同一位置」不等于「同一个值」 */
const sU = html.match(/id="sU"[^>]*min="([\d.]+)"[^>]*max="([\d.]+)"/);
const sV = html.match(/id="sV"[^>]*min="([\d.]+)"[^>]*max="([\d.]+)"/);
ok('|u| 滑块存在', !!sU);
ok('|v| 滑块存在', !!sV);
ok('两个长度滑块量程一致', !!sU && !!sV && sU[1] === sV[1] && sU[2] === sV[2],
  sU && sV ? `u:${sU[1]}~${sU[2]} v:${sV[1]}~${sV[2]}` : '未找到滑块');

/* ---------------- 2. 数学层 ---------------- */
const b0 = html.indexOf('// __MATH_BEGIN__');
const b1 = html.indexOf('// __MATH_END__');
const mathCode = html.slice(b0, b1);

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  mathCode + '\n;this.__M = {dot2:dot2,cross2:cross2,len2:len2,add2:add2,sub2:sub2,mul2:mul2,' +
  'basisFrom:basisFrom,dualBasis:dualBasis,planeCoords:planeCoords,naiveAlpha:naiveAlpha,' +
  'heightOnBase:heightOnBase,areaOf:areaOf,basisBounds:basisBounds};',
  sandbox,
  { filename: 'math.js' }
);
const M = sandbox.__M;
ok('纯数学函数可独立加载', !!M && typeof M.planeCoords === 'function');

const combos = [
  [68, 1.80, 1.45],
  [45, 1.20, 0.90],
  [115, 2.10, 1.90],
  [90, 1.50, 1.50],
  [55, 1.70, 1.10]
];

for (const [th, ul, vl] of combos) {
  const B = M.basisFrom(th, ul, vl);
  const u = B.u, v = B.v;
  const D = M.dualBasis(u, v);
  const tag = `θ=${th} |u|=${ul} |v|=${vl}`;

  ok('对偶基存在 ' + tag, !!D);
  if (!D) continue;

  ok('u*·u = 1 ' + tag, near(M.dot2(D.uStar, u), 1, 1e-12));
  ok('u*·v = 0 ' + tag, near(M.dot2(D.uStar, v), 0, 1e-12));
  ok('v*·v = 1 ' + tag, near(M.dot2(D.vStar, v), 1, 1e-12));
  ok('v*·u = 0 ' + tag, near(M.dot2(D.vStar, u), 0, 1e-12));
  ok('|u*| = 1/h_u ' + tag,
    near(M.len2(D.uStar), 1 / M.heightOnBase(u, v), 1e-9));
  ok('h_u = |u|·sinθ ' + tag,
    near(M.heightOnBase(u, v), ul * Math.sin(th * Math.PI / 180), 1e-12));

  /* 任取一点，坐标必须能还原 */
  const alphas = [-0.3, 0, 0.5, 1, 1.7];
  const betas = [0, 0.25, 1, 1.6];
  let recoverOk = true, worst = 0;
  for (const a of alphas) {
    for (const b of betas) {
      const p = M.add2(M.mul2(u, a), M.mul2(v, b));
      const c = M.planeCoords(u, v, p);
      if (!c) { recoverOk = false; continue; }
      worst = Math.max(worst, Math.abs(c.alpha - a), Math.abs(c.beta - b));
      const back = M.add2(M.mul2(u, c.alpha), M.mul2(v, c.beta));
      worst = Math.max(worst, Math.abs(back[0] - p[0]), Math.abs(back[1] - p[1]));
    }
  }
  ok('坐标可正反还原 ' + tag, recoverOk && worst < 1e-9, 'worst=' + worst);

  /* 投影误差的解析式 */
  const a0 = 0.78, b0v = 0.62;
  const p0 = M.add2(M.mul2(u, a0), M.mul2(v, b0v));
  const identity = a0 + b0v * M.dot2(u, v) / M.dot2(u, u);
  ok('α′ = α + β(u·v)/|u|² ' + tag, near(M.naiveAlpha(u, p0), identity, 1e-12));

  /* 面积比 = α */
  ok('|p×v|/|u×v| = |α| ' + tag,
    near(M.areaOf(p0, v) / M.areaOf(u, v), Math.abs(a0), 1e-12));

  /* 叉积形式与点积形式一致 */
  ok('(p×v)/(u×v) = α ' + tag,
    near(M.cross2(p0, v) / M.cross2(u, v), a0, 1e-12));
}

/* 正交基退化为自身 */
{
  const D = M.dualBasis([1, 0], [0, 1]);
  ok('标准正交基下 u* = u', near(D.uStar[0], 1, 1e-12) && near(D.uStar[1], 0, 1e-12));
  ok('标准正交基下 v* = v', near(D.vStar[0], 0, 1e-12) && near(D.vStar[1], 1, 1e-12));
}
{
  const D = M.dualBasis([2, 0], [0, 3]);
  ok('正交但非单位长：u* = u/|u|²', near(D.uStar[0], 0.5, 1e-12) && near(D.uStar[1], 0, 1e-12));
  ok('正交但非单位长：v* = v/|v|²', near(D.vStar[1], 1 / 3, 1e-12));
}

/* 退化保护 */
{
  ok('u ∥ v 时 dualBasis 返回 null', M.dualBasis([1, 0], [2, 0]) === null);
  ok('u ∥ v 时 planeCoords 返回 null', M.planeCoords([1, 0], [2, 0], [1, 1]) === null);
  ok('零向量不产生 NaN', M.dualBasis([0, 0], [1, 1]) === null);
}

/* ---------------- 3. 反向层（证明断言不是空转） ---------------- */
{
  const B = M.basisFrom(68, 1.8, 1.45);
  const u = B.u, v = B.v;
  const p = M.add2(M.mul2(u, 0.78), M.mul2(v, 0.62));

  /* 对称写叉积必须得到 -α，而不是 α */
  const alpha = M.cross2(p, v) / M.cross2(u, v);
  const flipped = M.cross2(v, p) / M.cross2(u, v);
  ok('反向：对称叉积得到 −α', near(flipped, -alpha, 1e-12), 'flipped=' + flipped);
  ok('反向：−α 确实不等于 α（默认参数）', Math.abs(flipped - alpha) > 1e-6);

  /* 默认参数下投影必须明显偏离，否则场景 ② 看不出东西 */
  const naive = M.naiveAlpha(u, p);
  ok('反向：默认参数下 α′ 偏离 α 超过 0.1', Math.abs(naive - 0.78) > 0.1,
    'gap=' + (naive - 0.78));

  /* 正交时偏差必须归零（否则“正交退化为自身”不成立） */
  const O = M.basisFrom(90, 1.5, 1.5);
  const po = M.add2(M.mul2(O.u, 0.6), M.mul2(O.v, 0.7));
  ok('反向：正交时 α′ 与 α 重合', Math.abs(M.naiveAlpha(O.u, po) - 0.6) < 1e-12);

  /* 自动取景：滑块全域内，包围盒必须包住所有端点且尺寸有限 */
  let boundsOk = true, boundsDetail = '';
  for (const th of [45, 68, 90, 115]) {
    for (const ul of [1.0, 1.5, 1.8, 2.1]) {
      for (const vl of [1.0, 1.45, 1.9, 2.1]) {
        const BB = M.basisFrom(th, ul, vl);
        const bb = M.basisBounds(BB.u, BB.v);
        const D2 = M.dualBasis(BB.u, BB.v);
        const pts = [[0, 0], BB.u, BB.v, M.add2(BB.u, BB.v), D2.uStar, D2.vStar];
        const w = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
        if (!(w > 0.2 && h > 0.2 && isFinite(w) && isFinite(h))) {
          boundsOk = false; boundsDetail = `退化 ${th}/${ul}/${vl}`;
        }
        for (const q of pts) {
          if (q[0] < bb.minX - 1e-12 || q[0] > bb.maxX + 1e-12 ||
              q[1] < bb.minY - 1e-12 || q[1] > bb.maxY + 1e-12) {
            boundsOk = false; boundsDetail = `漏点 ${th}/${ul}/${vl}`;
          }
        }
      }
    }
  }
  ok('取景框覆盖全部端点（滑块全域）', boundsOk, boundsDetail);

  /* 取景框不得比内容大太多，否则又会缩成一小团 */
  let tightOk = true, tightDetail = '';
  for (const th of [45, 68, 115]) {
    for (const ul of [1.0, 2.1]) {
      for (const vl of [1.0, 2.1]) {
        const BB = M.basisFrom(th, ul, vl);
        const bb = M.basisBounds(BB.u, BB.v);
        const w = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
        const diag = Math.hypot(ul, vl);
        if (w > diag * 2.6 || h > diag * 2.6) {
          tightOk = false; tightDetail = `过大 ${th}/${ul}/${vl} w=${w.toFixed(2)} h=${h.toFixed(2)}`;
        }
      }
    }
  }
  ok('取景框不过度膨胀', tightOk, tightDetail);
}

/* ---------------- 汇总 ---------------- */
console.log('');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) {
  console.log('');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('全部通过');
