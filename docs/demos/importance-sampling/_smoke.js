'use strict';
/* DOM/Canvas 桩内真实执行：零异常、每块画布确有绘制、控件可交互、读数没有 NaN。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, 'index.html');

function makeCtx(id, rec) {
  const bump = (k) => { rec.ops++; rec.by[k] = (rec.by[k] || 0) + 1; };
  const noop = () => {};
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    textBaseline: '', lineCap: '', lineJoin: '',
    setTransform: noop, save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    beginPath: noop, closePath: noop,
    moveTo: () => bump('moveTo'), lineTo: () => bump('lineTo'), rect: () => bump('rect'),
    bezierCurveTo: noop, quadraticCurveTo: noop, ellipse: noop,
    setLineDash: noop, clearRect: () => bump('clearRect'),
    fillRect: () => bump('fillRect'), strokeRect: () => bump('strokeRect'),
    fill: () => bump('fill'), stroke: () => bump('stroke'),
    arc: () => bump('arc'), clip: noop,
    fillText: (t) => { bump('fillText'); if (typeof t === 'string') rec.texts.push(t); },
    strokeText: noop,
    measureText: () => ({ width: 40 }),
    drawImage: () => bump('drawImage'),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => bump('putImageData'),
    canvas: { id },
  };
  return ctx;
}

function makeEl(id, recs) {
  const handlers = {};
  let text = '';
  const el = {
    id, clientWidth: 760, clientHeight: 220, width: 300, height: 150,
    value: '0', checked: false, offsetTop: 0,
    style: {}, dataset: {},
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    addEventListener(t, f) { (handlers[t] = handlers[t] || []).push(f); },
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: el.clientWidth, height: el.clientHeight }; },
    setAttribute() {}, getAttribute: () => null,
    querySelector: () => null,
    toDataURL: () => 'data:,',
    getContext() {
      if (!recs[id]) recs[id] = { ops: 0, by: {}, texts: [] };
      return (el._ctx = el._ctx || makeCtx(id, recs[id]));
    },
    _fire(type, ev) { (handlers[type] || []).forEach((f) => f.call(el, ev || { target: el, type })); },
    _has(t) { return !!(handlers[t] && handlers[t].length); },
  };
  Object.defineProperty(el, 'textContent', {
    get() { return text; },
    set(v) { text = String(v); },
  });
  return el;
}

function runSmoke(html) {
  const res = [];
  const ok = (name, cond, detail) => res.push({ name, pass: !!cond, detail: detail || '' });
  const errors = [];
  const recs = {};
  const els = {};
  const get = (id) => (els[id] = els[id] || makeEl(id, recs));
  const modeBtns = ['avg', 'bal', 'pow', 'raw'].map((m) => { const e = makeEl('b-' + m, recs); e.dataset = { h: m }; return e; });

  const rafQ = [];
  /* 用固定种子替换 Math.random，让统计类断言（T12/T21）可复现，不受偶发抖动影响 */
  let seed = 20261023;
  const seeded = Object.create(Math);
  seeded.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const sandbox = {
    Math: seeded, Number, Object, Array, String, Boolean, JSON, isFinite, isNaN, parseFloat, parseInt,
    Uint8ClampedArray, Date, performance: { now: () => ts },
    document: {
      documentElement: { nodeName: 'HTML' },
      querySelector: (s) => (s && s[0] === '#' ? get(s.slice(1)) : null),
      querySelectorAll: (s) => (s === '[data-h]' ? modeBtns : s === 'canvas' ? ['c1', 'c2', 'c3'].map(get) : []),
    },
    getComputedStyle: () => ({ getPropertyValue: () => '#1d1d1b' }),
    requestAnimationFrame: (f) => { rafQ.push(f); return rafQ.length; },
    cancelAnimationFrame: () => {},
    window: null,
  };
  sandbox.window = {
    devicePixelRatio: 2,
    addEventListener(t, f) { (sandbox.window._h = sandbox.window._h || {}); (sandbox.window._h[t] = sandbox.window._h[t] || []).push(f); },
    removeEventListener() {},
    innerWidth: 780,
  };
  sandbox.globalThis = sandbox;

  let ts = 0;
  const code = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  try {
    vm.runInNewContext(code, sandbox, { filename: 'index.html', timeout: 20000 });
  } catch (e) {
    errors.push('load: ' + e.message);
  }
  ok('T1 顶层执行零异常', errors.length === 0, errors[0] || '');
  ok('T2 顶层直接订阅了 error 事件（异常会被显示，而不是静默黑屏）',
    !!(sandbox.window._h && sandbox.window._h.error && sandbox.window._h.error.length));

  /* 同步首帧：此刻 rAF 一个都还没跑。判据用"画出了曲线段"而不是"调用过 API"——
     每一帧都会调用同样的 API，只有线段数能区分"有内容"与"空白画布"。 */
  const snap = (id) => Object.assign({}, recs[id] && recs[id].by);
  const f1s = snap('c1'), f2s = snap('c2'), f3s = snap('c3');
  ok('T3 注册 rAF 之前曲线已画完（同步首帧，非 rAF 驱动）',
    f1s.lineTo > 200 && f2s.lineTo > 200 && (f3s.arc || 0) >= 3,
    `c1.lineTo=${f1s.lineTo} c2.lineTo=${f2s.lineTo} c3.arc=${f3s.arc}`);
  ok('T4 首帧文字量足够（说明图注真的画上了）',
    f1s.fillText >= 3 && f2s.fillText >= 3 && f3s.fillText >= 3,
    `c1=${f1s.fillText} c2=${f2s.fillText} c3=${f3s.fillText}`);

  /* 跑 120 帧 */
  for (let i = 0; i < 120; i++) {
    ts += 16.7;
    const q = rafQ.splice(0, rafQ.length);
    for (const f of q) { try { f(ts); } catch (e) { errors.push('frame: ' + e.message); } }
  }
  ok('T5 120 帧零异常', errors.length === 0, errors[0] || '');
  ok('T6 帧循环仍在推进（画布持续绘制）',
    recs.c1.by.lineTo > f1s.lineTo + 5000 && recs.c2.by.lineTo > f2s.lineTo + 5000,
    `c1 +${recs.c1.by.lineTo - f1s.lineTo}`);

  /* 读数 */
  const readNum = (id) => parseFloat(get(id).textContent);
  ok('T7 演示 1 两个标准差都是有限数',
    isFinite(readNum('s1u')) && isFinite(readNum('s1p')), `${get('s1u').textContent} / ${get('s1p').textContent}`);
  ok('T8 演示 1 最大单样本贡献是有限数',
    isFinite(readNum('m1u')) && isFinite(readNum('m1p')), `${get('m1u').textContent} / ${get('m1p').textContent}`);
  ok('T9 MIS 三个标准差 + 均值都是有限数',
    ['s2a', 's2b', 's2m', 's2mean'].every((k) => isFinite(readNum(k))),
    ['s2a', 's2b', 's2m', 's2mean'].map((k) => get(k).textContent).join(' / '));
  ok('T10 MIS 样本明细表已填数（6 个单元格都是数字）',
    ['t-x1', 't-a1', 't-b1', 't-c1', 't-x2', 't-a2'].every((k) => isFinite(parseFloat(get(k).textContent))),
    get('t-w1').textContent + ' / ' + get('t-w2').textContent);

  /* 四种权重模式逐个点 */
  const stds = {};
  for (const b of modeBtns) {
    try { b._fire('click'); } catch (e) { errors.push('mode ' + b.dataset.h + ': ' + e.message); }
    for (let i = 0; i < 30; i++) { ts += 16.7; const q = rafQ.splice(0, rafQ.length); for (const f of q) { try { f(ts); } catch (e) { errors.push('frame: ' + e.message); } } }
    stds[b.dataset.h] = readNum('s2m');
  }
  ok('T11 四种权重模式都跑通且 MIS 标准差有限',
    Object.keys(stds).every((k) => isFinite(stds[k])), JSON.stringify(stds));
  /* 端到端看「直接相加」：判据用表格里的权重，而不是均值——均值在这个样本量下抖动 ±0.14，
     只有权重是精确量。四格都是 100% 就说明权重和是 200%，即没有做划分。 */
  ok('T12 「直接相加」下四格权重都是 100%（合计 200%，没有划分）', (function () {
    const b = modeBtns.find((x) => x.dataset.h === 'raw');
    try { b._fire('click'); } catch (e) { return false; }
    for (let i = 0; i < 60; i++) { ts += 16.7; const q = rafQ.splice(0, rafQ.length); for (const f of q) { try { f(ts); } catch (e) { return false; } } }
    return ['t-wa1', 't-wb1', 't-wa2', 't-wb2'].every((k) => parseFloat(get(k).textContent) >= 99.5);
  })(), ['t-wa1', 't-wb1', 't-wa2', 't-wb2'].map((k) => get(k).textContent).join(' + '));
  ok('T12b 平衡启发式下每行两个权重相加为 100%', (function () {
    const b = modeBtns.find((x) => x.dataset.h === 'bal');
    try { b._fire('click'); } catch (e) { return false; }
    for (let i = 0; i < 20; i++) { ts += 16.7; const q = rafQ.splice(0, rafQ.length); for (const f of q) { try { f(ts); } catch (e) { return false; } } }
    const s = (k) => parseFloat(get(k).textContent);
    return Math.abs(s('t-wa1') + s('t-wb1') - 100) < 0.3 && Math.abs(s('t-wa2') + s('t-wb2') - 100) < 0.3;
  })(), ['t-wa1', 't-wb1', 't-wa2', 't-wb2'].map((k) => get(k).textContent).join(' + '));

  /* 滑块极值 */
  const push = (id, v) => { const e = get(id); e.value = String(v); e._fire('input'); };
  let slideErr = '';
  for (const [id, vals] of [['a1', [0, 0.95, 0.5]], ['o1', [-0.3, 0.3, 0]], ['d3', [1, 4, 2]], ['l3', [0.2, 1.5, 0.5]]]) {
    for (const v of vals) {
      try { push(id, v); } catch (e) { slideErr = id + '@' + v + ': ' + e.message; }
    }
  }
  ok('T13 四个滑块的极值与中间值都不抛异常', !slideErr, slideErr);
  ok('T14 滑块都真的绑了 input 监听', ['a1', 'o1', 'd3', 'l3'].every((id) => get(id)._has('input')));
  ok('T15 按钮都绑了 click 监听', get('r1')._has('click') && get('r2')._has('click') && modeBtns.every((b) => b._has('click')));

  /* 测度换算读数：d 从 1 到 4，p_ω 涨 16 倍 */
  push('d3', 1); const p1v = readNum('n3w');
  push('d3', 4); const p4v = readNum('n3w');
  ok('T16 演示 3：d 从 1 到 4，p_ω 涨 16 倍', isFinite(p1v) && isFinite(p4v) && Math.abs(p4v / p1v - 16) < 0.2, `${p1v} → ${p4v}`);
  ok('T17 演示 3：p_ω 始终大于 p_A（d>1 倍率 >1）',
    readNum('n3w') > readNum('n3p'), `${readNum('n3p')} → ${readNum('n3w')}`);

  /* 画布文案里不能出现 NaN / undefined / Infinity */
  const badText = [];
  for (const id of ['c1', 'c2', 'c3']) {
    for (const t of recs[id].texts) if (/NaN|undefined|Infinity|null/.test(t)) badText.push(id + ':' + t);
  }
  ok('T18 画布文案无 NaN/undefined/Infinity', badText.length === 0, badText.slice(0, 3).join(' | '));

  /* 端到端无偏性：跑平衡启发式 400 帧，页面自己的均值必须收敛到解析真值。
     这一条才真正覆盖"页面实现的估计量"，而 _verify.js 只证明公式本身对。
     真值 0.2356 = 0.02 + 1.2·0.025·√2π + 0.8·0.07·√2π，见 _verify.js C2。 */
  const bal = modeBtns.find((b) => b.dataset.h === 'bal');
  try { bal._fire('click'); } catch (e) { errors.push('bal: ' + e.message); }
  for (let i = 0; i < 400; i++) { ts += 16.7; const q = rafQ.splice(0, rafQ.length); for (const f of q) { try { f(ts); } catch (e) { errors.push('frame: ' + e.message); } } }
  const meanBal = readNum('s2mean');
  ok('T21 平衡启发式 400 帧后均值收敛到真值 0.2356（页面实现无偏）',
    isFinite(meanBal) && Math.abs(meanBal - 0.2356) < 0.04, 'mean=' + get('s2mean').textContent);

  /* DPR 与尺寸 */
  ok('T19 画布按 devicePixelRatio=2 分配像素', get('c1').width === 1520 && get('c1').height === 808,
    `${get('c1').width}x${get('c1').height}`);

  /* resize */
  let rzErr = '';
  try { (sandbox.window._h.resize || []).forEach((f) => f({})); } catch (e) { rzErr = e.message; }
  ok('T20 resize 后重绘不抛异常', !rzErr, rzErr);

  const failed = res.filter((r) => !r.pass);
  return { ok: failed.length === 0, res, failed: failed.length, total: res.length, errors };
}

if (require.main === module) {
  const html = fs.readFileSync(process.argv[2] || SRC, 'utf8');
  const r = runSmoke(html);
  for (const x of r.res) console.log((x.pass ? '  PASS ' : '  FAIL ') + x.name + (x.detail ? '  [' + x.detail + ']' : ''));
  console.log(`\nsmoke: ${r.total - r.failed}/${r.total}`);
  process.exit(r.ok ? 0 : 1);
}
module.exports = { runSmoke, SRC };
