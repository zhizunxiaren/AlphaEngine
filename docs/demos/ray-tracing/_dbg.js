/* 补标定：同时约束水平与垂直，确保三颗大球完整入画（不裁顶） */
function makeCam(cfg,W,H){
  const eye=cfg.eye, look=cfg.look;
  let wx=eye[0]-look[0], wy=eye[1]-look[1], wz=eye[2]-look[2];
  const L=Math.hypot(wx,wy,wz); wx/=L;wy/=L;wz/=L;
  let ux=wz,uy=0,uz=-wx;
  const ul=Math.hypot(ux,uy,uz)||1; ux/=ul;uy/=ul;uz/=ul;
  const vx=wy*uz-wz*uy, vy=wz*ux-wx*uz, vz=wx*uy-wy*ux;
  const th=Math.tan(cfg.vfov*Math.PI/180/2), hh=th, hw=th*(W/H);
  const dux=2*hw*ux/W,duy=2*hw*uy/W,duz=2*hw*uz/W;
  const dvx=-2*hh*vx/H,dvy=-2*hh*vy/H,dvz=-2*hh*vz/H;
  return {eye,px:eye[0]-wx-hw*ux+hh*vx+0.5*(dux+dvx),
    py:eye[1]-wy-hw*uy+hh*vy+0.5*(duy+dvy),
    pz:eye[2]-wz-hw*uz+hh*vz+0.5*(duz+dvz),dux,duy,duz,dvx,dvy,dvz};
}
function dirOf(c,i,j){return [c.px+i*c.dux+j*c.dvx-c.eye[0], c.py+i*c.duy+j*c.dvy-c.eye[1], c.pz+i*c.duz+j*c.dvz-c.eye[2]];}
function hitT(O,D,C,r){
  const lx=C[0]-O[0],ly=C[1]-O[1],lz=C[2]-O[2];
  const a=D[0]*D[0]+D[1]*D[1]+D[2]*D[2];
  const h=D[0]*lx+D[1]*ly+D[2]*lz;
  const cc=lx*lx+ly*ly+lz*lz-r*r;
  const disc=h*h-a*cc; if(disc<=0) return NaN;
  const sq=Math.sqrt(disc); let t=(h-sq)/a;
  if(t<=1e-3){t=(h+sq)/a; if(t<=1e-3) return NaN;}
  return t;
}
const W=300,H=200;                 // 预览图尺寸
const S3=[[-2.9,1,0],[0,1,0],[2.9,1,0]];

function measure(cfg){
  const c=makeCam(cfg,W,H);
  const sp=S3.map(S=>{
    let imn=1e9,imx=-1e9,jmn=1e9,jmx=-1e9;
    for(let j=0;j<H;j++)for(let i=0;i<W;i++){
      if(!isNaN(hitT(c.eye,dirOf(c,i,j),S,1))){
        if(i<imn)imn=i; if(i>imx)imx=i; if(j<jmn)jmn=j; if(j>jmx)jmx=j;
      }
    }
    return {imn,imx,jmn,jmx,ok:imx>=0};
  });
  return sp;
}

console.log('=== 经典场景构图复检（W='+W+' H='+H+'）===');
console.log('要求：三球完整入画（上下左右都有余量）+ 左右均衡 + 占比合理\n');

const cands=[];
[16,19,22,25,28].forEach(vfov=>{
  [0.55,0.7,0.85].forEach(ly=>{
    [1.4,1.0,0.6].forEach(lx=>{
      cands.push({eye:[13,2.0,3.0], look:[lx,ly,0], vfov});
    });
  });
});

let best=null;
cands.forEach(cfg=>{
  const sp=measure(cfg);
  const allOk = sp.every(s=>s.ok && s.imn>=4 && s.imx<=W-5 && s.jmn>=4 && s.jmx<=H-5);
  if(!allOk) return;
  const L=sp[0].imn, R=sp[2].imx;
  const fill=(R-L)/W, bal=Math.abs(L-(W-1-R));
  const topMin=Math.min(...sp.map(s=>s.jmn)), botMax=Math.max(...sp.map(s=>s.jmx));
  const vfill=(botMax-topMin)/H;
  const score = bal*2 + Math.abs(fill-0.80)*300 + Math.abs(vfill-0.78)*300;
  const rec={cfg,sp,L,R,fill,bal,vfill,topMin,botMax,score};
  if(!best||score<best.score) best=rec;
});

if(!best){ console.log('❌ 无候选满足「完整入画」'); process.exit(1); }
console.log('>>> 最优参数');
console.log('    eye   = ['+best.cfg.eye.join(', ')+']');
console.log('    lookat= ['+best.cfg.look.join(', ')+']');
console.log('    vfov  = '+best.cfg.vfov+'°');
console.log('    水平：三球 i∈['+best.L+','+best.R+']  左留白 '+best.L+'px  右留白 '+(W-1-best.R)+
            'px  占比 '+(best.fill*100).toFixed(0)+'%');
console.log('    垂直：三球 j∈['+best.topMin+','+best.botMax+']  上留白 '+best.topMin+
            'px  下留白 '+(H-1-best.botMax)+'px  占比 '+(best.vfill*100).toFixed(0)+'%');
console.log('    各球框: '+best.sp.map(s=>'['+s.imn+','+s.imx+']×['+s.jmn+','+s.jmx+']').join('  '));

console.log('\n周边参数对比（看鲁棒性）:');
cands.forEach(cfg=>{
  const sp=measure(cfg);
  const allOk=sp.every(s=>s.ok&&s.imn>=4&&s.imx<=W-5&&s.jmn>=4&&s.jmx<=H-5);
  if(!allOk) return;
  const L=sp[0].imn,R=sp[2].imx;
  const dm=Math.abs(cfg.vfov-best.cfg.vfov)+Math.abs(cfg.look[0]-best.cfg.look[0])*10+Math.abs(cfg.look[1]-best.cfg.look[1])*10;
  if(dm<4.5){
    console.log('  vfov='+String(cfg.vfov).padStart(2)+'° lookat=('+cfg.look[0].toFixed(1)+','+cfg.look[1].toFixed(2)+
      ')  占比='+(((R-L)/W)*100).toFixed(0)+'%  左右差='+Math.abs(L-(W-1-R))+'px  '+
      '上留白='+Math.min(...sp.map(s=>s.jmn))+'px');
  }
});
