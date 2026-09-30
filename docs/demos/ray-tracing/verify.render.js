/* 实现级像素校验：用 DOM/Canvas 桩真实执行 index.html 的脚本，并对
 * putImageData 收到的【真实像素缓冲】做断言。
 *
 * 为什么必须有这一层：
 *   - verify.math.js 从「定义」重算，验证的是数学是否被正确理解，**不是页面里的实现**；
 *     页面把 (h−√Δ)/a 写成 (−h−√Δ)/a 这类符号反了，定义式照样算得出正确答案。
 *   - _smoke.js 只统计 Canvas API 调用次数，全黑画布与正常画布的次数完全一样。
 *   - _shot.js 截屏只能看到「一片黑」，无法区分「没绘制」「绘制了但是背景色」「内容没合成」。
 * 结论：只有读「页面真正交给 putImageData 的缓冲区」才能发现这类 bug。
 *
 * 用法: node verify.render.js [html路径]
 */
const fs = require('fs');
const HTML = process.argv[2] || require('path').join(__dirname, 'index.html');
const html = fs.readFileSync(HTML, 'utf8');
const s0 = html.lastIndexOf('<script>'), s1 = html.lastIndexOf('</script>');
const code = html.slice(s0 + '<script>'.length, s1);

/* ---------- 记录 putImageData 的真实缓冲区 + 记录矢量绘制调用 ---------- */
const frames = [];
const arcs = [];        // 记录每一个 ctx.arc(x, y, r, a0, a1)，用于校验"标记是否画在正确位置"以及"角度弧是否满足定律"
const rects = [];       // 记录每一个 ctx.fillRect(x, y, w, h)，用于校验"带暗底的标签是否互相压住"
const drawnTexts = [];  // 记录每一个 ctx.fillText(text, x, y)，用于校验"落字顺序"（顺序即遮挡关系）
const pts = [];         // 记录每一个路径坐标，用于校验"没有 NaN 被静默画进去"
/* 等宽字体的字宽模型：ASCII ≈ 6.9px，CJK ≈ 11.5px（页面用的都是 Consolas/ui-monospace 11.5px）。
   桩必须按「字长」估宽，绝不能返回一个常数 —— 返回常数会让标签避让在桩里
   「看起来总是躲得开」，而真实浏览器里球名比桩以为的宽得多，重叠照样发生。
   这是桩保真度问题：桩对被模拟对象的失真会直接变成校验的盲区。 */
function textW(s) {
  let w = 0;
  for (const ch of String(s)) w += (ch.codePointAt(0) >= 0x2E80) ? 11.5 : 6.9;
  return w;
}

function makeCtx(el) {
  const did = () => (el && !el._created) ? el.id : null;
  const ctx = {
    canvas: el,
    fillStyle:'', strokeStyle:'', lineWidth:1, font:'', textAlign:'', textBaseline:'',
    globalAlpha:1, imageSmoothingEnabled:true, imageSmoothingQuality:'high',
    setTransform(){}, clearRect(){}, strokeRect(){},
    fillRect(x, y, w, h) { rects.push({ domId: did(), x, y, w, h }); pts.push({ domId: did(), x, y, w, h, at:'fillRect' }); },
    beginPath(){}, closePath(){},
    moveTo(x, y) { pts.push({ domId: did(), x, y, at:'moveTo' }); },
    lineTo(x, y) { pts.push({ domId: did(), x, y, at:'lineTo' }); },
    arc(x, y, r, a0, a1, ccw) { arcs.push({ domId: did(), x, y, r, a0, a1, ccw }); pts.push({ domId: did(), x, y, r, a0, a1, at:'arc' }); },
    rect(x, y, w, h) { pts.push({ domId: did(), x, y, w, h, at:'rect' }); },
    fill(){}, stroke(){},
    save(){}, restore(){}, setLineDash(){},
    /* 落字时把对齐方式与估出的字宽一并记下 —— F6 要靠它还原「这条文字占多大一块」 */
    fillText(t, x, y) {
      drawnTexts.push({ domId: did(), t: String(t), x, y, align: this.textAlign, w: textW(t) });
    },
    measureText(t){ return { width: textW(t) }; }, drawImage(){},
    createRadialGradient(){ return { addColorStop(){} }; },
    createLinearGradient(){ return { addColorStop(){} }; },
    putImageData(img, x, y) {
      frames.push({
        w: img.width, h: img.height,
        data: Uint8ClampedArray.from(img.data),      // 必须复制：页面会复用同一个缓冲
        domId: did(),
        createdAt: frames.length,
      });
    },
    createImageData(w, h) { return { width:w, height:h, data:new Uint8ClampedArray(w*h*4) }; },
    getImageData(x, y, w, h) { return { width:w, height:h, data:new Uint8ClampedArray(w*h*4) }; },
  };
  return ctx;
}

const registry = Object.create(null);
function makeEl(id) {
  if (registry[id]) return registry[id];
  const el = {
    id, tagName:'CANVAS', className:'', textContent:'', _innerHTML:'',
    width:0, height:0, value:'0', checked:false, offsetTop:0, offsetWidth:0,
    clientWidth: 640, clientHeight: 320, style:{}, children:[], parentNode:null,
    _listeners:Object.create(null),
    getContext(){ return this._ctx || (this._ctx = makeCtx(this)); },
    getBoundingClientRect(){ return {left:0, top:0, width:this.clientWidth, height:this.clientHeight}; },
    addEventListener(t, fn){ (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener(){}, setPointerCapture(){}, releasePointerCapture(){},
    appendChild(c){ this.children.push(c); if (c) c.parentNode = this; return c; },
    removeChild(c){ const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
    click(){}, focus(){}, blur(){},
    getAttribute(n){ return n === 'href' ? ('#' + id) : null; },
    setAttribute(){}, querySelector(){ return null; }, querySelectorAll(){ return []; },
    toDataURL(){ return 'data:image/png;base64,AAAA'; },
    dispatch(t, ev){ (this._listeners[t]||[]).forEach(f => f.call(this, ev || {})); },
  };
  /* innerHTML = '' 必须同时清掉 children：分支表每次重渲染都会先清空再填，
     如果桩里只把字符串置空、子节点却留着，行数会一直累加，
     「表里到底有几行」这条断言就永远查不到真问题。 */
  Object.defineProperty(el, 'innerHTML', {
    get(){ return this._innerHTML; },
    set(v){ this._innerHTML = v; if (v === '') this.children.length = 0; },
  });
  registry[id] = el;
  return el;
}

const IDS = ['cv-raster','cv-rt','cv-ray','cv-hit','cv-quad','cv-normal','cv-chain','cv-pt','cv-path',
  'cv-count','cv-cone','count-spans','count-now','count-ledger','count-cap',
  'rg-prog','rg-t','rg-ang','rg-len','rg-r','rg-depth','rg-fov',
  'se-scene','se-res','se-light','se-shade','ck-aa',
  'bt-play','bt-chain','bt-pause','bt-reset','bt-save','bt-scan',
  'bt-path-play','bt-path-step','bt-path-reset',
  'bt-cnt-m0','bt-cnt-m1','bt-cnt-m2','bt-cnt-m3','bt-cnt-mx','bt-cnt-me','bt-cnt-all',
  'ck-path-normal','ck-path-fresnel','ck-path-grid','ck-cnt-normal','ck-cnt-grid','ck-cnt-branch',
  'count-btree',
  'o-a','o-h','o-c','o-d','o-t1','o-t2','o-pass','o-spp','o-cur','o-time','o-speed','o-noise',
  'o-mth','o-mtr','o-mtd','o-gin','o-gout','o-chord',
  'o-ca','o-chit','o-cterm','o-ccol','o-cshare','o-cdepth','o-crin','o-cprob','o-cexp',
  'path-now','path-ledger',
  'lb-prog','lb-ray','lb-r','lb-disc','lb-verdict','lb-chain','lb-depth','lb-stat','lb-fov','lb-path','lb-cnt',
  's0','s1','s2','s3','s4','s5','s6','s7','s8','s9','s10'];
IDS.forEach(makeEl);
registry['rg-t'].value = '0';       registry['rg-ang'].value = '-22';
registry['rg-len'].value = '100';   registry['rg-r'].value = '66';
registry['rg-depth'].value = '8';   registry['rg-fov'].value = '60';
registry['rg-prog'].value = '0';    registry['se-scene'].value = 'classic';
registry['se-res'].value = '200';   registry['se-light'].value = 'sky';
registry['se-shade'].value = 'normal'; registry['ck-aa'].checked = true;

const navLinks = ['#s0','#s1','#s2','#s3','#s4','#s5','#s6','#s7','#s8','#s9','#s10'].map((h, i) => {
  const e = makeEl('toc' + i); e.getAttribute = () => h; return e;
});
const created = [];                 // 记录页面 createElement 出来的节点（§7 账本 DOM 用）

const document = {
  createElement(tag) {
    const e = makeEl('created_' + tag + '_' + Math.random().toString(36).slice(2, 7));
    e.tagName = tag.toUpperCase(); e._created = true;
    created.push(e);
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

let rafQueue = [];
const requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
const window = {
  devicePixelRatio: 1, addEventListener(){}, removeEventListener(){},
  scrollY: 0, innerWidth: 1280, innerHeight: 800,
  requestAnimationFrame, setTimeout, clearTimeout,
  location: { href: 'file:///demo/index.html' },
};

/* ---------- 执行 ---------- */
const fn = new Function('window','document','requestAnimationFrame','performance','setTimeout','clearTimeout','console','navigator', code);
fn(window, document, requestAnimationFrame, performance, setTimeout, clearTimeout,
   { log(){}, warn(){}, error(){} }, { userAgent:'node' });

/* 推若干帧：§6 的渐进式路径追踪器靠 rAF 驱动，不推帧它不会有任何 putImageData。
   注意 §4 的帧在顶层执行时（full()）就已写入，始终是 frames 里第一个离屏帧。 */
let ts = 0;
for (let i = 0; i < 60; i++) {
  const q = rafQueue; rafQueue = [];
  if (!q.length) break;
  ts += 16.7;
  for (const f of q) { try { f(ts); } catch (e) { /* 异常由 _smoke.js 负责，这里只看像素 */ } }
}

/* ---------- 像素分析 ---------- */
const key = (d,i) => (d[i]<<16) | (d[i+1]<<8) | d[i+2];

function analyze(f) {
  const N = f.w * f.h;
  const stride = Math.max(1, Math.ceil(Math.sqrt(N / 40000)));   // 采样上限 ~4 万点
  const counts = new Map();
  let raySum = 0, n = 0, lumaMin = 255, lumaMax = 0;
  for (let y = 0; y < f.h; y += stride) {
    for (let x = 0; x < f.w; x += stride) {
      const i = (y * f.w + x) * 4;
      const k = key(f.data, i);
      counts.set(k, (counts.get(k) || 0) + 1);
      const l = 0.299*f.data[i] + 0.587*f.data[i+1] + 0.114*f.data[i+2];
      if (l < lumaMin) lumaMin = l;
      if (l > lumaMax) lumaMax = l;
      raySum += l; n++;
    }
  }
  let modal = 0, modalN = 0;
  for (const [k, c] of counts) if (c > modalN) { modalN = c; modal = k; }
  return {
    N, sampled: n, distinct: counts.size, modal,
    modalShare: +(modalN / n).toFixed(3),
    modalRGB: [(modal>>16)&255, (modal>>8)&255, modal&255],
    offModal: +(1 - modalN / n).toFixed(4),
    lumaMin: Math.round(lumaMin), lumaMax: Math.round(lumaMax),
    meanLuma: +(raySum / n).toFixed(1),
  };
}

/* 前景包围盒：亮度高于阈值的像素范围（用于构图裁切检查） */
function foregroundBox(f, threshold) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, cnt = 0;
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const i = (y * f.w + x) * 4;
      const l = 0.299*f.data[i] + 0.587*f.data[i+1] + 0.114*f.data[i+2];
      if (l > threshold) {
        cnt++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return cnt ? { x0, y0, x1, y1, cnt, ratio: +(cnt / (f.w * f.h)).toFixed(3) } : null;
}

const BG = [[0,0,0], [12,16,23]];                  // 本页两种背景色
const isBG = (rgb) => BG.some(b => b[0] === rgb[0] && b[1] === rgb[1] && b[2] === rgb[2]);

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  PASS  ' + m); };
const bad = (m) => { fail++; console.log('  FAIL  ' + m); };

/* ===== A. 通用守卫：凡被 putImageData 写入的缓冲区都不允许是「一片纯背景色」 ===== */
console.log('\n=== A. 通用守卫：所有写入的帧缓冲不得为单色背景 ===');
console.log('   记录到 ' + frames.length + ' 帧 putImageData');
const uniform = [];
for (const f of frames) {
  if (f.w * f.h < 2000) continue;                  // 小图（如 1x1、渐变色标）不参与
  const a = analyze(f);
  const singleColor = a.distinct === 1;
  if (singleColor && isBG(a.modalRGB)) {
    uniform.push({ f, a });
    bad((f.domId ? '#' + f.domId : '离屏缓冲') + ' ' + f.w + 'x' + f.h
      + ' 是单色背景 ' + a.modalRGB.join(',') + ' —— 没有任何几何被绘制');
  }
}
if (!uniform.length) ok('没有单色背景帧（' + frames.filter(f => f.w*f.h >= 2000).length + ' 个大帧全部有内容）');

/* ===== A2. 通用守卫：所有绘制坐标必须是有限数 =====
   NaN 不会报错，只会让这一笔静默消失——「到达天光」判据漏掉有限性检查时
   就会算出 Infinity·d 的 NaN 坐标，画面看着只是少了一条线。 */
console.log('\n=== A2. 通用守卫：绘制坐标不得为 NaN / Infinity ===');
const NaNKEYS = ['x', 'y', 'w', 'h', 'r', 'a0', 'a1'];
const badPts = pts.filter(p => NaNKEYS.some(k => p[k] !== undefined && !Number.isFinite(p[k])));
console.log('   记录到 ' + pts.length + ' 个绘制坐标');
if (!pts.length) bad('没有记录到任何绘制坐标，桩可能没接上');
else if (badPts.length) {
  const s = badPts[0];
  bad('有 ' + badPts.length + ' 个坐标不是有限数，例如 ' + (s.domId ? '#' + s.domId + ' ' : '')
    + s.at + ' ' + JSON.stringify(NaNKEYS.filter(k => s[k] !== undefined && !Number.isFinite(s[k]))
      .map(k => k + '=' + s[k]).join(',')));
} else ok('全部 ' + pts.length + ' 个坐标都是有限数（无 NaN 被静默画入）');

/* ===== B. §4 法线着色：必须是可见、居中、不裁切的球 ===== */
console.log('\n=== B. §4 法线着色（离屏低分缓冲）===');
const off4 = frames.find(f => !f.domId && f.w * f.h >= 2000);
if (!off4) {
  bad('找不到 §4 的离屏缓冲帧');
} else {
  const a = analyze(off4);
  const fg = foregroundBox(off4, 24);
  console.log('   缓冲 ' + off4.w + 'x' + off4.h + '  不同色数=' + a.distinct
    + '  最暗亮度=' + a.lumaMin + '  最亮亮度=' + a.lumaMax + '  平均亮度=' + a.meanLuma);

  if (fg) {
    const cx = (fg.x0 + fg.x1) / 2, cy = (fg.y0 + fg.y1) / 2;
    const mL = fg.x0, mR = off4.w - 1 - fg.x1, mT = fg.y0, mB = off4.h - 1 - fg.y1;
    console.log('   前景 ' + fg.cnt + ' px (' + (fg.ratio*100).toFixed(1) + '%)  列 ' + fg.x0 + '..' + fg.x1
      + '  行 ' + fg.y0 + '..' + fg.y1);
    console.log('   留白 左' + mL + ' 右' + mR + ' 上' + mT + ' 下' + mB
      + '   中心偏移 Δx=' + (cx - (off4.w-1)/2).toFixed(0) + ' Δy=' + (cy - (off4.h-1)/2).toFixed(0));

    if (fg.ratio >= 0.03) ok('球体可见（前景占比 ' + (fg.ratio*100).toFixed(1) + '%）');
    else bad('球体几乎不可见（前景占比仅 ' + (fg.ratio*100).toFixed(1) + '%）');

    const minMargin = Math.min(mL, mR, mT, mB);
    if (minMargin >= 3) ok('四边均未裁切（最小留白 ' + minMargin + 'px）');
    else bad('球体被画布边缘裁切（最小留白 ' + minMargin + 'px）');

    if (Math.abs(cx - (off4.w-1)/2) <= off4.w * 0.12) ok('水平居中（Δx=' + (cx-(off4.w-1)/2).toFixed(1) + '）');
    else bad('水平明显偏移（Δx=' + (cx-(off4.w-1)/2).toFixed(1) + '）');

    if (Math.abs(cy - (off4.h-1)/2) <= off4.h * 0.30) ok('垂直基本居中（Δy=' + (cy-(off4.h-1)/2).toFixed(1) + '）');
    else bad('垂直明显偏移（Δy=' + (cy-(off4.h-1)/2).toFixed(1) + '）');

    /* 正圆不变量：本页像素是正方形的，所以球在缓冲里必须是正圆。
       这一条与画布宽高比无关，能直接抓住「缓冲比例 ≠ 画布比例 → drawImage 拉伸成椭圆」。 */
    const bw = fg.x1 - fg.x0 + 1, bh = fg.y1 - fg.y0 + 1;
    const circDev = Math.abs(bw - bh) / Math.max(bw, bh);
    if (circDev <= 0.08) ok('是正圆而非椭圆（' + bw + '×' + bh + '，偏差 ' + (circDev*100).toFixed(1) + '%）');
    else bad('被拉成椭圆（' + bw + '×' + bh + '，偏差 ' + (circDev*100).toFixed(1) + '% > 8%）');

    const hFill = bh / off4.h;
    if (hFill >= 0.25 && hFill <= 0.70) ok('球体占画面高度 ' + (hFill*100).toFixed(0) + '%（既不小也不顶边）');
    else bad('球体在画面里的高度占比异常：' + (hFill*100).toFixed(0) + '%');
  } else {
    bad('缓冲里没有任何前景像素 —— 球完全没画出来');
  }

  /* 缓冲宽高比必须等于画布宽高比，否则 drawImage 一定拉伸 */
  const dispW = registry['cv-normal'].clientWidth, dispH = registry['cv-normal'].clientHeight;
  const dispAspect = dispW / dispH, bufAspect = off4.w / off4.h;
  const aspDev = Math.abs(bufAspect - dispAspect) / dispAspect;
  if (aspDev <= 0.015) ok('缓冲宽高比与显示画布一致（' + bufAspect.toFixed(3) + ' vs ' + dispAspect.toFixed(3) + '，画布 ' + dispW + '×' + dispH + '）');
  else bad('缓冲宽高比 ' + bufAspect.toFixed(3) + ' ≠ 画布 ' + dispAspect.toFixed(3)
    + '（偏差 ' + (aspDev*100).toFixed(1) + '%）→ drawImage 会拉伸变形');

  if (a.distinct >= 200) ok('法线着色有连续渐变（不同色数 ' + a.distinct + ' ≥ 200）');
  else bad('颜色过于单一（不同色数仅 ' + a.distinct + '），法线着色可能没生效');

  if (a.lumaMax >= 150) ok('存在高亮区（最亮亮度 ' + a.lumaMax + '）');
  else bad('整幅过暗（最亮亮度仅 ' + a.lumaMax + '）');
}

/* ===== B2. §4 其余三种着色模式也不允许空白 ===== */
console.log('\n=== B2. §4 其余着色模式 ===');
const dim4 = off4 ? (off4.w + 'x' + off4.h) : null;
['flat', 'lambert', 'depth'].forEach(mode => {
  const sel = registry['se-shade'];
  if (!sel) { bad('找不到 #se-shade，无法切换 ' + mode); return; }
  sel.value = mode;
  sel.dispatch('change', {});
  const cands = frames.filter(f => !f.domId && (f.w + 'x' + f.h) === dim4);
  const fr = cands[cands.length - 1];
  if (!fr) { bad(mode + '：切换后没有产生新的缓冲帧'); return; }
  const a = analyze(fr), fg = foregroundBox(fr, 24);
  console.log('   ' + mode.padEnd(8) + ' 不同色数=' + String(a.distinct).padStart(5)
    + '  平均亮度=' + String(a.meanLuma).padStart(6)
    + '  前景占比=' + (fg ? (fg.ratio*100).toFixed(1) + '%' : '0%'));
  if (a.distinct < 2) bad(mode + '：缓冲区只有一种颜色，等于空白');
  else if (a.meanLuma < 4) bad(mode + '：整幅几乎全黑（平均亮度 ' + a.meanLuma + '）');
  else if (mode !== 'lambert' && (!fg || fg.ratio < 0.06)) bad(mode + '：球体不可见（前景 ' + (fg ? (fg.ratio*100).toFixed(1) : 0) + '%）');
  else ok(mode + ' 模式画面正常');
});

/* ===== C. §6 路径追踪：离屏累积缓冲必须有内容 =====
   注意 §4 与 §6 都是「先写离屏缓冲，再 drawImage 到可见画布」，
   所以两者都表现为「非 DOM 画布上的 putImageData」，只能按尺寸分组区分。 */
console.log('\n=== C. §6 路径追踪（离屏累积缓冲）===');
const offFrames = frames.filter(f => !f.domId && f.w * f.h >= 2000);
const groups = new Map();
for (const f of offFrames) {
  const k = f.w + 'x' + f.h;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(f);
}
console.log('   离屏缓冲分组: ' + [...groups].map(([k, v]) => k + '×' + v.length + '帧').join('  '));
const ptKey = [...groups.keys()].filter(k => k !== (off4 ? off4.w + 'x' + off4.h : ''))
  .sort((a, b) => (parseInt(b) * parseInt(b.split('x')[1])) - (parseInt(a) * parseInt(a.split('x')[1])))[0];
if (!ptKey) {
  bad('找不到 §6 的离屏累积缓冲（非 §4 尺寸的离屏帧）');
} else {
  const g = groups.get(ptKey);
  const last = g[g.length - 1];
  const a = analyze(last);
  const fg = foregroundBox(last, 24);
  console.log('   ' + ptKey + ' 共 ' + g.length + ' 帧，末帧 不同色数=' + a.distinct
    + '  平均亮度=' + a.meanLuma + '  亮度 ' + a.lumaMin + '..' + a.lumaMax
    + '  前景占比=' + (fg ? (fg.ratio*100).toFixed(1) + '%' : '0%'));
  if (a.distinct >= 50) ok('路径追踪画面有内容（不同色数 ' + a.distinct + ' ≥ 50）');
  else bad('路径追踪画面过于单一（不同色数仅 ' + a.distinct + '）');
  if (fg && fg.ratio >= 0.5) ok('场景占据大部分画面（前景 ' + (fg.ratio*100).toFixed(1) + '%）');
  else bad('场景占比过低（前景 ' + (fg ? (fg.ratio*100).toFixed(1) : 0) + '%）');
}

/* ===== D. §3 求交示意：交点标记必须落在圆周上 =====
   这是纯几何不变量，与画布布局/缩放无关：标记点由 P = O + t·D 得到，而 t 是沿「未归一化方向 D」
   的参数，所以 P 必然落在球面上 → 换算到画布后，它到圆心的距离必须等于圆的绘制半径。
   先前的实现把 t 乘到了【单位方向】û 上，落点被拉近 |D| 倍（本页 |D|≈9.24），全挤在原点附近。
   注意：这条检查画布坐标系与布局无关，所以桩里的画布尺寸不影响结论。 */
console.log('\n=== D. §3 求交示意：两个交点标记落在圆周上 ===');
const hitArcs = arcs.filter(a => a.domId === 'cv-hit');
if (!hitArcs.length) {
  bad('cv-hit 没有任何 ctx.arc 调用 —— 示意图根本没画');
} else {
  const outline = hitArcs.reduce((m, a) => (a.r > m.r ? a : m), hitArcs[0]);   // 半径最大的就是球的轮廓
  const markers = hitArcs.filter(a => Math.abs(a.r - 6.5) < 1e-6);            // 交点标记固定半径 6.5
  console.log('   球轮廓 圆心=(' + outline.x.toFixed(1) + ',' + outline.y.toFixed(1)
    + ')  半径=' + outline.r.toFixed(1));
  console.log('   交点标记 ' + markers.length + ' 个: ' + markers.map(m =>
    '(' + m.x.toFixed(1) + ',' + m.y.toFixed(1) + ') 距圆心='
    + Math.hypot(m.x - outline.x, m.y - outline.y).toFixed(1)).join('  '));
  if (outline.r < 10) {
    bad('没识别出球的轮廓弧（最大半径仅 ' + outline.r.toFixed(1) + '）');
  } else if (markers.length < 2) {
    bad('交点标记数量不足（' + markers.length + ' 个，默认布局应为 t₁/t₂ 各一个）');
  } else {
    const worst = Math.max(...markers.map(m =>
      Math.abs(Math.hypot(m.x - outline.x, m.y - outline.y) - outline.r)));
    if (worst <= 2) ok('全部交点标记都在圆周上（最大偏差 ' + worst.toFixed(2) + 'px，圆半径 ' + outline.r.toFixed(1) + 'px）');
    else bad('交点标记偏离圆周：最大偏差 ' + worst.toFixed(1) + 'px（圆半径 ' + outline.r.toFixed(1) + 'px）'
      + ' —— t 很可能被乘到了单位方向 û 上而不是原始 D 上');
  }
}

/* ===== E. §7 光路示意：顶点必须落在球面上，角度弧必须满足反射 / Snell 定律 =====
   为什么必须查这一层：§7 的几何是「解析反推」出来的（先定目标反射角，再反解球心），
   只要反推时法线符号取反、或把 t 乘到了单位方向上，画面依然会画出"一条漂亮的折线"，
   但那条线在物理上是错的，而且光看截图完全看不出来。
   这里用两组与布局无关的不变量把关：
     ① 三个顶点圆点（r = 4.4px）到某条球轮廓圆心的距离 == 该圆半径  —— 交点在球面上
     ② 每个顶点处的两条角度弧（入射弧 r=0.60s / 折射弧 r=0.74s）的夹角，
        必须满足 |sinθ_inc| = 1.5·|sinθ_refr|；镜面处两弧夹角必须完全相等 */
console.log('\n=== E. §7 光路：顶点在球面上 + 角度弧满足定律 ===');
const stepBt = registry['bt-path-step'];
if (!stepBt) {
  bad('找不到 #bt-path-step，无法推进 §7 动画');
} else {
  /* 单步走满 6 个落点，让 4 段光路与全部角度弧都被画出来 */
  for (let i = 0; i < 6; i++) {
    stepBt.dispatch('click', {});
    const q = rafQueue; rafQueue = [];
    ts += 16.7;
    for (const f of q) { try { f(ts); } catch (e) { /* 异常由 _smoke.js 负责 */ } }
  }
  /* 只分析最后一帧：清空记录后再推一帧 */
  arcs.length = 0;
  rects.length = 0;
  drawnTexts.length = 0;
  const q2 = rafQueue; rafQueue = [];
  ts += 16.7;
  for (const f of q2) { try { f(ts); } catch (e) {} }

  const pa = arcs.filter(a => a.domId === 'cv-path');
  console.log('   最后一帧 cv-path 的 ctx.arc 调用 ' + pa.length + ' 次');

  /* ---- 球轮廓：半径最大的两条整圆弧 ---- */
  const circles = pa.filter(a => a.a0 !== undefined && Math.abs(a.a1 - a.a0) > 6 && a.r > 20);
  circles.sort((x, y) => y.r - x.r);
  const glassO = circles[0], metalO = circles.find(c => c.r < glassO.r * 0.95);
  if (!glassO || !metalO) {
    bad('没识别出两条球轮廓弧（找到 ' + circles.length + ' 条大半径整圆弧）');
  } else {
    console.log('   轮廓① 圆心=(' + metalO.x.toFixed(1) + ',' + metalO.y.toFixed(1) + ') 半径=' + metalO.r.toFixed(2)
      + '   轮廓② 圆心=(' + glassO.x.toFixed(1) + ',' + glassO.y.toFixed(1) + ') 半径=' + glassO.r.toFixed(2));
    /* 世界坐标里 r_glass / r_metal = 1.20 / 1.00，同一视图下像素半径之比必须等于它 */
    const rr = glassO.r / metalO.r;
    if (Math.abs(rr - 1.20) <= 0.02) ok('两球轮廓半径比 ' + rr.toFixed(3) + ' == 世界半径比 1.20（同一视图，无各向异性缩放）');
    else bad('两球轮廓半径比 ' + rr.toFixed(3) + ' ≠ 1.20，画布或视图存在非等比缩放');

    /* ---- 顶点圆点（半径固定 4.4px）落在圆周上 ---- */
    const dots = pa.filter(a => Math.abs(a.r - 4.4) < 1e-6);
    const onCircle = p => Math.min(
      Math.abs(Math.hypot(p.x - metalO.x, p.y - metalO.y) - metalO.r),
      Math.abs(Math.hypot(p.x - glassO.x, p.y - glassO.y) - glassO.r));
    console.log('   顶点圆点 ' + dots.length + ' 个: ' + dots.map(d =>
      '(' + d.x.toFixed(1) + ',' + d.y.toFixed(1) + ') 偏差=' + onCircle(d).toFixed(2) + 'px').join('  '));
    if (dots.length !== 3) {
      bad('顶点圆点数量应为 3（金属命中 / 玻璃入场 / 玻璃出射），实际 ' + dots.length);
    } else {
      const worst = Math.max(...dots.map(onCircle));
      if (worst <= 1.0) ok('三个顶点全部落在球面上（最大偏差 ' + worst.toFixed(2) + 'px）');
      else bad('有顶点不在球面上：最大偏差 ' + worst.toFixed(2) + 'px —— 折射端点很可能用了错的根或错的参数化');
    }
  }

  /* ---- 角度弧：按圆心分组，同圆心的一对弧就是要校验的入射/出射角 ---- */
  const ang = pa.filter(a => a.a0 !== undefined && Math.abs(a.a1 - a.a0) > 1e-6 && Math.abs(a.a1 - a.a0) < 3.0);
  const grp = new Map();
  for (const a of ang) {
    const k = a.x.toFixed(1) + ',' + a.y.toFixed(1);
    if (!grp.has(k)) grp.set(k, []);
    grp.get(k).push(a);
  }
  const deg = v => Math.abs(v) * 180 / Math.PI;
  console.log('   角度弧分组 ' + grp.size + ' 组: ' + [...grp].map(([k, v]) =>
    '[' + k + '] ' + v.length + '条(' + v.map(a => deg(a.a1 - a.a0).toFixed(2) + '°@r' + a.r.toFixed(1)).join(' ') + ')').join('  '));

  let mirrorChecked = 0, entryChecked = 0, exitChecked = 0;
  const incAngles = [], refrAngles = [];
  for (const [, v] of grp) {
    if (v.length !== 2) continue;
    v.sort((a, b) => a.r - b.r);
    const sameR = Math.abs(v[0].r - v[1].r) < 0.5;
    if (sameR) {
      /* 镜面：两条弧都是 0.60s，夹角必须完全相等（入射角 = 反射角） */
      const d0 = deg(v[0].a1 - v[0].a0), d1 = deg(v[1].a1 - v[1].a0);
      if (Math.abs(d0 - d1) <= 0.05) ok('镜面反射：两条角度弧相等（' + d0.toFixed(2) + '° = ' + d1.toFixed(2) + '°）');
      else bad('镜面反射不成立：入射弧 ' + d0.toFixed(2) + '° ≠ 反射弧 ' + d1.toFixed(2) + '°');
      mirrorChecked++;
    } else {
      /* 折射：小半径弧（0.60s）为入射角，大半径弧（0.74s）为折射角。
         介质顺序不能靠半径判定，必须两种取向都试：
           空气→玻璃：1.0·sinθ_inc = 1.5·sinθ_refr（角变小，向法线靠拢）
           玻璃→空气：1.5·sinθ_inc = 1.0·sinθ_refr（角变大，离开法线）
         恰好成立一种，且两种取向各出现一次 —— 这正是「光线真的进了玻璃又出来了」的证据。 */
      const thi = deg(v[0].a1 - v[0].a0), thr = deg(v[1].a1 - v[1].a0);
      incAngles.push(thi); refrAngles.push(thr);
      const sI = Math.sin(thi / 180 * Math.PI), sR = Math.sin(thr / 180 * Math.PI);
      const asEntry = Math.abs(1.0 * sI - 1.5 * sR) <= 0.002;
      const asExit = Math.abs(1.5 * sI - 1.0 * sR) <= 0.002;
      if (asEntry && !asExit) {
        ok('折射（空气→玻璃）：1.0·sin' + thi.toFixed(2) + '° = 1.5·sin' + thr.toFixed(2)
          + '°  (' + (1.0*sI).toFixed(4) + ' = ' + (1.5*sR).toFixed(4) + ')');
        entryChecked++;
      } else if (asExit && !asEntry) {
        ok('折射（玻璃→空气）：1.5·sin' + thi.toFixed(2) + '° = 1.0·sin' + thr.toFixed(2)
          + '°  (' + (1.5*sI).toFixed(4) + ' = ' + (1.0*sR).toFixed(4) + ')');
        exitChecked++;
      } else {
        bad('折射不满足 Snell（n = 1.5）：θ_inc=' + thi.toFixed(2) + '° θ_refr=' + thr.toFixed(2)
          + '°  两种取向都不成立（可能折射角算错或角度弧画反了）');
      }
    }
  }
  if (!mirrorChecked) bad('没有识别到镜面反射的一对角度弧（应为一组等半径弧）');
  if (entryChecked !== 1) bad('空气→玻璃 的折射角组应恰好 1 组，实际 ' + entryChecked);
  if (exitChecked !== 1) bad('玻璃→空气 的折射角组应恰好 1 组，实际 ' + exitChecked);

  /* ---- 两侧角度必须互为镜像（球内弦等腰性质的直接后果）----
     这条不依赖「入射弧画在小半径 / 折射弧画在大半径」这个绘图约定，
     所以即使有人把两个半径对调（画面看着仍然正常），它仍然成立或失败得出来。
     物理要求：入场 50.00° → 30.71°，出场 30.71° → 50.00°，
     即 两个入射角集合 = {50.00, 30.71}，两个折射角集合 = {30.71, 50.00}。 */
  if (incAngles.length === 2 && refrAngles.length === 2) {
    const sorted = a => a.slice().sort((x, y) => y - x).map(v => v.toFixed(2));
    const sI = sorted(incAngles), sR = sorted(refrAngles);
    const expect = ['50.00', '30.71'];
    const eq = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(parseFloat(v) - parseFloat(b[i])) <= 0.02);
    if (eq(sI, expect) && eq(sR, expect) && Math.abs(incAngles[0] - refrAngles[1]) <= 0.02) {
      ok('两侧角度互为镜像：入场 ' + incAngles[0].toFixed(2) + '°→' + refrAngles[0].toFixed(2)
        + '°  出场 ' + incAngles[1].toFixed(2) + '°→' + refrAngles[1].toFixed(2) + '°（弦的等腰性质）');
    } else {
      bad('玻璃球两侧角度不构成镜像：入射角 {' + sI.join(', ') + '}  折射角 {' + sR.join(', ')
        + '}，期望两侧都是 {50.00, 30.71} 且互为反转');
    }
  }

  /* ---- 读数一致性：镜面入射角必须显示为与反射角相同，且玻璃两个角满足 Snell ---- */
  const rd = id => (registry[id] ? registry[id].textContent : '');
  const mth = rd('o-mth'), mtr = rd('o-mtr'), gin = rd('o-gin'), chord = rd('o-chord');
  console.log('   读数: 入射=' + mth + '  反射=' + mtr + '  玻璃=' + gin + '  弦长=' + chord);
  if (mth && mth === mtr && /^\d+\.\d{2}°$/.test(mth)) ok('读数一致：镜面入射角显示值与反射角完全相同（' + mth + '）');
  else bad('镜面读数不一致或未填出：入射="' + mth + '" 反射="' + mtr + '"');
  const mm = gin.match(/^([\d.]+)° → ([\d.]+)°$/);
  if (mm) {
    const a = +mm[1], b = +mm[2];
    const lhs = Math.sin(a / 180 * Math.PI), rhs = 1.5 * Math.sin(b / 180 * Math.PI);
    if (Math.abs(lhs - rhs) <= 0.002) ok('玻璃读数满足 Snell：sin' + a.toFixed(2) + '° = 1.5·sin' + b.toFixed(2) + '°');
    else bad('玻璃读数的两个角不满足 Snell：' + a + '° → ' + b + '°');
  } else bad('玻璃入场读数格式异常："' + gin + '"');

  /* ---- 账本：6 行 DOM 均已创建，且关键数值正确 ---- */
  const divs = created.filter(e => e.tagName === 'DIV');
  const texts = divs.map(e => String(e.textContent || ''));
  const has = s => texts.some(t => t.indexOf(s) >= 0);
  console.log('   账本节点: 共创建 ' + divs.length + ' 个 DIV');
  if (divs.length >= 24) ok('账本 6 行 × 4 节点已构建（创建 ' + divs.length + ' 个 DIV）');
  else bad('账本 DOM 不完整：只创建了 ' + divs.length + ' 个 DIV（期望 ≥ 24）');
  [['反射', '反射条目'], ['折射进入', '折射进入条目'], ['折射出射', '折射出射条目'], ['到达天光', '到达天光条目']]
    .forEach(([kw, name]) => {
      if (has(kw)) ok('账本含「' + name + '」');
      else bad('账本缺少「' + name + '」');
    });
  if (has('弦长') && has('2.063')) ok('账本记录了球内弦长 2.063（= 2r·cos30.71°）');
  else bad('账本缺少弦长数值 2.063');

  /* ---- 状态栏：必须报告四条线段全部走完 ---- */
  const lbTxt = rd('lb-path');
  console.log('   状态栏: "' + lbTxt + '"');
  if (/4 段/.test(lbTxt)) ok('状态栏确认整条光路为 4 段');
  else bad('状态栏未报告 4 段光路："' + lbTxt + '"');

  /* ---- 标签避让：所有带暗底的标签必须两两不重叠 ----
     折射进入 / 折射出射 两个「球内角」的标注天然会挤到弦的中段，
     固定偏移必然撞在一起，所以 §7 的 chip() 会自己找不重叠的位置。
     这里从最后一帧的 fillRect 里挑出 chip（高度固定 16px），逐对做矩形相交测试。 */
  const chips = rects.filter(r => r.domId === 'cv-path' && Math.abs(r.h - 16) < 0.01);
  console.log('   最后一帧 cv-path 的 chip 标签 ' + chips.length + ' 个');
  let worst = { ox: 0, oy: 0, a: null, b: null };
  for (let i = 0; i < chips.length; i++) {
    for (let j = i + 1; j < chips.length; j++) {
      const A = chips[i], B = chips[j];
      const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
      const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      if (ox > 1 && oy > 1 && ox * oy > worst.ox * worst.oy) worst = { ox, oy, a: A, b: B };
    }
  }
  if (chips.length < 6) bad('最后一帧只画了 ' + chips.length + ' 个 chip 标签（期望 ≥ 6：两处球内角 ×2 + 镜面反射 ×2）');
  else if (worst.a) {
    bad('标签互相压住：重叠 ' + worst.ox.toFixed(1) + '×' + worst.oy.toFixed(1) + 'px  '
      + `[${worst.a.x.toFixed(0)},${worst.a.y.toFixed(0)}] ∩ [${worst.b.x.toFixed(0)},${worst.b.y.toFixed(0)}]`);
  } else ok('全部 ' + chips.length + ' 个标签两两不重叠（避让生效）');

  /* ---- 落字顺序：球名必须在角度标签「之后」画 ----
     角度标签与球名之间正是四条光线线段的绘制区间，所以"球名最后落字"
     等价于"球名不会被出射光压过去"。 */
  const ft = drawnTexts.filter(t => t.domId === 'cv-path');
  const iLastAngle = ft.map((t, i) => /°/.test(t.t) ? i : -1).reduce((a, b) => Math.max(a, b), -1);
  const iGlass = ft.findIndex(t => t.t.indexOf('玻璃球') >= 0);
  const iMetal = ft.findIndex(t => t.t.indexOf('金属球') >= 0);
  if (iLastAngle < 0 || iGlass < 0 || iMetal < 0) {
    bad('最后一帧缺少文字：角度标签=' + iLastAngle + ' 玻璃球=' + iGlass + ' 金属球=' + iMetal);
  } else if (iGlass > iLastAngle && iMetal > iLastAngle) {
    ok('球名在最后一条含「°」的文字之后落字（不会被光线压住）');
  } else {
    bad('球名落字次序早于角度标签（玻璃球 ' + iGlass + ' / 金属球 ' + iMetal
      + ' ≤ 最后一个角度标签 ' + iLastAngle + '），出射光线会压过球名');
  }
}

/* ================= F. §8 命中次数（与 §7 同场景） ================= */
console.log('\n=== F. §8 命中次数：模式读数 / 扫描带边界 / 与 §7 同场景 ===');
const rd = (id) => { const e = registry[id]; return e ? String(e.textContent) : ''; };
const clickEl = (id) => { const e = registry[id]; if (e) e.dispatch('click', {}); };
const pushFrame = () => { const q = rafQueue; rafQueue = []; ts += 16.7; for (const f of q) { try { f(ts); } catch (e) {} } };

/* ---- F1 五种终局的读数必须与几何自洽 ---- */
const MODE_EXPECT = [
  ['bt-cnt-m0', '0 次 / depth 0', '射向天空',     '背景色',                 '8'],
  ['bt-cnt-m1', '1 次 / depth 1', '射向天空',     '背景色 × 金属',          '8'],
  ['bt-cnt-m2', '2 次 / depth 2', '射向天空',     '背景色 × 玻璃^2',        '8'],
  ['bt-cnt-m3', '3 次 / depth 3', '射向天空',     '背景色 × 金属 × 玻璃^2', '8'],
  ['bt-cnt-mx', '2 次 / depth 2', 'maxDepth 截断', '黑色（预算用尽）',       '2'],
  ['bt-cnt-me', '0 次 / depth 0', '逃出场景',     '背景色',                 '8'],
];
let modeBad = 0;
for (const [id, hitTxt, termTxt, colTxt, depTxt] of MODE_EXPECT) {
  clickEl(id);
  const got = { hit: rd('o-chit'), term: rd('o-cterm'), col: rd('o-ccol'), dep: rd('o-cdepth') };
  const wrong = [];
  if (got.hit !== hitTxt) wrong.push('命中 "' + got.hit + '" ≠ "' + hitTxt + '"');
  if (got.term !== termTxt) wrong.push('终止 "' + got.term + '" ≠ "' + termTxt + '"');
  if (got.col !== colTxt) wrong.push('颜色来源 "' + got.col + '" ≠ "' + colTxt + '"');
  if (got.dep !== depTxt) wrong.push('预算 "' + got.dep + '" ≠ "' + depTxt + '"');
  if (wrong.length) { modeBad++; bad('#' + id + '：' + wrong.join('；')); }
}
if (!modeBad) ok('六种终局的命中次数 / 终止原因 / 颜色来源 / 预算 全部自洽（0、1、2、3、截断，以及两类 0 次的区分）');

/* ---- F2 方向占比：四类之和必须是 100%，且弹 3 次必须是极少数 ---- */
const shares = [];
for (const id of ['bt-cnt-m0', 'bt-cnt-m1', 'bt-cnt-m2', 'bt-cnt-m3']) {
  clickEl(id);
  shares.push(parseFloat(rd('o-cshare')));
}
const shareSum = shares.reduce((a, b) => a + b, 0);
console.log('   各类方向占比: ' + shares.map((v, i) => i + ' 次 ' + v.toFixed(1) + '%').join('  ')
  + '   合计 ' + shareSum.toFixed(1) + '%');
if (Math.abs(shareSum - 100) <= 0.3) ok('四类占比合计 ' + shareSum.toFixed(1) + '% = 100%（分段无缝无重叠）');
else bad('四类占比合计 ' + shareSum.toFixed(1) + '%，不等于 100%');
if (shares[0] > 60 && shares[3] < 2.5) ok('0 次命中占 ' + shares[0].toFixed(1) + '%（多数方向打空），3 次仅 '
  + shares[3].toFixed(1) + '%（解释了 §6 为何要打几百万条）');
else bad('占比关系反常：0 次 ' + shares[0] + '%，3 次 ' + shares[3] + '%');

/* ---- F3 从「画出来的像素几何」独立反推切线角，再与扫描带分段边界对照 ----
   这一步不引用页面里的任何常量：只用画布上两个球的圆心/半径和相机点，
   自己算 asin(r/D)。所以半径、眼位、asin、扫描范围任一写错都会暴露。 */
arcs.length = 0; rects.length = 0; drawnTexts.length = 0;
/* 注意：这里刻意不清空 pts —— 收尾的 A2′ 要复查「全程」画过的每一个坐标 */
clickEl('bt-cnt-m0');
pushFrame();

const pa8 = arcs.filter(a => a.domId === 'cv-count');
const pa7 = arcs.filter(a => a.domId === 'cv-path');
console.log('   最后一帧 cv-count 的 ctx.arc 调用 ' + pa8.length + ' 次');

const outlines = (pa) => pa.filter(a => a.r > 20 && Math.abs(a.a1 - a.a0) > 6).sort((x, y) => y.r - x.r);
const o8 = outlines(pa8), o7 = outlines(pa7);
const glass8 = o8[0], metal8 = o8.find(c => c.r < o8[0].r * 0.95);
const glass7 = o7[0], metal7 = o7.find(c => c.r < o7[0].r * 0.95);

/* F3 从像素几何独立反推出的四条切线角，后面 F7 要用它判断反射率峰值是否在掠射端 */
let TAN_ALL = null;
let TAN_GLASS = null;      // 其中属于玻璃球的两条（掠射峰的落点）

if (!glass8 || !metal8) bad('§8 画布上没识别出两条球轮廓');
else {
  /* 相机点：drawEye 里半径恰为 7 的那个整圆 */
  const eye8 = pa8.find(a => Math.abs(a.r - 7) < 0.01 && Math.abs(a.a1 - a.a0) > 6);
  if (!eye8) bad('§8 画布上没识别出相机点（半径 7 的整圆）');
  else {
    const dm = Math.hypot(metal8.x - eye8.x, metal8.y - eye8.y);
    const dg = Math.hypot(glass8.x - eye8.x, glass8.y - eye8.y);
    const am = Math.atan2(-(metal8.y - eye8.y), metal8.x - eye8.x) * 180 / Math.PI;
    const ag = Math.atan2(-(glass8.y - eye8.y), glass8.x - eye8.x) * 180 / Math.PI;
    const hm = Math.asin(metal8.r / dm) * 180 / Math.PI;
    const hg = Math.asin(glass8.r / dg) * 180 / Math.PI;
    const TAN = [am - hm, am + hm, ag - hg, ag + hg].sort((a, b) => a - b);
    TAN_ALL = TAN.slice();
    TAN_GLASS = [ag - hg, ag + hg].sort((a, b) => a - b);
    console.log('   由像素几何独立反推：金属球 α=' + am.toFixed(3) + '° 半角=' + hm.toFixed(3)
      + '°，玻璃球 α=' + ag.toFixed(3) + '° 半角=' + hg.toFixed(3) + '°');
    console.log('   ⇒ 四条切线方向 = ' + TAN.map(v => v.toFixed(3) + '°').join(', '));

    /* 扫描带的分段边界：读图例里 7 个 <em> 的 "a0°~a1° · pct%"。
       这里按「文本形状」过滤而不是按标签名全收：页面别处也可能创建 <em>/<span>，
       全收会让段数被无关元素灌大，从而把一个真问题盖过去。 */
    const ems = created.filter(e => e.tagName === 'EM')
      .map(e => String(e.textContent || ''))
      .filter(t => /^-?\d+(?:\.\d+)?°~/.test(t));
    const icons = created.filter(e => e.tagName === 'I').map(e => (e.style && e.style.background) || '');
    const caps = created.filter(e => e.tagName === 'SPAN' && /次/.test(String(e.textContent || '')))
      .map(e => String(e.textContent));
    const spans8 = ems.map(t => {
      const m = /^(-?\d+(?:\.\d+)?)°~(-?\d+(?:\.\d+)?)°/.exec(t);
      return m ? { a0: +m[1], a1: +m[2] } : null;
    });
    console.log('   扫描带分段 ' + spans8.length + ' 段: ' + ems.join(' | '));

    if (spans8.length !== 7 || spans8.some(s => !s)) {
      bad('扫描带分段数不是 7，或图例文本格式异常（' + ems.length + ' 条）');
    } else {
      const bounds = [];
      spans8.forEach(s => { bounds.push(s.a0, s.a1); });
      const near = (v, arr, tol) => arr.some(x => Math.abs(x - v) <= tol);
      const missT = TAN.filter(t => !near(t, bounds, 0.06));
      if (!missT.length) ok('四条切线角全部落在扫描带分段边界上（容差 0.06°）');
      else bad('切线角 ' + missT.map(v => v.toFixed(3) + '°').join(', ') + ' 不在分段边界上：边界为 '
        + bounds.map(v => v.toFixed(1)).join(','));

      if (Math.abs(spans8[0].a0 + 90) < 0.02 && Math.abs(spans8[6].a1 - 90) < 0.02)
        ok('分段覆盖完整的朝前半圈 −90° ~ +90°');
      else bad('分段没有覆盖 −90°~+90°：' + spans8[0].a0 + ' ~ ' + spans8[6].a1);

      let orderOk = true;
      for (let i = 1; i < spans8.length; i++) {
        if (spans8[i].a0 < spans8[i - 1].a1 - 0.02) orderOk = false;
      }
      if (orderOk) ok('分段按 α 递增排列、无重叠');
      else bad('分段顺序错乱或相互重叠');

      /* 命中次数由色块颜色反读（颜色本身就是画出来的属性） */
      const COL2HIT = { '#8b93a8': 0, '#ffd666': 1, '#7fe3ff': 2, '#ffb08a': 3 };
      const hitsOf = icons.map(c => (c in COL2HIT ? COL2HIT[c] : null));
      console.log('   各段命中次数(由色块反读): ' + hitsOf.join(', ') + '   标签: ' + caps.join(' | '));
      if (hitsOf.some(h => h === null)) bad('有色块的背景色不在命中次数调色板里：' + icons.join(','));
      else if (hitsOf[0] !== 0) bad('第一段（−90° 起）应当是 0 次命中，实际色块表示 ' + hitsOf[0] + ' 次');
      else {
        const i3 = hitsOf.indexOf(3);
        const w3 = i3 >= 0 ? spans8[i3].a1 - spans8[i3].a0 : -1;
        if (i3 >= 0 && w3 > 3.3 && w3 < 3.6) {
          ok('「命中 3 次」只有一段，宽 ' + w3.toFixed(2) + '°（仅占 ' + (w3 / 180 * 100).toFixed(1)
            + '% 的方向，这就是 §7 那条路径的稀有位）');
        } else bad('「命中 3 次」的分段异常：段数 ' + hitsOf.filter(h => h === 3).length
          + '，宽度 ' + (w3 < 0 ? '未找到' : w3.toFixed(2) + '°'));
        /* 1↔3 的分界不是切线角，而是「反射光线刚好擦过玻璃球」——两者必须区分 */
        if (i3 >= 0) {
          const b3 = [spans8[i3].a0, spans8[i3].a1];
          if (!b3.some(v => near(v, TAN, 0.06)))
            ok('「1 次 ↔ 3 次」的分界（' + b3.map(v => v.toFixed(1)).join('/')
              + '°）不是切线角——它是反射光线擦过玻璃球的条件，与切线是两回事');
          else bad('1↔3 的分界与切线角重合，无法区分两类边界');
        }
      }
    }
  }
}

/* ---- F4 §7 与 §8 必须把球画在同一像素位置（证明两节共用同一套几何） ---- */
if (glass8 && metal8 && glass7 && metal7) {
  const dM = Math.hypot(metal8.x - metal7.x, metal8.y - metal7.y);
  const dG = Math.hypot(glass8.x - glass7.x, glass8.y - glass7.y);
  const rM = Math.abs(metal8.r - metal7.r), rG = Math.abs(glass8.r - glass7.r);
  console.log('   §7 金属 (' + metal7.x.toFixed(1) + ',' + metal7.y.toFixed(1) + ') r=' + metal7.r.toFixed(2)
    + ' | §8 金属 (' + metal8.x.toFixed(1) + ',' + metal8.y.toFixed(1) + ') r=' + metal8.r.toFixed(2));
  if (dM < 0.5 && dG < 0.5 && rM < 0.5 && rG < 0.5)
    ok('§7 与 §8 的两颗球落在同一像素位置（圆心偏差 ' + dM.toFixed(2) + '/' + dG.toFixed(2)
      + 'px，半径偏差 ' + rM.toFixed(2) + '/' + rG.toFixed(2) + 'px）——两节确实是同一个场景');
  else bad('§7 与 §8 的球位置不一致：圆心偏差 ' + dM.toFixed(2) + '/' + dG.toFixed(2)
    + 'px，半径偏差 ' + rM.toFixed(2) + '/' + rG.toFixed(2) + 'px（几何被改成了两份）');
}

/* ---- F5 §8 画布上的标签：数量必须随命中次数增长，且两两不重叠 ----
   注意：F3 留在 rects 里的那一帧是「0 次命中」模式，它天然只有一个终止标记 chip
   （没有入射点、没有出射点，也就没有角度弧标签）。所以这里要自己采集帧，
   并且顺势把「chip 数 = 命中点标签数 + 1 个终止标记」这条关系也验掉。 */
const chipsOfMode = (id) => {
  arcs.length = 0; rects.length = 0; drawnTexts.length = 0;
  clickEl(id);
  pushFrame();
  return rects.filter(r => r.domId === 'cv-count' && Math.abs(r.h - 16) < 0.01);
};
const chipsMiss = chipsOfMode('bt-cnt-m0');
const chips3 = chipsOfMode('bt-cnt-m3');

console.log('   cv-count chip 数：0 次命中 ' + chipsMiss.length + ' 个，3 次命中 ' + chips3.length + ' 个');
if (chipsMiss.length < 1) bad('0 次命中模式下连终止标记都没画（chip 数 ' + chipsMiss.length + '）');
else if (chips3.length <= chipsMiss.length)
  bad('3 次命中的标签数（' + chips3.length + '）没有多于 0 次命中（' + chipsMiss.length
    + '）：入射/出射点的角度标签没有随命中次数增加');
else ok('标签随命中次数增加：0 次命中 ' + chipsMiss.length + ' 个 → 3 次命中 ' + chips3.length
  + ' 个（每多一次命中多两个入射/出射角标签）');

/* 阈值取 0.5px 而不是 1px：标签碰撞是「挤」出来的，1px 的余量会把
   「两个标签边缘贴在一起、看起来就是一坨」判成合格。同时把最差值打印出来，
   这样「刚好过线」和「完全分离」在日志里能分辨。 */
let worst8 = null;
for (let i = 0; i < chips3.length; i++) {
  for (let j = i + 1; j < chips3.length; j++) {
    const A = chips3[i], B = chips3[j];
    const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
    const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
    if (ox > 0.5 && oy > 0.5 && (!worst8 || ox * oy > worst8.ox * worst8.oy)) worst8 = { ox, oy, A, B };
  }
}
if (worst8) console.log('   最差一对标签的重叠 ' + worst8.ox.toFixed(2) + '×' + worst8.oy.toFixed(2)
  + 'px  两框 [' + worst8.A.x.toFixed(0) + ',' + worst8.A.y.toFixed(0) + '+'
  + worst8.A.w.toFixed(0) + '×' + worst8.A.h.toFixed(0) + '] ∩ ['
  + worst8.B.x.toFixed(0) + ',' + worst8.B.y.toFixed(0) + '+'
  + worst8.B.w.toFixed(0) + '×' + worst8.B.h.toFixed(0) + ']');
else console.log('   最差一对标签也无重叠（阈值 0.5px）');

/* 「不重叠」还不够：两个暗底标签只差 1~2px 时，在深色画布上会糊成一段叠字，
   肉眼读起来和重叠没区别。所以这里额外量「最近一对的间隙」，
   要求 ≥ 2px（页面里的 chip() 按 MG=3 让位，正常应留出 3px）。 */
let minGap8 = Infinity, gapPair = null;
for (let i = 0; i < chips3.length; i++) {
  for (let j = i + 1; j < chips3.length; j++) {
    const A = chips3[i], B = chips3[j];
    const gx = Math.max(B.x - (A.x + A.w), A.x - (B.x + B.w));
    const gy = Math.max(B.y - (A.y + A.h), A.y - (B.y + B.h));
    const sep = Math.max(gx, gy);
    if (sep < minGap8) { minGap8 = sep; gapPair = [A, B]; }
  }
}
console.log('   最近一对标签的间隙 ' + (minGap8 === Infinity ? '(只有一个标签)' : minGap8.toFixed(2) + 'px'));
if (minGap8 === Infinity || minGap8 >= 2) ok('标签两两之间留出了可见间隙（最近 '
  + (minGap8 === Infinity ? '—' : minGap8.toFixed(2) + 'px') + '）');
else bad('最近两个标签只隔 ' + minGap8.toFixed(2) + 'px（< 2px）——在深色画布上会糊成一段叠字');
if (worst8) bad('§8 标签互相压住：重叠 ' + worst8.ox.toFixed(1) + '×' + worst8.oy.toFixed(1) + 'px');
else if (chips3.length < 4) bad('§8 只画了 ' + chips3.length + ' 个 chip 标签（期望 ≥ 4）');
else ok('§8 的 ' + chips3.length + ' 个标签两两不重叠');

/* ---- F6 暗底标签不得压住同帧直接落字的静态文字（球名 / 相机 / 天光带）----
   为什么必须单独查这一条：F5 只比「标签与标签」之间的距离，而球名是
   直接 fillText 落字的、没有暗底框，所以根本不在 rects 里，F5 看不见它。
   §8 曾经把 reserve() 放在画光线之后：标签找位置时避让表里还没有球名，
   于是挑了个正好压在「金属球 r = 1.00」上的位置 —— 截图上一眼可见，
   但 F5 全绿。这类「检查项看不到的对象」只能靠显式建模它的占位矩形来兜。 */
function staticTextBoxes(domId, chipRects) {
  const out = [];
  for (const t of drawnTexts) {
    if (t.domId !== domId) continue;
    /* 落在某个暗底标签框内的文字就是标签自己的字，不算静态文字 */
    if (chipRects.some(r => t.x >= r.x - 1 && t.x <= r.x + r.w + 1 && t.y >= r.y - 1 && t.y <= r.y + r.h + 1)) continue;
    const x0 = t.align === 'center' ? t.x - t.w / 2 : (t.align === 'right' ? t.x - t.w : t.x);
    out.push({ t: t.t, x: x0, y: t.y - 11.5, w: t.w, h: 16 });
  }
  return out;
}
function chipTextClash(domId, modeId) {
  arcs.length = 0; rects.length = 0; drawnTexts.length = 0;
  clickEl(modeId); pushFrame();
  const chips = rects.filter(r => r.domId === domId && Math.abs(r.h - 16) < 0.01);
  const boxes = staticTextBoxes(domId, chips);
  let worst = null;
  for (const c of chips) for (const b of boxes) {
    const ox = Math.min(c.x + c.w, b.x + b.w) - Math.max(c.x, b.x);
    const oy = Math.min(c.y + c.h, b.y + b.h) - Math.max(c.y, b.y);
    if (ox > 1 && oy > 1 && (!worst || ox * oy > worst.ox * worst.oy)) worst = { ox, oy, b };
  }
  return { n: chips.length, texts: boxes.length, worst };
}
for (const [dom, mid, why] of [
  ['cv-count', 'bt-cnt-m0', '§8 · 0 次（朝上）'],
  ['cv-count', 'bt-cnt-m1', '§8 · 命中 1 次'],
  ['cv-count', 'bt-cnt-m2', '§8 · 命中 2 次'],
  ['cv-count', 'bt-cnt-m3', '§8 · 命中 3 次（标签最密）'],
  ['cv-count', 'bt-cnt-mx', '§8 · maxDepth 截断'],
  ['cv-count', 'bt-cnt-me', '§8 · 0 次（朝下逃逸）'],
  ['cv-count', 'bt-cnt-all', '§8 · 四线对照'],
  ['cv-path', 'bt-cnt-m1', '§7 · 同屏的另一块画布'],
]) {
  const r6 = chipTextClash(dom, mid);
  console.log('   ' + why + ' #' + dom + '：' + r6.n + ' 个暗底标签 vs ' + r6.texts + ' 条静态文字');
  if (r6.worst) {
    bad(why + ' 的暗底标签压住了静态文字「' + r6.worst.b.t + '」：重叠 '
      + r6.worst.ox.toFixed(1) + '×' + r6.worst.oy.toFixed(1) + 'px');
  } else if (!r6.n || !r6.texts) {
    bad(why + ' 没采到标签或静态文字，这一条可能空转（标签 ' + r6.n + ' 个 / 文字 ' + r6.texts + ' 条）');
  } else {
    ok(why + '：' + r6.n + ' 个暗底标签都没压住 ' + r6.texts + ' 条静态文字');
  }
}

/* ---- F7 §8 的分支树：玻璃 Fresnel 反射这一半必须真的被画出来、列出来 ----
   为什么单列一段：这一块最容易「表面完成」——建树函数写好了、读数填上了，
   但虚线没画、分支表没填、点了没反应，而 _smoke.js 只会说「无运行时异常」。
   下面的每一项都针对一种「静默失效」：
     ① 分支表被填充且按概率降序   —— 防止表是空的
     ② 期望命中次数 = 3.000       —— 防止剪枝把期望值也算掉了（会退化成 2.984）
     ③ 点了分支行主线真的换        —— 防止点击处理器没接上
     ④ 虚线分支真的多画了线        —— 防止 drawGhosts 没被调用
     ⑤ 扫描带里有反射率剖面        —— 防止 R 曲线整条消失                     */
console.log('\n=== F7. §8 分支树：玻璃 Fresnel 反射 / 分支表 / 反射率剖面 ===');
{
  const btreeEl = registry['count-btree'];
  const btRows = () => (btreeEl && btreeEl.children) ? btreeEl.children : [];
  /* 桩的 textContent 不聚合子节点，分支表的路径文本由 <span>/<b> 拼成，必须递归取 */
  const deepText = (el) => {
    if (!el) return '';
    let s = el.textContent || '';
    for (const c of (el.children || [])) s += deepText(c);
    return s;
  };
  const rowTxt = (rw) => (rw.children || []).map(deepText);

  clickEl('bt-cnt-m3');
  pushFrame();
  const rows = btRows();
  console.log('   分支表行数 ' + rows.length + '，期望命中次数 ' + rd('o-cexp') + '，玻璃反射率 ' + rd('o-crin'));

  if (rows.length < 3) bad('分支表没被填充（' + rows.length + ' 行）——玻璃反射支根本没列出来');
  if (rows.length > 0) {
    ok('分支表已填充 ' + rows.length + ' 行');
    const probs = rows.map(rw => parseFloat(rowTxt(rw)[0]));
    console.log('   各行：' + rows.map((rw, i) => '[' + i + '] ' + rowTxt(rw).join(' ')).join('  |  '));
    if (probs[0] > probs[probs.length - 1] && probs.every((p, i) => i === 0 || p <= probs[i - 1] + 1e-9))
      ok('分支表按概率降序（' + probs.map(p => p.toFixed(2) + '%').join(' > ') + '）');
    else bad('分支表概率非降序：' + probs.join(', '));
    if (Math.abs(probs[0] - 88.80) < 0.02) ok('首行概率 88.80% = 全折射主线的占比');
    else bad('首行概率应为 88.80%（全折射主线），实际 ' + probs[0]);

    const cls0 = String(rows[0].className);
    if (cls0.indexOf('main') >= 0 && cls0.indexOf('sel') >= 0)
      ok('首行同时标记 main（全折射主线）与 sel（当前当作主线看）');
    else bad('首行缺少 main/sel 标记："' + cls0 + '"');
  }

  /* 玻璃 Fresnel 反射：这一支是 §8 原先整体缺失的那一半。
     这一条刻意不放进上面那个 if 里：砍掉反射分支时行数会掉到 1，
     若它被「行数不足」的结论挡住，负向测试就永远等不到「找不到入场面反射」这句，
     检查点会被误判成空转。每条检查各管一件事，不互相遮断。 */
  const iRefl = rows.findIndex(rw => rowTxt(rw)[2].indexOf('入场面反射') >= 0);
  if (iRefl < 0) bad('分支表里找不到「玻璃入场面反射」这一支——Fresnel 反射又丢了');
  else {
      const rt = rowTxt(rows[iRefl]);
      ok('分支表列出玻璃入场反射支：' + rt[0] + ' · ' + rt[1] + ' · ' + rt[2]);
      if (/^2 次/.test(rt[1])) ok('入场反射支命中 2 次（金属 + 这次玻璃面），比主线少一次');
      else bad('入场反射支的命中次数应为 2 次，实际 "' + rt[1] + '"');

      /* 点它 → 主线换成这一支 */
      const hitBefore = rd('o-chit'), probBefore = rd('o-cprob');
      rows[iRefl].dispatch('click', {});
      pushFrame();
      const hitAfter = rd('o-chit'), probAfter = rd('o-cprob');
      console.log('   点第 ' + (iRefl + 1) + ' 行：命中 ' + hitBefore + ' → ' + hitAfter
        + '，概率 ' + probBefore + ' → ' + probAfter);
      if (hitBefore !== hitAfter && /^2 次/.test(hitAfter))
        ok('点分支行后主线换成该支（命中 ' + hitBefore + ' → ' + hitAfter + '）');
      else bad('点分支行后主线没换：' + hitBefore + ' → ' + hitAfter);

      const btree2 = btRows();
      if (btree2[iRefl] && String(btree2[iRefl].className).indexOf('sel') >= 0
        && String(btree2[0].className).indexOf('sel') < 0)
        ok('选中标记已从主线行移到被点的那一行');
      else bad('选中标记没有正确转移');

      /* 再点一次 → 退回主线 */
      btRows()[iRefl].dispatch('click', {});
      pushFrame();
      if (/^3 次/.test(rd('o-chit'))) ok('再点同一行退回概率最大的主线（命中回到 3 次）');
      else bad('再点同一行没退回主线，读数为 "' + rd('o-chit') + '"');
  }

  /* 期望命中次数：m3 方向严格等于 3.000。剪枝若把 0.30%/0.02% 两枝的
     概率质量一起丢掉，这个数会掉到 2.984 —— 而正文那条恒等式正是说它等于 3。 */
  clickEl('bt-cnt-m3');
  pushFrame();
  const expTxt = rd('o-cexp');
  const expVal = parseFloat(expTxt);
  console.log('   期望命中次数 = ' + expTxt);
  if (Math.abs(expVal - 3) < 0.0005) ok('m3 方向 E[命中次数] = 3.000（剪枝不污染期望值，恒等式成立）');
  else bad('期望命中次数异常：m3 方向应为 3.000，实际 ' + expTxt
    + '（剪枝很可能把概率质量也算掉了）');

  /* 玻璃表面反射率读数：主线要同时报出「入场面」与「出场面」两面 */
  const crin = rd('o-crin');
  console.log('   玻璃反射率读数（主线）= "' + crin + '"');
  if (/入\s*[\d.]+%/.test(crin) && /出\s*[\d.]+%/.test(crin) && /5\.77/.test(crin))
    ok('主线报出两面反射率 5.77%（正是 Schlick 在本次入射角下的值）');
  else bad('玻璃反射率读数异常："' + crin + '"（应同时含入场面/出场面的 5.77%）');

  /* 虚线分支：同一模式下，开/关「显示玻璃反射分支」画出的线段数必须有差 */
  const segCount = (modeId, on) => {
    const ck = registry['ck-cnt-branch'];
    if (ck) { ck.checked = on; ck.dispatch('change', {}); }
    clickEl(modeId);
    const n0 = pts.length;
    pushFrame();
    return pts.slice(n0).filter(p => p.domId === 'cv-count' && p.at === 'moveTo').length;
  };
  const sOn = segCount('bt-cnt-m3', true);
  const sOff = segCount('bt-cnt-m3', false);
  console.log('   cv-count 线段数：开分支 ' + sOn + '，关分支 ' + sOff + '（差 ' + (sOn - sOff) + '）');
  if (sOn - sOff >= 6) ok('虚线分支真的画了：关掉后少 ' + (sOn - sOff) + ' 段（玻璃反射支不再被画）');
  else bad('开/关「显示玻璃反射分支」画出的线段数几乎一样（' + sOn + ' vs ' + sOff
    + '）——drawGhosts 很可能没被调用');
  segCount('bt-cnt-m0', true);   // 复原开关

  /* 扫描带里的反射率剖面：两个掠射峰必须分别落在玻璃的两条切线附近、且**等高**。
     为什么盯「峰的角度」而不只盯「峰的大小」：若纵轴误画成 1−R（透射率），
     峰值大小依旧是 96%（与正确的 96% 几乎一样，只比数值分不出来），
     但峰值会跑到正入射那一端（玻璃球心方向 α≈8.6°）——角度一栏就露馅了。 */
  const coneTxt = drawnTexts.filter(t => t.domId === 'cv-cone').map(t => t.t);
  const peak = coneTxt.find(t => /^掠射\s*\d+%/.test(t));
  console.log('   cv-cone 文字含峰值标记: ' + (peak || '(无)'));
  const pm = peak
    ? /^掠射\s*(\d+)%（α\s*=\s*(-?[\d.]+)°\s*\/\s*(-?[\d.]+)°，两峰等高）/.exec(peak)
    : null;
  if (!pm) {
    bad('扫描带里找不到「两峰等高」的反射率峰值标记'
      + '（期望「掠射 N%（α = X° / Y°，两峰等高）」），实得 ' + (peak || '无')
      + '；画布文字 ' + coneTxt.length + ' 条');
  } else {
    const pct = +pm[1], ang1 = +pm[2], ang2 = +pm[3];
    const glassTan = TAN_GLASS || [];
    console.log('   峰值标记：' + pct + '%，两峰 α = ' + ang1 + '° / ' + ang2 + '°'
      + '（玻璃切线 ' + glassTan.map(v => v.toFixed(2)).join(' / ') + '°）');
    if (pct >= 50) ok('反射率峰值 ' + pct + '%（掠射端确实把大半的光反射走）');
    else bad('反射率峰值只有 ' + pct + '%，掠射端应远高于 50%');
    const nearGlass = glassTan.length === 2
      && glassTan.some(t => Math.abs(t - ang1) <= 5)
      && glassTan.some(t => Math.abs(t - ang2) <= 5);
    if (nearGlass) ok('两个峰值分别落在玻璃的两条切线角附近（' + ang1 + '° / ' + ang2 + '°）'
      + '——若纵轴被画成 1−R，峰值会跑到正入射的球心方向 α≈8.6°');
    else bad('峰值角 ' + ang1 + '° / ' + ang2 + '° 没有分别靠近玻璃的两条切线（'
      + (glassTan.length === 2 ? glassTan.map(v => v.toFixed(2)).join(' / ') : '切线角未取到')
      + '）——纵轴很可能画成了 1−R，或剖面采样轴不在玻璃上');
    if (Math.abs(ang1 - ang2) > 0.1) ok('两峰分别位于球心方向两侧（跨距 '
      + Math.abs(ang1 - ang2).toFixed(2) + '° = 2×切线半角）');
    else bad('两个峰值挤在同一侧（' + ang1 + '° / ' + ang2 + '°），剖面采样轴有问题');
  }

  /* 「两峰等高」的几何断言：不引用页面里的任何常量，只量画出来的折线。
     做法：把 cv-cone 的路径按 moveTo 切开，最长的那条就是 R 剖面（其它路径最多几十点）；
     取全曲线最高点 p1，再在「离 p1 横向 20px 之外」取第二个最高点 p2，比较两者 y。
     修好之前这一项实测差 3.8px（80.87% vs 92.12% × 34px 的纵向量程）——
     「一高一低」在画面上就是两个峰差 3.8 像素，肉眼恰好说不清但确实不对。 */
  const n0c = pts.length;
  clickEl('bt-cnt-m3');
  pushFrame();
  const coneSlice = pts.slice(n0c)
    .filter(p => p.domId === 'cv-cone' && (p.at === 'moveTo' || p.at === 'lineTo'));
  const paths = [];
  for (const p of coneSlice) {
    if (p.at === 'moveTo' || !paths.length) paths.push([]);
    paths[paths.length - 1].push(p);
  }
  paths.sort((a, b) => b.length - a.length);
  const curve = paths[0] || [];
  console.log('   cv-cone 折线 ' + paths.length + ' 条，最长 ' + curve.length + ' 点（应为 R 剖面）');
  if (curve.length < 100) {
    bad('cv-cone 上找不到足够长的折线（' + curve.length + ' 点）——反射率剖面没画出来');
  } else {
    const p1 = curve.reduce((m, p) => (p.y < m.y ? p : m), curve[0]);
    const far = curve.filter(p => Math.abs(p.x - p1.x) > 20);
    if (!far.length) bad('剖面折线横向跨度不足 20px，无法比较两个峰');
    else {
      const p2 = far.reduce((m, p) => (p.y < m.y ? p : m), far[0]);
      const dy = Math.abs(p1.y - p2.y);
      console.log('   两峰 y：' + p1.y.toFixed(2) + '（x=' + p1.x.toFixed(1) + '）与 '
        + p2.y.toFixed(2) + '（x=' + p2.x.toFixed(1) + '），差 ' + dy.toFixed(3) + 'px');
      if (dy < 0.5) ok('两个掠射峰真的等高（差 ' + dy.toFixed(3) + 'px）：剖面关于玻璃球心方向对称');
      else bad('两个掠射峰不等高（差 ' + dy.toFixed(3) + 'px）——采样栅格没有关于球心方向对称，'
        + '同一个物理现象被画成了两个峰高');

      /* 交叉检查：标注里写的百分比，必须等于曲线上真正画出来的峰高。
         量程背景（100% 在下标 0%、0% 在底边那块矩形）是从记录里找出来的，不引用页面常量：
         曲线的基线（fill 路径最后落到的最低点）正好压在量程矩形的底边上，
         靠这条「底边贴合」关系就能把量程矩形从整块画布背景里挑出来。
         若只在文字里报「掠射 96%」而折线抽稀时恰好把峰值那一点丢掉、实际只画到 83%，
         这一项是唯一能发现的地方。 */
      if (pm) {
        const yBase = curve.reduce((m, p) => Math.max(m, p.y), -Infinity);
        const cands = rects.filter(r => r.domId === 'cv-cone'
          && r.x <= p1.x && p1.x <= r.x + r.w && r.y <= p1.y && p1.y <= r.y + r.h);
        cands.sort((a, b) => (Math.abs(a.y + a.h - yBase) - Math.abs(b.y + b.h - yBase))
          || (a.w * a.h - b.w * b.h));
        const band = cands[0];
        if (!band) {
          bad('找不到剖面所在的量程背景，无法把峰高像素换算回 R');
        } else {
          const Ytop = band.y, Ybot = band.y + band.h;
          const drawnR = (Ybot - p1.y) / (Ybot - Ytop);
          const claimed = (+pm[1]) / 100;
          console.log('   量程 y ' + Ytop.toFixed(0) + '~' + Ybot.toFixed(0)
            + '（宽 ' + band.w.toFixed(0) + '，底边贴合曲线基线 ' + yBase.toFixed(1) + '）'
            + '：曲线峰高换算 R = ' + (drawnR * 100).toFixed(2) + '%，标注 ' + (claimed * 100) + '%');
          if (Math.abs(drawnR - claimed) <= 0.01)
            ok('标注的峰值 ' + (claimed * 100) + '% 就是折线上真正画出来的峰高（差 '
              + Math.abs((drawnR - claimed) * 100).toFixed(2) + ' 个百分点）');
          else bad('标注写 ' + (claimed * 100) + '%，但折线上实际只画到 '
            + (drawnR * 100).toFixed(2) + '%——抽稀把峰值那一点丢掉了');
        }
      }
    }
  }
  const coneArcs = arcs.filter(a => a.domId === 'cv-cone');
  if (coneArcs.length >= 2) ok('两个反射率峰值点都被标出（cv-cone 上有 ' + coneArcs.length + ' 个 arc）');
  else bad('cv-cone 上的峰值标记不足（' + coneArcs.length + ' 个 arc，应至少 2 个）');
}

/* ---- A2′ 收尾复查：整轮跑下来画过的每个坐标都必须是有限数 ----
   A2 在页面初次加载之后就执行了，那时还没有任何模式切换；而「朝下打空」这条路径
   只有在切到对应模式后才第一次被画出来。所以有限性守卫必须在这里再复查一遍，
   否则「tSky 漏判有限性」这个 bug 会从 A2 眼皮底下溜过去（画面上只是少一条线）。
   这一段刻意放在所有会绘制画面的交互之后。 */
console.log('\n=== A2′. 收尾复查：切模式之后画出的坐标也不能出现 NaN / Infinity ===');
for (const id of ['bt-cnt-m0', 'bt-cnt-m1', 'bt-cnt-m2', 'bt-cnt-m3', 'bt-cnt-mx', 'bt-cnt-me', 'bt-cnt-all']) {
  clickEl(id);
  pushFrame();
}
const badPtsAll = pts.filter(p => NaNKEYS.some(k => p[k] !== undefined && !Number.isFinite(p[k])));
console.log('   六种模式 + 四线对照各画一帧，全程记录到 ' + pts.length + ' 个绘制坐标');
if (badPtsAll.length) {
  const s = badPtsAll[0];
  bad('全程有 ' + badPtsAll.length + ' 个坐标不是有限数，例如 ' + (s.domId ? '#' + s.domId + ' ' : '')
    + s.at + ' ' + JSON.stringify(NaNKEYS.filter(k => s[k] !== undefined && !Number.isFinite(s[k]))
      .map(k => k + '=' + s[k]).join(',')));
} else ok('全程 ' + pts.length + ' 个坐标都是有限数（切模式之后也没有 NaN 混进来）');

console.log('\n----------------------------------------');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
