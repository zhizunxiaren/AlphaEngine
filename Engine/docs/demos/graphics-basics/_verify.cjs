// 独立真值：使用已知几何案例，不以复制页面算法作为期望值。
const assert=require('node:assert/strict');
const path=require('node:path');
function verify(M){
  const tests=[];
  const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
  const vec=(a,b)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>near(v,b[i]));};
  const test=(name,fn)=>{try{fn();tests.push(name);}catch(e){throw new Error(`${name}: ${e.message}`);}};
  test('点积正交与缩放',()=>{near(M.dot([2,0,0],[0,3,0]),0);near(M.dot([2,0,0],[3,0,0]),6);});
  test('叉积方向与面积',()=>{vec(M.cross([2,0,0],[0,3,0]),[0,0,6]);vec(M.cross([0,3,0],[2,0,0]),[0,0,-6]);});
  test('归一化与零向量守卫',()=>{vec(M.normalize([3,4,0]),[.6,.8,0]);vec(M.normalize([0,0,0]),[0,0,0]);});
  test('重心坐标与退化三角形',()=>{vec(M.bary([1,1],[0,0],[4,0],[0,4]),[.5,.25,.25]);assert.equal(M.bary([1,0],[0,0],[1,0],[2,0]),null);});
  test('覆盖内外边界',()=>{assert.equal(M.inside([.5,.2,.3]),true);assert.equal(M.inside([1.2,-.2,0]),false);assert.equal(M.inside(null),false);});
  test('变换不可交换',()=>{vec(M.transform([1,0],Math.PI/2,2,1,'RT'),[1,2]);vec(M.transform([1,0],Math.PI/2,2,1,'TR'),[0,4]);});
  test('透视深度与 FOV',()=>{near(M.project(1,2,90),.5);near(M.project(1,4,90),.25);});
  test('镜面反射长度与方向',()=>{vec(M.reflect([.6,-.8],[0,1]),[.6,.8]);});
  test('求交最近根与非单位方向',()=>{vec(M.sphere([0,0,-3],[0,0,1],[0,0,0],1),[2,4]);vec(M.sphere([0,0,-3],[0,0,2],[0,0,0],1),[1,2]);assert.equal(M.sphere([0,0,-3],[0,1,0],[0,0,0],1).length,0);});
  test('球内与退化方向',()=>{vec(M.sphere([0,0,0],[1,0,0],[0,0,0],1),[-1,1]);assert.equal(M.sphere([0,0,0],[0,0,0],[0,0,0],1).length,0);});
  test('折射与全反射',()=>{near(M.refract(Math.PI/6,1,1.5),Math.asin(1/3));assert.equal(M.refract(Math.PI/3,1.5,1),null);});
  test('标准 sRGB 编码',()=>{near(M.linearToSrgb(.5),.7353569830524495);near(M.linearToSrgb(.001),.01292);});
  test('标准 sRGB 解码',()=>{near(M.srgbToLinear(.5),.21404114048223255);near(M.srgbToLinear(.01292),.001);});
  test('透明混合次序',()=>{vec(M.over([1,0,0],[0,0,1],.25),[.25,0,.75]);vec(M.over([0,0,1],[1,0,0],.25),[.75,0,.25]);});
  test('透视属性校正',()=>near(M.perspective([.5,.5,0],[0,1,1],[1,2,3]),1/3));
  test('确定性随机数范围',()=>{const a=M.noise(7),b=M.noise(7);let first;for(let i=0;i<100;i++){const x=a();if(i===0)first=x;near(x,b());assert.ok(x>=0&&x<1);}assert.notEqual(first,a());});
  return tests;
}
module.exports=verify;
if(require.main===module){const tests=verify(require(path.join(__dirname,'math.js')));console.log(`PASS: ${tests.length} 组独立数学真值。`);}
