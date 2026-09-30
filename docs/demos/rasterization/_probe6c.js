/* ==================================================================
   §6 取证续：斜板挡住蓝板了，怎么挪才合适？
   ------------------------------------------------------------------
   实测五块板的可见像素是 519 / 5417 / 1518 / 32 / 2806（灰/橙/青/蓝/斜板），
   蓝板只剩 32 个像素 —— 几乎等于没有。原因是斜板在屏幕中段横跨了 x≈43..149，
   而蓝板正好在中段那条带里（y 67..77）。

   不猜，扫一遍：把斜板整体左移若干、或同时收窄，看蓝板能拿回多少像素，
   同时确认斜板自己还看得见、而且仍然与地面相交（那是「画家算法必错」的来源）。

   运行：node _probe6c.js
   ================================================================== */
const { load } = require('./_stub.js');
const S = load({ clientWidth: 720, clientHeight: 420 });
if (S.topError) { console.log('❌ ' + S.topError.message); process.exit(1); }
const R = S.window.__rast;
const D = R.sections.depth;
const W = D.W, H = D.H, NP = W * H;
const NEAR = D.NEAR(), FAR = D.FAR();

/* 用页面自己的相机与投影重建场景，只改斜板那一块的顶点 —— 不动页面源码 */
function build(plate) {
  const view = R.makeView({ x: 0, y: 1.15, z: 0 }, 0, -0.10);
  const pr = R.makeProj(W, H, 60, NEAR, FAR);
  const quads = [];
  function quad(p, col, spec) {
    const a = p.map(q => view({ x: q[0], y: q[1], z: q[2] }));
    const n0 = a[1], n1 = a[0];
    /* 法线：cross(a1−a0, a2−a0) 然后归一化 */
    const ex = n0.x - n1.x, ey = n0.y - n1.y, ez = n0.z - n1.z;
    const f0 = a[2];
    const fx = f0.x - n1.x, fy = f0.y - n1.y, fz = f0.z - n1.z;
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    const su = a.map(v => pr(v));
    const sv = su.map(q => ({
      x: q.x, y: q.y, w: q.w, z: q.z, u: spec, nx: nx, ny: ny, nz: nz,
      r: col[0], g: col[1], b: col[2],
    }));
    quads.push([sv[0], sv[1], sv[2]]);
    quads.push([sv[0], sv[2], sv[3]]);
  }
  quad([[-6, 0, -13], [6, 0, -13], [6, 0, -1.2], [-6, 0, -1.2]], [0.20, 0.24, 0.30], 0.05);
  quad([[-1.2, 0.24, -3.4], [4.6, 0.24, -3.4], [4.6, 0.24, -0.9], [-1.2, 0.24, -0.9]], [0.72, 0.52, 0.18], 0.30);
  quad([[-5.0, 0.16, -6.2], [0.8, 0.16, -6.2], [0.8, 0.16, -2.0], [-5.0, 0.16, -2.0]], [0.12, 0.58, 0.50], 0.30);
  quad([[-4.4, 0.08, -9.6], [3.4, 0.08, -9.6], [3.4, 0.08, -5.4], [-4.4, 0.08, -5.4]], [0.30, 0.38, 0.74], 0.30);
  quad(plate, [0.78, 0.22, 0.38], 0.45);
  return quads;
}

function measure(tris) {
  /* 每个三角形单独渲一遍，得到「谁覆盖了这个像素」与各自的深度 */
  const solo = tris.map(t => {
    const fb = R.makeFB(W, H);
    R.fbClear(fb, 0, 0, 0, false);
    R.rasterTri(fb, t[0], t[1], t[2], {
      mode: 'bbox', rule: 'tl', ztest: false,
      shade: (px, py, P, at) => [at.r, at.g, at.b],
    });
    return fb;
  });
  const win = [0, 0, 0, 0, 0];
  let cov = 0;
  for (let i = 0; i < NP; i++) {
    let w = -1;
    for (let t = 0; t < solo.length; t++) {
      if (solo[t].cover[i] === 0) continue;
      if (w < 0 || solo[t].z[i] < solo[w].z[i]) w = t;
    }
    if (w >= 0) { win[Math.floor(w / 2)]++; cov++; }
  }
  return { win, cov };
}

const base = [[-3.2, 1.8, -8.2], [2.6, 1.8, -6.0], [2.6, -0.2, -3.6], [-3.2, -0.2, -5.8]];
const cands = [
  { name: '原样', p: base },
  { name: '左移 1.0', p: base.map(q => [q[0] - 1.0, q[1], q[2]]) },
  { name: '左移 1.6', p: base.map(q => [q[0] - 1.6, q[1], q[2]]) },
  { name: '左移 2.2', p: base.map(q => [q[0] - 2.2, q[1], q[2]]) },
  { name: '左移 1.6 且收窄 40%',
    p: base.map(q => { const cx = 0; return [cx + (q[0] - cx) * 0.6 - 1.6, q[1], q[2]]; }) },
  { name: '左移 2.2 且收窄 40%',
    p: base.map(q => { const cx = 0; return [cx + (q[0] - cx) * 0.6 - 2.2, q[1], q[2]]; }) },
];

console.log('五块板的可见像素（灰 / 橙 / 青 / 蓝 / 斜板），画布 ' + W + '×' + H + '：');
console.log('');
cands.forEach(function (c) {
  const m = measure(build(c.p));
  const min = Math.min.apply(null, m.win);
  console.log('  ' + c.name.padEnd(20) + m.win.map(n => String(n).padStart(5)).join(' ') +
              '   覆盖合计 ' + String(m.cov).padStart(5) + '  最小 ' + String(min).padStart(4) +
              (min >= 200 ? '  ✅' : ''));
});
console.log('');
console.log('判据：最小的那块也要有两百像素以上，才算「一眼能看见」。');
