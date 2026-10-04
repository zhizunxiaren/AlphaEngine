/* ==================================================================
   画布上屏取证：每个 <canvas> 到底显示了什么像素？
   ------------------------------------------------------------------
   用户反馈：「第一章节的两个动图是黑色的」。

   为什么之前的校验抓不到：整套套件只验证「页面算出来的帧缓冲」，
   而「帧缓冲 → canvas」这一段（fit / blitFB / drawImage）在桩里是纯 noop。
   §1 的两块画布唯一的存在形式就是这段上屏代码，所以无论它画成什么样，
   23 项自检 + 112 项独立校验都一律全绿。

   上一版探针用「所有 id 以 cv- 开头」当画布清单，结果把 §4 的六个读数格
   （<div class="v" id="cv-total"> …）也算进来了 —— 它们叫 cv- 但不是画布，
   这是页面里的一处命名冲突。本版改成直接从 HTML 里抓真正的 <canvas> 元素。

   运行：node _probe1.js
   ================================================================== */
const fs = require('fs');
const path = require('path');
const { load } = require('./_stub.js');

/* 允许把页面路径当第一个参数传进来 —— _neg.js 就是靠这个把「改坏了的页面副本」
   喂进来，检验本脚本的断言真的会红。不传就读自己目录下的 index.html。 */
const HTML_PATH = process.argv[2] || path.join(__dirname, 'index.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');
/* 真正的画布：从 HTML 抓 <canvas ... id="..."> */
const CANVASES = [...html.matchAll(/<canvas\b[^>]*\bid="([a-zA-Z0-9_-]+)"[^>]*>/g)].map(m => m[1]);
/* 名字像画布、实际不是的元素（用于点出命名冲突） */
const FAKE = [...new Set([...html.matchAll(/\sid="(cv-[a-zA-Z0-9_-]+)"/g)].map(m => m[1]))]
  .filter(id => CANVASES.indexOf(id) < 0);

const S = load({ html: HTML_PATH, clientWidth: 640, clientHeight: 300, captureBlits: true });
if (S.topError) { console.log('❌ 顶层执行失败：' + S.topError.message); process.exit(1); }

/* 这脚本同时是**断言**脚本：发现「画布是空的」就退出非 0。
   为什么要退出码：没有退出码，断言就只是打印 —— _neg.js 也就没法把
   「删掉同步首帧」「首帧进度为 0」这类缺陷当变异去反向检验它。
   一条不会红的断言等于没有断言。 */
const FAIL = [];
function bad(msg) { FAIL.push(msg); }

console.log('HTML 里的 <canvas> 共 ' + CANVASES.length + ' 个');
console.log('名字以 cv- 开头但不是画布的元素 ' + FAKE.length + ' 个：' + FAKE.join(' '));
console.log('');

/* ---------- 关键回归：一帧都不驱动时，画布上**看得见**东西吗 ----------
   这正是用户看到的情形：rAF 被暂停（预览面板离屏 / 后台标签页），
   §1 的动画一次都没跑过。修复前这两块画布连 drawImage 都没发生过。

   判据是「看得见」，不是「非零」—— 这一条是被用户打回来才改对的：
   第一版把同步首帧修成画 12%（492/11264 像素），断言写成 painted > 0，
   于是「画了 4% 的角落一块楔形、其余 95% 还是 #0c1017 暗底」照样全绿，
   用户回来说「还是不对」。**非零可以是 4%。**
   所以现在要求：零帧那一帧必须铺到归属图的 80% 以上。
   80% 这个数不是拍的：铺满时画上像素恰好 == covered，取 80% 留出
   动画实现的余地，同时把「只画了一小块」这种明显不合格的状态挡在外面。 */
const MIN_COVER = 0.8;
const R = S.window.__rast;
const fkSec = R && R.sections ? R.sections.fork : null;
const covered = fkSec ? fkSec.covered : null;

console.log('【一帧都不驱动】——模拟 rAF 被暂停：');
console.log('  判据：画上像素 ≥ 归属图覆盖数 covered 的 ' + (100 * MIN_COVER) + '%（covered = ' + covered + '）');
for (const id of ['cv-fork-tri', 'cv-fork-pix']) {
  const r = S.displayed(id);
  if (!r.ok) { bad(id + '：' + r.why); console.log('  ❌ ' + id + '：' + r.why); continue; }
  const p = painted(r.snap);
  const frac = covered ? p.painted / covered : null;
  if (p.painted === 0) {
    bad(id + ' 在「一帧都不驱动」时是空画布（' + p.n + ' 个像素全为 [' + p.bg + ']）——' +
        '这正是用户看到的黑框');
    console.log('  ❌ ' + id + ' 空画布：' + p.n + ' 像素全为 [' + p.bg + ']');
  } else if (frac !== null && frac < MIN_COVER) {
    bad(id + ' 零帧那一帧只画了 ' + p.painted + '/' + p.n + ' 像素（归属图的 ' +
        (100 * frac).toFixed(0) + '%）—— 后面 ' + (100 * (1 - p.painted / p.n)).toFixed(0) +
        '% 还是暗底，看上去仍像一个黑框');
    console.log('  ❌ ' + id + ' 画得太少：' + p.painted + '/' + p.n +
      '（' + (100 * frac).toFixed(0) + '% of covered，要求 ≥ ' + (100 * MIN_COVER) + '%）');
  } else {
    console.log('  ✅ ' + id.padEnd(14) + ' 画上 ' + p.painted + '/' + p.n +
      ' 像素（归属图的 ' + (frac === null ? '?' : (100 * frac).toFixed(0) + '%') +
      '），颜色 ' + p.kinds + ' 种，主色[' + p.bg + ']');
  }
}
console.log('  #pf-fork = ' + JSON.stringify(S.registry['pf-fork'] ? S.registry['pf-fork'].textContent : null));
console.log('');

function stats(snap) {
  const d = snap.data, n = snap.width * snap.height;
  const hist = new Map();
  for (let i = 0; i < n; i++) {
    const k = d[i * 4] + ',' + d[i * 4 + 1] + ',' + d[i * 4 + 2];
    hist.set(k, (hist.get(k) || 0) + 1);
  }
  const top = [...hist.entries()].sort((u, v) => v[1] - u[1]);
  return { n: n, kinds: hist.size, top: top.slice(0, 3), bg: top.length ? top[0][0] : '' };
}
/* 非主色像素数 = 真正「画上去的东西」有多少 */
function painted(snap) {
  const st = stats(snap);
  return { n: st.n, kinds: st.kinds, painted: st.n - st.top[0][1], bg: st.top[0][0], top: st.top };
}

/* ---------- 先看 §1 随时间怎么走 ----------
   必须**一次连续跑到尾**，在指定帧号采样。分段调用 S.frames() 不行：
   它的时间戳每次调用都从 0 起算，于是「200 帧那次」采到的是 2.32 秒、
   「300 帧那次」反而采到 2.15 秒 —— 表看起来在倒退，其实是采样假象。 */
console.log('§1 两块画布随帧数的变化（一次连续跑，按帧号采样）');
console.log('  校准值：动画铺满时「画上」应当恰好等于归属图覆盖数 covered = ' + covered);
console.log('   帧数   ' + 'cv-fork-tri'.padEnd(38) + 'cv-fork-pix');
const MARKS = [1, 5, 15, 40, 90, 200, 300];
const samples = [];
function sampleInto(frameNo) {
  const cells = ['cv-fork-tri', 'cv-fork-pix'].map(function (id) {
    const r = S.displayed(id);
    if (!r.ok) return { err: r.why };
    const p = painted(r.snap);
    return { painted: p.painted, n: p.n, kinds: p.kinds, bg: p.bg };
  });
  samples.push({ frame: frameNo, cells: cells });
}
function cellText(c) {
  if (c.err) return '（' + c.err + '）';
  return '画上 ' + String(c.painted).padStart(5) + '/' + c.n + ' 色 ' + String(c.kinds).padStart(4) +
         ' 背景[' + c.bg + ']';
}
sampleInto(0);   /* 第 0 帧 = 注册 rAF 之前那次**同步绘制**（rAF 完全不跑时页面呈现的样子） */
let nm = 0, seen = 0;
S.frames(300, 30000, function () {
  seen++;
  if (nm < MARKS.length && seen >= MARKS[nm]) { sampleInto(seen); nm++; }
});
console.log('  （第 0 行是同步首帧「海报」；第 1 行起才是动画本身）');
samples.forEach(function (s) {
  console.log('  ' + String(s.frame).padStart(5) + '   ' +
    cellText(s.cells[0]).padEnd(38) + cellText(s.cells[1]));
});
const last = samples[samples.length - 1];
/* 单调性只对**动画本身**成立，不能把第 0 行的同步海报算进来：
   海报刻意画到铺满，而动画从 0 重放，中间那一步天然是「满 → 空」的落差。
   把两者混在一起判，等于在断言「页面启动时不许重放动画」——那是另一回事。
   这里要验的是：动画推进过程中不许回退（回退 = 帧调度或进度映射有 bug）。 */
const anim = samples.slice(1);
const mono = anim.every(function (s, i) {
  return i === 0 || s.cells[0].painted >= anim[i - 1].cells[0].painted;
});
const pf = S.registry['pf-fork'];
console.log('  进度读数 #pf-fork = ' + JSON.stringify(pf ? pf.textContent : null));
if (!mono) bad('§1 动画的「画上」像素数不是单调不减的 —— 要么动画真的会回退，要么采样方式又回到了分段调用');
console.log('  动画单调不减（左图，第 1 行起）：' + (mono ? '✅ 是' : '❌ 否'));
if (covered != null && last && !last.cells[0].err) {
  const eq = last.cells[0].painted === covered;
  if (!eq) bad('§1 铺满后「画上」像素数 ' + last.cells[0].painted + ' != 归属图覆盖数 ' + covered);
  console.log('  铺满后「画上」== covered：' + (eq ? '✅ ' : '❌ ') +
    last.cells[0].painted + ' vs ' + covered);
}
console.log('');

/* ---------- 全部画布 ---------- */
console.log('全部 <canvas> 的最终状态（再跑 300 帧到动画收敛）：');
S.frames(300, 30000);
console.log('');
const rows = [];
for (const id of CANVASES) {
  const r = S.displayed(id);
  const el = S.registry[id];
  const ctx = el && el._ctx;
  const ops = ctx ? Object.keys(ctx._draws).length : 0;
  void ops;
  if (!r.ok) {
    /* 没走 blitFB 不代表空白：可能是纯矢量绘制（折线图、示意图），
       也可能是「把一块画布缩放画到另一块上」这种 drawImage 直连 ——
       后者的源是真实画布元素，桩快照不到。
       判断依据改成「这块画布的上下文有没有被用过」——用过就说明画了东西。 */
    rows.push({ id: id, kind: 'no-blit', line: '·  ' + id.padEnd(16) +
      (ctx ? '未走上屏（矢量绘制或从未绘制）' : '页面从未取它的 2d 上下文 ← 可能是死的画布') });
    continue;
  }
  const p = painted(r.snap);
  const pct = (100 * p.painted / p.n).toFixed(1);
  /* 上屏目标尺寸退化（0 / NaN）在浏览器里就等于「什么都不画」，
     画面停在 canvas 透明底上。它和「像素全同色」是两种不同的空白成因，
     所以要分开记、分开报。 */
  const degen = !(r.drawW > 0) || !(r.drawH > 0);
  const good = !degen && p.painted > 0;
  rows.push({ id: id, kind: 'blit', painted: p.painted, n: p.n, bg: p.bg, degen: degen,
    drawW: r.drawW, drawH: r.drawH,
    line: (good ? '✅ ' : '❌ ') + id.padEnd(16) +
      ' 源 ' + String(r.snap.width).padStart(3) + '×' + String(r.snap.height).padStart(3) +
      ' 画上 ' + String(p.painted).padStart(5) + '/' + String(p.n).padEnd(5) + '(' + pct + '%)' +
      ' 颜色 ' + String(p.kinds).padStart(4) + ' 主色[' + p.bg + ']' });
}
rows.forEach(r => console.log('  ' + r.line));

const flat = rows.filter(r => r.kind === 'blit' && r.painted === 0);
const dead = rows.filter(r => r.kind === 'no-blit' && S.registry[r.id] && !S.registry[r.id]._ctx);
const blankVec = rows.filter(r => r.kind === 'no-blit' && S.registry[r.id] &&
  S.registry[r.id]._ctx && !(S.registry[r.id]._ctx._ops > 0));
console.log('');
console.log('「整块是同一个颜色」（画上去 0 像素）的画布：' + flat.length +
  (flat.length ? '：' + flat.map(r => r.id).join(', ') : ''));
console.log('「页面从未取过 2d 上下文」的画布：' + dead.length +
  (dead.length ? '：' + dead.map(r => r.id).join(', ') : ''));
console.log('「取了上下文但一次都没画」的矢量画布：' + blankVec.length +
  (blankVec.length ? '：' + blankVec.map(r => r.id).join(', ') : ''));

/* ---------- 断言 ----------
   这些才是本脚本的产出，「报告」只是它们的证据。 */
rows.forEach(function (r) {
  if (r.kind !== 'blit') return;
  if (r.degen) bad(r.id + ' 的上屏目标尺寸退化了（drawImage 的 w/h = ' + r.drawW + '×' + r.drawH +
    '，0 或 NaN 在浏览器里等于什么都不画）');
  else if (r.painted === 0) bad(r.id + ' 收敛后仍是一片死色（' + r.n + ' 个像素全为 [' + r.bg + ']）');
});
dead.forEach(r => bad(r.id + ' 从未取过 2d 上下文 —— 页面里没有代码写过它，可能是死画布'));
blankVec.forEach(r => bad(r.id + ' 取了 2d 上下文却一次都没画 —— 矢量画布是空白的'));

console.log('');
console.log('='.repeat(64));
if (FAIL.length) {
  console.log('画布上屏取证：' + FAIL.length + ' 项失败 ❌');
  FAIL.forEach(f => console.log('  · ' + f));
  process.exit(1);
}
console.log('画布上屏取证：全部通过 ✅  ' + CANVASES.length + ' 块画布，0 块空白');
