/* ==================================================================
   §1 那两块画布的出图：证明它们**不是黑的**。
   ------------------------------------------------------------------
   用户报的缺陷是「第一章节的两个动图是黑色的」。本脚本把这两块画布
   在若干个时间点上**真正上屏的帧缓冲**抠出来拼成一张图：
     第 0 帧 —— 一帧都不驱动，正对应用户看到黑框的情形；
     之后几帧 —— 动画在推进。

   注意抠的是「上屏快照」，不是「页面算出来的帧缓冲」。这两者在整套
   校验里曾经被当成一回事，而缺陷恰恰就在两者之间的那段上屏代码里。

   采样必须**一次连续跑完**：_stub.js 的 frames() 时间戳每次调用都从 0
   重来，分段采样会把时间轴倒回去（见 _stub.js 里那段注释）。

   运行：node _preview_fork.js
   ================================================================== */
const path = require('path');
const { load } = require('./_stub.js');
const { makeCanvas, paste, border, saveCanvas, rgbaToRGB } = require('./_png.js');

const HTML_PATH = process.argv[2] || path.join(__dirname, 'index.html');
const S = load({ html: HTML_PATH, clientWidth: 640, clientHeight: 300, captureBlits: true });
if (S.topError) { console.log('❌ 顶层执行失败：' + S.topError.message); process.exit(1); }

const IDS = ['cv-fork-tri', 'cv-fork-pix'];
const POINTS = [20, 60, 140, 300];      /* 采样帧号（第 0 帧单独先取一次） */
const SCALE = 3, GAP = 12;
const BG = [0.024, 0.031, 0.043];

function grab() {
  return IDS.map(function (id) {
    const r = S.displayed(id);
    if (!r.ok) return { id: id, err: r.why };
    return { id: id, W: r.snap.width, H: r.snap.height, snap: r.snap,
             dw: r.drawW, dh: r.drawH };
  });
}
/* 非主色像素数：主色即背景，其余就是「画上去的东西」 */
function paintedOf(snap) {
  const d = snap.data, n = snap.width * snap.height, hist = new Map();
  for (let i = 0; i < n; i++) {
    const k = d[i * 4] + ',' + d[i * 4 + 1] + ',' + d[i * 4 + 2];
    hist.set(k, (hist.get(k) || 0) + 1);
  }
  const top = [...hist.entries()].sort((u, v) => v[1] - u[1]);
  return { n: n, painted: n - top[0][1], kinds: hist.size, bg: top[0][0] };
}

const shots = [{ at: 0, cells: grab() }];
let nm = 0, seen = 0;
S.frames(300, 60000, function () {
  seen++;
  if (nm < POINTS.length && seen >= POINTS[nm]) {
    shots.push({ at: seen, cells: grab() });
    nm++;
  }
});

/* ---------- 排版：两行（两块画布）× 若干列（时间点） ---------- */
const W = shots[0].cells[0].W, H = shots[0].cells[0].H;
const totalW = GAP + shots.length * (W * SCALE + GAP);
const totalH = GAP + IDS.length * (H * SCALE + GAP);
const canvas = makeCanvas(totalW, totalH, BG);

shots.forEach(function (s, ci) {
  const cx = GAP + ci * (W * SCALE + GAP);
  s.cells.forEach(function (c, ri) {
    if (c.err) return;
    const cy = GAP + ri * (H * SCALE + GAP);
    paste(canvas, rgbaToRGB(c.snap), c.W, c.H, cx, cy, SCALE);
    border(canvas, cx - 1, cy - 1, c.W * SCALE + 2, c.H * SCALE + 2, [0.16, 0.19, 0.24]);
  });
});

const out = path.join(__dirname, '_preview_fork.png');
saveCanvas(out, canvas);

/* ---------- 报告 ---------- */
console.log('已写出 ' + path.basename(out) + '  ' + canvas.W + '×' + canvas.H +
            '   （每次上屏放大 ' + SCALE + '×）');
console.log('');
console.log('   帧号   ' + IDS.map(id => id.padEnd(34)).join(''));
shots.forEach(function (s) {
  const cells = s.cells.map(function (c) {
    if (c.err) return '（' + c.err + '）'.padEnd(30);
    const p = paintedOf(c.snap);
    return ('画上 ' + p.painted + '/' + p.n + ' 像素 ' + p.kinds + ' 色').padEnd(34);
  });
  console.log('  ' + String(s.at).padStart(5) + '   ' + cells.join(''));
});
console.log('');
console.log('第 0 帧那一列就是「rAF 被暂停」时用户看到的东西：');
console.log('  修复前 —— 全背景色，就是两个黑框；');
console.log('  修到一半（同步首帧只画 12%）—— 左上角一小块楔形，95% 仍是暗底，');
console.log('  用户照样回来说「还是不对」，因为判据是「看得见」而不是「非零」；');
console.log('  现在 —— 同步那一帧直接画到铺满，rAF 不跑也是一幅完整的示意图，');
console.log('  第 1 帧起才是动画本身（从 0 重放，见 _probe1.js 的帧数表）。');
