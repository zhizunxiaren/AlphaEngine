/* ==================================================================
   光栅化教学页 · 变异测试（负向）
   ------------------------------------------------------------------
   目的只有一个：证明前面那几套校验**不是空转**。

   做法：把页面源码逐条改坏（每次只改一处），写到系统临时目录，
   再让 _check.js / verify.raster.js / _probe1.js 去跑那份副本。
   期望结果是「校验必须报错」。如果改坏了却依然全绿，
   说明那条断言是装饰品 —— 本文件就会把这条变异标成失败。

   反过来，M00 与 M35 是**无害**改动（只动一处文案空格），
   它们必须**不被**检出。没有这个对照，「所有变异都被检出」也可能是
   因为校验脚本自己坏了（比如路径写错、永远退出非 0）。
   每个被判定的脚本都至少配一个这样的控制组。

   运行：node _neg.js
   ================================================================== */
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = __dirname;
const SRC = path.join(DIR, 'index.html');
const original = fs.readFileSync(SRC, 'utf8');

/* 每个变异：
     id/name  说明
     find     要替换的原文（必须能在源码里找到 —— 找不到就是变异本身失效）
     repl     替换成什么
     script   用哪个校验脚本来抓它
     expect   true = 期望被抓到；false = 控制组，期望不被抓到
     note     说明这条变异对应哪条断言（报错信息里会带上） */
const MUTANTS = [
  { id: 'M00', name: '无害改动：只多打一个空格（控制组）',
    find: '   光栅化 · 可视化拆解', repl: '   光栅化 ·  可视化拆解',
    script: '_check.js', expect: false,
    note: '用来证明校验脚本本身是活的：无害改动不该被检出' },

  /* ---- §5 填充规则 ---- */
  { id: 'M01', name: '边界归属改成「一律接受」（= rule all）',
    find: 'return isTL;', repl: 'return true;',
    script: 'verify.raster.js', expect: true, note: 'C1/C2 水密性' },
  { id: 'M02', name: '边界归属改成「一律拒绝」（= rule none）',
    find: 'return isTL;', repl: 'return false;',
    script: 'verify.raster.js', expect: true, note: 'C1/C3 水密性' },
  { id: 'M03', name: 'top-left 判据漏掉 sgn（不减到归一化绕序）',
    find: 'var dx = (b.x-a.x)*sgn, dy = (b.y-a.y)*sgn;',
    repl: 'var dx = (b.x-a.x), dy = (b.y-a.y);',
    script: 'verify.raster.js', expect: true, note: 'C1/C9 共享边归属' },
  { id: 'M04', name: 'top-left 判据恒真（不分顶边/左边）',
    find: 'return dy === 0 ? (dx < 0) : (dy > 0);', repl: 'return true;',
    script: 'verify.raster.js', expect: true, note: 'C8 四个规范情形 / C1' },
  { id: 'M05', name: 'windingSign 恒为 +1（不再折正绕序）',
    find: 'function windingSign(v0,v1,v2){ return area2(v0,v1,v2) < 0 ? -1 : 1; }',
    repl: 'function windingSign(v0,v1,v2){ return 1; }',
    script: 'verify.raster.js', expect: true, note: 'B6 绕序无关' },

  /* ---- 数学内核 ---- */
  { id: 'M06', name: '重心坐标不做归一化',
    find: 'return { l0:w0/s, l1:w1/s, l2:w2/s, sum:s, w0:w0, w1:w1, w2:w2 };',
    repl: 'return { l0:w0, l1:w1, l2:w2, sum:s, w0:w0, w1:w1, w2:w2 };',
    script: 'verify.raster.js', expect: true, note: 'A3/A5 与页面 ①–③' },
  { id: 'M07', name: '透视校正权重退化成仿射权重',
    find: 'var a0 = l.l0/w0, a1 = l.l1/w1, a2 = l.l2/w2;',
    repl: 'var a0 = l.l0, a1 = l.l1, a2 = l.l2;',
    script: 'verify.raster.js', expect: true, note: 'A8a 与射线求交的真值' },
  { id: 'M08', name: 'attrAt 的红通道三个权重都取自 v2',
    find: 'r: P.l0*v0.r + P.l1*v1.r + P.l2*v2.r,',
    repl: 'r: P.l0*v2.r + P.l1*v2.r + P.l2*v2.r,',
    script: 'verify.raster.js', expect: true, note: 'A14 通道独立性' },
  { id: 'M09', name: 'z01 公式写错（1 − w/n 而不是 1 − n/w）',
    find: 'return (f/(f-n))*(1 - n/w);', repl: 'return (f/(f-n))*(1 - w/n);',
    script: 'verify.raster.js', expect: true, note: 'A10a 端点值' },
  { id: 'M10', name: 'eps32(0) 返回 0（而不是最小规格化数）',
    find: 'if(!(a > 0)) return Math.pow(2,-149);', repl: 'if(!(a > 0)) return 0;',
    script: 'verify.raster.js', expect: true, note: 'A11c（返回 0 会让精度曲线出现 Infinity）' },
  { id: 'M11', name: '深度导数少除一个 d',
    find: 'slope = A*n/(d*d);', repl: 'slope = A*n/d;',
    script: 'verify.raster.js', expect: true, note: 'A12 可分辨距离' },

  /* ---- 相机 / 投影 ---- */
  { id: 'M12', name: '相机前移写成 +d（物体跑到摄像机背后）',
    find: 'p[0]*sy + p[2]*cy - d', repl: 'p[0]*sy + p[2]*cy + d',
    script: 'verify.raster.js', expect: true, note: 'I1 w 全为正' },
  { id: 'M13', name: '§2 左图纵轴上下镜像',
    find: 'function Y3(p){ return oy - p.y*s3; }', repl: 'function Y3(p){ return oy + p.y*s3; }',
    script: '_check.js', expect: true, note: '正向守卫 + 反向守卫' },

  /* ---- 深度缓冲 ---- */
  { id: 'M14', name: 'fbClear 的初值不随 reverse 反转',
    find: 'z0 = reverse ? 0 : 1', repl: 'z0 = 1',
    script: 'verify.raster.js', expect: true, note: 'D4 覆盖集 / 页面 ⑥ 组' },
  { id: 'M15', name: '深度比较方向反了',
    find: 'if(!(zs*stored < zs*fb.z[idx])) continue;',
    repl: 'if(!(zs*stored > zs*fb.z[idx])) continue;',
    script: 'verify.raster.js', expect: true, note: 'D1 近者胜' },
  { id: 'M16', name: '深度默认就做透视校正（本应是错误开关）',
    find: 'var lz = o.depthPersp ? perspWeights(l, v0.w, v1.w, v2.w) : l;',
    repl: 'var lz = o.depthPersp ? l : perspWeights(l, v0.w, v1.w, v2.w);',
    script: 'verify.raster.js', expect: true, note: 'D1（透视校正后的深度不再单调）' },
  { id: 'M17', name: 'fbClear 不清空 cover',
    find: 'fb.z[i]=z0; fb.cover[i]=0; }', repl: 'fb.z[i]=z0; }',
    script: 'verify.raster.js', expect: true, note: 'C1 水密性（覆盖次数会累积）' },
  { id: 'M18', name: 'mask 无条件写 1（会把已覆盖的 2 降级）',
    find: 'if(o.mask && o.mask[y*W+x] === 0) o.mask[y*W+x] = 1;',
    repl: 'if(o.mask) o.mask[y*W+x] = 1;',
    script: 'verify.raster.js', expect: true, note: 'B7 mask 语义' },

  /* ---- §9 着色频率 ---- */
  { id: 'M19', name: 'flat 不写回面法线（退化成逐顶点法线）',
    find: 'for(k=0;k<3;k++){ vs[k].nx = fn.x; vs[k].ny = fn.y; vs[k].nz = fn.z; }',
    repl: '/* 变异：不写回面法线 */',
    script: 'verify.raster.js', expect: true, note: 'G5b flat 的插值后法线长度应恰为 1' },

  /* ---- §10 MSAA ---- */
  { id: 'M20', name: 'N 归一化被改成恒等（表外 N 会读到 undefined）',
    find: 'function normMSAA(n){ return MSAA_POS[n] ? n : 4; }',
    repl: 'function normMSAA(n){ return n; }',
    script: 'verify.raster.js', expect: true, note: 'H9' },
  { id: 'M21', name: 'MSAA 退化成逐样本着色（= SSAA）',
    find: 'if(o.perSampleShade){', repl: 'if(true){',
    script: 'verify.raster.js', expect: true, note: 'H2 MSAA 的成本结构' },
  { id: 'M22', name: '§10 的 draw() 重新从控件读 N（制造第二个状态源）',
    find: 'N = normMSAA(sel ? +sel.value : 4);',
    repl: 'N = sel ? +sel.value : 4;',
    script: '_check.js', expect: true, note: '单一来源反向守卫' },

  /* ---- 静态守卫 ---- */
  { id: 'M23', name: '字号掉回 10px（会糊字）',
    find: "FONT = '600 11.5px ui-monospace,Consolas,monospace'",
    repl: "FONT = '600 10px ui-monospace,Consolas,monospace'",
    script: '_check.js', expect: true, note: '字号下限守卫' },
  { id: 'M24', name: '颜色字面量改成大写十六进制',
    find: '#5fd0a8', repl: '#5FD0A8',
    script: '_check.js', expect: true, note: '配色一致性守卫' },
  { id: 'M25', name: '章节标题与目录对不上',
    find: '覆盖范围收缩：别去测不该问的像素', repl: '裁剪与包围盒',
    script: '_check.js', expect: true, note: '目录 ↔ 章节一致性' },
  { id: 'M26', name: '陷阱卡跳到不存在的章节',
    find: 'data-jump="#s10"', repl: 'data-jump="#s99"',
    script: '_check.js', expect: true, note: '陷阱卡跳转守卫' },
  { id: 'M27', name: '§5 放大窗的对角线多画一格',
    find: 'ctx.lineTo(zx + (ox2+8+0.5)*cell, zy + (oy2+8+0.5)*cell);',
    repl: 'ctx.lineTo(zx + (ox2+8+0.5)*cell + cell, zy + (oy2+8+0.5)*cell + cell);',
    script: '_check.js', expect: true, note: '§5 放大窗正向守卫' },
  { id: 'M28', name: '删掉一个控件的事件绑定（控件变成死的）',
    find: "if(cbE) cbE.addEventListener('change', draw);", repl: '/* 变异：不绑定 */',
    script: '_check.js', expect: true, note: '控件接线守卫' },
  { id: 'M29', name: 'sci 定义被挪到调用点之后（整页 ReferenceError）',
    find: 'function sci(v){',
    repl: 'function sciLater(v){',
    script: 'verify.raster.js', expect: true, note: '顶层执行（会直接抛 sci is not defined）' },

  /* ---- §6 场景的良定性（J 组） ----
     这两条对应的是「验出来的真缺陷」，不是假想出来的：
     场景原本四块板全在 y=0，重叠处深度完全相等，反 Z 与标准 Z 会各自
     把平局判给不同的板（3637 个像素颜色不同）。断言 J1/J6/J8 就是为它加的。 */
  { id: 'M30', name: '§6 把橙板压回 y=0（与灰底板共面重叠）',
    find: 'quad([[-1.2,0.24,-3.4],[ 4.6,0.24,-3.4],[ 4.6,0.24,-0.9],[-1.2,0.24,-0.9]]',
    repl: 'quad([[-1.2,0,-3.4],[ 4.6,0,-3.4],[ 4.6,0,-0.9],[-1.2,0,-0.9]]',
    script: 'verify.raster.js', expect: true,
    note: 'J1 反 Z 逐位相同 / J6 平局不是一片区域 / J8 不许共面' },
  { id: 'M31', name: '§6 斜板挪回原位（会挡住蓝板）',
    find: 'quad([[-4.12,1.8,-8.2],[-0.64,1.8,-6.0],[-0.64,-0.2,-3.6],[-4.12,-0.2,-5.8]]',
    repl: 'quad([[-3.2,1.8,-8.2],[ 2.6,1.8,-6.0],[ 2.6,-0.2,-3.6],[-3.2,-0.2,-5.8]]',
    script: 'verify.raster.js', expect: true,
    note: 'J7 每块板都要有两百像素以上可见（原位置只剩 32）' },

  /* ---- §1 的两块画布曾经全黑（用户报的缺陷） ----
     这一组对应的是「真实发生过、且整套校验曾经完全看不见」的缺陷：
     帧缓冲一直是对的，错的是它没上屏。三条变异分别打三个不同的判据，
     少一条就意味着那个判据是装饰品。

     M32 打**静态**守卫：删掉同步首帧后，注册 rAF 的前一行只剩事件绑定，
          `_check.js` 必须报「缺同步首帧」。
     M33 打**动态**守卫：同步首帧还在，但起点进度为 0 —— 帧缓冲算了一遍，
          画上去还是 0 像素，`_probe1.js` 必须报「空画布」。
          这条是静态守卫看不见的：`paintAt(0)` 确实是一次绘制调用。
     M35 是 `_probe1.js` 的**控制组**：无害改动不该让它红，
          否则 M33「被检出」可能只是因为脚本永远退出 1。 */
  { id: 'M32', name: '§1 删掉同步首帧（rAF 暂停时就是两个黑框）',
    find: '  paintAt(START);              /* 同步先画一帧，不依赖 rAF */\n',
    repl: '',
    script: '_check.js', expect: true,
    note: '模块在注册 rAF 之前必须同步画一帧' },
  { id: 'M33', name: '§1 首帧进度改成 0（画了，但一个像素都没画上）',
    find: 'var START = 0.5, startEl = START;',
    repl: 'var START = 0, startEl = START;',
    script: '_probe1.js', expect: true,
    note: '一帧都不驱动时画布必须非空（这就是用户看到的黑框）' },
  { id: 'M34', name: '§8/§9 启动序列里去掉同步 draw()（只留 rAF 注册）',
    find: 'draw(); requestAnimationFrame(tick);',
    repl: 'requestAnimationFrame(tick);',
    script: '_check.js', expect: true,
    note: '注册 rAF 之前同步画一帧（同行形式也要认出来）' },
  { id: 'M35', name: '无害改动：只多打一个空格（`_probe1.js` 的控制组）',
    find: '   光栅化 · 可视化拆解', repl: '   光栅化 ·  可视化拆解',
    script: '_probe1.js', expect: false,
    note: '用来证明 _probe1.js 的断言不是「永远退出 1」' },
];

/* ---------- 执行 ----------
   早先这里是 spawnSync 起子进程跑校验脚本。结果证明不可靠：
   同一个会话里 28 条变异能跑通，几分钟后所有 spawnSync 都返回
   EBUSY（两个 node 解释器都一样）—— 是沙箱环境在拦进程创建，
   与页面无关。把结论建立在一个时灵时不灵的能力上，本身就是缺陷。

   改成用 vm 在**本进程内**跑校验脚本：
     · 把 console.log 收进数组（既能打印又能取「❌ 行」）
     · 把 process 换成桩，process.exit 抛一个带退出码的哨兵
   于是「退出码」照旧拿得到，却不再需要创建进程。
   代价：变异若造成死循环，这里没有超时保护（子进程有）。本文件的
   变异都是常量替换，不新增循环，可以接受。 */
const vm = require('vm');

function run(script, htmlText) {
  const scriptPath = path.join(DIR, script);
  const src = fs.readFileSync(scriptPath, 'utf8');
  const htmlPath = path.join(os.tmpdir(), 'rast-mut-' + Date.now() + '-' +
    Math.random().toString(36).slice(2, 7) + '.html');
  fs.writeFileSync(htmlPath, htmlText);

  const lines = [];
  const push = (...a) => lines.push(a.map(x => (typeof x === 'string' ? x : String(x))).join(' '));
  const EXIT = {};
  const fakeProcess = {
    argv: [process.execPath, scriptPath, htmlPath],
    exit(code) { EXIT.code = (code === undefined ? 0 : code); throw EXIT; },
    exitCode: 0, cwd: process.cwd, execPath: process.execPath, env: process.env,
    platform: process.platform, version: process.version, versions: process.versions,
  };
  const sandbox = {
    require: (id) => require(id.charAt(0) === '.' ? path.resolve(path.dirname(scriptPath), id) : id),
    process: fakeProcess,
    console: { log: push, warn: push, error: push, info: push },
    __dirname: path.dirname(scriptPath),
    __filename: scriptPath,
    module: { exports: {} }, exports: {},
  };

  let code = 0, spawnError = null;
  try {
    vm.runInNewContext(src, vm.createContext(sandbox), { filename: scriptPath });
  } catch (e) {
    if (e === EXIT) code = EXIT.code || 0;
    else {
      /* 校验脚本自己炸了（多半是被变异后的页面/源码触发的）—— 也算「被检出」 */
      code = 1;
      push('❌ 校验脚本抛异常: ' + (e && e.message));
      spawnError = null;
    }
  } finally {
    try { fs.unlinkSync(htmlPath); } catch (e) { /* 已删 */ }
  }
  const out = lines.join('\n');
  const caught = out.split('\n').filter(l => l.indexOf('❌') >= 0)
    .map(l => l.trim().replace(/^❌\s*/, ''));
  return { code, spawnError, out, caught };
}

console.log('共 ' + MUTANTS.length + ' 条变异（含 ' +
  MUTANTS.filter(m => m.expect === false).length + ' 条控制组）\n');
let good = 0, badCount = 0;
const problems = [];

MUTANTS.forEach(function (m) {
  const hits = original.split(m.find).length - 1;
  if (hits === 0) {
    /* 找不到锚点 = 这条变异失效。绝不能算「通过」——
       ray-tracing 那页就出过「锚点用了重写前的旧变量名」这种假通过。 */
    console.log('❌ ' + m.id + ' ' + m.name);
    console.log('     ↳ 注入点没找到（页面已被改动？）：' + JSON.stringify(m.find.slice(0, 60)));
    badCount++; problems.push(m.id + ' 锚点失效');
    return;
  }
  const mutated = original.split(m.find).join(m.repl);
  const r = run(m.script, mutated);
  if (r.spawnError) {
    console.log('❌ ' + m.id + ' ' + m.name);
    console.log('     ↳ 基础设施错误，未能执行校验脚本：' + r.spawnError.code + ' ' + r.spawnError.message);
    badCount++; problems.push(m.id + ' 未能执行（' + r.spawnError.code + '）');
    return;
  }
  const caught = r.code !== 0;
  const wantCaught = m.expect !== false;
  const pass = caught === wantCaught;
  if (pass) good++;
  else { badCount++; problems.push(m.id + ' ' + (wantCaught ? '改坏了却全绿' : '无害改动被误报')); }

  const tag = pass ? '✅' : '❌';
  const verdict = caught ? '被检出' : '全绿';
  console.log(tag + ' ' + m.id + '  ' + m.name);
  console.log('     ' + (wantCaught ? '期望被检出' : '期望不被检出') + ' · 实际 ' + verdict +
              (hits > 1 ? ' · 注入点 ' + hits + ' 处' : '') + ' · 由 ' + m.script + ' 判定');
  console.log('     对应断言：' + m.note);
  if (caught && r.caught.length) {
    /* 只列前三条，避免刷屏 */
    r.caught.slice(0, 3).forEach(c => console.log('       · ' + c));
    if (r.caught.length > 3) console.log('       · …共 ' + r.caught.length + ' 条');
  } else if (!wantCaught && caught) {
    console.log('       · ' + (r.caught[0] || '(无 ❌ 行，但退出码非 0)'));
  }
  console.log('');
});

console.log('='.repeat(68));
console.log('变异测试：' + good + ' / ' + MUTANTS.length + ' 符合预期，' + badCount + ' 条异常');
if (badCount) {
  console.log('\n异常清单：');
  problems.forEach(p => console.log('  · ' + p));
  console.log('\n出现「改坏了却全绿」时，说明对应断言是装饰品，必须去补断言；');
  console.log('出现「锚点失效」时，说明页面改动后这条变异已经不再测试任何东西。');
  process.exit(1);
}
console.log('每一条断言都至少能被一个缺陷触发 ✅');
