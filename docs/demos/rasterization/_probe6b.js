/* ==================================================================
   §6 取证续：为什么覆盖集合一样、颜色却差 10%？
   ------------------------------------------------------------------
   上一版探针把 key 写成了 c.py*W + floor(c.px)，而 c.py = y+0.5，
   于是 W=160 时每个 key 都偏了 80 —— 读出来的「赢家」根本是别的像素。
   这一版改成 floor(py)*W + floor(px)，并把每个像素的**写入序列**整个记下来。

   要看的是：同一像素上，两个模式各被写了哪几次、每次的深度是多少。
   运行：node _probe6b.js
   ================================================================== */
const { load } = require('./_stub.js');
const S = load({ clientWidth: 720, clientHeight: 420 });
if (S.topError) { console.log('❌ ' + S.topError.message); process.exit(1); }
const R = S.window.__rast;
const D = R.sections.depth;
const W = D.W, H = D.H, NP = W * H;

function render(reverse, depthPersp) {
  const tris = D.getScene();
  tris.sort(function (a, b) {
    return (a[0].z + a[1].z + a[2].z) / 3 - (b[0].z + b[1].z + b[2].z) / 3;
  });
  const fb = R.makeFB(W, H);
  R.fbClear(fb, 0.047, 0.063, 0.090, reverse);
  /* writes[i] = [{tri, z01, col}...]，按写入先后 */
  const writes = new Map();
  for (let ti = 0; ti < tris.length; ti++) {
    const t = tris[ti];
    let cur = null;
    R.rasterTri(fb, t[0], t[1], t[2], {
      mode: 'bbox', rule: 'tl', reverse: reverse, ztest: true, depthPersp: !!depthPersp,
      shade: function (px, py, P, at) {
        const idx = Math.floor(py) * W + Math.floor(px);
        cur = { tri: ti, z01: (reverse ? 1 : 1) * 0, col: [at.r, at.g, at.b] };
        if (!writes.has(idx)) writes.set(idx, []);
        /* 真正的 stored 在 shade 之后才写入 fb.z，这里先占位，稍后回填 */
        writes.get(idx).push(cur);
        return R.blinnPhong({ x: at.nx, y: at.ny, z: at.nz }, [at.r, at.g, at.b], at.u);
      },
    });
  }
  return { fb: fb, writes: writes, tris: tris };
}

const A = render(false, false);
const B = render(true, false);

function summarize(tag, R2, idx) {
  const ws = R2.writes.get(idx) || [];
  console.log('  ' + tag + ' 写入 ' + ws.length + ' 次：' +
    ws.map(function (w, k) {
      return '#' + k + ' tri' + w.tri + ' col=[' + w.col.map(v => v.toFixed(3)).join(',') + ']';
    }).join('  |  '));
}

/* 找一个颜色差异最大的像素 */
let best = null;
for (let i = 0; i < NP; i++) {
  const e = Math.abs(A.fb.col[i * 3] - B.fb.col[i * 3]) +
            Math.abs(A.fb.col[i * 3 + 1] - B.fb.col[i * 3 + 1]) +
            Math.abs(A.fb.col[i * 3 + 2] - B.fb.col[i * 3 + 2]);
  if (!best || e > best.e) best = { i: i, e: e };
}
console.log('颜色差异最大的像素：(' + (best.i % W) + ',' + Math.floor(best.i / W) + ')  Σ|Δcol| = ' + best.e.toFixed(4));
summarize('标准   ', A, best.i);
summarize('reverse', B, best.i);
console.log('  标准   最终 col = [' + [0, 1, 2].map(c => A.fb.col[best.i * 3 + c].toFixed(4)).join(',') + ']');
console.log('  reverse 最终 col = [' + [0, 1, 2].map(c => B.fb.col[best.i * 3 + c].toFixed(4)).join(',') + ']');
console.log('');

/* 全局统计：写入次数分布是否不同 */
function hist(R2) {
  const h = {};
  for (let i = 0; i < NP; i++) { const n = (R2.writes.get(i) || []).length; h[n] = (h[n] || 0) + 1; }
  return h;
}
console.log('每像素写入次数分布（右图是页面自报的 fb.cover）：');
console.log('  标准   : ' + JSON.stringify(hist(A)));
console.log('  reverse: ' + JSON.stringify(hist(B)));
let covMismatch = 0;
for (let i = 0; i < NP; i++) {
  const n = (A.writes.get(i) || []).length;
  if (n !== A.fb.cover[i]) covMismatch++;
}
console.log('  「着色调用次数」与 fb.cover 不一致的像素（标准）：' + covMismatch);
console.log('');

/* 只看「两者都只写了 1 次」的像素里，颜色却不同的有多少 —— 这些是最可疑的 */
let singleDiff = 0, single = 0;
for (let i = 0; i < NP; i++) {
  const na = (A.writes.get(i) || []).length, nb = (B.writes.get(i) || []).length;
  if (na !== 1 || nb !== 1) continue;
  single++;
  const e = Math.abs(A.fb.col[i * 3] - B.fb.col[i * 3]);
  if (e > 1e-6) singleDiff++;
}
console.log('两模式都只写 1 次的像素：' + single + ' 个，其中颜色不同的 ' + singleDiff + ' 个');
console.log('  —— 若这个数 ≈ 0，说明颜色差异**全部**来自「共面平局换赢家」；');
console.log('     若这个数很大，说明同一次写入也会产出不同颜色（那就是插值/着色环节的问题）。');
console.log('');

/* 赢家三角形的直方图对比 */
function winnerHist(R2) {
  const h = {};
  for (let i = 0; i < NP; i++) {
    const ws = R2.writes.get(i) || [];
    if (!ws.length) continue;
    const t = ws[ws.length - 1].tri;
    h[t] = (h[t] || 0) + 1;
  }
  return h;
}
console.log('最终赢家三角形 → 覆盖像素数：');
console.log('  标准   : ' + JSON.stringify(winnerHist(A)));
console.log('  reverse: ' + JSON.stringify(winnerHist(B)));

/* 场景各三角形是不是共面（都躺在 y=0 上？） */
console.log('');
console.log('场景三角形在世界空间的平面性检查（同一 quad 的两半必然共面）：');
A.tris.forEach(function (t, i) {
  const nz = t.map(v => v.z);
  console.log('  tri#' + i + '  z01: ' + nz.map(v => v.toFixed(6)).join(' / ') +
              '   Δz01 = ' + (Math.max(...nz) - Math.min(...nz)).toExponential(2));
});
