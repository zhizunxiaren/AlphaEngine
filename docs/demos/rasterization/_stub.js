/* ==================================================================
   共享的 DOM / Canvas 桩
   ------------------------------------------------------------------
   三个校验脚本（_smoke / verify.raster / _neg）都跑同一份桩，
   免得「桩里值不一样 ⇒ 一个脚本过、另一个挂」这种鬼故事。

   两个刻意的设计：
   1. 控件的初值**从 HTML 里解析**，不手工维护一张表。
      浏览器就是这么做的（range 取 value、checkbox 看 checked、
      select 取 selected 那项 / 否则第一项）。于是「模块内部默认值
      和 HTML 默认值不一致」这类 bug 会被冒烟测试直接抓出来。
   2. 所有 id 从 HTML 自动收集，不写清单。多一个少一个都会暴露。
   ================================================================== */
const fs = require('fs');
const path = require('path');

function makeCtx(tag, counter, capture) {
  /* 每个上下文各自记一笔操作数。只有全局计数不够用：
     矢量画布（折线图、示意图）根本不上屏，判断「**这一块**画布到底
     画过东西没有」只能看它自己的上下文被用过几次。 */
  const ctx = {
    canvas: null,
    _ops: 0,
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '',
    textBaseline: '', globalAlpha: 1, imageSmoothingEnabled: true, imageSmoothingQuality: 'high',
    _draws: [], _lastFill: null, _lastImg: null,
    setTransform() { noop('setTransform'); }, resetTransform() { noop('resetTransform'); },
    clearRect() { noop('clearRect'); },
    /* fillRect 要记参数：blitFB 先 fillStyle=VP_BG 再 fillRect(0,0,w,h)。
       w/h 一旦退化成 0 或 NaN，浏览器里就是「什么都不画」，
       画面停在 canvas 的透明底上——看起来就是全黑。光数调用次数查不出来。 */
    fillRect(x, y, w, h) { noop('fillRect'); this._lastFill = { x: x, y: y, w: w, h: h }; },
    strokeRect() { noop('strokeRect'); },
    beginPath() { noop('beginPath'); }, closePath() { noop('closePath'); },
    moveTo() { noop('moveTo'); }, lineTo() { noop('lineTo'); }, arc() { noop('arc'); },
    rect() { noop('rect'); }, fill() { noop('fill'); }, stroke() { noop('stroke'); },
    save() { noop('save'); }, restore() { noop('restore'); },
    setLineDash() { noop('setLineDash'); },
    fillText(t) { noop('fillText'); this._lastText = t; },
    strokeText() { noop('strokeText'); },
    measureText(t) { return { width: String(t == null ? '' : t).length * 6.6 }; },
    /* drawImage 要留下**源画布元素**：blitFB 是
         off.putImageData(帧缓冲) → ctx.drawImage(off, 0,0,w,h)
       所以「这个 canvas 最终显示了什么像素」只能顺着源元素去取它的 _lastImg。
       原来这里是个纯 noop，于是「画布全黑」这种缺陷整套校验都看不见。 */
    drawImage(src, x, y, w, h) {
      noop('drawImage');
      /* 只在 capture 打开时**当场复制**一份源像素。
         为什么必须当场复制：blitFB 用的是同一个共享离屏画布 off，
         后面每一个模块上屏都会把它覆盖掉。等所有帧跑完再去读 off._lastImg，
         拿到的是「最后一个模块」的帧缓冲，不是这个 canvas 真正显示过的东西。
         默认关闭是因为冒烟测试要跑 960 帧 × 30 多个画布，逐帧复制开销不必要。 */
      let snap = null;
      if (capture && src && src._ctx && src._ctx._lastImg) {
        const im = src._ctx._lastImg, n = im.width * im.height * 4;
        if (n <= 4 * 1024 * 1024) snap = { width: im.width, height: im.height, data: im.data.slice(0, n) };
      }
      const entry = { src: src, x: x, y: y, w: w, h: h, snap: snap };
      /* capture 时只保留最后一次：探针要的是「现在屏上是什么」，
         留着历史会让 960 帧 × 30 个画布的复制撑爆内存。 */
      if (capture) this._draws = [entry]; else this._draws.push(entry);
      if (snap) this._lastSnap = snap;
    },
    createRadialGradient() { noop('createRadialGradient'); return { addColorStop() {} }; },
    createLinearGradient() { noop('createLinearGradient'); return { addColorStop() {} }; },
    putImageData(img) { noop('putImageData'); this._lastImg = img; },
    getImageData(x, y, w, h) {
      noop('getImageData');
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
    createImageData(w, h) {
      noop('createImageData');
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
  };
  /* noop 在对象字面量之后定义：它要同时累加全局计数与**本上下文**的计数，
     而字面量内部所有方法都引用它，靠的是函数声明提升 + 调用时 ctx 已就绪。 */
  function noop(n) {
    counter.calls[n] = (counter.calls[n] || 0) + 1;
    counter.ops++;
    ctx._ops++;
  }
  return ctx;
}

/* 从 HTML 解析每个控件的「浏览器初值」 */
function parseDefaults(html) {
  const out = { value: Object.create(null), checked: Object.create(null) };
  for (const m of html.matchAll(/<input\b([^>]*)>/g)) {
    const a = m[1];
    const id = /\bid="([^"]+)"/.exec(a), t = /\btype="([^"]+)"/.exec(a);
    if (!id || !t) continue;
    if (t[1] === 'checkbox' || t[1] === 'radio') {
      out.checked[id[1]] = /\bchecked\b/.test(a);
    } else {
      const v = /\bvalue="([^"]*)"/.exec(a);
      out.value[id[1]] = v ? v[1] : '';
    }
  }
  for (const m of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const opts = [...m[2].matchAll(/<option\b([^>]*)>/g)].map(x => {
      const v = /\bvalue="([^"]*)"/.exec(x[1]);
      return { v: v ? v[1] : '', sel: /\bselected\b/.test(x[1]) };
    });
    const sel = opts.find(o => o.sel) || opts[0];
    out.value[m[1]] = sel ? sel.v : '';
  }
  return out;
}

function load(opts) {
  opts = opts || {};
  const htmlPath = opts.html || path.join(__dirname, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const s0 = html.lastIndexOf('<script>'), s1 = html.lastIndexOf('</script>');
  if (s0 < 0 || s1 < 0) throw new Error('找不到 <script> 块');
  const code = html.slice(s0 + '<script>'.length, s1);

  const counter = { ops: 0, calls: Object.create(null) };
  const defaults = parseDefaults(html);
  const registry = Object.create(null);

  function makeEl(id, tag) {
    if (registry[id]) return registry[id];
    const el = {
      id, tagName: (tag || 'CANVAS').toUpperCase(), className: '', textContent: '',
      innerHTML: '', width: 0, height: 0, offsetTop: 0, offsetWidth: 0, offsetHeight: 0,
      clientWidth: opts.clientWidth || 640, clientHeight: opts.clientHeight || 320,
      style: {}, dataset: {},
      value: defaults.value[id] !== undefined ? defaults.value[id] : '0',
      checked: defaults.checked[id] !== undefined ? defaults.checked[id] : false,
      _listeners: Object.create(null),
      getContext() { return this._ctx || (this._ctx = makeCtx(id, counter, opts.captureBlits)); },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight,
                 right: this.clientWidth, bottom: this.clientHeight };
      },
      addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
      removeEventListener() {},
      setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return true; },
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

  const htmlIds = [...new Set([...html.matchAll(/\sid="([a-zA-Z0-9_-]+)"/g)].map(m => m[1]))];
  htmlIds.forEach(id => makeEl(id));

  /* 覆盖初值（测试需要特定初始状态时用） */
  if (opts.values) Object.keys(opts.values).forEach(k => { makeEl(k).value = opts.values[k]; });
  if (opts.checked) Object.keys(opts.checked).forEach(k => { makeEl(k).checked = opts.checked[k]; });

  const navLinks = htmlIds.filter(id => /^s\d+$/.test(id)).map(id => {
    const e = makeEl('navlink_' + id, 'a');
    e.getAttribute = () => '#' + id;
    return e;
  });
  const trapEls = [...html.matchAll(/data-jump="([^"]+)"/g)].map(m => {
    const e = makeEl('trap_' + m[1], 'button');
    e.getAttribute = (n) => (n === 'data-jump' ? m[1] : null);
    return e;
  });

  const document = {
    createElement(tag) { return makeEl('created_' + tag + '_' + Math.random().toString(36).slice(2, 7), tag); },
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

  let rafQueue = [];
  const requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
  const winListeners = Object.create(null);
  const window = {
    devicePixelRatio: opts.dpr || 1,
    addEventListener(t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
    removeEventListener() {},
    scrollY: 0, innerWidth: 1280, innerHeight: 800,
    requestAnimationFrame, setTimeout, clearTimeout,
    location: { href: 'file:///demo/index.html' },
  };

  const errors = [];
  let topError = null;
  try {
    const fn = new Function('window', 'document', 'requestAnimationFrame', 'performance',
      'setTimeout', 'clearTimeout', 'console', 'navigator', code);
    fn(window, document, requestAnimationFrame, performance, setTimeout, clearTimeout, console,
       { userAgent: 'node' });
  } catch (e) {
    topError = e;
    errors.push('顶层执行: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n'));
  }

  return {
    html, code, ids: htmlIds, defaults, registry, document, window,
    ctxCalls: counter.calls, ops: counter, errors, topError,
    get raf() { return { take: () => { const q = rafQueue; rafQueue = []; return q; } }; },
    winListeners,
    /* 跑 n 帧动画。
       onFrame(帧号, 时间戳) 是给探针用的采样回调 —— 有了它，探针才能在
       **一次连续的时间轴上**取多个采样点。

       为什么必须能连续采样：本函数的 ts 每次调用都从 0 起算，而页面里
       requestAnimationFrame 的时间戳是单调时钟。于是「先跑 200 帧、再跑 100 帧」
       这种分段采样，第二次的 100 帧时间戳会**倒回**到 0～1670，
       §1 的动画就被倒带回 2.15 秒 —— 比第一次采样到的 2.32 秒还早。
       探针当时把这张「越跑越退」的表当成了动画异常，其实是分段采样的假象。
       要一次跑到底，就用 onFrame 在单次调用里采。 */
    frames(n, budgetMs, onFrame) {
      const t = { frames: 0, errs: 0, ms: 0 };
      const t0 = Date.now();
      let ts = 0;
      for (let i = 0; i < n; i++) {
        const q = rafQueue; rafQueue = [];
        if (!q.length) break;
        ts += 16.7;
        for (const fn of q) {
          try { fn(ts); t.frames++; }
          catch (e) { t.errs++; if (errors.length < 10) errors.push('帧 ' + i + ': ' + e.message + '\n   ' + (e.stack || '').split('\n')[1]); }
        }
        if (onFrame) onFrame(t.frames, ts, t);
        if (budgetMs && Date.now() - t0 > budgetMs) break;
      }
      t.ms = Date.now() - t0;
      return t;
    },
    /* 派发一个事件 */
    fire(id, evt, ev, val) {
      const el = registry[id];
      if (!el) { errors.push('元素 #' + id + ' 不存在'); return false; }
      if (val !== undefined) {
        if (typeof val === 'boolean') { el.checked = val; el._isCheck = true; } else el.value = String(val);
      }
      try { el.dispatch(evt, Object.assign({ clientX: 100, clientY: 100, pointerId: 1, preventDefault() {} }, ev || {})); return true; }
      catch (e) { errors.push('#' + id + ' ' + evt + ': ' + e.message + '\n   ' + (e.stack || '').split('\n')[1]); return false; }
    },
    /* 「这个 canvas 上屏的到底是什么像素」。
       需要 load({captureBlits:true})。返回最后一次上屏的源像素 + 目标填充尺寸；
       两者任一退化（尺寸 0/NaN、没有 drawImage、源是空图）都照样如实返回，
       让调用方自己去判断——桩不替调用方下结论。 */
    displayed(id) {
      const el = registry[id];
      if (!el || !el._ctx) return { id: id, ok: false, why: '没有 2d 上下文（该 id 不是画布？）' };
      const ctx = el._ctx;
      const d = ctx._draws[ctx._draws.length - 1];
      if (!d) return { id: id, ok: false, why: '从未 drawImage 上屏', fill: ctx._lastFill };
      const snap = d.snap || (d.src && d.src._ctx && d.src._ctx._lastSnap) || null;
      return { id: id, ok: !!snap, why: snap ? '' : '源画布没有可用的像素快照（captureBlits 关着？）',
               fill: ctx._lastFill, drawW: d.w, drawH: d.h, snap: snap };
    },
  };
}

module.exports = { load };
