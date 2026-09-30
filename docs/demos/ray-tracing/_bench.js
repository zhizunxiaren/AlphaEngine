/* 性能基准：用最终参数实测「一轮完整采样」耗时，决定分辨率与小球数量。
   与本文件将写入 index.html 的 rayColor 保持逐行一致（含 h−r>best 剪枝）。 */
function mulberry32(a){return function(){a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

const S={x:[],y:[],z:[],r:[],m:[],a:[],b:[],c:[],fz:[],io:[]};
let NS=0;
function add(x,y,z,r,m,ar,bg,bb,fz,io){S.x.push(x);S.y.push(y);S.z.push(z);S.r.push(r);S.m.push(m);S.a.push(ar);S.b.push(bg);S.c.push(bb);S.fz.push(fz||0);S.io.push(io||1.5);}

function buildScene(){
  S.x.length=0;S.y.length=0;S.z.length=0;S.r.length=0;S.m.length=0;
  S.a.length=0;S.b.length=0;S.c.length=0;S.fz.length=0;S.io.length=0;
  const rnd=mulberry32(20260922);
  // 三颗大球放前面（让 best 尽快变小，剪枝更有效）
  add(-2.9,1.0,0,1.0,0, 0.62,0.30,0.22,0,1.5);
  add( 0.0,1.0,0,1.0,2, 1,1,1,0,1.50);
  add( 2.9,1.0,0,1.0,1, 0.86,0.86,0.90,0.04,1.5);
  const X0=-9.5,X1=5.5,Z0=-7.5,Z1=3.5,STEP=1.3;
  for(let cx=X0; cx<=X1+1e-9; cx+=STEP){
    for(let cz=Z0; cz<=Z1+1e-9; cz+=STEP){
      const px=cx+(rnd()-0.5)*0.5, pz=cz+(rnd()-0.5)*0.5;
      if(Math.hypot(px+2.9,pz)<1.55) continue;
      if(Math.hypot(px,pz)<1.55) continue;
      if(Math.hypot(px-2.9,pz)<1.55) continue;
      const rr=rnd(), cr=rnd(), cg=rnd(), cb=rnd();
      if(rr<0.62)      add(px,0.2,pz,0.2,0, cr,cg,cb,0,1.5);
      else if(rr<0.88) add(px,0.2,pz,0.2,1, 0.5+0.5*cr,0.5+0.5*cg,0.5+0.5*cb,0.25*rnd(),1.5);
      else             add(px,0.2,pz,0.2,2, 1,1,1,0,1.5);
    }
  }
  add(0,-1000,0,1000, 0, 0.60,0.60,0.57,0,1.5);   // 地面放最后
  NS=S.x.length;
}

const CAM={};
function buildCam(aspect,W,H){
  const ex=13,ey=2.0,ez=3.0, tx=1.4,ty=0.7,tz=0;
  let wx=ex-tx,wy=ey-ty,wz=ez-tz;
  const L=Math.hypot(wx,wy,wz); wx/=L;wy/=L;wz/=L;
  let ux=wz,uy=0,uz=-wx;
  const ul=Math.hypot(ux,uy,uz)||1; ux/=ul;uy/=ul;uz/=ul;
  const vx=wy*uz-wz*uy, vy=wz*ux-wx*uz, vz=wx*uy-wy*ux;
  const th=Math.tan(16*Math.PI/180/2), hh=th, hw=th*aspect;
  const dux=2*hw*ux/W,duy=2*hw*uy/W,duz=2*hw*uz/W;
  const dvx=-2*hh*vx/H,dvy=-2*hh*vy/H,dvz=-2*hh*vz/H;
  CAM.ex=ex;CAM.ey=ey;CAM.ez=ez;
  CAM.px=ex-wx-hw*ux+hh*vx+0.5*(dux+dvx);
  CAM.py=ey-wy-hw*uy+hh*vy+0.5*(duy+dvy);
  CAM.pz=ez-wz-hw*uz+hh*vz+0.5*(duz+dvz);
  CAM.dux=dux;CAM.duy=duy;CAM.duz=duz;CAM.dvx=dvx;CAM.dvy=dvy;CAM.dvz=dvz;
}

const RNG=mulberry32(1234567);
let _rx=0,_ry=0,_rz=0;
function randUnit(){
  for(let g=0;g<64;g++){
    const x=RNG()*2-1,y=RNG()*2-1,z=RNG()*2-1;
    const s=x*x+y*y+z*z;
    if(s>1e-6&&s<1){const k=1/Math.sqrt(s);_rx=x*k;_ry=y*k;_rz=z*k;return;}
  }
  _rx=0;_ry=1;_rz=0;
}

const PRUNE = process.argv[2] !== 'noprune';
const MAXDEPTH = 8;
const out3=[0,0,0];

function rayColor(ox,oy,oz,dx,dy,dz){
  let ar=1,ag=1,ab=1;
  const dl0=Math.sqrt(dx*dx+dy*dy+dz*dz)||1; dx/=dl0;dy/=dl0;dz/=dl0;
  for(let depth=0;depth<MAXDEPTH;depth++){
    let best=Infinity,bi=-1;
    const a=dx*dx+dy*dy+dz*dz;
    for(let i=0;i<NS;i++){
      const lx=S.x[i]-ox, ly=S.y[i]-oy, lz=S.z[i]-oz;
      const ri=S.r[i];
      const h=dx*lx+dy*ly+dz*lz;
      if(PRUNE){
        if(h+ri<0) continue;
        if(h-ri>best) continue;
      }
      const c=lx*lx+ly*ly+lz*lz-ri*ri;
      const disc=h*h-a*c;
      if(disc<=0) continue;
      const sq=Math.sqrt(disc);
      let t=(h-sq)/a;
      if(t<=1e-3){t=(h+sq)/a; if(t<=1e-3) continue;}
      if(t<best){best=t;bi=i;}
    }
    if(bi<0){
      const t2=0.5*(dy+1);
      out3[0]=ar*lerp(1.0,0.5,t2); out3[1]=ag*lerp(1.0,0.7,t2); out3[2]=ab*lerp(1.0,1.0,t2);
      return;
    }
    const i2=bi, t3=best;
    const hx=ox+t3*dx, hy=oy+t3*dy, hz=oz+t3*dz;
    let nx=(hx-S.x[i2])/S.r[i2], ny=(hy-S.y[i2])/S.r[i2], nz=(hz-S.z[i2])/S.r[i2];
    const mt=S.m[i2];
    if(mt===3){ out3[0]=ar*S.a[i2]; out3[1]=ag*S.b[i2]; out3[2]=ab*S.c[i2]; return; }
    if(dx*nx+dy*ny+dz*nz>0){nx=-nx;ny=-ny;nz=-nz;}
    if(mt===0){
      randUnit();
      const tx=hx+nx+_rx, ty=hy+ny+_ry, tz=hz+nz+_rz;
      const l2=Math.sqrt(tx*tx+ty*ty+tz*tz);
      if(l2<1e-6){out3[0]=0;out3[1]=0;out3[2]=0;return;}
      dx=tx/l2;dy=ty/l2;dz=tz/l2;
      ox=hx+nx*1e-3;oy=hy+ny*1e-3;oz=hz+nz*1e-3;
      ar*=S.a[i2]; ag*=S.b[i2]; ab*=S.c[i2];
    } else if(mt===1){
      const dn=dx*nx+dy*ny+dz*nz;
      let rx=dx-2*dn*nx, ry=dy-2*dn*ny, rz=dz-2*dn*nz;
      if(S.fz[i2]>0){ randUnit(); rx+=S.fz[i2]*_rx; ry+=S.fz[i2]*_ry; rz+=S.fz[i2]*_rz; }
      const l3=Math.sqrt(rx*rx+ry*ry+rz*rz);
      if(l3<1e-6){out3[0]=0;out3[1]=0;out3[2]=0;return;}
      rx/=l3;ry/=l3;rz/=l3;
      if(rx*nx+ry*ny+rz*nz<=0){out3[0]=0;out3[1]=0;out3[2]=0;return;}
      dx=rx;dy=ry;dz=rz;
      ox=hx+nx*1e-3;oy=hy+ny*1e-3;oz=hz+nz*1e-3;
      ar*=S.a[i2]; ag*=S.b[i2]; ab*=S.c[i2];
    } else {
      const ior=S.io[i2];
      const gnx=(hx-S.x[i2])/S.r[i2], gny=(hy-S.y[i2])/S.r[i2], gnz=(hz-S.z[i2])/S.r[i2];
      const front=(dx*gnx+dy*gny+dz*gnz)<0;
      const etaRatio=front?(1.0/ior):ior;
      const cosTheta=Math.min(-(dx*nx+dy*ny+dz*nz),1.0);
      const sinTheta=Math.sqrt(Math.max(0,1-cosTheta*cosTheta));
      let refl=(etaRatio*sinTheta>1.0);
      if(!refl){
        const r0=(1-ior)/(1+ior); const r02=r0*r0;
        if(r02+(1-r02)*Math.pow(1-cosTheta,5)>RNG()) refl=true;
      }
      let ox2,oy2,oz2;
      if(refl){
        const dn2=dx*nx+dy*ny+dz*nz;
        ox2=dx-2*dn2*nx; oy2=dy-2*dn2*ny; oz2=dz-2*dn2*nz;
      } else {
        const ct=Math.min(-(dx*nx+dy*ny+dz*nz),1.0);
        const ppx=etaRatio*(dx+ct*nx), ppy=etaRatio*(dy+ct*ny), ppz=etaRatio*(dz+ct*nz);
        const par=-Math.sqrt(Math.abs(1-(ppx*ppx+ppy*ppy+ppz*ppz)));
        ox2=ppx+par*nx; oy2=ppy+par*ny; oz2=ppz+par*nz;
      }
      const l4=Math.sqrt(ox2*ox2+oy2*oy2+oz2*oz2);
      if(l4<1e-6){out3[0]=0;out3[1]=0;out3[2]=0;return;}
      dx=ox2/l4;dy=oy2/l4;dz=oz2/l4;
      ox=hx+nx*1e-3;oy=hy+ny*1e-3;oz=hz+nz*1e-3;
    }
  }
  out3[0]=0;out3[1]=0;out3[2]=0;
}
function lerp(a,b,t){return a+(b-a)*t;}

buildScene();
console.log('场景球体数 NS = '+NS+'   (三颗大球 + 小球 + 地面)');
console.log('剪枝: '+(PRUNE?'开':'关')+'\n');

const acc=new Float64Array(3);
[['120 ',120],['160 ',160],['180 ',180],['200 ',200],['260 ',260]].forEach(([tag,W])=>{
  const H=Math.round(W/1.5);
  buildCam(W/H,W,H);
  // 预热
  for(let k=0;k<W*8;k++){
    const i=k%W, j=0;
    rayColor(CAM.ex,CAM.ey,CAM.ez,
      CAM.px+i*CAM.dux+j*CAM.dvx-CAM.ex,
      CAM.py+i*CAM.duy+j*CAM.dvy-CAM.ey,
      CAM.pz+i*CAM.duz+j*CAM.dvz-CAM.ez);
  }
  const N=W*H;
  const t0=Date.now();
  for(let p=0;p<N;p++){
    const i=p%W, j=(p/W)|0;
    rayColor(CAM.ex,CAM.ey,CAM.ez,
      CAM.px+i*CAM.dux+j*CAM.dvx-CAM.ex,
      CAM.py+i*CAM.duy+j*CAM.dvy-CAM.ey,
      CAM.pz+i*CAM.duz+j*CAM.dvz-CAM.ez);
  }
  const ms=Date.now()-t0;
  console.log('  '+tag+'× '+String(H).padStart(3)+'  = '+String(N).padStart(6)+' px   一轮耗时 '+
    String(ms).padStart(5)+' ms   →  '+ (1000/ms).toFixed(1).padStart(5) +' 轮/秒'+
    '   30 秒可得 '+Math.round(30000/ms)+' 轮');
});
