// 每个真值组配一个可触发失败的缺陷；无害控制组必须通过。
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const verify=require('./_verify.cjs'),{checkContent}=require('./_check.cjs');
const original=fs.readFileSync(path.join(__dirname,'math.js'),'utf8');
function load(s){const scope={module:{exports:{}}};vm.runInNewContext(s,scope);return scope.module.exports;}
const mutations=[
 ['点积','s+v*b[i]','s+v+b[i]'],
 ['叉积','a[0]*b[1]-a[1]*b[0]','a[1]*b[0]-a[0]*b[1]'],
 ['归一化','a.map(v=>v/n)','a.map(v=>v/(2*n))'],
 ['重心','return [u,v,1-u-v]','return [v,u,1-u-v]'],
 ['覆盖','v>=-1e-9','v>=-1'],
 ['顺序',"if(order==='RT')q[0]+=tx","if(order==='TR')q[0]+=tx"],
 ['投影','x/(z*Math.tan','x/(2*z*Math.tan'],
 ['反射','const k=2*M.dot','const k=M.dot'],
 ['求交','(-h-s)/a','(-h+s)/a'],
 ['退化射线','if(a===0||disc<0)','if(disc<0)'],
 ['全反射','Math.abs(s)>1?null','Math.abs(s)>2?null'],
 ['编码','1/2.4','1/2.2'],
 ['解码',',2.4)',',2.2)'],
 ['混合','v*alpha+b[i]*(1-alpha)','v*(1-alpha)+b[i]*alpha'],
 ['透视插值','s+v*attrs[i]/ws[i]','s+v*attrs[i]'],
 ['随机范围','(n>>>0)/4294967296','(n>>>0)/2147483648']
];
verify(load(original+'\n// 无害控制组：仅增加注释。\n'));
for(const [label,from,to] of mutations){assert.ok(original.includes(from),`变异锚点丢失：${label}`);assert.throws(()=>verify(load(original.replace(from,to))),undefined,`未检出：${label}`);}
const scope={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'content.js'),'utf8'),scope);
const C=scope.window.GraphicsContent;checkContent(C);const bad=JSON.parse(JSON.stringify(C));bad.lessons[0].hint='';assert.throws(()=>checkContent(bad));
const pipeline=fs.readFileSync(path.join(__dirname,'pipeline-math.js'),'utf8'),verifyPipeline=require('./_verify.pipeline.cjs');
const pipelineMutations=[
 ['矩阵','dot(row,v)','dot(row,v)+1'],
 ['裁剪右平面','v=>v[3]-v[0]','v=>v[3]+v[0]'],
 ['裁剪交点','da/(da-db)','db/(da-db)'],
 ['裁剪属性','color:mix(a.color,b.color,t)','color:a.color'],
 ['视口Y','(1-p[1])*height/2','(1+p[1])*height/2'],
 ['透视属性','s+v/vertices[i].pos[3]','s+v'],
 ['重复片元','indices});break','indices});continue'],
 ['深度插值','s+v*points[j][2]','s+v*points[j][2]*2'],
 ['覆盖判断','v<-1e-9','v<-1'],
 ['深度比较','incoming<stored','incoming>stored'],
 ['场景越界','outside?2.2:.9','outside?.9:.9']
];
verifyPipeline(load(pipeline+'\n// 无害控制组\n'));
for(const [label,from,to] of pipelineMutations){assert.ok(pipeline.includes(from),`管线变异锚点丢失：${label}`);assert.throws(()=>verifyPipeline(load(pipeline.replace(from,to))),undefined,`未检出管线缺陷：${label}`);}
console.log(`PASS: ${mutations.length} 个基础数学 + ${pipelineMutations.length} 个管线缺陷 + 1 个内容缺陷均检出；两组无害控制通过。`);
