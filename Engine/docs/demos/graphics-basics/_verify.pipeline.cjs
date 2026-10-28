const assert=require('node:assert/strict');
function verify(K){
  const passed=[];
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`),vec=(a,b)=>{assert.equal(a.length,b.length);a.forEach((x,i)=>near(x,b[i]));};
  function test(name,f){try{f();passed.push(name);}catch(e){throw Error(`${name}: ${e.message}`);}}
  const vertex=(label,pos,color=[.2,.3,.4])=>({label,pos,color});
  const triangle=[vertex('A',[-.5,-.5,.5,1],[1,0,0]),vertex('B',[-.5,.5,.5,1],[0,1,0]),vertex('C',[2,0,.5,1],[0,0,1])];
  test('矩阵作用于列向量',()=>vec(K.mul([[1,0,0,2],[0,1,0,3],[0,0,1,4],[0,0,0,1]],[1,2,3,1]),[3,5,7,1]));
  test('齐次右平面裁剪的独立交点',()=>{const p=K.clip(triangle);assert.equal(p.length,4);vec(p[2].pos,[1,.2,.5,1]);vec(p[3].pos,[1,-.2,.5,1]);});
  test('裁剪插值属性',()=>{const p=K.clip(triangle);vec(p[2].color,[0,.4,.6]);vec(p[3].color,[.4,0,.6]);});
  test('六平面全部生效与完全排除',()=>{for(const pos of [[-2,0,.5,1],[2,0,.5,1],[0,-2,.5,1],[0,2,.5,1],[0,0,-.5,1],[0,0,1.5,1]]){const p=K.clip([vertex('A',pos),vertex('B',[0,.1,.5,1]),vertex('C',[.1,0,.5,1])]);assert.ok(p.every(v=>K.planes.every(f=>f(v.pos)>=-1e-8)));}assert.equal(K.clip([vertex('A',[2,0,.5,1]),vertex('B',[3,1,.5,1]),vertex('C',[3,-1,.5,1])]).length,0);});
  test('视口 Y 翻转与边界',()=>{vec(K.viewport([-1,1,0]),[0,0,0]);vec(K.viewport([1,-1,1]),[64,40,1]);});
  test('透视属性独立比例',()=>{const vs=[vertex('A',[0,0,0,1],[1,0,0]),vertex('B',[0,0,0,2],[0,1,0]),vertex('C',[0,0,0,4],[0,0,1])];vec(K.interpolate([1/3,1/3,1/3],vs),[4/7,2/7,1/7]);});
  test('四边形扇形无重复片元',()=>{const rect=[[-1,-1],[1,-1],[1,1],[-1,1]].map((p,i)=>vertex(String(i),[...p,.5,1]));const f=K.rasterize(rect,4,4).fragments;assert.equal(f.length,16);assert.equal(new Set(f.map(p=>`${p.x},${p.y}`)).size,16);});
  test('透视插值与深度插值区别',()=>{const vs=[vertex('A',[-1,-1,1,1],[1,0,0]),vertex('B',[2,-2,.4,2],[0,1,0]),vertex('C',[-4,4,2,4],[0,0,1])];const f=K.rasterize(vs,4,4).fragments.find(f=>f.x===0&&f.y===1);assert.ok(f);near(f.depth,.5875);vec(f.color,[8/15,2/15,5/15]);});
  test('覆盖拒绝三角形外采样',()=>{const vs=[vertex('A',[-1,-1,.5,1]),vertex('B',[1,-1,.5,1]),vertex('C',[-1,1,.5,1])];const f=K.rasterize(vs,4,4).fragments;assert.equal(f.length,10);assert.ok(!f.some(f=>f.x===3&&f.y===0));});
  test('深度比较胜负与等深',()=>{assert.equal(K.depthPass(.3,.45),true);assert.equal(K.depthPass(.7,.45),false);assert.equal(K.depthPass(.45,.45),false);});
  test('完整场景的可见几何与关闭越界',()=>{const s=K.build(true),inside=K.build(false);assert.equal(s.clipped.length,4);assert.equal(inside.clipped.length,3);assert.ok(s.fragments.length>100);assert.ok(s.fragments.every(f=>f.depth>=0&&f.depth<=1));assert.equal(s.probe.x,47);assert.equal(s.probe.y,23);assert.ok(s.probe.depth>.45);assert.ok(s.clipInput[2].pos[0]>s.clipInput[2].pos[3]);});
  return passed;
}
module.exports=verify;
if(require.main===module)console.log(`PASS: ${verify(require('./pipeline-math.js')).length} 组管线独立真值。`);
