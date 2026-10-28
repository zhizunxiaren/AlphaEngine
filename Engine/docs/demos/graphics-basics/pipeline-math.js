/* 可独立验证的教学管线：+Z 向前，列向量，0<=zclip<=wclip。 */
(function(root){
  'use strict';
  const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  const mul=(m,v)=>m.map(row=>dot(row,v));
  const planes=[v=>v[3]+v[0],v=>v[3]-v[0],v=>v[3]+v[1],v=>v[3]-v[1],v=>v[2],v=>v[3]-v[2]];
  function clip(vertices){
    let polygon=vertices.map(v=>({...v,pos:[...v.pos],color:[...v.color]})),serial=0;
    for(const distance of planes){
      const next=[];
      for(let i=0;i<polygon.length;i++){
        const a=polygon[i],b=polygon[(i+1)%polygon.length],da=distance(a.pos),db=distance(b.pos),inA=da>=0,inB=db>=0;
        if(inA)next.push(a);
        if(inA!==inB){const t=da/(da-db);next.push({pos:mix(a.pos,b.pos,t),color:mix(a.color,b.color,t),label:`I${++serial}`,generated:true,edge:[a.label,b.label],t,from:inA?b.pos:a.pos});}
      }
      polygon=next;
    }
    return polygon;
  }
  function bary(p,a,b,c){const d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(d)<1e-12)return null;const u=((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/d,v=((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/d;return [u,v,1-u-v];}
  function interpolate(weights,vertices){const denominator=weights.reduce((s,v,i)=>s+v/vertices[i].pos[3],0);return [0,1,2].map(k=>weights.reduce((s,v,i)=>s+v*vertices[i].color[k]/vertices[i].pos[3],0)/denominator);}
  function viewport(p,width=64,height=40){return [(p[0]+1)*width/2,(1-p[1])*height/2,p[2]];}
  function rasterize(polygon,width=64,height=40){
    const ndc=polygon.map(v=>v.pos.slice(0,3).map(x=>x/v.pos[3])),screen=ndc.map(p=>viewport(p,width,height)),fragments=[];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      for(let i=1;i<polygon.length-1;i++){
        const indices=[0,i,i+1],points=indices.map(j=>screen[j]),weights=bary([x+.5,y+.5],...points);
        if(!weights||weights.some(v=>v<-1e-9))continue;
        const depth=weights.reduce((s,v,j)=>s+v*points[j][2],0),vertices=indices.map(j=>polygon[j]);
        fragments.push({x,y,weights,depth,color:interpolate(weights,vertices),indices});break;
      }
    }
    return {ndc,screen,fragments,width,height};
  }
  function depthPass(incoming,stored){return incoming<stored;}
  function build(outside=true){
    const angle=.12,c=Math.cos(angle),s=Math.sin(angle),cy=Math.cos(.25),sy=Math.sin(.25);
    const M=[[c*cy,-s,c*sy,.45],[s*cy,c,s*sy,.1],[-sy,0,cy,2.3],[0,0,0,1]];
    const V=[[1,0,0,-.25],[0,1,0,-.1],[0,0,1,.4],[0,0,0,1]];
    const near=1,far=8,fx=1/Math.tan(35*Math.PI/180),fy=fx*1.6;
    const P=[[fx,0,0,0],[0,fy,0,0],[0,0,far/(far-near),-near*far/(far-near)],[0,0,1,0]];
    const model=[{label:'A',pos:[-.85,-.65,0,1],color:[.08,.22,.85]},{label:'B',pos:[-.15,.95,.8,1],color:[.85,.12,.08]},{label:'C',pos:[outside?2.2:.9,-.55,0,1],color:[.9,.55,.04]}];
    const transform=(vs,m)=>vs.map(v=>({...v,pos:mul(m,v.pos)}));
    const world=transform(model,M),view=transform(world,V),clipInput=transform(view,P),clipped=clip(clipInput),raster=rasterize(clipped);
    const probe=raster.fragments.reduce((best,f)=>!best||Math.hypot(f.x-47,f.y-23)<Math.hypot(best.x-47,best.y-23)?f:best,null);
    return {M,V,P,model,world,view,clipInput,clipped,probe,...raster};
  }
  const api={mix,mul,clip,bary,interpolate,viewport,rasterize,depthPass,build,planes};
  root.RasterPipelineMath=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
