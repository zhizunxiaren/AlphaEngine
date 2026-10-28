/*
 * _smoke.js —— 运行时冒烟：用 DOM/Canvas 桩在本进程内跑页面脚本
 * 目的不是看画面，而是确认 4 个场景、滑块、开关、拖拽的绘制路径都不抛异常，
 * 并且每个场景确实往画布上写了东西（而不是提前 return 的空转）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) pass++;
  else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); }
}

/* ---------------- Canvas 2D 桩 ---------------- */
const calls = { stroke: 0, fill: 0, arc: 0, text: 0, clear: 0, dash: 0 };
const texts = [];

function makeCtx() {
  const c = {
    strokeStyle: '#000', fillStyle: '#000', lineWidth: 1,
    font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
    setTransform() {}, clearRect() { calls.clear++; },
    save() {}, restore() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {},
    stroke() { calls.stroke++; },
    fill() { calls.fill++; },
    arc() { calls.arc++; },
    setLineDash(a) { calls.dash++; if (!Array.isArray(a)) throw new Error('setLineDash 需要数组'); },
    fillText(t) { calls.text++; texts.push(String(t)); }
  };
  return c;
}

/* ---------------- DOM 桩 ---------------- */
const registry = new Map();

function El(id) {
  this.id = id;
  this._h = {};
  this.textContent = '';
  this.innerHTML = '';
  this.dataset = {};
  this.style = {};
  this.checked = true;
  this.value = '0';
  this.children = [];
  const self = this;
  this.classList = {
    _s: new Set(),
    add(c) { this._s.add(c); },
    remove(c) { this._s.delete(c); },
    toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { on ? this._s.add(c) : this._s.delete(c); } },
    contains(c) { return this._s.has(c); }
  };
}
El.prototype.addEventListener = function (t, f) { (this._h[t] = this._h[t] || []).push(f); };
El.prototype.dispatch = function (t, ev) { (this._h[t] || []).forEach(f => f(ev)); };
El.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, width: 800, height: 500, right: 800, bottom: 500 };
};
El.prototype.closest = function () { return this; };
El.prototype.setPointerCapture = function () {};
El.prototype.releasePointerCapture = function () {};

const cvEl = new El('cv');
cvEl.width = 800; cvEl.height = 500;
cvEl._ctx = makeCtx();
cvEl.getContext = function () { return this._ctx; };
cvEl.parentElement = new El('cvwrap');

const tabsEl = new El('tabs');
for (let i = 0; i < 4; i++) {
  const b = new El('tab' + i);
  b.dataset.scene = String(i);
  tabsEl.children.push(b);
}

function getEl(id) {
  if (id === 'cv') return cvEl;
  if (id === 'tabs') return tabsEl;
  if (!registry.has(id)) registry.set(id, new El(id));
  return registry.get(id);
}

const rafQueue = [];
let now = 0;

const sandbox = {
  Math, Number, Array, Object, String, JSON, parseInt, parseFloat, isFinite, Set, console,
  document: { getElementById: getEl },
  requestAnimationFrame(cb) { rafQueue.push(cb); return rafQueue.length; },
  performance: { now: () => now }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.devicePixelRatio = 1;
sandbox.window.addEventListener = function () {};

vm.createContext(sandbox);

/* ---------------- 1. 加载即执行（同步首帧） ---------------- */
let loadErr = null;
try {
  new vm.Script(code, { filename: 'page.js' }).runInContext(sandbox);
} catch (e) {
  loadErr = e;
}
ok('脚本加载无异常', !loadErr, loadErr && (loadErr.message + '\n' + String(loadErr.stack).split('\n')[1]));

ok('加载阶段已同步绘制（未等 rAF）', calls.stroke > 5 && calls.text > 3,
  'stroke=' + calls.stroke + ' text=' + calls.text);
ok('首帧写入了 α / β 读数', /^\d+\.\d{3}$/.test(getEl('rA').textContent),
  'rA=' + JSON.stringify(getEl('rA').textContent));
ok('首帧写入了 |u*| 读数', /^\d+\.\d{3}$/.test(getEl('rUstar').textContent),
  'rUstar=' + JSON.stringify(getEl('rUstar').textContent));

/* ---------------- 2. 逐帧推进 ---------------- */
function runFrames(n) {
  for (let i = 0; i < n; i++) {
    const q = rafQueue.splice(0, rafQueue.length);
    now += 16.6;
    for (const cb of q) cb(now);
  }
}

let frameErr = null;
try { runFrames(90); } catch (e) { frameErr = e; }
ok('连续 90 帧无异常', !frameErr, frameErr && frameErr.message);
ok('rAF 会自我续帧', rafQueue.length > 0);

const aAfter = getEl('rA').textContent;
ok('α 读数随动画变化', aAfter !== '0.000' && /^\d+\.\d{3}$/.test(aAfter), 'rA=' + aAfter);

/* ---------------- 3. 四个场景 ---------------- */
for (let s = 0; s < 4; s++) {
  const before = { text: calls.text, stroke: calls.stroke };
  let err = null;
  try {
    tabsEl.dispatch('click', { target: tabsEl.children[s] });
    runFrames(45);
  } catch (e) { err = e; }
  ok('场景 ' + s + ' 无异常', !err, err && err.message);
  ok('场景 ' + s + ' 有绘制输出', calls.text > before.text && calls.stroke > before.stroke,
    'text+' + (calls.text - before.text) + ' stroke+' + (calls.stroke - before.stroke));
  ok('场景 ' + s + ' 说明文字已更新', getEl('explain').innerHTML.indexOf('①') >= 0 ||
    getEl('explain').innerHTML.indexOf('②') >= 0 ||
    getEl('explain').innerHTML.indexOf('③') >= 0 ||
    getEl('explain').innerHTML.indexOf('④') >= 0);
}

/* ---------------- 4. 滑块全域 ---------------- */
{
  /* 先验一条：滑块事件必须当场重绘，不能只等 rAF（后台标签页 rAF 会暂停） */
  {
    const before = calls.text;
    const el = getEl('sU');
    el.value = '1.5';
    el.dispatch('input', { target: el });
    ok('滑块 input 当场触发重绘（不依赖 rAF）', calls.text > before,
      'delta=' + (calls.text - before));
  }

  const cases = [
    ['sTh', '115', 'vTh'], ['sTh', '45', 'vTh'],
    ['sU', '2.1', 'vU'], ['sU', '1.2', 'vU'],
    ['sV', '1.9', 'vV'], ['sV', '0.9', 'vV']
  ];
  let err = null;
  try {
    for (const [id, val] of cases) {
      const el = getEl(id);
      el.value = val;
      el.dispatch('input', { target: el });
      runFrames(12);
    }
  } catch (e) { err = e; }
  ok('滑块极值全程无异常', !err, err && err.message);
  ok('滑块读数已同步', getEl('vU').textContent === '1.20' && getEl('vV').textContent === '0.90',
    'vU=' + getEl('vU').textContent + ' vV=' + getEl('vV').textContent);
}

/* ---------------- 5. 开关全关 ---------------- */
{
  let err = null;
  try {
    for (const id of ['cGrid', 'cDual', 'cProj', 'cArea']) {
      const el = getEl(id);
      el.checked = false;
      el.dispatch('change', { target: el });
    }
    runFrames(30);
  } catch (e) { err = e; }
  ok('四个开关全关后无异常', !err, err && err.message);

  try {
    for (const id of ['cGrid', 'cDual', 'cProj', 'cArea']) {
      const el = getEl(id);
      el.checked = true;
      el.dispatch('change', { target: el });
    }
    runFrames(10);
  } catch (e) { err = e; }
  ok('开关恢复后无异常', !err, err && err.message);
}

/* ---------------- 6. 拖拽 ---------------- */
{
  let err = null;
  const before = getEl('rA').textContent;
  try {
    cvEl.dispatch('pointerdown', { clientX: 500, clientY: 200, pointerId: 1 });
    cvEl.dispatch('pointermove', { clientX: 560, clientY: 240, pointerId: 1 });
    cvEl.dispatch('pointerup', { clientX: 560, clientY: 240, pointerId: 1 });
    runFrames(20);
  } catch (e) { err = e; }
  ok('拖拽全程无异常', !err, err && err.message);
  ok('拖拽后读数改变', getEl('rA').textContent !== before,
    before + ' → ' + getEl('rA').textContent);

  /* 拖到画布外：必须被夹住，不能产生 NaN */
  try {
    cvEl.dispatch('pointerdown', { clientX: -500, clientY: 3000, pointerId: 2 });
    cvEl.dispatch('pointerup', { pointerId: 2 });
    runFrames(10);
  } catch (e) { err = e; }
  ok('拖出画布边界无异常', !err, err && err.message);
  ok('边界拖拽后读数仍是有限数', /^-?\d+\.\d{3}$/.test(getEl('rA').textContent),
    'rA=' + getEl('rA').textContent);
}

/* ---------------- 7. 重播按钮 ---------------- */
{
  let err = null;
  try {
    getEl('btnPlay').dispatch('click', {});
    runFrames(30);
  } catch (e) { err = e; }
  ok('重播按钮无异常', !err, err && err.message);
}

/* ---------------- 8. 文本层面：公式没被写错 ---------------- */
const joined = texts.join(' ');
ok('画布上出现了 α 数值标注', /α=/.test(joined), joined.slice(0, 120));
ok('画布上出现了 u* 标签', /u\*/.test(joined));
ok('画布上出现了 h_u（格厚）标注', texts.indexOf('h_u') >= 0);
ok('画布上出现了 d（距离）标注', texts.some(t => /^d = /.test(t)));

/* ---------------- 汇总 ---------------- */
console.log('');
console.log('调用统计 stroke=' + calls.stroke + ' fill=' + calls.fill +
  ' arc=' + calls.arc + ' text=' + calls.text);
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) {
  console.log('');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('全部通过');
