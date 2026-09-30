/* 无头渲染 + 导出 PNG：用与 index.html 完全一致的场景/相机/rayColor，
   真正渲染出图，供目视验证构图与光照是否正确。 */
const fs = require('fs');
const zlib = require('zlib');

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

/* ---------- 与 index.html 一致的渲染核心 ---------- */
function mulberry32(a){return function(){a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const S={x:[],y:[],z:[],r:[],m:[],a:[],b:[],c:[],fz:[],io:[]};
let NS=0;
function add(x,y,z,r,m,ar,bg,bb,fz,io){S.x.push(x);S.y.push(y);S.z.push(z);S.r.push(r);S.m.push(m);S.a.push(ar);S.b.push(bg);S.c.push(bb);S.fz.push(fz||0);S.io.push(io||1.5);}
function clearS(){['x','y','z','r','m','a','b','c','fz','io'].forEach(k=>S[k].length=0);}
const LAMP={x:0,y:6.2,z:0,r:1.5};

let BIGX=2.9;
function buildClassic(lampOn){
  clearS(); const rnd=mulberry32(20260922);
  add(-BIGX,1.0,0,1.0,0, 0.62,0.30,0.22,0,1.5);
  add( 0.0,1.0,0,1.0,2, 1,1,1,0,1.50);
  add( BIGX,1.0,0,1.0,1, 0.86,0.86,0.90,0.04,1.5);
  const X0=-9.5,X1=5.5,Z0=-7.5,Z1=3.5,STEP=1.3;
  for(let cx=X0;cx<=X1+1e-9;cx+=STEP) for(let cz=Z0;cz<=Z1+1e-9;cz+=STEP){
    const px=cx+(rnd()-0.5)*0.5, pz=cz+(rnd()-0.5)*0.5;
    if(Math.hypot(px+BIGX,pz)<1.55) continue;
    if(Math.hypot(px,pz)<1.55) continue;
    if(Math.hypot(px-BIGX,pz)<1.55) continue;
    const rr=rnd(), cr=rnd(), cg=rnd(), cb=rnd();
    if(rr<0.62) add(px,0.2,pz,0.2,0, cr,cg,cb,0,1.5);
    else if(rr<0.88) add(px,0.2,pz,0.2,1, 0.5+0.5*cr,0.5+0.5*cg,0.5+0.5*cb,0.25*rnd(),1.5);
    else add(px,0.2,pz,0.2,2, 1,1,1,0,1.5);
  }
  add(0,-1000,0,1000,0, 0.60,0.60,0.57,0,1.5);
  if(lampOn) add(LAMP.x,LAMP.y,LAMP.z,LAMP.r,3, 7.0,6.6,5.8,0,1.5);
  NS=S.x.length;
}
let IOR5=1.05;
function buildMats(lampOn){
  clearS();
  add(0,-1000,0,1000,0, 0.60,0.60,0.57,0,1.5);
  const zs=[-3.2,-1.6,0,1.6,3.2];
  add(0,0.7,zs[0],0.7,0, 0.80,0.26,0.26,0,1.5);
  add(0,0.7,zs[1],0.7,1, 0.92,0.92,0.95,0.00,1.5);
  add(0,0.7,zs[2],0.7,1, 0.90,0.72,0.40,0.45,1.5);
  add(0,0.7,zs[3],0.7,2, 1,1,1,0,1.50);
  add(0,0.7,zs[4],0.7,2, 1,1,1,0,IOR5);
  if(lampOn) add(LAMP.x,LAMP.y,LAMP.z,LAMP.r,3, 7.0,6.6,5.8,0,1.5);
  NS=S.x.length;
}

const CAM={};
function buildCam(cfg,W,H){
  const eye=cfg.eye, look=cfg.look;
  let wx=eye[0]-look[0], wy=eye[1]-look[1], wz=eye[2]-look[2];
  const L=Math.hypot(wx,wy,wz); wx/=L;wy/=L;wz/=L;
  let ux=wz, uy=0, uz=-wx;
  const ul=Math.hypot(ux,uy,uz)||1; ux/=ul;uy/=ul;uz/=ul;
  const vx=wy*uz-wz*uy, vy=wz*ux-wx*uz, vz=wx*uy-wy*ux;
  const th=Math.tan(cfg.vfov*Math.PI/180/2), hh=th, hw=th*(W/H);
  const dux=2*hw*ux/W,duy=2*hw*uy/W,duz=2*hw*uz/W;
  const dvx=-2*hh*vx/H,dvy=-2*hh*vy/H,dvz=-2*hh*vz/H;
  CAM.ex=eye[0];CAM.ey=eye[1];CAM.ez=eye[2];
  CAM.px=eye[0]-wx-hw*ux+hh*vx+0.5*(dux+dvx);
  CAM.py=eye[1]-wy-hw*uy+hh*vy+0.5*(duy+dvy);
  CAM.pz=eye[2]-wz-hw*uz+hh*vz+0.5*(duz+dvz);
  CAM.dux=dux;CAM.duy=duy;CAM.duz=duz;CAM.dvx=dvx;CAM.dvy=dvy;CAM.dvz=dvz;
}

let RNG=mulberry32(1234567);
let _rx=0,_ry=0,_rz=0;
function randUnit(){
  for(let g=0;g<64;g++){
    const x=RNG()*2-1,y=RNG()*2-1,z=RNG()*2-1,s=x*x+y*y+z*z;
    if(s>1e-6&&s<1){const k=1/Math.sqrt(s);_rx=x*k;_ry=y*k;_rz=z*k;return;}
  }
  _rx=0;_ry=1;_rz=0;
}
function lerp(a,b,t){return a+(b-a)*t;}
const out3=[0,0,0];
let MAXDEPTH=8, LAMPON=false, NORMALMODE=false;
const PRUNE=true;

function rayColor(ox,oy,oz,dx,dy,dz){
  let ar=1,ag=1,ab=1;
  const dl0=Math.sqrt(dx*dx+dy*dy+dz*dz)||1; dx/=dl0;dy/=dl0;dz/=dl0;
  for(let depth=0;depth<MAXDEPTH;depth++){
    let best=Infinity,bi=-1;
    const a=dx*dx+dy*dy+dz*dz;
    for(let i=0;i<NS;i++){
      const lx=S.x[i]-ox, ly=S.y[i]-oy, lz=S.z[i]-oz, ri=S.r[i];
      const h=dx*lx+dy*ly+dz*lz;
      if(PRUNE){ if(h+ri<0) continue; if(h-ri>best) continue; }
      const c=lx*lx+ly*ly+lz*lz-ri*ri;
      const disc=h*h-a*c;
      if(disc<=0) continue;
      const sq=Math.sqrt(disc);
      let t=(h-sq)/a;
      if(t<=1e-3){t=(h+sq)/a; if(t<=1e-3) continue;}
      if(t<best){best=t;bi=i;}
    }
    if(bi<0){
      const t2=0.5*(dy+1), sky=LAMPON?0.13:1.0;
      out3[0]=ar*lerp(1.0,0.5,t2)*sky; out3[1]=ag*lerp(1.0,0.7,t2)*sky; out3[2]=ab*lerp(1.0,1.0,t2)*sky;
      return;
    }
    const i2=bi,t3=best;
    const hx=ox+t3*dx, hy=oy+t3*dy, hz=oz+t3*dz;
    let nx=(hx-S.x[i2])/S.r[i2], ny=(hy-S.y[i2])/S.r[i2], nz=(hz-S.z[i2])/S.r[i2];
    const mt=S.m[i2];
    if(NORMALMODE){ out3[0]=(nx+1)*0.5; out3[1]=(ny+1)*0.5; out3[2]=(nz+1)*0.5; return; }
    if(mt===3){ out3[0]=ar*S.a[i2]; out3[1]=ag*S.b[i2]; out3[2]=ab*S.c[i2]; return; }
    if(dx*nx+dy*ny+dz*nz>0){nx=-nx;ny=-ny;nz=-nz;}
    if(mt===0){
      randUnit();
      const tx=hx+nx+_rx,ty=hy+ny+_ry,tz=hz+nz+_rz;
      const l2=Math.sqrt(tx*tx+ty*ty+tz*tz);
      if(l2<1e-6){out3[0]=0;out3[1]=0;out3[2]=0;return;}
      dx=tx/l2;dy=ty/l2;dz=tz/l2;
      ox=hx+nx*1e-3;oy=hy+ny*1e-3;oz=hz+nz*1e-3;
      ar*=S.a[i2];ag*=S.b[i2];ab*=S.c[i2];
    } else if(mt===1){
      const dn=dx*nx+dy*ny+dz*nz;
      let rx=dx-2*dn*nx,ry=dy-2*dn*ny,rz=dz-2*dn*nz;
      if(S.fz[i2]>0){randUnit();rx+=S.fz[i2]*_rx;ry+=S.fz[i2]*_ry;rz+=S.fz[i2]*_rz;}
      const l3=Math.sqrt(rx*rx+ry*ry+rz*rz);
      if(l3<1e-6){out3[0]=0;out3[1]=0;out3[2]=0;return;}
      rx/=l3;ry/=l3;rz/=l3;
      if(rx*nx+ry*ny+rz*nz<=0){out3[0]=0;out3[1]=0;out3[2]=0;return;}
      dx=rx;dy=ry;dz=rz; ox=hx+nx*1e-3;oy=hy+ny*1e-3;oz=hz+nz*1e-3;
      ar*=S.a[i2];ag*=S.b[i2];ab*=S.c[i2];
    } else {
      const ior=S.io[i2];
      const gnx=(hx-S.x[i2])/S.r[i2],gny=(hy-S.y[i2])/S.r[i2],gnz=(hz-S.z[i2])/S.r[i2];
      const front=(dx*gnx+dy*gny+dz*gnz)<0;
      const etaRatio=front?(1.0/ior):ior;
      const cosTheta=Math.min(-(dx*nx+dy*ny+dz*nz),1.0);
      const sinTheta=Math.sqrt(Math.max(0,1-cosTheta*cosTheta));
      let refl=(etaRatio*sinTheta>1.0);
      if(!refl){ const r0=(1-ior)/(1+ior); const r02=r0*r0;
        if(r02+(1-r02)*Math.pow(1-cosTheta,5)>RNG()) refl=true; }
      let ox2,oy2,oz2;
      if(refl){ const dn2=dx*nx+dy*ny+dz*nz; ox2=dx-2*dn2*nx;oy2=dy-2*dn2*ny;oz2=dz-2*dn2*nz; }
      else { const ct=Math.min(-(dx*nx+dy*ny+dz*nz),1.0);
        const ppx=etaRatio*(dx+ct*nx),ppy=etaRatio*(dy+ct*ny),ppz=etaRatio*(dz+ct*nz);
        const par=-Math.sqrt(Math.abs(1-(ppx*ppx+ppy*ppy+ppz*ppz)));
        ox2=ppx+par*nx;oy2=ppy+par*ny;oz2=ppz+par*nz; }
      const l4=Math.sqrt(ox2*ox2+oy2*oy2+oz2*oz2);
      if(l4<1e-6){out3[0]=0;out3[1]=0;out3[2]=0;return;}
      dx=ox2/l4;dy=oy2/l4;dz=oz2/l4; ox=hx+nx*1e-3;oy=hy+ny*1e-3;oz=hz+nz*1e-3;
    }
  }
  out3[0]=0;out3[1]=0;out3[2]=0;
}

/* ---------- 渲染一张图 ---------- */
function render(file, W, H, cfg, sceneFn, spp, label){
  RNG = mulberry32(987654321);
  sceneFn();
  buildCam(cfg,W,H);
  const acc=new Float64Array(W*H*3);
  const t0=Date.now();
  for(let s=0;s<spp;s++){
    for(let j=0;j<H;j++) for(let i=0;i<W;i++){
      const du=RNG(), dv=RNG();
      const dx=CAM.px+(i+du)*CAM.dux+(j+dv)*CAM.dvx-CAM.ex;
      const dy=CAM.py+(i+du)*CAM.duy+(j+dv)*CAM.dvy-CAM.ey;
      const dz=CAM.pz+(i+du)*CAM.duz+(j+dv)*CAM.dvz-CAM.ez;
      rayColor(CAM.ex,CAM.ey,CAM.ez,dx,dy,dz);
      const k=(j*W+i)*3;
      acc[k]+=out3[0]; acc[k+1]+=out3[1]; acc[k+2]+=out3[2];
    }
  }
  const rgb=new Uint8Array(W*H*3);
  for(let p=0;p<W*H;p++){
    const k3=p*3;
    for(let ch=0;ch<3;ch++){
      const v=acc[k3+ch]/spp;
      rgb[k3+ch]=Math.max(0,Math.min(255,Math.round(Math.sqrt(Math.max(0,Math.min(1,v)))*255)));
    }
  }
  writePNG(file,W,H,rgb);
  console.log('  '+label.padEnd(28)+' '+W+'×'+H+'  '+String(spp).padStart(3)+' spp  '+
    String(Date.now()-t0).padStart(5)+' ms  球体 '+NS+'  → '+file);
}

const OUT=require('path').join(__dirname,'_preview_');
MAXDEPTH=8; LAMPON=false; NORMALMODE=false; BIGX=2.9;
[1.05, 2.4, 1.7].forEach(v=>{
  IOR5=v;
  render(OUT+'mats_ior'+v+'.png', 300, 200,
    {eye:[7.5,2.0,0.2], look:[0,0.78,0], vfov:46},
    ()=>buildMats(false), 96, '材质对比 第五颗 ior='+v);
});
// 经典场景用最终机位再渲一张确认
render(OUT+'final_classic.png', 300, 200,
  {eye:[13,2.0,3.0], look:[1.4,0.72,0], vfov:20},
  ()=>buildClassic(false), 96, '经典场景 最终机位 vfov20');
console.log('完成。');
