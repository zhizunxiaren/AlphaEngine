const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function checkContent(C){
  assert.equal(C.lessons.length,12,'基础篇必须有 12 章');
  assert.equal(new Set(C.lessons.map(l=>l.id)).size,12,'章节 ID 必须唯一');
  for(const l of C.lessons){
    for(const field of ['id','name','title','lead','intuition','analogy','boundary','memory','hint','pitfall'])assert.ok(typeof l[field]==='string'&&l[field].length>0,`${l.id} 缺少 ${field}`);
    assert.ok(l.concepts.length>=4,`${l.id} 缺少概念`);assert.ok(l.flow.length>=4,`${l.id} 缺少流程`);
    l.flow.forEach(f=>assert.ok(f.length===3&&f.every(Boolean),'流程必须有步骤、数据流、说明'));
    assert.ok(l.quiz[2]>=0&&l.quiz[2]<l.quiz[1].length,'答案必须存在');
    assert.ok(l.sources.every(k=>C.sources[k]),'来源必须可解析');
    assert.ok(l.controls.length>0,'实验必须有控件');
  }
  assert.ok(C.todo.length>=8,'现代主题应明确列为 TODO');
  return C.lessons.reduce((n,l)=>n+l.concepts.length,0);
}
function check(){
  const files=['index.html','style.css','math.js','content.js','pipeline-math.js','pipeline.js','app.js'];
  const source=Object.fromEntries(files.map(n=>[n,fs.readFileSync(path.join(__dirname,n),'utf8')]));
  ['math.js','content.js','pipeline-math.js','pipeline.js','app.js'].forEach(n=>new vm.Script(source[n],{filename:n}));
  assert.ok(!/<script[^>]+src=["']https?:/i.test(source['index.html']),'不能依赖联网脚本');
  assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(source['app.js']),'离线实验不能调用网络');
  assert.ok(source['style.css'].includes('prefers-reduced-motion'),'需要尊重减少动态效果');
  const scope={window:{}};vm.runInNewContext(source['content.js'],scope);const n=checkContent(scope.window.GraphicsContent);
  return {chapters:12,concepts:n,modernTodo:scope.window.GraphicsContent.todo.length};
}
module.exports={checkContent,check};
if(require.main===module)console.log('PASS:',JSON.stringify(check()));
