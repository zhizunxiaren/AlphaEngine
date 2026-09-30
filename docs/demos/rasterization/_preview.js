/* ==================================================================
   无头出图：把页面里那几个**真实帧缓冲**导成一张 PNG 网格。
   ------------------------------------------------------------------
   为什么不能直接截图：本会话沙箱不允许创建进程，所以起不了 Chrome，
   `_shot.js`（CDP 截图）用不了。但「看不到画面」不等于「不用验画面」——
   页面里 11 个模块的像素本来就是 JS 自己算出来、再由 putImageData 上屏的，
   那些 Float32Array 帧缓冲可以直接取出来编码成 PNG。

   能取到的（其余几节是纯线条/标注，没有帧缓冲）：
     §1 谁去找谁      —— 逐像素归属图（左=光线追踪 / 右=光栅化 / 两色=都判错）
     §6 深度缓冲      —— 同一场景的三种深度 / 反 Z 对比
     §8 背面剔除      —— 开/关剔除的覆盖差
     §10 MSAA         —— N=1 / 4 / 8 的 resolve 结果 + SSAA 对照

   运行：node _preview.js
   ================================================================== */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const { load } = require('./_stub.js');

/* ---------- 最小 PNG 编码器 ---------- */
const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function writePNG(file, w, h, rgb) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = rgb[y * w * 3 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

/* ---------- 画布：往大图里贴小图（最近邻放大） ---------- */
function makeCanvas(W, H, bg) {
  const c = { W, H, px: new Float32Array(W * H * 3) };
  for (let i = 0; i < W * H; i++) { c.px[i * 3] = bg[0]; c.px[i * 3 + 1] = bg[1]; c.px[i * 3 + 2] = bg[2]; }
  return c;
}
function paste(c, src, sw, sh, dx, dy, scale) {
  for (let y = 0; y < sh * scale; y++) {
    const sy = Math.floor(y / scale), ty = dy + y;
    if (ty < 0 || ty >= c.H) continue;
    for (let x = 0; x < sw * scale; x++) {
      const sx = Math.floor(x / scale), tx = dx + x;
      if (tx < 0 || tx >= c.W) continue;
      const s = (sy * sw + sx) * 3, d = (ty * c.W + tx) * 3;
      c.px[d] = src[s]; c.px[d + 1] = src[s + 1]; c.px[d + 2] = src[s + 2];
    }
  }
}
/* 画一个 1px 边框，方便看清每格边界 */
function border(c, x, y, w, h, col) {
  for (let i = 0; i < w; i++) {
    [[x + i, y], [x + i, y + h - 1]].forEach(function (p) {
      const d = (p[1] * c.W + p[0]) * 3;
      c.px[d] = col[0]; c.px[d + 1] = col[1]; c.px[d + 2] = col[2];
    });
  }
  for (let j = 0; j < h; j++) {
    [[x, y + j], [x + w - 1, y + j]].forEach(function (p) {
      const d = (p[1] * c.W + p[0]) * 3;
      c.px[d] = col[0]; c.px[d + 1] = col[1]; c.px[d + 2] = col[2];
    });
  }
}
/* 线性 → sRGB 编码，与页面 encode() 同一套 */
const enc = (v) => { const c = Math.max(0, Math.min(1, v)); return Math.round(255 * Math.pow(c, 1 / 2.2)); };
function fbToRGB(fb) {
  const n = fb.W * fb.H, out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = enc(fb.col[i * 3]) / 255;
    out[i * 3 + 1] = enc(fb.col[i * 3 + 1]) / 255;
    out[i * 3 + 2] = enc(fb.col[i * 3 + 2]) / 255;
  }
  return out;
}

/* ---------- 加载页面 ---------- */
const S = load({ clientWidth: 720, clientHeight: 420 });
if (S.topError) { console.log('❌ 页面顶层执行失败：' + S.topError.message); process.exit(1); }
const R = S.window.__rast, SEC = R.sections;

const BG = [0.024, 0.031, 0.043];
const SCALE = 2;
const GAP = 10;

/* ---------- §1 逐像素归属图 ---------- */
const fk = SEC.fork;
let tile1 = null;
if (fk && fk.owner) {
  const W = fk.W, H = fk.H;
  const src = new Float32Array(W * H * 3);
  /* COLS 是每个判定组合的颜色；owner 是「这个像素属于第几种组合」 */
  for (let i = 0; i < W * H; i++) {
    const col = fk.COLS[fk.owner[i]] || [0.1, 0.1, 0.1];
    src[i * 3] = Math.max(0, Math.min(1, col[0]));
    src[i * 3 + 1] = Math.max(0, Math.min(1, col[1]));
    src[i * 3 + 2] = Math.max(0, Math.min(1, col[2]));
  }
  tile1 = { src, W, H, label: '§1 owner' };
}

/* ---------- §6 深度缓冲：四种模式 ---------- */
const depthTiles = [];
const D = SEC.depth;
if (D && D.getScene) {
  const tris = D.getScene(), W = D.W, H = D.H;
  /* 必须复刻页面的绘制顺序：近的先画。
     「不测深度」那一格的全部意义就在于顺序错误会被看见 ——
     不排序的话这一格就和开了深度测试长得一样，等于没画。 */
  tris.sort(function (a, b) {
    return (a[0].z + a[1].z + a[2].z) / 3 - (b[0].z + b[1].z + b[2].z) / 3;
  });
  const modes = [
    { name: 'ztest', ztest: true, reverse: false, depthPersp: false },
    { name: 'ztest-reverseZ', ztest: true, reverse: true, depthPersp: false },
    { name: 'off', ztest: false, reverse: false, depthPersp: false },
    { name: 'world(错)', ztest: true, reverse: false, depthPersp: true },
  ];
  modes.forEach(function (m) {
    const fb = R.makeFB(W, H);
    R.fbClear(fb, 0.047, 0.063, 0.090, m.reverse);
    tris.forEach(function (t) {
      R.rasterTri(fb, t[0], t[1], t[2], {
        mode: 'bbox', rule: 'tl', reverse: m.reverse, ztest: m.ztest, depthPersp: m.depthPersp,
        shade: function (px, py, P, at) {
          return R.blinnPhong({ x: at.nx, y: at.ny, z: at.nz }, [at.r, at.g, at.b], at.u);
        },
      });
    });
    depthTiles.push({ name: m.name, fb: fb, W: W, H: H });
  });
}

/* ---------- §8 背面剔除 ----------
   三格，不是为了凑数：
     剔除关 / 剔除开      —— 立方体是闭合凸体，背面被正面完整挡住，
                             所以这两格**必须逐像素完全相同**。这不是 bug，
                             正是「背面剔除是安全的优化」这句话的像素级证据。
     剔除开 + 顶面绕反    —— 顶面绕序写反后，剔除会把该留的顶面剔掉，露出洞。
                             这一格存在的意义是：证明上一格的「相同」不是因为
                             剔除根本没生效（没有这一格，上面那个 0 就是假通过）。 */
const cullTiles = [];
const CU = SEC.cull;
if (CU && CU.build && CU.isFront) {
  const W = CU.W, H = CU.H;
  function cullTile(badTop, cullOn, label) {
    CU.setState({ mode: 'screen', wind: 'ccw', spin: false, badTop: badTop });
    const B = CU.build();
    const fb = R.makeFB(W, H);
    R.fbClear(fb, 0.047, 0.063, 0.090, false);
    let kept = 0;
    B.tris.forEach(function (t) {
      if (cullOn && !CU.isFront(t.v, 'screen', 'ccw')) return;
      kept++;
      R.rasterTri(fb, t.v[0], t.v[1], t.v[2], {
        mode: 'bbox', rule: 'tl', ztest: true,
        shade: function (px, py, P, at) {
          return R.blinnPhong({ x: at.nx, y: at.ny, z: at.nz }, [at.r, at.g, at.b], 0.4);
        },
      });
    });
    cullTiles.push({ name: label + '（' + kept + ' 面）', fb: fb, W: W, H: H });
  }
  cullTile(false, false, '剔除关');
  cullTile(false, true, '剔除开');
  cullTile(true, true, '剔除开+顶面绕反');
  CU.setState({ badTop: false, spin: true, mode: 'screen', wind: 'ccw' });
}

/* ---------- §10 MSAA：resolve 结果 ----------
   这里不自己重算 resolve，直接调页面自己的 rasterMSAA ——
   自己重算等于把被测对象抄一遍，抄错了两边一起错，验不出东西。 */
const msaaTiles = [];
const M = SEC.msaa;
if (M && M.star && R.rasterMSAA) {
  [[1, false, '1x 无 AA'], [4, false, '4x MSAA'], [8, false, '8x MSAA'], [4, true, '4x SSAA']]
    .forEach(function (cfg) {
      const fb = R.makeFB(M.W, M.H);
      R.fbClear(fb, 0.047, 0.063, 0.090);
      const st = R.rasterMSAA(fb, M.star(), cfg[0], {
        ztest: false, perSampleShade: cfg[1],
        /* 顶点色即颜色：SSAA 与 MSAA 在边缘上的差别才看得见 */
        shade: function (px, py, P, at) { return [at.r, at.g, at.b]; },
      });
      msaaTiles.push({ name: cfg[2], src: fbToRGB(fb), W: fb.W, H: fb.H, st: st });
    });
}

/* ---------- 排版成一张大图 ---------- */
const rowsH = [];
if (tile1) rowsH.push({ tiles: [tile1], h: tile1.H });
if (depthTiles.length) rowsH.push({ tiles: depthTiles.map(t => ({ src: fbToRGB(t.fb), W: t.W, H: t.H, label: t.name })), h: depthTiles[0].H });
if (cullTiles.length) rowsH.push({ tiles: cullTiles.map(t => ({ src: fbToRGB(t.fb), W: t.W, H: t.H, label: t.name })), h: cullTiles[0].H });
if (msaaTiles.length) rowsH.push({ tiles: msaaTiles, h: msaaTiles[0].H });

let totalW = 0, totalH = 0;
rowsH.forEach(function (r) {
  let w = 0;
  r.tiles.forEach(function (t) { w += t.W * SCALE + GAP; });
  r.w = w;
  totalW = Math.max(totalW, w);
  totalH += r.h * SCALE + GAP * 2;
});
totalW += GAP * 2;

const canvas = makeCanvas(totalW, totalH, BG);
let cy = GAP;
rowsH.forEach(function (r) {
  let cx = GAP;
  r.tiles.forEach(function (t) {
    paste(canvas, t.src, t.W, t.H, cx, cy, SCALE);
    border(canvas, cx - 1, cy - 1, t.W * SCALE + 2, t.H * SCALE + 2, [0.16, 0.19, 0.24]);
    /* 标签：用小方格表示即可，这里只做「数一下有多少块」的核对 */
    cx += t.W * SCALE + GAP;
  });
  cy += r.h * SCALE + GAP * 2;
});

const out = path.join(__dirname, '_preview_sections.png');
const rgb = new Uint8Array(canvas.W * canvas.H * 3);
for (let i = 0; i < canvas.W * canvas.H * 3; i++) rgb[i] = Math.round(canvas.px[i] * 255);
writePNG(out, canvas.W, canvas.H, rgb);

console.log('已写出 ' + path.basename(out) + '  ' + canvas.W + '×' + canvas.H);
console.log('');
console.log('画面清单（每块放大 ' + SCALE + '×）：');
const labels = [];
if (tile1) labels.push('§1 归属图（' + tile1.W + '×' + tile1.H + '）');
depthTiles.forEach(t => labels.push('§6 ' + t.name));
cullTiles.forEach(t => labels.push('§8 ' + t.name));
msaaTiles.forEach(t => labels.push('§10 ' + t.name));
labels.forEach((l, i) => console.log('  ' + (i + 1) + '. ' + l));

/* 顺带打一份统计，证明每块画面都不是空白 */
console.log('');
console.log('非背景像素占比（用来排除「画了一整块背景色」这种假通过）：');
function nonBg(src, ref) {
  let n = 0;
  for (let i = 0; i < src.length; i += 3) {
    if (Math.abs(src[i] - ref[0]) > 0.02 || Math.abs(src[i + 1] - ref[1]) > 0.02 ||
        Math.abs(src[i + 2] - ref[2]) > 0.02) n++;
  }
  return (100 * n / (src.length / 3)).toFixed(1) + '%';
}
if (tile1) console.log('  §1 归属图      : ' + nonBg(tile1.src, fk.COLS[fk.COLS.length - 1] || [0, 0, 0]));
depthTiles.forEach(t => console.log('  §6 ' + t.name.padEnd(14) + ': ' + nonBg(fbToRGB(t.fb), [0.2, 0.24, 0.29])));
cullTiles.forEach(t => console.log('  §8 ' + t.name.padEnd(14) + ': ' + nonBg(fbToRGB(t.fb), [0.2, 0.24, 0.29])));
msaaTiles.forEach(t => console.log('  §10 ' + t.name.padEnd(13) + ': ' + nonBg(t.src, [0.15, 0.19, 0.24])));

/* MSAA 那一行同时把成本事实印出来：着色次数 vs 被覆盖样本数。
   这两个数的比例关系（MSAA 亚线性、SSAA 严格线性）就是 §10 的结论本身。 */
if (msaaTiles.length) {
  console.log('');
  console.log('§10 成本（着色次数 / 被覆盖样本数 / 部分覆盖像素数）：');
  msaaTiles.forEach(function (t) {
    const st = t.st;
    console.log('  ' + t.name.padEnd(10) + ' N=' + st.N +
      '  着色 ' + String(st.shadeCount).padStart(6) +
      '  覆盖样本 ' + String(st.coveredSamples).padStart(6) +
      '  部分覆盖 ' + String(st.partial).padStart(5) +
      '  采样判定 ' + st.tested);
  });
}

/* §6 那一行顺带验证「四种模式该同的同、该异的异」：
     ztest 与 reverse-Z 只差一个刻度，必须逐像素相同；
     off（画家算法）与 world（给深度做透视校正）必须明显不同。
   如果 reverse-Z 那行不是 0，说明场景里有共面重叠在靠浮点舍入分胜负 —— 那是场景的病。 */
if (depthTiles.length) {
  console.log('');
  console.log('§6 各模式与 ztest 的像素差异（共 ' + (depthTiles[0].fb.W * depthTiles[0].fb.H) + ' 像素）：');
  const base = depthTiles[0].fb;
  depthTiles.slice(1).forEach(function (t) {
    let d = 0;
    for (let i = 0; i < base.W * base.H; i++) {
      if (Math.abs(base.col[i * 3] - t.fb.col[i * 3]) > 1e-6 ||
          Math.abs(base.col[i * 3 + 1] - t.fb.col[i * 3 + 1]) > 1e-6 ||
          Math.abs(base.col[i * 3 + 2] - t.fb.col[i * 3 + 2]) > 1e-6) d++;
    }
    console.log('  ' + t.name.padEnd(14) + ': ' + String(d).padStart(5) + ' / ' + (base.W * base.H));
  });
}
if (cullTiles.length === 3) {
  function pdiff(a, b) {
    let d = 0;
    for (let i = 0; i < a.W * a.H; i++) if (Math.abs(a.col[i * 3] - b.col[i * 3]) > 1e-6) d++;
    return d;
  }
  console.log('');
  console.log('§8 像素差异（基准 = 剔除关）：');
  console.log('  ' + cullTiles[1].name.padEnd(20) + ': ' + pdiff(cullTiles[0].fb, cullTiles[1].fb) +
              '   ← 闭合凸体上背面被正面完全挡住，**必须为 0**');
  console.log('  ' + cullTiles[2].name.padEnd(20) + ': ' + pdiff(cullTiles[0].fb, cullTiles[2].fb) +
              '   ← 绕序写反后剔错面，洞口可见，**必须不为 0**');
}
