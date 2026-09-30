/* 运行时冒烟测试：用最小 DOM/Canvas 桩在 Node 中真实执行 index.html 的脚本，
   捕获 ReferenceError / TypeError 等一切运行时异常，模拟若干帧动画，
   并把 HTML 里出现过的每一个控件都真实派发一次事件。

   为什么这一步不能省：语法检查只能证明「能解析」。§1~§11 的十一个模块
   各自在 draw()/update() 里搬动帧缓冲、写文字、算统计量，
   真正会炸的是「某个 id 拼错了」「某个变量名少了下划线」这类事，
   它们只在执行时才现形。 */
const fs = require('fs');
const path = require('path').join(__dirname, 'index.html');
const html = fs.readFileSync(path, 'utf8');

const s0 = html.lastIndexOf('<script>'), s1 = html.lastIndexOf('</script>');
if (s0 < 0 || s1 < 0) { console.log('❌ 找不到 <script> 块'); process.exit(1); }
const code = html.slice(s0 + '<script>'.length, s1);

const errors = [];
const notes = [];

/* ---------- Canvas 2D 上下文桩 ---------- */
let opCount = 0;
const ctxCalls = Object.create(null);
function makeCtx(tag) {
  const noop = (name) => { ctxCalls[name] = (ctxCalls[name] || 0) + 1; opCount++; };
  return {
    canvas: null,
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '',
    textBaseline: '', globalAlpha: 1, imageSmoothingEnabled: true,
    setTransform() { noop('setTransform'); }, resetTransform() { noop('resetTransform'); },
    clearRect() { noop('clearRect'); }, fillRect() { noop('fillRect'); },
    strokeRect() { noop('strokeRect'); },
    beginPath() { noop('beginPath'); }, closePath() { noop('closePath'); },
    moveTo() { noop('moveTo'); }, lineTo() { noop('lineTo'); }, arc() { noop('arc'); },
    rect() { noop('rect'); }, fill() { noop('fill'); }, stroke() { noop('stroke'); },
    save() { noop('save'); }, restore() { noop('restore'); },
    setLineDash() { noop('setLineDash'); }, fillText() { noop('fillText'); },
    strokeText() { noop('strokeText'); },
    measureText(t) { return { width: String(t == null ? '' : t).length * 6.6 }; },
    drawImage() { noop('drawImage'); },
    createRadialGradient() { noop('createRadialGradient'); return { addColorStop() {} }; },
    createLinearGradient() { noop('createLinearGradient'); return { addColorStop() {} }; },
    putImageData() { noop('putImageData'); },
    getImageData(x, y, w, h) {
      noop('getImageData');
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
    createImageData(w, h) {
      noop('createImageData');
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
  };
}

/* ---------- 元素桩 ---------- */
const registry = Object.create(null);
function makeEl(id, tag) {
  if (registry[id]) return registry[id];
  const el = {
    id, tagName: (tag || 'CANVAS').toUpperCase(), className: '', textContent: '',
    innerHTML: '', width: 0, height: 0, value: '0', checked: false,
    offsetTop: 0, offsetWidth: 0, offsetHeight: 0, clientWidth: 640, clientHeight: 320,
    style: {}, dataset: {},
    _listeners: Object.create(null),
    getContext() { return this._ctx || (this._ctx = makeCtx(id)); },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight,
               right: this.clientWidth, bottom: this.clientHeight };
    },
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener() {},
    setPointerCapture() {}, releasePointerCapture() {},
    hasPointerCapture() { return true; },
    appendChild() {}, removeChild() {}, insertBefore() {},
    click() {}, focus() {}, blur() {}, scrollIntoView() {},
    getAttribute(n) { return n === 'href' ? ('#' + id) : null; },
    setAttribute() {}, removeAttribute() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    toDataURL() { return 'data:image/png;base64,AAAA'; },
    dispatch(t, ev) { (this._listeners[t] || []).forEach(f => f.call(this, ev || {})); },
  };
  registry[id] = el;
  return el;
}

/* 预置 HTML 里出现过的全部 id —— 不靠手工维护清单，
   这样「HTML 加了控件但脚本没接」和「脚本接了但 HTML 没有」都会暴露。 */
const htmlIds = [...new Set([...html.matchAll(/\sid="([a-zA-Z0-9_-]+)"/g)].map(m => m[1]))];
htmlIds.forEach(id => makeEl(id));

/* 关键控件初值尽量与 HTML 一致 */
const INIT = {
  'rd-fork': '6', 'rg-prog': '0', 'rg-t': '0', 'rg-ang': '-22', 'rg-len': '100',
  'rg-r': '66', 'rg-depth': '8', 'rg-fov': '60',
  'r-proj-rot': '0', 'r-proj-dist': '9',
  'r-fill-zoom': '9', 'r-near': '0.5', 'r-far': '200',
  'r-persp-tex': '0', 'r-persp-pitch': '0',
  'r-shade-seg': '24',
  'sel-edge': 'interp', 'sel-cover': 'bbox', 'sel-fill-rule': 'tl',
  'sel-depth': 'z01', 'sel-cull': 'screen', 'sel-wind': 'ccw',
  'sel-shade': 'phong', 'sel-msaa': '4',
};
Object.keys(INIT).forEach(id => { if (registry[id]) registry[id].value = INIT[id]; });
['cb-edge-wrong', 'cb-reverse-z', 'cb-persp-anim', 'cb-wind-bad', 'cb-spin',
 'cb-shade-wrong', 'cb-shade-spin', 'cb-msaa-ssaa', 'cb-msaa-edge'
].forEach(id => { if (registry[id]) registry[id].checked = false; });

/* 侧栏导航 + 陷阱卡（scroll 高亮 / 跳转用） */
const navLinks = htmlIds.filter(id => /^s\d+$/.test(id)).map(id => {
  const e = makeEl('navlink_' + id, 'a');
  e.getAttribute = () => '#' + id;
  return e;
});
const trapEls = [...html.matchAll(/class="[^"]*\btrap\b[^"]*"[^>]*data-jump="([^"]+)"/g)]
  .map(m => { const e = makeEl('trap_' + m[1], 'button'); e.getAttribute = () => m[1]; return e; });

const document = {
  createElement(tag) {
    const e = makeEl('created_' + tag + '_' + Math.random().toString(36).slice(2, 7), tag);
    return e;
  },
  getElementById(id) { return registry[id] || makeEl(id); },
  querySelector(sel) {
    if (sel && sel[0] === '#') return registry[sel.slice(1)] || makeEl(sel.slice(1));
    return makeEl('q_' + sel);
  },
  querySelectorAll(sel) {
    if (sel === '.toc a') return navLinks;
    if (sel === '.trap') return trapEls;
    if (sel === 'canvas') return htmlIds.filter(id => id.indexOf('cv-') === 0).map(id => makeEl(id));
    return [];
  },
  addEventListener() {}, removeEventListener() {},
  body: makeEl('body', 'body'), documentElement: makeEl('docEl', 'html'),
};

/* ---------- window / 计时 ---------- */
let rafQueue = [];
const requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
const winListeners = Object.create(null);
const window = {
  devicePixelRatio: 1,
  addEventListener(t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
  removeEventListener() {},
  scrollY: 0, innerWidth: 1280, innerHeight: 800,
  requestAnimationFrame, setTimeout, clearTimeout,
  location: { href: 'file:///demo/index.html' },
};

/* ---------- 执行 ---------- */
console.log('脚本 ' + code.split('\n').length + ' 行，开始执行…\n');
const t0 = Date.now();
try {
  const fn = new Function('window', 'document', 'requestAnimationFrame', 'performance',
    'setTimeout', 'clearTimeout', 'console', 'navigator', code);
  fn(window, document, requestAnimationFrame, performance, setTimeout, clearTimeout, console,
     { userAgent: 'node' });
  console.log('✅ 顶层执行无异常  (' + (Date.now() - t0) + ' ms)');
} catch (e) {
  errors.push('顶层执行: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n'));
  console.log('❌ 顶层执行抛异常: ' + e.message);
  console.log((e.stack || '').split('\n').slice(1, 5).join('\n'));
}

/* ---------- 模拟动画帧 ---------- */
console.log('\n模拟 requestAnimationFrame 帧（最多 240 帧，每帧 +16.7ms）…');
let ts = 0, frames = 0, frameErr = 0;
const started = Date.now();
for (let i = 0; i < 240; i++) {
  const q = rafQueue; rafQueue = [];
  if (!q.length) break;
  ts += 16.7;
  for (const fn of q) {
    try { fn(ts); frames++; }
    catch (e) {
      frameErr++;
      if (errors.length < 8) errors.push('帧 ' + i + ': ' + e.message + '\n   ' + (e.stack || '').split('\n')[1]);
    }
  }
  if (Date.now() - started > 30000) { notes.push('达到 30s 上限，提前结束帧模拟（第 ' + i + ' 帧）'); break; }
}
console.log('   执行 ' + frames + ' 个回调，耗时 ' + (Date.now() - started) + ' ms，异常 ' + frameErr + ' 次');

/* ---------- 穷举所有 select / checkbox / range ---------- */
function fire(id, val, evt) {
  const el = registry[id];
  if (!el) { errors.push('交互失败：元素 #' + id + ' 不存在'); return; }
  if (val !== null) {
    if (el._isCheck) el.checked = val; else el.value = val;
  }
  try { el.dispatch(evt, { clientX: 100, clientY: 100, pointerId: 1, preventDefault() {} }); }
  catch (e) { errors.push('交互 #' + id + ' (' + evt + '): ' + e.message + '\n   ' + (e.stack || '').split('\n')[1]); }
}

console.log('\n穷举 select 的每一个 option…');
/* 从 HTML 里把每个 select 的 option 值抽出来，逐个真实切换 ——
   光切一次「非默认值」是查不出「第 3 个选项才会炸」这种事的。 */
let selCount = 0;
const selRe = /<select\b[^>]*\bid="([a-zA-Z0-9_-]+)"[^>]*>([\s\S]*?)<\/select>/g;
for (const m of html.matchAll(selRe)) {
  const id = m[1];
  const opts = [...m[2].matchAll(/<option\b[^>]*\bvalue="([^"]*)"/g)].map(x => x[1]);
  for (const v of opts) { fire(id, v, 'change'); selCount++; }
}
console.log('   ' + selCount + ' 次 select 切换');

console.log('\n穷举 checkbox / range…');
let cbCount = 0;
for (const m of html.matchAll(/<input\b[^>]*\btype="(checkbox|range)"[^>]*\bid="([a-zA-Z0-9_-]+)"[^>]*>/g)) {
  const type = m[1], id = m[2];
  const el = registry[id]; if (!el) continue;
  if (type === 'checkbox') {
    el._isCheck = true;
    fire(id, true, 'change'); fire(id, false, 'change'); cbCount += 2;
  } else {
    const min = /\bmin="([-\d.]+)"/.exec(m[0]), max = /\bmax="([-\d.]+)"/.exec(m[0]),
          step = /\bstep="([-\d.]+)"/.exec(m[0]);
    const lo = min ? +min[1] : 0, hi = max ? +max[1] : 100, st = step ? +step[1] : 1;
    [lo, (lo + hi) / 2, hi, lo + (hi - lo) * 0.37, lo + (hi - lo) * 0.83]
      .forEach(v => { fire(id, String(Math.round(v / st) * st || lo), 'input'); cbCount++; });
  }
}
console.log('   ' + cbCount + ' 次控件事件');

console.log('\n穷举 button 点击…');
let btCount = 0;
for (const m of html.matchAll(/<button\b[^>]*\bid="([a-zA-Z0-9_-]+)"/g)) {
  fire(m[1], null, 'click'); btCount++;
}
console.log('   ' + btCount + ' 次按钮点击');

/* ---------- 指针拖动 ---------- */
console.log('\n模拟指针拖动…');
let dragErr = 0;
const dragTargets = [['cv-edge', [80, 120]], ['cv-fill', [200, 180]], ['cv-cover', [60, 60]],
  ['cv-depth', [100, 100]], ['cv-cull', [120, 80]], ['cv-shade', [90, 90]]];
for (const [id, p] of dragTargets) {
  const el = registry[id]; if (!el) continue;
  try {
    el.dispatch('pointerdown', { clientX: p[0], clientY: p[1], pointerId: 1, preventDefault() {} });
    el.dispatch('pointermove', { clientX: p[0] + 60, clientY: p[1] + 30, pointerId: 1, preventDefault() {} });
    el.dispatch('pointermove', { clientX: p[0] - 40, clientY: p[1] - 20, pointerId: 1, preventDefault() {} });
    el.dispatch('pointerup', { clientX: p[0], clientY: p[1], pointerId: 1, preventDefault() {} });
  } catch (e) { dragErr++; errors.push('拖动 #' + id + ': ' + e.message + '\n   ' + (e.stack || '').split('\n')[1]); }
}
console.log('   ' + dragTargets.length + ' 个面板拖动，异常 ' + dragErr + ' 次');

/* ---------- 侧栏 / resize ---------- */
try {
  (winListeners['scroll'] || []).forEach(f => f.call(window, {}));
  (winListeners['resize'] || []).forEach(f => f.call(window, {}));
  console.log('   scroll / resize 处理正常');
} catch (e) { errors.push('scroll/resize: ' + e.message); }
console.log('   toc 链接 ' + navLinks.length + ' 个，陷阱卡 ' + trapEls.length + ' 个');
if (!navLinks.length) notes.push('未解析到 .toc a 链接（检查 HTML 里侧栏是否为 <a href="#sN">）');

/* ---------- 内建自检 ---------- */
console.log('\n=== 调用页面内建 verify() ===');
let vres = null;
try {
  vres = window.__rast.verify();
  /* verify() 直接返回一个数组（不是 {results:…}）；两种形状都接住，
     免得页面改了返回结构后这里静默地报「0 项」。 */
  const list = Array.isArray(vres) ? vres : (vres && (vres.results || vres.list)) || [];
  const bad = list.filter(r => !r.pass);
  console.log('   断言 ' + list.length + ' 项，失败 ' + bad.length + ' 项');
  if (!list.length) errors.push('内建 verify() 返回 0 项断言 —— 自检被掏空了');
  bad.forEach(b => console.log('   ❌ ' + b.name + (b.detail ? '  — ' + b.detail : '')));
  if (bad.length) errors.push('内建 verify() 有 ' + bad.length + ' 项失败: ' + bad.map(b => b.name).join(' / '));
} catch (e) {
  errors.push('verify() 抛异常: ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 5).join('\n'));
  console.log('❌ verify() 抛异常: ' + e.message);
  console.log((e.stack || '').split('\n').slice(1, 5).join('\n'));
}

/* ---------- 统计 ---------- */
console.log('\n=== 画布 API 调用统计 ===');
const sorted = Object.keys(ctxCalls).sort((a, b) => ctxCalls[b] - ctxCalls[a]);
console.log('   ' + sorted.slice(0, 14).map(k => k + '×' + ctxCalls[k]).join('  '));
notes.push('Canvas 操作总数 ' + opCount);
notes.push('已注册的画布数 ' + htmlIds.filter(id => id.indexOf('cv-') === 0).length);

console.log('\n=== 结果 ===');
if (errors.length) {
  console.log('❌ 发现 ' + errors.length + ' 个运行时问题:');
  errors.slice(0, 12).forEach((e, i) => console.log('\n  [' + (i + 1) + '] ' + e));
  process.exit(1);
} else {
  console.log('✅ 无运行时异常');
  notes.forEach(n => console.log('   · ' + n));
}
