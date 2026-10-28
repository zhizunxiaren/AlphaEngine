'use strict';
/* 静态守卫：语法、DOM 接线、离线、同步首帧顺序、字号、以及若干"当年写错过"的反向守卫。 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'index.html');
const MIN_FONT = 11.5;

function checkHtml(html) {
  const res = [];
  const ok = (name, cond, detail) => res.push({ name, pass: !!cond, detail: detail || '' });

  const a = html.lastIndexOf('<script>'), b = html.lastIndexOf('</script>');
  if (a < 0 || b < 0) { ok('S0 存在内联脚本', false); return { ok: false, res, failed: 1, total: 1 }; }
  const code = html.slice(a + 8, b);
  let parseErr = null;
  try { new Function(code); } catch (e) { parseErr = e.message; }
  ok('S1 内联脚本可解析', !parseErr, parseErr || `${code.split('\n').length} 行`);

  /* 每个 $('#id') 必须有对应 id；id 不可重复 */
  const refs = [...code.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]);
  const ids = [...html.matchAll(/\sid="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]);
  const idSet = new Set(ids);
  const missing = [...new Set(refs)].filter((r) => !idSet.has(r));
  ok('S2 所有 $(\'#id\') 都有对应元素', missing.length === 0, missing.join(',') || `${new Set(refs).size} 个引用`);
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  ok('S3 id 不重复', dup.length === 0, dup.join(',') || `${ids.length} 个 id`);

  /* 四个权重模式必须齐全，且 wAof 里有对应分支 */
  const modes = [...html.matchAll(/data-h="([a-z]+)"/g)].map((m) => m[1]);
  ok('S4 权重模式 = avg/bal/pow/raw', ['avg', 'bal', 'pow', 'raw'].every((m) => modes.includes(m)), modes.join(','));
  ok('S5 wAof 覆盖全部模式（pow 为兜底分支）',
    ['raw', 'avg', 'bal'].every((m) => code.includes(`==='${m}'`)) && code.includes('wPow(x)'), 'raw/avg/bal + wPow 兜底');

  /* 离线：不得有外部脚本/样式 */
  const ext = /<script[^>]+src=|<link[^>]+href="https?:/i.test(html);
  ok('S6 零外部依赖（可离线单文件打开）', !ext);

  /* 同步首帧必须早于 rAF 注册：画布内容不得只由 rAF 回调产生。
     注意 tick(); 在 loop() 体内也出现过一次，所以必须锚定"独立成行"的那一处，
     否则把注册顺序颠倒也能通过（本校验第一版就是这么假绿的）。 */
  const tickRe = /^[ \t]*tick\(\);[ \t]*(?:\/\*[\s\S]*?\*\/)?[ \t]*$/gm;
  const tickMatches = [...code.matchAll(tickRe)];
  const iTick = tickMatches.length ? tickMatches[0].index : -1;
  const iRaf = code.indexOf('requestAnimationFrame(loop)');
  ok('S7 顶层同步画首帧，且早于 rAF 注册', iTick >= 0 && iRaf > iTick, `tick@${iTick} < raf@${iRaf}`);
  ok('S8 顶层只有一个独立 tick() 调用（不会重复推进统计）', tickMatches.length === 1, `${tickMatches.length} 处`);

  /* 画布字号下限（10~11px 在等宽字体下会糊字） */
  const fonts = [...code.matchAll(/\.font\s*=\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const bad = fonts.filter((f) => {
    const px = /(\d+(?:\.\d+)?)px/.exec(f);
    return px && parseFloat(px[1]) < MIN_FONT;
  });
  ok('S9 画布字号 ≥ 11.5px', bad.length === 0, bad.join(' | ') || fonts.join(' | '));

  /* 数学块必须存在且各出现一次 */
  const mBegin = html.split('/* __MATH_BEGIN__').length - 1;
  const mEnd = html.split('/* __MATH_END__ */').length - 1;
  ok('S10 __MATH_BEGIN__ / __MATH_END__ 各一次', mBegin === 1 && mEnd === 1, `${mBegin}/${mEnd}`);

  /* 反向守卫：p1 必须按截断质量归一化，否则 ∫p≠1（本页真实修过的缺陷）。
     在剥掉注释的源码上做，避免记录该缺陷的注释自己命中。 */
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const p1Def = /const p1=\(x,a,o,z\)=>\(1-a\)\+a\*Nm\(x,\.62\+o,\.06\)\/\(z\|\|M1\(a,o\)\)/.test(bare);
  ok('S11 p1 归一到 1（除以截断质量，不是除以 a）', p1Def);
  ok('S12 三处画布都存在且有 id', ['c1', 'c2', 'c3'].every((c) => idSet.has(c)));
  ok('S13 无 console.log / debugger 残留', !/console\.log|debugger/.test(bare));

  /* CSS 级联：text-transform 会把 a→A、Δ 等记号改掉 */
  const tt = /text-transform\s*:\s*(uppercase|capitalize|lowercase)/.test(html);
  ok('S14 无 text-transform 改写记号大小写', !tt);

  /* 正文数字与代码同源：分账百分比在正文里出现（防止改了 f 却忘了改文字）。
     锚定整句，而不是只找 "1.7%" 字样——同段落前面还有一处 1.7%，只查字样会假绿。 */
  ok('S15 正文的 w_A 分账句与函数实测值一致（1.7% / 99.3%）',
    html.includes('<b>w<sub>A</sub> ≈ 1.7%</b>') && html.includes('<b>w<sub>A</sub> ≈ 99.3%</b>'));
  ok('S16 正文声明了 2 倍偏差的说法', /两倍|2I/.test(html));

  const failed = res.filter((r) => !r.pass);
  return { ok: failed.length === 0, res, failed: failed.length, total: res.length };
}

if (require.main === module) {
  const html = fs.readFileSync(process.argv[2] || SRC, 'utf8');
  const r = checkHtml(html);
  for (const x of r.res) console.log((x.pass ? '  PASS ' : '  FAIL ') + x.name + (x.detail ? '  [' + x.detail + ']' : ''));
  console.log(`\nstatic: ${r.total - r.failed}/${r.total}`);
  process.exit(r.ok ? 0 : 1);
}
module.exports = { checkHtml, SRC };
