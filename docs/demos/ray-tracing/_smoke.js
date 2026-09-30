/* 运行时冒烟测试：用最小 DOM/Canvas 桩在 Node 中真实执行 index.html 的脚本，
   捕获 ReferenceError / TypeError 等一切运行时异常，并模拟若干帧动画。 */
const fs = require('fs');
const path = require('path').join(__dirname, 'index.html');
const html = fs.readFileSync(path, 'utf8');
const s0 = html.lastIndexOf('<script>'), s1 = html.lastIndexOf('</script>');
const code = html.slice(s0 + '<script>'.length, s1);

const errors = [];
const notes = [];
function note(m){ notes.push(m); }

/* ---------- Canvas 2D 上下文桩 ---------- */
let opCount = 0;
const ctxCalls = Object.create(null);
function makeCtx(tag) {
  const noop = (name) => { ctxCalls[name] = (ctxCalls[name] || 0) + 1; opCount++; };
  const ctx = {
    canvas: null,
    fillStyle:'', strokeStyle:'', lineWidth:1, font:'', textAlign:'', textBaseline:'',
    globalAlpha:1, imageSmoothingEnabled:true, imageSmoothingQuality:'high',
    setTransform(){noop('setTransform');}, clearRect(){noop('clearRect');},
    fillRect(){noop('fillRect');}, strokeRect(){noop('strokeRect');},
    beginPath(){noop('beginPath');}, closePath(){noop('closePath');},
    moveTo(){noop('moveTo');}, lineTo(){noop('lineTo');}, arc(){noop('arc');},
    rect(){noop('rect');}, fill(){noop('fill');}, stroke(){noop('stroke');},
    save(){noop('save');}, restore(){noop('restore');},
    setLineDash(){noop('setLineDash');}, fillText(){noop('fillText');},
    measureText(){ return { width: 40 }; },
    drawImage(){ noop('drawImage'); },
    createRadialGradient(){ noop('createRadialGradient');
      return { addColorStop(){} }; },
    createLinearGradient(){ noop('createLinearGradient'); return { addColorStop(){} }; },
    putImageData(){ noop('putImageData'); },
    createImageData(w, h) {
      noop('createImageData');
      return { width:w, height:h, data:new Uint8ClampedArray(w*h*4) };
    },
    getImageData(x, y, w, h) {
      noop('getImageData');
      return { width:w, height:h, data:new Uint8ClampedArray(w*h*4) };
    },
  };
  return ctx;
}

/* ---------- 元素桩 ---------- */
const registry = Object.create(null);
function makeEl(id) {
  if (registry[id]) return registry[id];
  const el = {
    id, tagName:'CANVAS', className:'', textContent:'', innerHTML:'',
    width:0, height:0, value:'0', checked:false, offsetTop:0, offsetWidth:0,
    clientWidth: 640, clientHeight: 320, style:{},
    _listeners: Object.create(null),
    getContext(){ return this._ctx || (this._ctx = makeCtx(id)); },
    getBoundingClientRect(){ return {left:0, top:0, width:this.clientWidth, height:this.clientHeight}; },
    addEventListener(t, fn){ (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener(){},
    setPointerCapture(){}, releasePointerCapture(){},
    appendChild(){}, removeChild(){}, click(){}, focus(){}, blur(){},
    getAttribute(n){ return n === 'href' ? ('#' + id) : null; },
    setAttribute(){}, querySelector(){ return null; }, querySelectorAll(){ return []; },
    toDataURL(){ return 'data:image/png;base64,AAAA'; },
    dispatch(t, ev){ (this._listeners[t]||[]).forEach(f => f.call(this, ev || {})); },
  };
  registry[id] = el;
  return el;
}

/* 预置所有被引用的 id */
const IDS = ['cv-raster','cv-rt','cv-ray','cv-hit','cv-quad','cv-normal','cv-chain','cv-pt','cv-path',
  'rg-prog','rg-t','rg-ang','rg-len','rg-r','rg-depth','rg-fov',
  'se-scene','se-res','se-light','se-shade','ck-aa',
  'bt-play','bt-chain','bt-pause','bt-reset','bt-save','bt-scan',
  'bt-path-play','bt-path-step','bt-path-reset',
  'ck-path-normal','ck-path-fresnel','ck-path-grid',
  'o-a','o-h','o-c','o-d','o-t1','o-t2','o-pass','o-spp','o-cur','o-time','o-speed','o-noise',
  'o-mth','o-mtr','o-mtd','o-gin','o-gout','o-chord',
  'path-now','path-ledger',
  'lb-prog','lb-ray','lb-r','lb-disc','lb-verdict','lb-chain','lb-depth','lb-stat','lb-fov','lb-path',
  's0','s1','s2','s3','s4','s5','s6','s7','s8','s9'];
IDS.forEach(makeEl);
/* 关键控件的初值，尽量与 HTML 中一致 */
registry['rg-t'].value = '0';
registry['rg-ang'].value = '-22';
registry['rg-len'].value = '100';
registry['rg-r'].value = '66';
registry['rg-depth'].value = '8';
registry['rg-fov'].value = '60';
registry['rg-prog'].value = '0';
registry['se-scene'].value = 'classic';
registry['se-res'].value = '200';
registry['se-light'].value = 'sky';
registry['se-shade'].value = 'normal';
registry['ck-aa'].checked = true;

/* 侧栏导航（滚动高亮用） */
const navLinks = ['#s0','#s1','#s2','#s3','#s4','#s5','#s6','#s7','#s8','#s9'].map((h, i) => {
  const e = makeEl('toc' + i);
  e.getAttribute = () => h;
  return e;
});

const document = {
  createElement(tag) {
    const e = makeEl('created_' + tag + '_' + Math.random().toString(36).slice(2, 7));
    e.tagName = tag.toUpperCase();
    return e;
  },
  querySelector(sel) {
    if (sel && sel[0] === '#') return registry[sel.slice(1)] || makeEl(sel.slice(1));
    if (sel === 'canvas') return makeEl('cv-pt');
    return makeEl('q_' + sel);
  },
  querySelectorAll(sel) {
    if (sel === '.toc a') return navLinks;
    if (sel.indexOf('#cv-ray') === 0) return [registry['rg-t'], registry['rg-ang'], registry['rg-len']];
    return [];
  },
  addEventListener(){}, removeEventListener(){},
  body: makeEl('body'), documentElement: makeEl('docEl'),
};

/* ---------- window / 计时 ---------- */
let rafQueue = [];
const requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
const winListeners = Object.create(null);
const window = {
  devicePixelRatio: 1,
  addEventListener(t, fn){ (winListeners[t] = winListeners[t] || []).push(fn); },
  removeEventListener(){},
  scrollY: 0, innerWidth: 1280, innerHeight: 800,
  requestAnimationFrame, setTimeout: setTimeout, clearTimeout,
  location: { href: 'file:///demo/index.html' },
};

/* ---------- 执行 ---------- */
console.log('脚本 ' + code.split('\n').length + ' 行，开始执行…\n');
const t0 = Date.now();
try {
  const fn = new Function('window','document','requestAnimationFrame','performance','setTimeout','clearTimeout','console','navigator', code);
  fn(window, document, requestAnimationFrame, performance, setTimeout, clearTimeout, console, { userAgent:'node' });
  console.log('✅ 顶层执行无异常  (' + (Date.now()-t0) + ' ms)');
} catch (e) {
  errors.push('顶层执行: ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,4).join('\n'));
  console.log('❌ 顶层执行抛异常: ' + e.message);
}

/* ---------- 模拟动画帧 ---------- */
console.log('\n模拟 requestAnimationFrame 帧（共 120 帧，每帧 +16ms）…');
let ts = 0, frames = 0, frameErr = 0;
const started = Date.now();
for (let i = 0; i < 120; i++) {
  const q = rafQueue; rafQueue = [];
  if (!q.length) break;
  ts += 16.7;
  for (const fn of q) {
    try { fn(ts); frames++; }
    catch (e) {
      frameErr++;
      if (errors.length < 6) errors.push('帧 ' + i + ': ' + e.message + '\n   ' + (e.stack||'').split('\n')[1]);
    }
  }
  if (Date.now() - started > 25000) { note('达到 25s 时间上限，提前结束帧模拟（第 ' + i + ' 帧）'); break; }
}
console.log('   执行 ' + frames + ' 个回调，耗时 ' + (Date.now()-started) + ' ms，异常 ' + frameErr + ' 次');

/* ---------- 模拟交互 ---------- */
console.log('\n模拟控件交互…');
const interactions = [
  ['se-scene','mats','change'], ['se-scene','norm','change'], ['se-scene','classic','change'],
  ['se-res','160','change'], ['se-res','260','change'], ['se-res','200','change'],
  ['se-light','lamp','change'], ['se-light','sky','change'],
  ['rg-depth','3','input'], ['rg-depth','8','input'],
  ['ck-aa',null,'change'],
  ['bt-pause',null,'click'], ['bt-reset',null,'click'], ['bt-save',null,'click'],
  ['se-shade','lambert','change'], ['se-shade','depth','change'], ['se-shade','normal','change'],
  ['rg-fov','80','input'], ['bt-scan',null,'click'],
  ['bt-chain',null,'click'], ['bt-play',null,'click'],
  /* §7 光路动画：单步走满 6 个落点 + 三个开关 + 播放 */
  ['bt-path-reset',null,'click'],
  ['bt-path-step',null,'click'], ['bt-path-step',null,'click'], ['bt-path-step',null,'click'],
  ['bt-path-step',null,'click'], ['bt-path-step',null,'click'], ['bt-path-step',null,'click'],
  ['ck-path-normal',null,'change'], ['ck-path-normal',null,'change'],
  ['ck-path-fresnel',null,'change'], ['ck-path-grid',null,'change'],
  ['bt-path-play',null,'click'],
  /* §8 命中次数：6 个模式按钮 + 三个开关 */
  ['bt-cnt-m1',null,'click'], ['bt-cnt-m2',null,'click'], ['bt-cnt-m3',null,'click'],
  ['bt-cnt-mx',null,'click'], ['bt-cnt-me',null,'click'], ['bt-cnt-all',null,'click'], ['bt-cnt-m0',null,'click'],
  ['ck-cnt-normal',null,'change'], ['ck-cnt-normal',null,'change'],
  ['ck-cnt-grid',null,'change'], ['ck-cnt-grid',null,'change'],
  ['ck-cnt-branch',null,'change'], ['ck-cnt-branch',null,'change'],
];
let intErr = 0;
for (const [id, val, evt] of interactions) {
  const el = registry[id];
  if (!el) { errors.push('交互失败：元素 #' + id + ' 不存在'); intErr++; continue; }
  if (val !== null) el.value = val;
  if (id === 'ck-aa') el.checked = false;
  try { el.dispatch(evt, { clientX:100, clientY:100, pointerId:1, preventDefault(){} }); }
  catch (e) { intErr++; errors.push('交互 #' + id + ' (' + evt + '): ' + e.message + '\n   ' + (e.stack||'').split('\n')[1]); }
}
console.log('   ' + interactions.length + ' 次交互，异常 ' + intErr + ' 次');

/* 指针拖动 */
console.log('\n模拟指针拖动（§3 求交面板 / §4 法线球）…');
let dragErr = 0;
[['cv-hit',[80,120]],['cv-normal',[320,180]]].forEach(([id, p]) => {
  const el = registry[id];
  try {
    el.dispatch('pointerdown', { clientX:p[0], clientY:p[1], pointerId:1 });
    el.dispatch('pointermove', { clientX:p[0]+60, clientY:p[1]+30, pointerId:1 });
    el.dispatch('pointermove', { clientX:p[0]-40, clientY:p[1]-20, pointerId:1 });
    el.dispatch('pointerup',   { clientX:p[0], clientY:p[1], pointerId:1 });
  } catch (e) { dragErr++; errors.push('拖动 #' + id + ': ' + e.message + '\n   ' + (e.stack||'').split('\n')[1]); }
});
console.log('   2 个面板拖动，异常 ' + dragErr + ' 次');

/* §8 扫描带：横坐标应映射到不同发射角，从而切到不同光路。
   假画布 clientWidth=640 → x0=78、x1=622，α = −90 + (x−78)/544×180。 */
console.log('\n模拟 §8 扫描带点击…');
let coneErr = 0;
[[184,'1 次'], [232,'3 次'], [350,'2 次'], [500,'0 次']].forEach(([x, name]) => {
  const el = registry['cv-cone'];
  try { el.dispatch('click', { clientX:x, clientY:90 }); }
  catch (e) { coneErr++; errors.push('扫描带点击 x=' + x + ' (' + name + '): ' + e.message); }
});
console.log('   4 次扫描带点击，异常 ' + coneErr + ' 次');

/* window resize */
try { (winListeners['resize']||[]).forEach(f=>f.call(window,{})); console.log('   resize 处理正常'); }
catch (e) { errors.push('resize: ' + e.message); }

/* ---------- 统计 ---------- */
console.log('\n=== 画布 API 调用统计 ===');
const sorted = Object.keys(ctxCalls).sort((a,b)=>ctxCalls[b]-ctxCalls[a]);
console.log('   ' + sorted.map(k=>k+'×'+ctxCalls[k]).join('  '));
note('Canvas 操作总数 ' + opCount);

/* 确认渲染器真的在算 */
const pt = registry['cv-pt'];
const passTxt = registry['o-pass'] ? registry['o-pass'].textContent : '(无)';
const sppTxt = registry['o-spp'] ? registry['o-spp'].textContent : '(无)';
note('路径追踪读数: 已完成轮数=' + passTxt + '  样本/像素=' + sppTxt);

console.log('\n=== 结果 ===');
if (errors.length) {
  console.log('❌ 发现 ' + errors.length + ' 个运行时问题:');
  errors.slice(0, 10).forEach((e, i) => console.log('\n  [' + (i+1) + '] ' + e));
  process.exit(1);
} else {
  console.log('✅ 无运行时异常');
  notes.forEach(n => console.log('   · ' + n));
}
