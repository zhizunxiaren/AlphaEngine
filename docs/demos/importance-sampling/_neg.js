'use strict';
/* 变异测试：每条断言都必须有一个能让它失败的缺陷，否则那条断言等于没有。
   全部在内存里改副本，不落任何临时文件。控制组证明校验栈本身是活的。 */
const fs = require('fs');
const { checkHtml, SRC } = require('./_check.js');
const { checkHtml: verifyHtml } = require('./_verify.js');
const { runSmoke } = require('./_smoke.js');

const SUITES = { check: checkHtml, verify: verifyHtml, smoke: runSmoke };

const MUTATIONS = [
  {
    name: 'M1 p1 去掉截断归一化（∫p≠1，演示会带偏差）',
    suite: 'verify', expect: ['A1'],
    apply: (h) => h.replace('const p1=(x,a,o,z)=>(1-a)+a*Nm(x,.62+o,.06)/(z||M1(a,o));',
      'const p1=(x,a,o,z)=>(1-a)+a*Nm(x,.62+o,.06);'),
  },
  {
    name: 'M2 samp1 退化为纯均匀（采样密度与 pdf 不一致）',
    suite: 'verify', expect: ['B1'],
    apply: (h) => h.replace('const samp1=(a,o,rnd)=>{if(rnd()<a){', 'const samp1=(a,o,rnd)=>{if(false){'),
  },
  {
    name: 'M3 面积→立体角漏掉 d²（MIS 变有偏）',
    suite: 'verify', expect: ['H1', 'H3'],
    apply: (h) => h.replace('const solidPdf=(A,d,cosL)=>A>0&&cosL>0?(1/A)*d*d/cosL:0;',
      'const solidPdf=(A,d,cosL)=>A>0&&cosL>0?(1/A)/cosL:0;'),
  },
  {
    name: 'M4 策略 B 的权重用 A 的位置取值（分账与样本来源错配）',
    suite: 'smoke', expect: ['T21'],
    apply: (h) => h.replace('const ca=wAof(x1)*eA, cb=wBof(y1)*eB;', 'const ca=wAof(x1)*eA, cb=wBof(x1)*eB;'),
  },
  {
    name: 'M5 raw 模式的两份权重都改成 0.5（退化成简单平均）',
    suite: 'smoke', expect: ['T12'],
    apply: (h) => h.replace('const wBof=x=>H2===\'raw\'?1:1-wAof(x);', 'const wBof=x=>H2===\'raw\'?.5:1-wAof(x);'),
  },
  {
    name: 'M6 删掉顶层同步首帧（画布只由 rAF 驱动）',
    suite: 'smoke', expect: ['T3'],
    apply: (h) => h.replace(/\ntick\(\); +\/\* 同步首帧[^\n]*\n/, '\n'),
  },
  {
    name: 'M7 删掉 error 监听（异常静默，只留一块黑画布）',
    suite: 'smoke', expect: ['T2'],
    apply: (h) => h.replace(/window\.addEventListener\('error'[^\n]*\n/, ''),
  },
  {
    name: 'M8 画布字号降到 10px（字迹重叠）',
    suite: 'check', expect: ['S9'],
    apply: (h) => h.replace("g.font='12px system-ui", "g.font='10px system-ui"),
  },
  {
    name: 'M9 HTML 里的 id 拼错（JS 取到 null）',
    suite: 'check', expect: ['S2'],
    apply: (h) => h.replace('id="s1u"', 'id="s1x"'),
  },
  {
    name: 'M10 少一个权重模式按钮',
    suite: 'check', expect: ['S4'],
    apply: (h) => h.replace(/<button data-h="raw"[^>]*>[^<]*<\/button>/, ''),
  },
  {
    name: 'M11 CSS 把记号转成大写（a 变 A、Δ 变 Δ）',
    suite: 'check', expect: ['S14'],
    apply: (h) => h.replace('th{background:var(--bg);font-weight:600}', 'th{background:var(--bg);font-weight:600;text-transform:uppercase}'),
  },
  {
    name: 'M12 正文分账百分比与代码不同源',
    suite: 'check', expect: ['S15'],
    apply: (h) => h.replace('w<sub>A</sub> ≈ 1.7%', 'w<sub>A</sub> ≈ 0.6%'),
  },
  {
    name: 'M13 把 rAF 注册挪到同步首帧之前',
    suite: 'check', expect: ['S7'],
    apply: (h) => h.replace(/(\ntick\(\); +\/\* 同步首帧[^\n]*\n)/, '\n')
      .replace(/(requestAnimationFrame\(loop\);)/, '$1\ntick();'),
  },
  {
    name: 'M14 控制组：插入一条无害注释（必须全部通过）',
    suite: 'all', expect: [], control: true,
    apply: (h) => h.replace('</main>', '</main>\n<!-- 校验控制组：这行注释不应触发任何断言 -->'),
  },
];

function runOne(html, suite) { return SUITES[suite](html); }

const html0 = fs.readFileSync(SRC, 'utf8');
const base = {
  check: checkHtml(html0), verify: verifyHtml(html0), smoke: runSmoke(html0),
};
let allGood = true;
let caught = 0, total = 0;

console.log('基线：' + Object.entries(base).map(([k, v]) => `${k} ${v.total - v.failed}/${v.total}`).join('  '));
for (const [k, v] of Object.entries(base)) if (!v.ok) { allGood = false; console.log(`  基线 ${k} 未通过：` + v.res.filter((r) => !r.pass).map((r) => r.name).join('; ')); }

for (const m of MUTATIONS) {
  const html = m.apply(html0);
  if (html === html0) { console.log(`  BROKEN  ${m.name}  —— 变异锚点没找到（脚本与页面已脱节）`); allGood = false; continue; }
  total++;
  if (m.control) {
    const rs = ['check', 'verify', 'smoke'].map((s) => runOne(html, s));
    const okAll = rs.every((r) => r.ok);
    if (okAll) caught++;
    else allGood = false;
    console.log(`  ${okAll ? 'OK     ' : 'FALSE+ '} ${m.name}  [三套仍全绿]`);
    continue;
  }
  const r = runOne(html, m.suite);
  const fails = r.res.filter((x) => !x.pass).map((x) => x.name);
  const hit = m.expect.every((e) => fails.some((f) => f.startsWith(e)));
  const fired = fails.length > 0;
  if (fired && hit) caught++; else allGood = false;
  console.log(`  ${fired && hit ? 'OK     ' : 'MISS   '} ${m.name}  —— ${m.suite}: ${fails.slice(0, 3).join('; ') || '没有断言失败'}`);
}

console.log(`\nmutations: ${caught}/${total}（含 1 条无害控制组）`);
process.exit(allGood ? 0 : 1);
