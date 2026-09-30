/* §7 构图判定器
 * 对给定 (EYE, M, r) 打印 α → β 全表，并给出每个命中点在「可见球冠」上的相对位置，
 * 用来排除「光线只从球边缘蹭过去」那种观感很差的掠射解。
 *
 * 可见球冠定义：命中点 P 能被眼睛看到 ⟺ (P−EYE)·n_outward < 0
 *   => (M−EYE)·n + r < 0 => cos(ψ − ψ0) < −r/|M−EYE|
 *   => ψ ∈ (ψ0 + 90 + γ, ψ0 + 270 − γ)，其中 ψ0 = 眼睛看球心的方向，γ = asin(r/D)
 * 相对位置 0% = 上边缘，100% = 下边缘。
 */
const DEG = 180 / Math.PI;
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

function report(EYE, M, r, want) {
  const vx = M.x - EYE.x, vy = M.y - EYE.y, D = Math.hypot(vx, vy);
  const a0 = Math.atan2(vy, vx) * DEG;
  const gam = Math.asin(r / D) * DEG;
  const psiUp = a0 + 90 + gam;              // 上边缘法线角
  const capSpan = 180 - 2 * gam;
  console.log('\n=== EYE(' + EYE.x + ',' + EYE.y + ')  球心(' + M.x + ',' + M.y + ')  r=' + r
    + '   D=' + D.toFixed(3) + '  γ=' + gam.toFixed(1) + '°  可见球冠 ψ∈(' + psiUp.toFixed(1) + '°, ' + (psiUp + capSpan).toFixed(1) + '°)');
  console.log('  α 命中范围 (' + (a0 - gam).toFixed(1) + '°, ' + (a0 + gam).toFixed(1) + '°)   ← 想看的 β=' + want);

  const rows = [];
  for (let a = a0 - gam + 0.4; a <= a0 + gam - 0.4; a += 0.5) {
    const rr = a / DEG, d = { x: Math.cos(rr), y: Math.sin(rr) };
    const H = hit(M, r, EYE, d); if (!H) continue;
    const dn = d.x * H.n.x + d.y * H.n.y;
    const dOut = norm({ x: d.x - 2 * dn * H.n.x, y: d.y - 2 * dn * H.n.y });
    const beta = Math.atan2(dOut.y, dOut.x) * DEG;
    const th = Math.acos(Math.min(1, Math.abs(dn))) * DEG;
    const psi = Math.atan2(H.n.y, H.n.x) * DEG;
    let rel = (psi - psiUp) / capSpan; if (rel < 0) rel += 180 / capSpan;
    rows.push({ a, t: H.t, P: H.P, beta, th, psi, rel });
  }
  // 只打印 β 落在目标区间附近的样本，避免刷屏
  const near = rows.filter(x => Math.abs(x.beta - want) < 26);
  if (!near.length) { console.log('  （没有 β 接近 ' + want + '° 的解）'); return null; }
  near.forEach(x => console.log('   α=' + x.a.toFixed(1).padStart(5) + '°  θ=' + x.th.toFixed(1).padStart(5)
    + '°  偏折 ' + (180 - 2 * x.th).toFixed(1).padStart(5) + '°   β=' + x.beta.toFixed(1).padStart(6)
    + '°   命中点(球冠相对位置 ' + (x.rel * 100).toFixed(0).padStart(3) + '%)  (' + x.P.x.toFixed(2) + ',' + x.P.y.toFixed(2) + ')  相机段长 ' + x.t.toFixed(2)));
  // 返回最接近 want 的那个
  return near.reduce((b, x) => Math.abs(x.beta - want) < Math.abs(b.beta - want) ? x : b);
}

const EYE = { x: 0.65, y: 1.35 };
const tries = [
  { M: { x: 3.10, y: 2.40 }, r: 1.10 },
  { M: { x: 3.30, y: 2.55 }, r: 1.15 },
  { M: { x: 2.95, y: 2.20 }, r: 1.25 },
  { M: { x: 3.40, y: 2.20 }, r: 1.05 },
];
tries.forEach(t => report(EYE, t.M, t.r, 58));
