/* 独立数值验证：复刻 index.html 中的相机与求交公式，检查符号约定是否正确。
   断言口径来自 docs/20-Knowledge/Concepts/射线与几何体求交.md：
     oc = C − O,  a = D·D,  h = D·oc,  c = oc·oc − r²,  Δ = h² − a·c,  t = (h ± √Δ)/a  */
const assert = require('assert');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '   ' + extra : '')); }
}

/* ---------- 球体求交（与 index.html 中 §6 rayColor 内联版本逐字一致） ---------- */
function hitSphere(O, D, C, r) {
  const lx = C[0] - O[0], ly = C[1] - O[1], lz = C[2] - O[2];   // oc = C − O
  const a = D[0] * D[0] + D[1] * D[1] + D[2] * D[2];
  const h = D[0] * lx + D[1] * ly + D[2] * lz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = h * h - a * c;
  if (disc <= 0) return { disc, t: NaN };
  const sq = Math.sqrt(disc);
  let t = (h - sq) / a;
  if (t <= 1e-3) t = (h + sq) / a;
  if (t <= 1e-3) t = NaN;
  return { disc, t, t1: (h - sq) / a, t2: (h + sq) / a, h, c, a };
}

/* ---------- §4 相机（unit sphere 在原点，焦点 = 1） ---------- */
function cam4(yaw, pitch, fovDeg, W, H) {
  const d = 4.2;
  const ex = d * Math.cos(pitch) * Math.sin(yaw),
        ey = d * Math.sin(pitch),
        ez = d * Math.cos(pitch) * Math.cos(yaw);
  const L = Math.hypot(ex, ey, ez);
  const wx = ex / L, wy = ey / L, wz = ez / L;
  const upx = 0, upy = 1, upz = 0;
  let ux = upy * wz - upz * wy, uy = upz * wx - upx * wz, uz = upx * wy - upy * wx;
  const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const vx = wy * uz - wz * uy, vy = wz * ux - wx * uz, vz = wx * uy - wy * ux;
  const th = Math.tan(fovDeg * Math.PI / 180 / 2), hh = th, hw = th * (W / H);
  const dux = 2 * hw * ux / W, duy = 2 * hw * uy / W, duz = 2 * hw * uz / W;
  const dvx = -2 * hh * vx / H, dvy = -2 * hh * vy / H, dvz = -2 * hh * vz / H;
  const px = ex - wx - hw * ux + hh * vx + 0.5 * (dux + dvx);
  const py = ey - wy - hw * uy + hh * vy + 0.5 * (duy + dvy);
  const pz = ez - wz - hw * uz + hh * vz + 0.5 * (duz + dvz);
  return { ex, ey, ez, px, py, pz, dux, duy, duz, dvx, dvy, dvz };
}
function dirOf(cam, i, j) {
  return [cam.px + i * cam.dux + j * cam.dvx - cam.ex,
          cam.py + i * cam.duy + j * cam.dvy - cam.ey,
          cam.pz + i * cam.duz + j * cam.dvz - cam.ez];
}

/* ---------- §6 相机（最终定标参数） ---------- */
const CAM6 = { eye:[13,2.0,3.0], look:[1.4,0.72,0], vfov:20 };
function makeCam(cfg, W, H) {
  const eye = cfg.eye, look = cfg.look;
  let wx = eye[0]-look[0], wy = eye[1]-look[1], wz = eye[2]-look[2];
  const L = Math.hypot(wx, wy, wz); wx /= L; wy /= L; wz /= L;
  let ux = wz, uy = 0, uz = -wx;               // cross((0,1,0), w)
  const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const vx = wy*uz - wz*uy, vy = wz*ux - wx*uz, vz = wx*uy - wy*ux;
  const th = Math.tan(cfg.vfov * Math.PI / 180 / 2), hh = th, hw = th * (W/H);
  const dux = 2*hw*ux/W, duy = 2*hw*uy/W, duz = 2*hw*uz/W;
  const dvx = -2*hh*vx/H, dvy = -2*hh*vy/H, dvz = -2*hh*vz/H;
  return { eye, px: eye[0]-wx-hw*ux+hh*vx+0.5*(dux+dvx),
                py: eye[1]-wy-hw*uy+hh*vy+0.5*(duy+dvy),
                pz: eye[2]-wz-hw*uz+hh*vz+0.5*(duz+dvz),
           dux, duy, duz, dvx, dvy, dvz };
}
function dirOf6(c, i, j) {
  return [c.px + i*c.dux + j*c.dvx - c.eye[0],
          c.py + i*c.duy + j*c.dvy - c.eye[1],
          c.pz + i*c.duz + j*c.dvz - c.eye[2]];
}

console.log('\n=== 1. 球体求交：符号约定 ===');
{
  const r = hitSphere([0,0,5], [0,0,-1], [0,0,0], 1);
  ok('正前方命中，近根 = 4.0', Math.abs(r.t1-4.0) < 1e-9, 't1='+r.t1);
  ok('远根 = 6.0', Math.abs(r.t2-6.0) < 1e-9, 't2='+r.t2);
  ok('Δ = 1.0', Math.abs(r.disc-1.0) < 1e-9, 'Δ='+r.disc);

  const r2 = hitSphere([0,0,0.5], [0,0,-1], [0,0,0], 1);
  ok('起点在球内 → c < 0', r2.c < 0, 'c='+r2.c);
  ok('起点在球内 → 近根为负', r2.t1 < 0, 't1='+r2.t1);
  ok('起点在球内 → 必须取远根 1.5', Math.abs(r2.t-1.5) < 1e-9, 't='+r2.t);

  const r3 = hitSphere([0,0,5], [0,0,1], [0,0,0], 1);
  ok('球在背后 → 未命中', isNaN(r3.t), 't='+r3.t);

  const r4 = hitSphere([0,5,5], [0,0,-1], [0,0,0], 1);
  ok('偏离 5r → Δ < 0', r4.disc < 0, 'Δ='+r4.disc);

  const r5 = hitSphere([0,0,5], [0,0,-2], [0,0,0], 1);
  ok('未归一化 D=(0,0,-2) → t=2.0（参数，非距离）', Math.abs(r5.t1-2.0) < 1e-9, 't1='+r5.t1);
}

console.log('\n=== 2. §4 相机：中心像素必须正对原点，四角逐点发散 ===');
{
  const W = 168, H = 116;
  let allCenter = true, allCorner = true;
  [0, 0.62, 1.7, -2.2].forEach(yaw => [0, 0.3, -0.6, 0.9].forEach(pitch => {
    const c = cam4(yaw, pitch, 60, W, H);
    const d = dirOf(c, (W-1)/2, (H-1)/2);
    const L = Math.hypot(d[0], d[1], d[2]);
    const eyeLen = Math.hypot(c.ex, c.ey, c.ez);
    const cosA = ((d[0]/L)*c.ex + (d[1]/L)*c.ey + (d[2]/L)*c.ez) / eyeLen;
    if (Math.abs(cosA + 1) > 0.02) allCenter = false;
    const tl = dirOf(c, 0, 0), br = dirOf(c, W-1, H-1);
    if (tl[0]*br[0] + tl[1]*br[1] + tl[2]*br[2] >= 0) allCorner = false;
  }));
  ok('16 组 (yaw,pitch) 中心射线都指回原点', allCenter);
  ok('四角射线方向相反（u/v 正交且朝向正确）', allCorner);

  const c = cam4(0.62, 0.30, 60, W, H);
  const d = dirOf(c, (W-1)/2, (H-1)/2);
  const r = hitSphere([c.ex, c.ey, c.ez], d, [0,0,0], 1);
  const tAsDist = r.t * Math.hypot(d[0], d[1], d[2]);
  ok('中心像素命中单位球，距离 ≈ 3.2', Math.abs(tAsDist - 3.2) < 0.02, 't='+tAsDist.toFixed(4));
}

console.log('\n=== 3. §6 相机：经典场景构图（最终定标） ===');
{
  const W = 200, H = 133;
  const c = makeCam(CAM6, W, H);
  const d = dirOf6(c, (W-1)/2, (H-1)/2);
  const r = hitSphere(c.eye, d, [0,1,0], 1);
  ok('中心像素命中中间那颗玻璃球', !isNaN(r.t), 't='+r.t.toFixed(3));

  // 三球必须全部入画且左右基本对称
  function spanOf(C, rad) {
    let mn = 1e9, mx = -1e9;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (!isNaN(hitSphere(c.eye, dirOf6(c, i, j), C, rad).t)) { if (i<mn)mn=i; if(i>mx)mx=i; }
    }
    return [mn, mx];
  }
  const L = spanOf([-2.9,1,0], 1), M = spanOf([0,1,0], 1), R = spanOf([2.9,1,0], 1);
  ok('左侧大球入画', L[1] >= 0, 'i ∈ ['+L[0]+','+L[1]+']');
  ok('右侧大球入画', R[1] >= 0, 'i ∈ ['+R[0]+','+R[1]+']');
  ok('三球整体占比 45%~75%（不空旷也不顶边）', (() => { const f=(R[1]-L[0])/W; return f>=0.45 && f<=0.75; })(),
     '占比 '+(((R[1]-L[0])/W*100).toFixed(0))+'%');
  const bal = Math.abs(L[0] - (W-1-R[1]));
  ok('左右留白基本对称（差 < 20px）', bal < 20, '左留白 '+L[0]+'px  右留白 '+(W-1-R[1])+'px');

  // 垂直：三球顶部必须留有余量（它们顶端都在视平线上，故以最近的那颗为准）
  function rowSpanOf(C, rad) {
    let mn = 1e9, mx = -1e9;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (!isNaN(hitSphere(c.eye, dirOf6(c, i, j), C, rad).t)) { if (j<mn)mn=j; if(j>mx)mx=j; }
    }
    return [mn, mx];
  }
  const rows = rowSpanOf([0,1,0], 1);       // 最近、最大的一颗（中央玻璃球）
  ok('中央球上沿留有余量（不裁顶，≥10px）', rows[0] >= 10, '上留白 '+rows[0]+'px');
  ok('中央球下沿留有余量（≥10px）', H-1-rows[1] >= 10, '下留白 '+(H-1-rows[1])+'px');
  console.log('       中央球行范围 j ∈ ['+rows[0]+','+rows[1]+']  / '+H);

  // 地面必须可见（至少 50% 的行能打到地面）
  let groundRows = 0;
  for (let j = 0; j < H; j++) {
    if (!isNaN(hitSphere(c.eye, dirOf6(c, W>>1, j), [0,-1000,0], 1000).t)) groundRows++;
  }
  ok('画面中列有地面（>50% 行）', groundRows > H*0.5, groundRows+'/'+H+' 行');
}

console.log('\n=== 4. §6 材质对比场景：5 球沿 z 轴排开 ===');
{
  const W = 200, H = 133;
  const cfg = { eye:[7.5,2.0,0.2], look:[0,0.78,0], vfov:46 };
  const c = makeCam(cfg, W, H);
  const zs = [-3.2,-1.6,0,1.6,3.2];
  const spans = zs.map(z => {
    let mn=1e9,mx=-1e9;
    for(let j=0;j<H;j++)for(let i=0;i<W;i++){
      if(!isNaN(hitSphere(c.eye, dirOf6(c,i,j), [0,0.7,z], 0.7).t)){ if(i<mn)mn=i; if(i>mx)mx=i; }
    }
    return {z, mn, mx, ok: mx>=0};
  });
  const allIn = spans.every(s => s.ok && s.mn >= 2 && s.mx <= W-3);
  ok('5 颗球全部完整入画', allIn);
  // 按屏幕列排序后检查相邻间隙
  const sorted = spans.filter(s=>s.ok).slice().sort((a,b)=>a.mn-b.mn);
  let minGap = 1e9;
  for (let k=0;k<sorted.length-1;k++) minGap = Math.min(minGap, sorted[k+1].mn - sorted[k].mx);
  ok('相邻球在屏幕上互不重叠（间隙 > 0）', minGap > 0, '最小间隙 '+minGap+'px');
  const fill = (sorted[sorted.length-1].mx - sorted[0].mn) / W;
  ok('整排占比 70%~90%', fill >= 0.70 && fill <= 0.90, (fill*100).toFixed(0)+'%');
  console.log('       各球列范围(按 z 顺序): ' + spans.map(s=>s.ok?(s.mn+'..'+s.mx):'出画').join(' | '));
}

console.log('\n=== 5. rayColor 端到端：单球 + 天空 ===');
{
  const RNG = (function (a) { return function () { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(7);
  let _rx=0,_ry=0,_rz=0;
  function randUnit() {
    for (let g=0;g<64;g++){
      const x=RNG()*2-1, y=RNG()*2-1, z=RNG()*2-1, s=x*x+y*y+z*z;
      if (s>1e-6 && s<1) { const k=1/Math.sqrt(s); _rx=x*k; _ry=y*k; _rz=z*k; return; }
    }
    _rx=0;_ry=1;_rz=0;
  }
  function lerp(a,b,t){ return a+(b-a)*t; }
  function rayColor(ox,oy,oz,dx,dy,dz,maxDepth) {
    let ar=1,ag=1,ab=1;
    const dl0 = Math.hypot(dx,dy,dz)||1; dx/=dl0; dy/=dl0; dz/=dl0;
    for (let depth=0; depth<maxDepth; depth++) {
      let best=Infinity, bi=-1;
      const a = dx*dx+dy*dy+dz*dz;
      { const lx=-ox, ly=-oy, lz=-oz;
        const h=dx*lx+dy*ly+dz*lz, c=lx*lx+ly*ly+lz*lz-1;
        const disc=h*h-a*c;
        if (disc>0){ const sq=Math.sqrt(disc);
          let t=(h-sq)/a; if(t<=1e-3){t=(h+sq)/a;}
          if(t>1e-3){ best=t; bi=0; } } }
      if (bi<0) {
        const t2 = 0.5*(dy+1);
        return [ar*lerp(1.0,0.5,t2), ag*lerp(1.0,0.7,t2), ab*lerp(1.0,1.0,t2)];
      }
      const t3=best, hx=ox+t3*dx, hy=oy+t3*dy, hz=oz+t3*dz;
      let nx=hx, ny=hy, nz=hz;
      if (dx*nx+dy*ny+dz*nz > 0) { nx=-nx; ny=-ny; nz=-nz; }
      randUnit();
      const tx2=hx+nx+_rx, ty2=hy+ny+_ry, tz2=hz+nz+_rz;
      const l2=Math.hypot(tx2,ty2,tz2);
      if (l2<1e-6) return [0,0,0];
      dx=tx2/l2; dy=ty2/l2; dz=tz2/l2;
      ox=hx+nx*1e-3; oy=hy+ny*1e-3; oz=hz+nz*1e-3;
      ar*=0.5; ag*=0.5; ab*=0.5;
    }
    return [0,0,0];
  }

  const up = rayColor(0,0,5, 0,1,-1, 8);      // dy>0
  const dn = rayColor(0,0,5, 0,-1,0, 8);      // 正下方：dy=-1 → t2=0 → 天空最白
  ok('向上逃逸 → 偏蓝 (b > r)', up[2] > up[0], 'L=('+up.map(v=>v.toFixed(3)).join(',')+')');
  ok('正下方逃逸 → r ≈ 1.0（天空最白端）', dn[0] > 0.99, 'L=('+dn.map(v=>v.toFixed(3)).join(',')+')');

  let vals=[], bad=0;
  for (let n=0;n<400;n++){
    const v = rayColor(0,0,5, 0,0,-1, 8);
    vals.push(v);
    if (v.some(x=>x<0||x>1.0001||!isFinite(x))) bad++;
  }
  ok('400 次采样全部落在 [0,1] 且有限', bad===0, 'bad='+bad);
  const per = vals.map(v=>(v[0]+v[1]+v[2])/3);
  const mn=Math.min(...per), mx=Math.max(...per);
  ok('漫反射采样有方差（确实在随机半球采样）', mx-mn > 0.02, 'range=['+mn.toFixed(3)+','+mx.toFixed(3)+']');
  const mean = per.reduce((s,x)=>s+x,0)/per.length;
  ok('单通道平均亮度 < 1（被 albedo 连乘衰减）', mean < 1.0, 'mean='+mean.toFixed(3));

  let anyZero=false;
  for (let n=0;n<200;n++) if (rayColor(0,0,5, 0,0,-1, 1)[0]===0) anyZero=true;
  ok('maxDepth=1 时大量路径被保险丝截断为黑', anyZero);
}

console.log('\n=== 6. §3 面板：Δ 分类判定 ===');
{
  function calc(O, C, HND, r) {
    const dx=HND[0]-O[0], dy=HND[1]-O[1];
    const cx=C[0]-O[0], cy=C[1]-O[1];
    const a=dx*dx+dy*dy, h=dx*cx+dy*cy, c=cx*cx+cy*cy-r*r;
    const disc=h*h-a*c; let t1=NaN,t2=NaN;
    if(disc>=0){ const s=Math.sqrt(disc); t1=(h-s)/a; t2=(h+s)/a; }
    return {a,h,c,disc,t1,t2};
  }
  const q = calc([0.55,1.35],[5.6,3.0],[9.2,4.6],1.7);
  ok('默认布局：命中 (Δ > 0)', q.disc>0, 'Δ='+q.disc.toFixed(3));
  ok('默认布局：近根 t₁ > 0', q.t1>0, 't₁='+q.t1.toFixed(3));
  ok('默认布局：t₁ < t₂', q.t1 < q.t2);
  const q2 = calc([5.6,3.0],[5.6,3.0],[9.2,4.6],1.7);
  ok('起点与球心重合 → c < 0', q2.c<0);
  ok('起点在球内 → t₁ < 0 < t₂', q2.t1<0 && q2.t2>0, 't₁='+q2.t1.toFixed(2)+' t₂='+q2.t2.toFixed(2));
  const q3 = calc([0.55,1.35],[5.6,3.0],[-6,-3],1.7);
  ok('射线背向球 → 两根皆负', q3.disc>0 && q3.t1<0 && q3.t2<0,
     't₁='+q3.t1.toFixed(2)+' t₂='+q3.t2.toFixed(2));
}

console.log('\n----------------------------------------');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
