/* §7 布局求解器（带质量约束的搜索）
 *
 * 视觉质量判据（比「参数好看」更可靠）：
 *   rel  = 命中点在可见球冠上的相对位置，0 = 上边缘，1 = 下边缘。
 *          rel 接近 0 或 1 说明光线只是从球的轮廓边蹭过去 —— 观感差、也不像「镜面反射」。
 *          要求 0.28 ≤ rel ≤ 0.72（命中点在球面中段，一眼能看出光是在球面上拐弯）。
 *   θ    = 镜面入射角，要求 ≤ 74°（避免掠射：掠射时偏折量 180−2θ 太小，看不出反射）。
 *   β    = 反射方向，要求 50°~72°（右上斜线，给玻璃球留出向右上的行程）。
 *   α    = 相机射线角，要求 8°~30°（从画面左下方自然斜向上射入）。
 *   相机段长 2.0~3.2。
 *   金属球整体在画面内。
 */
const DEG = 180 / Math.PI;
const W = 8.6, SKY = 7.0, PAD = 0.40;
const EYE = { x: 0.65, y: 1.35 };
const norm = v => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
function hit(c, r, p, d) {
  const ox = p.x - c.x, oy = p.y - c.y;
  const h = d.x * (-ox) + d.y * (-oy);
  const cc = ox * ox + oy * oy - r * r;
  const disc = h * h - cc; if (disc <= 0) return null;
  const sq = Math.sqrt(disc);
  let t = h - sq; if (t <= 1e-9) t = h + sq; if (t <= 1e-9) return null;
  const P = { x: p.x + t * d.x, y: p.y + t * d.y };
  return { t, P, n: { x: (P.x - c.x) / r, y: (P.y - c.y) / r } };
}

const out = [];
const nearEdge = [];
const REL_LO = 0.12, REL_HI = 0.88;
const stat = Object.create(null);
const bump = k => { stat[k] = (stat[k] || 0) + 1; };

for (let mx = 2.0; mx <= 4.60; mx += 0.05) {
  for (let my = 1.50; my <= 4.60; my += 0.05) {
    for (let r = 0.80; r <= 1.35; r += 0.05) {
      if (mx - r < PAD || my - r < PAD || my + r > SKY - PAD) { bump('金属球出画面'); continue; }
      const vx = mx - EYE.x, vy = my - EYE.y, D = Math.hypot(vx, vy);
      if (D <= r * 1.05) { bump('眼睛太贴球'); continue; }
      const a0 = Math.atan2(vy, vx) * DEG, gam = Math.asin(r / D) * DEG;
      const psiUp = a0 + 90 + gam, span = 180 - 2 * gam;
      const aLo = a0 - gam + 0.30, aHi = a0 + gam - 0.30;
      for (let a = aLo; a <= aHi; a += 0.4) {
        const rr = a / DEG, d = { x: Math.cos(rr), y: Math.sin(rr) };
        const H = hit({ x: mx, y: my }, r, EYE, d); if (!H) continue;
        const dn = d.x * H.n.x + d.y * H.n.y;
        const dOut = norm({ x: d.x - 2 * dn * H.n.x, y: d.y - 2 * dn * H.n.y });
        const beta = Math.atan2(dOut.y, dOut.x) * DEG;
        const th = Math.acos(Math.min(1, Math.abs(dn))) * DEG;
        if (th > 74) { bump('镜面入射角过掠(θ>74)'); continue; }
        if (beta < 50 || beta > 72) { bump('反射方向不在右上区间'); continue; }
        if (a < 8 || a > 30) { bump('相机射线角不自然'); continue; }
        if (H.t < 2.0 || H.t > 3.2) { bump('相机段长不合适'); continue; }
        const psi = Math.atan2(H.n.y, H.n.x) * DEG;
        let rel = (psi - psiUp) / span; if (rel < 0) rel += 180 / span; if (rel > 1) rel -= 180 / span;
        nearEdge.push({ M: { x: mx, y: my }, r, a, t: H.t, P: H.P, n: H.n, d, dOut, beta, th, rel, dev: 180 - 2 * th });
        if (rel < REL_LO || rel > REL_HI) { bump('命中点贴轮廓(rel越过 ' + REL_LO + '~' + REL_HI + ')'); continue; }
        out.push({ M: { x: mx, y: my }, r, a, t: H.t, P: H.P, n: H.n, d, dOut, beta, th, rel, dev: 180 - 2 * th });
      }
    }
  }
}

console.log('=== 淘汰统计（前 8） ===');
Object.entries(stat).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, v]) => console.log('  ' + String(v).padStart(9) + '  ' + k));
console.log('');
console.log('=== 同时满足全部质量约束的解 === ' + out.length);
if (!out.length) {
  console.log('（需要放宽约束）通过方向/角度筛选的 ' + nearEdge.length + ' 组的球冠相对位置分布：');
  const buckets = new Array(20).fill(0);
  nearEdge.forEach(c => { const i = Math.min(19, Math.max(0, Math.floor(c.rel * 20))); buckets[i]++; });
  buckets.forEach((v, i) => {
    if (v) console.log('  rel ' + (i / 20).toFixed(2) + '~' + ((i + 1) / 20).toFixed(2) + '  ' + String(v).padStart(6) + '  ' + '#'.repeat(Math.min(60, Math.round(v / Math.max(...buckets) * 60))));
  });
  const best = nearEdge.slice().sort((a, b) => Math.abs(a.rel - 0.5) - Math.abs(b.rel - 0.5)).slice(0, 4);
  console.log('\n最接近球心的 4 组：');
  best.forEach(c => console.log('  球心(' + c.M.x.toFixed(2) + ',' + c.M.y.toFixed(2) + ') r=' + c.r.toFixed(2)
    + '  α=' + c.a.toFixed(2) + '°  θ=' + c.th.toFixed(1) + '°  β=' + c.beta.toFixed(1) + '°  rel=' + (c.rel * 100).toFixed(0) + '%  段长 ' + c.t.toFixed(2)));
  process.exit(1);
}

/* 打分：命中点居中 + 偏折量大 + 反射角居中 + 相机段长居中 + 球心构图好 */
const score = c =>
  -Math.abs(c.rel - 0.30) * 3.0
  + c.dev * 0.030
  - Math.abs(c.beta - 61) * 0.06
  - Math.abs(c.t - 2.6) * 0.55
  - Math.abs(c.M.x - 3.05) * 0.55
  - Math.abs(c.M.y - 2.75) * 0.55;
out.sort((a, b) => score(b) - score(a));

const seen = new Set(); let shown = 0;
console.log('\n=== Top 8（去重） ===');
for (const c of out) {
  const key = Math.round(c.M.x * 3) + '_' + Math.round(c.M.y * 3) + '_' + Math.round(c.r * 4);
  if (seen.has(key)) continue; seen.add(key);
  console.log('\n球心(' + c.M.x.toFixed(2) + ', ' + c.M.y.toFixed(2) + ')  r=' + c.r.toFixed(2)
    + '   相机α=' + c.a.toFixed(2) + '°  段长 ' + c.t.toFixed(2)
    + '\n   命中点(' + c.P.x.toFixed(3) + ', ' + c.P.y.toFixed(3) + ')  球冠相对位置 ' + (c.rel * 100).toFixed(0) + '%'
    + '  法线(' + c.n.x.toFixed(3) + ', ' + c.n.y.toFixed(3) + ')'
    + '\n   镜面入射角 θ=' + c.th.toFixed(2) + '°  偏折 ' + c.dev.toFixed(1) + '°  反射 β=' + c.beta.toFixed(2) + '°  反射向(' + c.dOut.x.toFixed(4) + ', ' + c.dOut.y.toFixed(4) + ')'
    + '   score ' + score(c).toFixed(3));
  if (++shown >= 8) break;
}
