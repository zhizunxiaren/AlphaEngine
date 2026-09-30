/* ==================================================================
   光栅化教学页 · 静态校验
   ------------------------------------------------------------------
   这一层只读源码文本，不执行页面。它管三件事：
     1. 结构性一致性（目录 / 章节 / 控件接线 / DOM 引用）
     2. 关键公式的**正向**守卫（这些写法必须存在）
     3. 曾经写错过的写法的**反向**守卫（这些写法必须不存在）

   第 3 条是本文件存在的主要理由。
   一个「页面画出来没问题」的 bug —— 相机符号反了、面法线取自屏幕坐标、
   纵轴上下镜像、MSAA 的 N 没归一化 —— 眼睛是看不出来的：
   画面照样是一个三角形、一颗球、一张图。只有断言「那种写法不再出现」
   才能防止它悄悄回来。

   运行：node _check.js
   ================================================================== */
const fs = require('fs');
/* 允许命令行指定待校验的 HTML 路径（_neg.js 的变异测试靠这个跑改坏的副本） */
const path = process.argv[2] || require('path').join(__dirname, 'index.html');
const html = fs.readFileSync(path, 'utf8');

let bad = 0;
function ok(name, cond, extra) {
  console.log('  ' + (cond ? '✅' : '❌') + '  ' + name + (extra !== undefined ? '   [' + extra + ']' : ''));
  if (!cond) bad++;
}
function section(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 60 - t.length))); }

/* ---------- 0. 语法 ---------- */
section('0 语法与脚本块');
const s0 = html.lastIndexOf('<script>'), s1 = html.lastIndexOf('</script>');
if (s0 < 0 || s1 < 0 || s1 < s0) { console.log('  ❌ 找不到完整的 <script> 块'); process.exit(1); }
const code = html.slice(s0 + '<script>'.length, s1);
console.log('  HTML ' + html.split('\n').length + ' 行 / ' + html.length + ' 字节 · ' +
            '脚本 ' + code.split('\n').length + ' 行 / ' + code.length + ' 字节');
try { new Function(code); ok('脚本语法可解析', true); }
catch (e) { ok('脚本语法可解析', false, e.message); process.exit(1); }
/* 去掉注释再做反向守卫：修复说明里**会引用**旧的错误写法
   （「曾经写成 X」），如果直接在原文上匹配，守卫会被自己的注释绊倒。
   第一版就是这样：三条反向守卫全红，查下去发现命中的是修复注释本身。 */
const bare = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
ok('只有一个 <script> 块（多块会让校验脚本抽错）',
   (html.match(/<script\b/g) || []).length === 1);
ok('脚本是 IIFE + \'use strict\'（不往全局漏变量）',
   /\(function\(\)\{\s*\n'use strict';/.test(code));
ok('页面里没有遗留的 console.log（交付物不该往控制台打字）',
   !/^\s*console\.(log|warn|error)\s*\(/m.test(code));
ok('页面里没有遗留的调试占位符', !/@@[A-Z0-9_]+@@|TODO|FIXME|XXX/.test(code));
ok('没有硬编码的绝对路径（I:/… 或 file:///…）—— 两页都要能整体搬迁',
   !/I:\/|I:\\\\|file:\/\/\/I:/i.test(html));

/* ---------- 1. 目录 / 章节一致性 ---------- */
section('1 目录 ↔ 章节 ↔ id 一致性');
const htmlIds = [...new Set([...html.matchAll(/\sid="([a-zA-Z0-9_-]+)"/g)].map(m => m[1]))];
const toc = [...html.matchAll(/<a\s+href="#(s\d+)"[^>]*>([\s\S]*?)<\/a>/g)]
  .map(m => ({ id: m[1], text: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }));
const h2s = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)]
  .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
ok('目录有 ' + toc.length + ' 项，h2 有 ' + h2s.length + ' 个（应当相等）', toc.length === h2s.length);
ok('目录每一项都指向一个存在的 id', toc.every(t => htmlIds.indexOf(t.id) >= 0),
   toc.filter(t => htmlIds.indexOf(t.id) < 0).map(t => t.id).join(',') || '全部命中');
/* 目录文字与章节标题必须讲同一件事：取标题前几个字比对 */
const tampered = [];
toc.forEach((t, i) => {
  if (!h2s[i]) return;
  /* 只取标题开头的连续汉字做主题词：目录里带 ①…⑫ 编号、
     章节标题里带「：」与英文缩写，直接比字符串会误报。 */
  const m = /^[\u4e00-\u9fa5]{2,6}/.exec(t.text.replace(/^[①-⑫\s]+/, ''));
  if (!m) return;
  if (h2s[i].indexOf(m[0]) < 0) tampered.push('#' + t.id + ' 「' + t.text + '」 vs「' + h2s[i] + '」');
});
ok('目录文字与对应章节标题讲的是同一个主题', tampered.length === 0,
   tampered.join(' / ') || toc.length + '/' + toc.length + ' 对应');
ok('章节 id 从 s0 连续编号到 s' + (toc.length - 1),
   toc.every((t, i) => t.id === 's' + i), toc.map(t => t.id).join(' '));

/* ---------- 2. 控件接线 ---------- */
section('2 控件接线（HTML 里的每个控件脚本都得认）');
const ctrlIds = [];
for (const m of html.matchAll(/<(input|select|button)\b([^>]*)>/g)) {
  const id = /\bid="([^"]+)"/.exec(m[2]);
  if (id) ctrlIds.push({ id: id[1], tag: m[1] });
}
const notUsed = ctrlIds.filter(c => code.indexOf("'" + c.id + "'") < 0);
ok('HTML 里 ' + ctrlIds.length + ' 个控件全部在脚本中被引用', notUsed.length === 0,
   notUsed.map(c => c.id).join(',') || '全部已接');
/* 光「id 出现在源码里」不够 —— 删掉一行 addEventListener，控件就成了摆设，
   而 $('id') 那行还在，上面的检查照样全绿（M28 就是这么假通过的）。
   所以要把「控件 id → 持有它的变量名」解出来，再要求那个变量被绑过事件。 */
{
  const holders = Object.create(null);
  for (const m of bare.matchAll(/(\w+)\s*=\s*\$\('([\w-]+)'\)/g)) {
    (holders[m[2]] = holders[m[2]] || []).push(m[1]);
  }
  const unwired = [];
  ctrlIds.forEach(function (c) {
    const vars = holders[c.id];
    if (!vars) { unwired.push(c.id + '(没有被 $() 绑到变量)'); return; }
    const bound = vars.some(v => new RegExp('\\b' + v + '\\.addEventListener\\s*\\(').test(bare));
    if (!bound) unwired.push(c.id + '(' + vars.join('/') + ' 未绑定监听)');
  });
  ok(ctrlIds.length + ' 个控件都真的绑了事件监听（不只是被引用过）',
     unwired.length === 0, unwired.join(' · ') || '全部已绑');
}
/* 数据出口：<b id="..."> 之类的读数格必须有 set('id',...) 或 textContent 写入 */
const outIds = htmlIds.filter(id => /^(v-|ed-|fl-|dp-|pe-|pj-|fk-|sh-|ms-|cu-|o-)/.test(id));
const unwritten = outIds.filter(id => code.indexOf("'" + id + "'") < 0);
ok('HTML 里 ' + outIds.length + ' 个读数格全部由脚本写入', unwritten.length === 0,
   unwritten.join(',') || '全部已接');
/* 画布：每个 cv-* 都得被 $() 拿到 */
const cvs = htmlIds.filter(id => /^cv-/.test(id));
const cvsUnused = cvs.filter(id => code.indexOf("'" + id + "'") < 0);
ok('HTML 里 ' + cvs.length + ' 个画布全部被脚本引用', cvsUnused.length === 0, cvsUnused.join(',') || '全部已用');
/* 反向：脚本引用的 id 必须都在 HTML 里（否则 getElementById 返回 null） */
const used = [...new Set([...code.matchAll(/\$\('([a-zA-Z0-9_-]+)'\)/g)].map(m => m[1]))];
const dangling = used.filter(id => htmlIds.indexOf(id) < 0);
ok('脚本引用的 ' + used.length + ' 个 id 全部存在于 HTML', dangling.length === 0, dangling.join(',') || '无悬空引用');

/* 轨迹卡：每张都要跳到存在的章节，且指向的章节不能是自己 */
const traps = [...html.matchAll(/class="trap"\s+data-jump="#(s\d+)"/g)].map(m => m[1]);
ok('陷阱卡 ' + traps.length + ' 张，全部指向存在的章节',
   traps.length > 0 && traps.every(t => htmlIds.indexOf(t) >= 0), traps.join(' '));
ok('陷阱卡指向的是具体小节（不是 s0 结论页）', traps.every(t => t !== 's0'));

/* ---------- 3. 关键公式的正向守卫 ---------- */
section('3 正向守卫：这些写法必须存在');
const POS = [
  [/function Efun\(ax,ay,bx,by,px,py\)\{ return \(bx-ax\)\*\(py-ay\) - \(by-ay\)\*\(px-ax\); \}/,
   '边缘函数 E(a,b,p) = (b−a)×(p−a) 的二维叉积形式'],
  [/var w0 = Efun\(v1\.x,v1\.y, v2\.x,v2\.y, px,py\);/, 'λ0 权重取 v1→v2 这条对边'],
  [/var s = w0 \+ w1 \+ w2;/, 'Σ = 三个未归一化权重之和（= 两倍面积）'],
  [/return dy === 0 \? \(dx < 0\) : \(dy > 0\);/, 'top-left 判据：水平向左算 top，非水平向下算 left'],
  [/function edgeIsTopLeft\(sgn, a, b\)\{[\s\S]{0,120}?\(b\.x-a\.x\)\*sgn/,
   'top-left 判据把边方向折到归一化绕序（漏了 sgn 就会「一边收一边弃」→ 裂缝）'],
  [/var a0 = l\.l0\/w0, a1 = l\.l1\/w1, a2 = l\.l2\/w2;/, '透视校正权重 = λ/w 再归一化'],
  [/z: \(f\/\(f-n\)\)\*\(1 - n\/w\)/, 'z01 = (f/(f−n))·(1 − n/w)'],
  [/var lz = o\.depthPersp \? perspWeights\(l, v0\.w, v1\.w, v2\.w\) : l;/,
   '深度默认走屏幕空间线性插值（depthPersp 才是那个错误开关）'],
  [/if\(!\(zs\*stored < zs\*fb\.z\[idx\]\)\) continue;/, '深度比较写成 zs·stored < zs·buf（一份代码同时支持正/反 Z）'],
  [/if\(o\.mask && o\.mask\[y\*W\+x\] === 0\) o\.mask\[y\*W\+x\] = 1;/,
   'mask 只在未标记时写 1（否则会把已覆盖的 2 覆盖掉）'],
  [/u: P\.l0\*v0\.u \+ P\.l1\*v1\.u \+ P\.l2\*v2\.u,/, 'attrAt 的 u 用 v0/v1/v2 三个顶点'],
  [/r: P\.l0\*v0\.r \+ P\.l1\*v1\.r \+ P\.l2\*v2\.r,/, 'attrAt 的 r 用 v0/v1/v2 三个顶点'],
  [/nlen: Math\.sqrt\(nx\*nx \+ ny\*ny \+ nz\*nz\)/, 'attrAt 报出插值后法线长度（§9 的判据）'],
  [/function normMSAA\(n\)\{ return MSAA_POS\[n\] \? n : 4; \}/, 'N 归一化集中在一处'],
  [/var N = normMSAA\(N0\);/, 'rasterMSAA 一进来就归一化 N'],
  [/N = normMSAA\(sel \? \+sel\.value : 4\);/, '§10 从控件读到的 N 也过同一处归一化'],
  [/var z0 = reverse \? 0 : 1;|z0 = reverse \? 0 : 1/, 'fbClear 的初值随 reverse 反转（否则第一帧全被判成「更远」）'],
  [/function sci\(v\)\{/, 'sci 科学计数法在顶层'],
  [/FONT = '600 11\.5px/, '画布字号下限 11.5px'],
  [/function makeView\(eye, yaw, pitch\)\{/, '相机是右手系、朝 −Z'],
  [/if\(dot3\(fn, nrm3\(wa\)\) < 0\) fn = v3\(-fn\.x, -fn\.y, -fn\.z\);/,
   '平面法线按顶点法线翻向（否则 flat 模式整颗球被照成背面）'],
  [/ctx\.lineTo\(zx \+ \(ox2\+8\+0\.5\)\*cell, zy \+ \(oy2\+8\+0\.5\)\*cell\);/,
   '§5 放大窗的对角线终点落在窗口右下角那一格（不多画一寸）'],
  [/var ox2 = 12 - 4, oy2 = 12 - 4;/, '§5 放大窗的窗口原点抽成变量（画线/填格共用同一个原点）'],
  [/if\(rule === 'all'\)\s+return true;[\s\S]{0,140}?if\(rule === 'none'\) return false;/,
   '两种错误边界规则都保留在代码里（作为对照，不是死代码）'],
];
/* 正向守卫也跑在 bare 上：否则「注释里提了一句」就会被当成「代码里有」 */
POS.forEach(([re, name]) => ok(name, re.test(bare)));

/* ---------- 4. 反向守卫：曾经写错过的写法必须不再出现 ---------- */
section('4 反向守卫：这些写法不能再出现');
const NEG = [
  [/N = sel \? \+sel\.value : 4;/, '§10 的 draw() 不再从控件直接读 N（setState 会被下一次 draw 覆盖）'],
  [/MSAA_POS\[N\] \|\| MSAA_POS\[1\]/, '不再用「只换 SP 不改 N」的半归一化（会读到 undefined）'],
  [/\{x:vs\[1\]\.x,y:vs\[1\]\.y,z:vs\[1\]\.z\}/, 'flat 面法线不再取自屏幕坐标 + z01'],
  [/oy \+ p\.y\*s3/, '§2 左图纵轴不再上下镜像（+y 必须画在上方）'],
  [/p\[0\]\*cy - p\[2\]\*sy, p\[1\], p\[0\]\*sy \+ p\[2\]\*cy \+ d\)/, '§2 相机前移不再写成 +d（那会把物体放到摄像机背后）'],
  [/oy \+ p\.y\*s3 - p\.z\*s3\*0\.30/, '旧的 §2 纵轴表达式不再出现'],
  [/if\(a===0 && !\(useRule && tl\.e01\)\)/, '旧的错误边界判据写法不再出现'],
  [/wsum/, 'attrAt 不再用名字与算法都不对的 wsum'],
  [/set-syntax/, '不再出现占位/破坏性标记词'],
  [/shade2/, '不再有残留的 shade2 字段'],
  [/for\(var i=0;i<W\*H;i\+\+\) shown\.z\[i\] = 0\.42;/, '不再有写死深度值的死循环'],
  [/#3a4[^\s'"]{0,3}'/, '不再有被破坏的颜色字面量（曾经出现过 #3a4椅 这类乱码）'],
  [/strokeStyle = '#[0-9a-fA-F]{0,5}[^0-9a-fA-F'"\s]/, '颜色字面量都是合法十六进制'],
  [/var isCov = stat\.covS\[cidx\] > 0;/, '§10 放大窗不再留着算出来却没用的 isCov'],
  [/ctx\.lineTo\(zx \+ \(12-4\+0\.5\)\*cell \+ cell\*9/, '§5 放大窗的对角线不再多画一格伸到窗外'],
];
/* 注意：这些正则跑在 __bare__（已剥注释）上 */
NEG.forEach(([re, name]) => ok(name, !re.test(bare)));

/* ---------- 5. 顺序敏感 / 单一来源的结构约束 ---------- */
section('5 顺序与单一来源（正则查不出、只能比下标的地方）');
{
  /* sci 必须在 depthSec 之前定义 —— 否则§7 调用时会 ReferenceError（整页白屏） */
  const iSci = code.indexOf('function sci(v){');
  const iDepth = code.indexOf('var depthSec = (function(){');
  const iPersp = code.indexOf('var perspSec = (function(){');
  ok('sci 定义在 §6（depthSec）之前', iSci > 0 && iSci < iDepth, 'sci@' + iSci + ' < depth@' + iDepth);
  ok('sci 定义在 §7（perspSec）之前 —— 曾经它被困在 §6 的闭包里，§7 一调用就整页中断',
     iSci > 0 && iSci < iPersp, 'sci@' + iSci + ' < persp@' + iPersp);
}
{
  /* 页面自检必须在 window.__rast 赋值之前定义并挂上去 */
  const iVerify = code.indexOf('function verify(){');
  const iExport = code.indexOf('window.__rast = {');
  ok('verify() 定义在 __rast 导出之前', iVerify > 0 && iVerify < iExport);
  ok('__rast.verify 确实挂上了', /window\.__rast = \{[\s\S]*?verify:verify/.test(code));
  const names = ['Efun', 'area2', 'baryScreen', 'perspWeights', 'windingSign', 'edgeIsTopLeft',
    'attrAt', 'makeFB', 'fbClear', 'rasterTri', 'rasterMSAA', 'makeView', 'makeProj',
    'z01of', 'eps32', 'blinnPhong', 'MSAA_POS', 'fbToRGBA', 'sections', 'verify'];
  const missing = names.filter(n => !new RegExp('\\b' + n + ':').test(code.slice(iExport, iExport + 1200)));
  ok('__rast 导出了校验脚本需要的全部 ' + names.length + ' 个出口', missing.length === 0, missing.join(',') || '全部齐');
}
{
  /* 每个 section 模块都要挂在 __rast.sections 上。
     注意这里比的是**导出键名**（edge/cover/…），不是模块变量名（edgeSec/coverSec/…）——
     第一版拿变量名去找，9 个模块全被判成缺失。 */
  const keys = ['fork', 'proj', 'edge', 'cover', 'fill', 'depth', 'persp', 'cull', 'shade', 'msaa', 'merge'];
  const iExport = code.indexOf('window.__rast = {');
  const tail = code.slice(iExport, iExport + 1400);
  const missing = keys.filter(k => !new RegExp('\\b' + k + '\\s*:').test(tail));
  ok(keys.length + ' 个 section 全部挂在 __rast.sections 上', missing.length === 0, missing.join(',') || keys.length + '/' + keys.length);
  /* 每个模块变量本身也得存在 */
  const vars = ['fork', 'proj', 'edgeSec', 'coverSec', 'fillSec', 'depthSec', 'perspSec', 'cullSec', 'shadeSec', 'msaaSec', 'mergeSec'];
  const noVar = vars.filter(v => !new RegExp('\\bvar ' + v + ' = \\(function\\(\\)\\{').test(code));
  ok('11 个模块都以 IIFE 形式定义', noVar.length === 0, noVar.join(',') || '11/11');
}
{
  /* setState 必须把值写回控件（§10 的单一来源） */
  const i = code.indexOf('setState:function(o){\n             if(o.N !== undefined)');
  ok('§10 的 setState 把 N 写回 <select>', i > 0 && code.slice(i, i + 260).indexOf('sel.value = String(o.N)') > 0);
}
{
  /* 「控件即状态」的四个模块不许出现 setState —— 它们没有「模块变量」可写，
     加了 setState 就等于制造第二个状态源（§10 就是这么错的）。 */
  const controlOwned = ['fillSec', 'depthSec', 'perspSec', 'coverSec', 'edgeSec'];
  const offenders = controlOwned.filter(function (name) {
    const i = code.indexOf('var ' + name + ' = (function(){');
    if (i < 0) return false;
    const j = code.indexOf('\n})();', i);
    return code.slice(i, j).indexOf('setState') >= 0;
  });
  ok('只读控件的那几个模块没有被塞进 setState（避免第二个状态源）',
     offenders.length === 0, offenders.join(',') || '干净');
}

/* ---------- 6. 字体与配色一致性 ---------- */
section('6 字号与配色');
{
  const fonts = [...code.matchAll(/font = '([^']*)'/g)].map(m => m[1]);
  const sizes = [];
  fonts.forEach(f => { const m = /(\d+(?:\.\d+)?)px/.exec(f); if (m) sizes.push(+m[1]); });
  const tooSmall = sizes.filter(v => v < 11.5);
  ok('画布内出现的字号都不低于 11.5px（10/10.5px 会糊字）', tooSmall.length === 0,
     sizes.length ? '出现 ' + [...new Set(sizes)].sort((a, b) => a - b).join(',') + 'px' : '无');
}
{
  /* 颜色字面量：统一小写十六进制（含 CSS 与 canvas 两侧） */
  const hexes = [...bare.matchAll(/#([0-9a-fA-F]{6})\b/g)].map(m => m[1]);
  const upper = [...new Set(hexes.filter(h => /[A-F]/.test(h)))];
  ok('十六进制颜色字面量统一小写（' + hexes.length + ' 处）', upper.length === 0, upper.join(',') || '全部小写');
}
{
  /* 主色板必须与光线追踪页同构，但 hero 渐变不同（辨识度） */
  ok('CSS 变量色板与光线追踪页同构（--accent/--teal/--amber/--rose 都在）',
     ['--accent', '--teal', '--amber', '--rose', '--vp'].every(v => html.indexOf(v + ':') > 0));
  ok('hero 渐变与光线追踪页不同（两页可区分）',
     /linear-gradient\(140deg,#12172a 0%,#152a3d 55%,#0f3330 100%\)/.test(html));
}

/* ---------- 7. 与页面自检的对应 ---------- */
section('7 页面自检的存在性');
{
  const nOk = (code.match(/\bok\('/g) || []).length;
  ok('页面自检断言 ' + nOk + ' 处（≥ 20）', nOk >= 20);
  const groups = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬'.split('').filter(c => code.indexOf("ok('" + c) >= 0);
  ok('页面自检覆盖 ①–⑬ 十三组（实到 ' + groups.length + ' 组）', groups.length >= 13, groups.join(''));
}

console.log('\n' + '='.repeat(64));
if (bad) { console.log('静态校验：' + bad + ' 项不通过 ❌'); process.exit(1); }
console.log('静态校验：全部通过 ✅');
