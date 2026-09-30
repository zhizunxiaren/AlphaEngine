/* ==================================================================
   §6 取证：reverse-Z 到底改变了什么？
   ------------------------------------------------------------------
   _preview.js 报出「ztest 与 ztest-reverseZ 有 3637 / 17600 个像素不同」，
   而页面自检 ⑧ 断言的是「覆盖集合完全一致」。两者必须同时对：
   反 Z 只该改变精度（谁在浮点下存得更准），不该改变「谁赢」。

   所以要把「覆盖集合」与「最终颜色」两件事分开量：
     覆盖集合 = fb.cover > 0 的像素集合      → 必须相同
     最终颜色 = fb.col                        → 允许因平局翻转而不同

   如果覆盖集合也不同，那是 §6 的真缺陷，不是精度问题。
   运行：node _probe6.js
   ================================================================== */
const { load } = require('./_stub.js');
const S = load({ clientWidth: 720, clientHeight: 420 });
if (S.topError) { console.log('❌ 顶层执行失败：' + S.topError.message); process.exit(1); }
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
  for (const t of tris) {
    R.rasterTri(fb, t[0], t[1], t[2], {
      mode: 'bbox', rule: 'tl', reverse: reverse, ztest: true, depthPersp: !!depthPersp,
      shade: function (px, py, P, at) {
        return R.blinnPhong({ x: at.nx, y: at.ny, z: at.nz }, [at.r, at.g, at.b], at.u);
      },
    });
  }
  return fb;
}

const A = render(false, false), B = render(true, false), C = render(false, true);

function covDiff(a, b) {
  let d = 0;
  for (let i = 0; i < NP; i++) if ((a.cover[i] > 0) !== (b.cover[i] > 0)) d++;
  return d;
}
function colDiff(a, b) {
  let d = 0, maxAbs = 0;
  for (let i = 0; i < NP * 3; i++) {
    const e = Math.abs(a.col[i] - b.col[i]);
    if (e > 1e-6) d++;
    if (e > maxAbs) maxAbs = e;
  }
  return { n: Math.floor(d / 3), maxAbs: maxAbs };
}

console.log('帧缓冲 ' + W + '×' + H + ' = ' + NP + ' 像素');
console.log('');

const cAB = covDiff(A, B);
console.log('【覆盖集合】ztest  vs  reverse-Z      : 差 ' + cAB + ' 像素');
console.log('【覆盖集合】ztest  vs  depthPersp(错) : 差 ' + covDiff(A, C) + ' 像素');
console.log('');

const dAB = colDiff(A, B), dAC = colDiff(A, C);
console.log('【最终颜色】ztest  vs  reverse-Z      : ' + dAB.n + ' 像素不同，最大差 ' + dAB.maxAbs.toExponential(3));
console.log('【最终颜色】ztest  vs  depthPersp(错) : ' + dAC.n + ' 像素不同，最大差 ' + dAC.maxAbs.toExponential(3));
console.log('');

/* 差在哪？把差异像素的坐标拉出来看看是不是落在同一条线上 */
function where(a, b) {
  const pts = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (Math.abs(a.col[i * 3] - b.col[i * 3]) > 1e-6 ||
        Math.abs(a.col[i * 3 + 1] - b.col[i * 3 + 1]) > 1e-6 ||
        Math.abs(a.col[i * 3 + 2] - b.col[i * 3 + 2]) > 1e-6) pts.push([x, y]);
  }
  return pts;
}
const pts = where(A, B);
if (pts.length) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const xsum = new Map();
  pts.forEach(p => xsum.set(p[0], (xsum.get(p[0]) || 0) + 1));
  const topx = [...xsum.entries()].sort((u, v) => v[1] - u[1]).slice(0, 6);
  console.log('差异像素分布：x ∈ [' + Math.min(...xs) + ',' + Math.max(...xs) + ']  ' +
              'y ∈ [' + Math.min(...ys) + ',' + Math.max(...ys) + ']');
  console.log('出现最多的列：' + topx.map(t => 'x=' + t[0] + '×' + t[1]).join('  '));
  console.log('前 12 个坐标：' + pts.slice(0, 12).map(p => '(' + p[0] + ',' + p[1] + ')').join(' '));
}

/* 三次渲染里，同一个像素上「最终赢家」的深度值是否一致（不看颜色只看深度） */
function zDepth(fb) {
  const o = new Float32Array(NP);
  for (let i = 0; i < NP; i++) o[i] = fb.reverse ? 1 - fb.z[i] : fb.z[i];
  return o;
}
let zdiff = 0, zdmax = 0;
for (let i = 0; i < NP; i++) {
  if (A.cover[i] > 0) {
    const e = Math.abs(A.z[i] - (1 - B.z[i]));
    if (e > 1e-9) { zdiff++; if (e > zdmax) zdmax = e; }
  }
}
console.log('');
console.log('【深度值】两者都覆盖的像素上，|z01_A − (1 − stored_B)| > 1e-9 的有 ' + zdiff +
            ' 个，最大 ' + zdmax.toExponential(3));
console.log('  —— 若这行接近 0，说明赢家相同、只是 1−z 在 float32 里把次序挤到了一起；');
console.log('     若这行很大，说明确实换了赢家（平局翻转）。');
