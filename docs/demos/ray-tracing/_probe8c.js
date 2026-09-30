/* §8 分支树探针：验证「分支表」这一块不是白写的。
   重点不是「有没有报错」，而是「表里的数字和点击后的行为对不对」——
   一个不渲染任何行的分支表同样不会报错，但用户点它什么也不会发生。
   检查项：
     ① 表真的被填充了行，且按概率降序
     ② 概率最大的那行同时带 main（= 全折射主线）与 sel（= 当前选中）
     ③ 点某一行 → 读数换成那一支的命中次数与概率；主线的命中次数也跟着换
     ④ 再点同一行 → 退回概率最大的那一支
     ⑤ 关掉「显示玻璃反射分支」不影响主线与读数（只收起虚线）              */
const fs = require('fs');
const path = require('path').join(__dirname, 'index.html');
const html = fs.readFileSync(path, 'utf8');
const s0 = html.lastIndexOf('<script>'), s1 = html.lastIndexOf('</script>');
const code = html.slice(s0 + '<script>'.length, s1);

const fails = [];
function ok(cond, name, extra){
  console.log('  ' + (cond ? '✅' : '❌') + '  ' + name + (extra ? '  ' + extra : ''));
  if (!cond) fails.push(name);
}

/* ---------- Canvas 桩 ---------- */
function makeCtx(){
  const noop = () => {};
  return {
    canvas:null, fillStyle:'', strokeStyle:'', lineWidth:1, font:'', textAlign:'', textBaseline:'',
    globalAlpha:1, imageSmoothingEnabled:true, imageSmoothingQuality:'high',
    setTransform:noop, clearRect:noop, fillRect:noop, strokeRect:noop, beginPath:noop, closePath:noop,
    moveTo:noop, lineTo:noop, arc:noop, rect:noop, fill:noop, stroke:noop, save:noop, restore:noop,
    setLineDash:noop, fillText:noop, drawImage:noop, putImageData:noop,
    measureText:() => ({ width: 40 }),
    createRadialGradient(){ return { addColorStop:noop }; },
    createLinearGradient(){ return { addColorStop:noop }; },
    createImageData(w,h){ return { width:w, height:h, data:new Uint8ClampedArray(w*h*4) }; },
    getImageData(x,y,w,h){ return { width:w, height:h, data:new Uint8ClampedArray(w*h*4) }; },
  };
}

/* ---------- 元素桩（这一版记录 children，才能查分支表） ---------- */
const registry = Object.create(null);
function makeEl(id){
  if (registry[id]) return registry[id];
  const el = {
    id, tagName:'DIV', className:'', textContent:'', _innerHTML:'',
    width:0, height:0, value:'0', checked:false, offsetTop:0, offsetWidth:0,
    clientWidth: 640, clientHeight: 320, style:{}, children:[], parentNode:null,
    _listeners: Object.create(null),
    getContext(){ return this._ctx || (this._ctx = makeCtx()); },
    getBoundingClientRect(){ return { left:0, top:0, width:this.clientWidth, height:this.clientHeight }; },
    addEventListener(t, fn){ (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener(){}, setPointerCapture(){}, releasePointerCapture(){},
    appendChild(c){ this.children.push(c); if (c) c.parentNode = this; return c; },
    removeChild(c){ const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
    click(){}, focus(){}, blur(){}, setAttribute(){}, querySelector(){ return null; }, querySelectorAll(){ return []; },
    getAttribute(n){ return n === 'href' ? ('#' + id) : null; },
    toDataURL(){ return 'data:image/png;base64,AAAA'; },
    dispatch(t, ev){ (this._listeners[t]||[]).forEach(f => f.call(this, ev || {})); },
  };
  /* innerHTML = '' 必须真的清空 children，否则 renderBtree 每次重渲染都会累加 */
  Object.defineProperty(el, 'innerHTML', {
    get(){ return this._innerHTML; },
    set(v){ this._innerHTML = v; if (v === '') this.children.length = 0; },
  });
  registry[id] = el;
  return el;
}

const IDS = ['cv-raster','cv-rt','cv-ray','cv-hit','cv-quad','cv-normal','cv-chain','cv-pt','cv-path',
  'rg-prog','rg-t','rg-ang','rg-len','rg-r','rg-depth','rg-fov',
  'se-scene','se-res','se-light','se-shade','ck-aa',
  'bt-play','bt-chain','bt-pause','bt-reset','bt-save','bt-scan',
  'bt-path-play','bt-path-step','bt-path-reset',
  'ck-path-normal','ck-path-fresnel','ck-path-grid',
  'o-a','o-h','o-c','o-d','o-t1','o-t2','o-pass','o-spp','o-cur','o-time','o-speed','o-noise',
  'o-mth','o-mtr','o-mtd','o-gin','o-gout','o-chord',
  'path-now','path-ledger'];
IDS.forEach(makeEl);
registry['se-scene'].value = 'classic';
registry['se-res'].value = '200';
registry['se-light'].value = 'sky';
registry['se-shade'].value = 'normal';
registry['rg-depth'].value = '8';
registry['rg-fov'].value = '60';
registry['rg-prog'].value = '0';
registry['rg-t'].value = '0';
registry['rg-ang'].value = '-22';
registry['rg-len'].value = '100';
registry['rg-r'].value = '66';

const navLinks = ['#s0','#s1','#s2','#s3','#s4','#s5','#s6','#s7','#s8','#s9'].map((h,i) => {
  const e = makeEl('toc'+i); e.getAttribute = () => h; return e;
});

const document = {
  createElement(tag){
    const e = makeEl('created_' + tag + '_' + Math.random().toString(36).slice(2,7));
    e.tagName = tag.toUpperCase();
    return e;
  },
  querySelector(sel){
    if (sel && sel[0] === '#') return registry[sel.slice(1)] || makeEl(sel.slice(1));
    if (sel === 'canvas') return makeEl('cv-pt');
    return makeEl('q_' + sel);
  },
  querySelectorAll(sel){
    if (sel === '.toc a') return navLinks;
    if (sel.indexOf('#cv-ray') === 0) return [registry['rg-t'], registry['rg-ang'], registry['rg-len']];
    return [];
  },
  addEventListener(){}, removeEventListener(){},
  body: makeEl('body'), documentElement: makeEl('docEl'),
};

let rafQueue = [];
const requestAnimationFrame = fn => { rafQueue.push(fn); return rafQueue.length; };
const winListeners = Object.create(null);
const window = {
  devicePixelRatio:1,
  addEventListener(t, fn){ (winListeners[t] = winListeners[t] || []).push(fn); },
  removeEventListener(){}, scrollY:0, innerWidth:1280, innerHeight:800,
  requestAnimationFrame, setTimeout, clearTimeout,
  location:{ href:'file:///demo/index.html' },
};

new Function('window','document','requestAnimationFrame','performance','setTimeout','clearTimeout','console','navigator', code)
  (window, document, requestAnimationFrame, performance, setTimeout, clearTimeout, console, { userAgent:'node' });

function frames(n){
  for (let i=0;i<n;i++){
    const q = rafQueue; rafQueue = [];
    if (!q.length) break;
    q.forEach(fn => fn(i*16.7));
  }
}
frames(3);

const box = registry['count-btree'];
const rows = () => box.children;
/* 真实 DOM 里 textContent 会把子节点文本一起算进来；桩里只存了自己的那段，
   所以这里递归聚合 —— 分支表的路径文本是由 <span>/<b>/<em> 拼出来的。 */
function txt(el){
  if (!el) return '';
  let s = el.textContent || '';
  for (const c of (el.children || [])) s += txt(c);
  return s;
}
const read = id => txt(registry[id]);

console.log('\n=== §8 分支表探针 ===\n');
console.log('初始（m0）行数: ' + rows().length);

/* ---------- 切到 m3（3 次命中 = §7 那条路径，也是分支最丰富的一条） ---------- */
registry['bt-cnt-m3'].dispatch('click', {});
frames(2);
console.log('\n[切到 m3 后]');
const r = rows();
console.log('  行数: ' + r.length + '   命中读数: ' + read('o-chit') + '   本支概率: ' + read('o-cprob') + '   期望: ' + read('o-cexp'));
console.log('  各行：');
r.forEach((rw, i) => console.log('    [' + i + '] ' + txt(rw.children[0]) + '  ' + txt(rw.children[1]) + '  ' + txt(rw.children[2])));

ok(r.length >= 3, '分支表已填充（行数 ≥ 3）', '实际 ' + r.length + ' 行');
/* 关键恒等式：剪枝不能污染期望值。m3 方向的 E[命中次数] 精确等于 3.000，
   因为「反射支少一次命中」与「玻璃内反射支多一次命中」正负相抵。 */
ok(/^3\.0{2,3}/.test(read('o-cexp')) || Math.abs(parseFloat(read('o-cexp')) - 3) < 0.0005,
   '期望命中次数 = 3.000（剪枝前后一致，恒等式成立）', read('o-cexp'));
ok(rows()[0] && /88\.8/.test(txt(rows()[0].children[0])),
   '首行概率 = 88.80%（全折射主线）', rows()[0] ? txt(rows()[0].children[0]) : '(无)');
ok(rows()[0] && rows()[0].className.indexOf('main') >= 0, '首行带 main 标记');
ok(rows()[0] && rows()[0].className.indexOf('sel') >= 0, '首行默认被选中（sel）');

/* 概率必须降序 */
let desc = true, prevP = Infinity;
for (const rw of rows()){
  const p = parseFloat(txt(rw.children[0]));
  if (!(p <= prevP + 1e-9)) desc = false;
  prevP = p;
}
ok(desc, '各行按概率降序排列');

/* 有一条行应该是「玻璃入场反射」——这正是 §8 原先整体缺失的那一半。
   匹配串必须用「入场面反射」而不是「反射」：后者的字面也被「金属反射」命中，
   会把全折射主线误当成反射支。 */
let hasReflRow = false, reflRowTxt = '';
for (const rw of rows()){
  const t = txt(rw.children[2]);
  if (t.indexOf('入场面反射') >= 0){ hasReflRow = true; reflRowTxt = t; }
}
ok(hasReflRow, '表里存在「玻璃入场面反射」分支（Fresnel 反射不再缺失）', reflRowTxt);

/* 入场反射支的命中次数应少于主线：金属 1 次 + 玻璃入场 1 次 = 2 次 */
const reflRow = rows().find(rw => txt(rw.children[2]).indexOf('入场面反射') >= 0);
if (reflRow){
  ok(/^2 次/.test(txt(reflRow.children[1])), '「金属 → 玻璃入场反射」支为 2 次命中', txt(reflRow.children[1]));
} else {
  ok(false, '找到「金属 → 玻璃入场反射」这一支');
}

/* ---------- 点一行 → 主线换成那一支 ---------- */
const target = rows().findIndex(rw => txt(rw.children[2]).indexOf('入场面反射') >= 0);
if (target > 0){
  const beforeHit = read('o-chit'), beforeProb = read('o-cprob');
  rows()[target].dispatch('click', {});
  frames(2);
  const afterHit = read('o-chit'), afterProb = read('o-cprob');
  console.log('\n[点第 ' + (target+1) + ' 行后]  命中: ' + beforeHit + ' → ' + afterHit + '   概率: ' + beforeProb + ' → ' + afterProb);
  ok(afterHit !== beforeHit, '点击分支后主线命中次数发生变化');
  ok(/^2 次/.test(afterHit), '切换后命中次数 = 该支的 2 次', afterHit);
  ok(rows()[target].className.indexOf('sel') >= 0, '被点的行标记为 sel');
  ok(rows()[0].className.indexOf('sel') < 0, '原主线行已不再是 sel');

  /* ---------- 再点同一行 → 退回主线 ---------- */
  rows()[target].dispatch('click', {});
  frames(2);
  const backHit = read('o-chit');
  console.log('\n[再点同一行]  命中: ' + backHit);
  ok(/^3 次/.test(backHit), '再点同一行退回概率最大的主线（3 次）', backHit);
} else {
  ok(false, '找到可点击的反射支（索引 > 0）');
}

/* ---------- 关掉「显示玻璃反射分支」不影响主线与读数 ---------- */
const ckB = registry['ck-cnt-branch'];
if (ckB){
  ckB.checked = false;
  const hitBefore = read('o-chit');
  ckB.dispatch('change', {});
  frames(2);
  ok(read('o-chit') === hitBefore, '取消「显示玻璃反射分支」后主线读数不变', read('o-chit'));
  ckB.checked = true;
  ckB.dispatch('change', {});
  frames(2);
  ok(read('o-chit') === hitBefore, '重新勾选后主线读数仍不变');
} else {
  ok(false, '找到 #ck-cnt-branch');
}

/* ---------- 切到 all 视图不应留下孤儿行 ---------- */
registry['bt-cnt-all'].dispatch('click', {});
frames(2);
ok(rows().length === 0, '「四线对照」视图下分支表被清空', '行数 ' + rows().length);
registry['bt-cnt-m3'].dispatch('click', {});
frames(2);
ok(rows().length >= 3, '切回 m3 分支表重新填充', '行数 ' + rows().length);

console.log('\n=== 结果 ===');
if (fails.length){ console.log('❌ ' + fails.length + ' 项未通过: ' + fails.join(' / ')); process.exit(1); }
console.log('✅ 全部通过');
