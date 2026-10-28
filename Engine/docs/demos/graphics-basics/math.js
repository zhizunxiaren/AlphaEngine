/* 原创教学计算；与具体图形 API 的坐标约定分开。 */
(function (root) {
  'use strict';
  const M = {
    clamp: (x, a=0, b=1) => Math.max(a, Math.min(b, x)),
    dot: (a,b) => a.reduce((s,v,i)=>s+v*b[i],0),
    cross: (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    normalize(a) { const n=Math.hypot(...a); return n>1e-12?a.map(v=>v/n):a.map(()=>0); },
    bary(p,a,b,c) {
      const det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
      if(Math.abs(det)<1e-12)return null;
      const u=((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/det;
      const v=((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/det;
      return [u,v,1-u-v];
    },
    inside(w) { return !!w && w.every(v=>v>=-1e-9); },
    transform(p,angle,scale,tx,order='RT') {
      const c=Math.cos(angle),s=Math.sin(angle);
      const [x,y]=order==='TR'?[p[0]+tx,p[1]]:p;
      const q=[scale*(c*x-s*y),scale*(s*x+c*y)];
      if(order==='RT')q[0]+=tx;
      return q;
    },
    project(x,z,fov) { return x/(z*Math.tan(fov*Math.PI/360)); },
    reflect(d,n) {const k=2*M.dot(d,n);return d.map((v,i)=>v-k*n[i]);},
    sphere(o,d,c,r) {
      const oc=o.map((v,i)=>v-c[i]),a=M.dot(d,d),h=M.dot(oc,d),k=M.dot(oc,oc)-r*r;
      const disc=h*h-a*k;
      if(a===0||disc<0)return [];
      const s=Math.sqrt(disc);return [(-h-s)/a,(-h+s)/a];
    },
    refract(theta,n1,n2) {
      const s=n1/n2*Math.sin(theta);
      return Math.abs(s)>1?null:Math.asin(s);
    },
    linearToSrgb(x) {x=Math.max(0,x);return x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055;},
    srgbToLinear(x) {return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);},
    over(a,b,alpha) {return a.map((v,i)=>v*alpha+b[i]*(1-alpha));},
    noise(seed) {let n=seed|0;return ()=>{n=(Math.imul(1664525,n)+1013904223)|0;return (n>>>0)/4294967296;};},
    perspective(weights,attrs,ws) {
      const denom=weights.reduce((s,v,i)=>s+v/ws[i],0);
      return weights.reduce((s,v,i)=>s+v*attrs[i]/ws[i],0)/denom;
    }
  };
  root.GraphicsMath=M;
  if(typeof module!=='undefined')module.exports=M;
})(typeof globalThis!=='undefined'?globalThis:this);
