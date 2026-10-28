(function(){
  'use strict';
  const M=window.GraphicsMath, C=window.GraphicsContent, $=s=>document.querySelector(s);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const colors={blue:'#235cdc',red:'#bd463c',gold:'#8c610c',green:'#14745c',ink:'#182740',muted:'#52647a',grid:'#d6e0ee',white:'#ffffff'};
  let saved={},storageOK=true;
  try{saved=JSON.parse(localStorage.getItem('alpha-graphics-basics-v1')||'{}')||{};}catch{storageOK=false;}
  const done=new Set(Array.isArray(saved.done)?saved.done.filter(id=>C.lessons.some(l=>l.id===id)):[]);
  const validCards=new Set(C.lessons.flatMap(l=>[l.id,...l.concepts.map((_,i)=>`${l.id}-concept-${i}`)]));
  const retry=new Set(Array.isArray(saved.retry)?saved.retry.filter(id=>validCards.has(id)):[]);
  let view='learn',id=C.lessons.some(l=>l.id===location.hash.slice(1))?location.hash.slice(1):'overview';
  let states={},state,canvas,ctx,raf=0,playing=false,reviewIndex=0,reviewQueue=[],reviewKnown=0;
  let plotSize=16;
  function persist(){try{localStorage.setItem('alpha-graphics-basics-v1',JSON.stringify({done:[...done],retry:[...retry]}));}catch{storageOK=false;}}
  function defaults(l){const r={speed:1,orderFlip:false,probe:[320,206]};l.controls.forEach(c=>r[c[0]]=Array.isArray(c[2])?c[2][0]:c[5]);return r;}
  function lesson(){return C.lessons.find(l=>l.id===id);}
  function stop(){if(raf)cancelAnimationFrame(raf);raf=0;playing=false;const b=$('#play');if(b){b.textContent='播放变化';b.setAttribute('aria-pressed','false');}}
  function progress(){ $('#progress').textContent=`${done.size} / ${C.lessons.length} 章已读`;$('#progress-bar').style.width=`${100*done.size/C.lessons.length}%`; }
  function renderNav(){
    const q=$('#search').value.trim().toLowerCase();
    const matches=C.lessons.filter(l=>[l.name,l.title,l.lead,...l.concepts.flat()].join(' ').toLowerCase().includes(q));
    $('#chapters').innerHTML=matches.map(l=>`<a href="#${l.id}" ${view==='learn'&&l.id===id?'aria-current="page"':''}><span class="num">${String(C.lessons.indexOf(l)).padStart(2,'0')}</span>${l.name}${done.has(l.id)?'<span class="read-dot" aria-label="已读">✓</span>':''}</a>`).join('');
    $('#search-status').textContent=q?(matches.length?`找到 ${matches.length} 章；按回车查看术语结果`:'没有匹配章节，可试“光照”或“normal”'):'';
    const active=$('#chapters [aria-current="page"]');if(active&&innerWidth<=720)$('#chapters').scrollLeft=active.offsetLeft-$('#chapters').offsetLeft-25;
    progress();
  }
  function sourceHTML(l){return `<div class="sources">核对与延伸：${l.sources.map(key=>{const [name,url]=C.sources[key];return `<a href="${url}" target="_blank" rel="noopener noreferrer">${esc(name)}</a>`;}).join('')}<br>解释与简化实验为内部教学推导；外部链接需要联网，教程实验可离线使用。</div>`;}
  function controlsHTML(l){return l.controls.map(c=>{
    const [key,label]=c;
    if(Array.isArray(c[2]))return `<label class="control" for="ctl-${key}"><span class="control-head">${label}</span><select id="ctl-${key}" data-key="${key}">${c.slice(2).map(([v,t])=>`<option value="${v}" ${state[key]===v?'selected':''}>${t}</option>`).join('')}</select></label>`;
    return `<label class="control" for="ctl-${key}"><span class="control-head"><span>${label}</span><output id="out-${key}" for="ctl-${key}">${format(key,state[key])}</output></span><input id="ctl-${key}" data-key="${key}" type="range" min="${c[2]}" max="${c[3]}" step="${c[4]}" value="${state[key]}"></label>`;
  }).join('');}
  function format(key,v){if(key==='samples')return `${2**v} SPP`;if(['angle','fov'].includes(key))return `${v}°`;if(['reveal'].includes(key))return `${Math.round(v)}%`;if(key==='stage')return `${Math.round(v)} / 5`;if(['travel','mix','offset'].includes(key))return `${Math.round(v*100)}%`;if(key==='exposure')return `${v.toFixed(1)} EV`;return Number.isInteger(v)?String(v):v.toFixed(2);}
  function flowHTML(l){return `<ol class="flow" aria-label="${l.name}流程图">${l.flow.map((f,i)=>`<li><button data-flow="${i}" aria-pressed="${i===0}"><strong>${i+1}. ${f[0]}</strong><small>${esc(f[1])}</small></button></li>`).join('')}</ol><div class="flow-detail" id="flow-detail" aria-live="polite"><strong>${l.flow[0][0]}：</strong>${l.flow[0][2]}</div>`;}
  function head(title,lead,badge='基础篇'){return `<div class="lesson-head"><div class="breadcrumb"><span class="badge">${badge}</span><span>${view==='learn'?`第 ${String(C.lessons.indexOf(lesson())).padStart(2,'0')} 章 / 建议阅读 ${lesson().time}`:'随时回来查一查'}</span></div><h1>${title}</h1><p class="lead">${lead}</p></div>`;}
  function renderLearn(){
    const l=lesson(),idx=C.lessons.indexOf(l);state=states[id]||(states[id]=defaults(l));
    $('#main').innerHTML=head(l.title,l.lead)+(id==='raster'?window.RasterPipelineUI.markup():'')+`
      <div class="lesson-layout">
        <div class="experiment"><div class="experiment-head"><h2>${id==='raster'?'局部放大：覆盖与重心坐标':'动手看一遍'}</h2><span>可暂停 / 单步 / 重置</span></div><div class="canvas-wrap"><canvas id="demo" width="640" height="380" role="img" aria-label="${l.name}的交互示意。${l.hint}">${esc(l.intuition)}</canvas></div><p class="experiment-hint">${l.hint}</p><div class="controls">${controlsHTML(l)}</div><div class="playbar"><button id="play" class="primary" aria-pressed="false">播放变化</button><button id="step">单步</button><button id="reset">重置实验</button>${id==='depth'?'<button id="swap">交换绘制顺序</button>':''}<label for="speed">速度 <select id="speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label></div><div class="live-result" id="result" role="status" aria-live="off"></div></div>
        <div class="explain"><div><h2>先抓住这个直觉</h2><p>${l.intuition}</p></div><div class="memory"><h3>一句话记住</h3><p>${l.memory}</p></div><div class="analogy"><h2>换个生活中的说法</h2><p>${l.analogy}<small>类比的边界：${l.boundary}</small></p></div></div>
      </div>
      <section class="section-block" aria-labelledby="flow-heading"><h2 id="flow-heading">把过程连起来</h2><p class="section-intro">按箭头顺序阅读，点击步骤查看输入、处理和输出。</p>${flowHTML(l)}</section>
      <section class="section-block" aria-labelledby="concept-heading"><h2 id="concept-heading">这些名字，各自在说什么？</h2><div class="concept-grid">${l.concepts.map(([n,en,t])=>`<article class="concept"><h3>${n}<span class="en">${en}</span></h3><p>${t}</p></article>`).join('')}</div><details><summary>再看一眼必要公式</summary><div class="formula"><code>${esc(l.formula[0])}</code><p>${l.formula[1]}</p></div></details><div class="pitfall"><strong>容易记混：</strong>${l.pitfall}</div></section>
      <section class="section-block quiz" aria-labelledby="quiz-heading"><h3 id="quiz-heading">先别看答案，试着解释</h3><p>${l.quiz[0]}</p><div class="quiz-options">${l.quiz[1].map((t,i)=>`<button data-answer="${i}">${t}</button>`).join('')}</div><p class="feedback" id="quiz-feedback" role="status"></p></section>
      ${sourceHTML(l)}
      <div class="lesson-footer"><span>${idx>0?`<a href="#${C.lessons[idx-1].id}">← ${C.lessons[idx-1].name}</a>`:''}</span><button id="read-toggle" class="read-toggle" aria-pressed="${done.has(id)}">${done.has(id)?'✓ 已标为读完':'标记本章读完'}</button><span>${idx<C.lessons.length-1?`<a href="#${C.lessons[idx+1].id}">下一章：${C.lessons[idx+1].name} →</a>`:'<button id="start-review">开始基础复习</button>'}</span></div>
      <p class="review-meta">${storageOK?'阅读进度和待复习题仅保存在此浏览器。':'浏览器未开放本地存储；本次可以正常学习，关闭后进度可能不保留。'}</p>`;
    canvas=$('#demo');ctx=canvas.getContext('2d');
    $('[id="speed"]').value=String(state.speed);
    document.querySelectorAll('[data-key]').forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{stop();state[el.dataset.key]=el.tagName==='SELECT'?el.value:Number(el.value);syncControls();draw();}));
    $('#play').onclick=()=>playing?stop():play();$('#step').onclick=()=>{stop();advance();draw();};
    $('#reset').onclick=()=>{stop();states[id]=defaults(l);state=states[id];syncControls();draw();};
    $('#speed').onchange=e=>state.speed=Number(e.target.value);
    if($('#swap'))$('#swap').onclick=()=>{state.orderFlip=!state.orderFlip;draw();};
    document.querySelectorAll('[data-flow]').forEach(b=>b.onclick=()=>{
      document.querySelectorAll('[data-flow]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
      const f=l.flow[+b.dataset.flow];$('#flow-detail').innerHTML=`<strong>${f[0]}：</strong>${f[2]}`;
    });
    document.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>{
      const correct=+b.dataset.answer===l.quiz[2];
      document.querySelectorAll('[data-answer]').forEach(x=>{x.classList.remove('correct','wrong');x.setAttribute('aria-pressed',String(x===b));});
      b.classList.add(correct?'correct':'wrong');$('#quiz-feedback').textContent=(correct?'答对了。':'再想一想。')+l.quiz[3];
      if(correct)retry.delete(id);else retry.add(id);persist();
    });
    $('#read-toggle').onclick=()=>{done.has(id)?done.delete(id):done.add(id);persist();const b=$('#read-toggle');b.setAttribute('aria-pressed',String(done.has(id)));b.textContent=done.has(id)?'✓ 已标为读完':'标记本章读完';renderNav();};
    if($('#start-review'))$('#start-review').onclick=()=>setView('review');
    canvas.addEventListener('pointerdown',e=>{if(id!=='raster')return;const b=canvas.getBoundingClientRect();state.probeX=Math.round(M.clamp((e.clientX-b.left)*640/b.width,120,520));state.probeY=Math.round(M.clamp((e.clientY-b.top)*380/b.height,70,310));syncControls();draw();});
    draw();
    if(id==='raster')window.RasterPipelineUI.mount($('#raster-pipeline'),stop);
  }
  function syncControls(){lesson().controls.forEach(c=>{const el=$(`#ctl-${c[0]}`);el.value=state[c[0]];const out=$(`#out-${c[0]}`);if(out)out.textContent=format(c[0],state[c[0]]);});$('#speed').value=String(state.speed);}
  function animSpec(){const key={overview:'stage',vectors:'angle',transforms:'angle',camera:'depth',raster:'reveal',depth:'depthA',texture:'offset',lighting:'angle',rays:'travel',sampling:'samples',color:'mix',connections:'stage'}[id];return lesson().controls.find(c=>c[0]===key);}
  function advance(){const c=animSpec(),step=c[4],delta=['stage','samples'].includes(c[0])?1:(c[3]-c[2])/20;state[c[0]]=state[c[0]]>=c[3]?c[2]:Math.min(c[3],Math.round((state[c[0]]+delta)/step)*step);syncControls();}
  function play(){
    window.RasterPipelineUI.pause();stop();const c=animSpec(),key=c[0];if(state[key]>=c[3])state[key]=c[2];
    playing=true;$('#play').textContent='暂停';$('#play').setAttribute('aria-pressed','true');
    let last=performance.now(),value=state[key];
    function tick(now){if(!playing)return;const dt=Math.max(0,Math.min(100,now-last));last=now;value=Math.min(c[3],value+(c[3]-c[2])*dt/6500*state.speed);state[key]=Math.min(c[3],Math.round(value/c[4])*c[4]);syncControls();draw();if(value>=c[3])stop();else raf=requestAnimationFrame(tick);}
    raf=requestAnimationFrame(tick);
  }
  function setView(v){stop();view=v;if(v==='review')beginReview();render();window.scrollTo({top:0,behavior:'instant'});}
  function render(){stop();window.RasterPipelineUI.destroy();document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));renderNav();if(view==='learn')renderLearn();if(view==='reference')renderReference();if(view==='review')renderReview();if(view==='todo')renderTodo();}
  function renderReference(){
    $('#main').innerHTML=head('忘了什么，就查什么。','按中文或英文搜索。先看一句话解释，再回到对应章节动手试。','基础速查')+`<label for="ref-search" class="search-label">搜索术语或解释</label><input id="ref-search" class="reference-search" type="search" placeholder="例如：片元、透视校正、normal、sRGB" value="${esc($('#search').value)}"><p id="ref-count" role="status" class="review-meta"></p><div id="reference-results"></div>`;
    $('#ref-search').oninput=fillReference;fillReference();
  }
  function fillReference(){const q=$('#ref-search').value.trim().toLowerCase();let n=0;const html=C.lessons.map(l=>l.concepts.filter(c=>c.join(' ').toLowerCase().includes(q)).map(([name,en,text])=>{n++;return `<article class="reference-item"><div><h2>${name}<span>${en}</span></h2><a href="#${l.id}">去“${l.name}”看实验</a></div><p>${text}</p></article>`;}).join('')).join('');$('#reference-results').innerHTML=html||'<p class="empty">没有匹配的基础术语。可换个说法，或到 TODO 查看后续专题。</p>';$('#ref-count').textContent=`${n} 个基础概念` ;}
  function beginReview(){const cards=C.lessons.flatMap(l=>[{cardId:l.id,name:l.name,id:l.id,question:l.quiz[0],answer:l.quiz[1][l.quiz[2]],explanation:l.quiz[3],memory:l.memory},...l.concepts.map(([name,en,text],i)=>({cardId:`${l.id}-concept-${i}`,id:l.id,name:l.name,question:`怎样解释“${name}”（${en}）？`,answer:text,explanation:'试着举一个它在渲染中的用途，并说明一个容易误解的地方。',memory:l.memory}))]);reviewQueue=[...cards.filter(c=>retry.has(c.cardId)),...cards.filter(c=>!retry.has(c.cardId))];reviewIndex=0;reviewKnown=0;}
  function renderReview(){
    if(!reviewQueue.length)beginReview();
    $('#main').innerHTML=head('想起来，比再读一遍更重要。','12 个章节问题与 66 张概念卡。先自己解释，再揭开答案；答错或标为忘记的卡会优先出现。','基础复习')+'<div id="review-body"></div>';showReviewCard();
  }
  function showReviewCard(){
    const host=$('#review-body');if(reviewIndex>=reviewQueue.length){host.innerHTML=`<div class="review-card"><h2>这一轮完成了。</h2><p>本轮 ${reviewQueue.length} 张卡，${reviewKnown} 张标记为记得，${retry.size} 张待巩固。</p><p>隔一段时间再回来试一遍，能独立解释比一次全对更有用。</p><button id="review-again" class="primary">再复习一轮</button></div>`;$('#review-again').onclick=()=>{beginReview();showReviewCard();};return;}
    const l=reviewQueue[reviewIndex];host.innerHTML=`<div class="review-card"><p class="review-meta">${reviewIndex+1} / ${reviewQueue.length} · ${l.name}${retry.has(l.cardId)?' · 待巩固':''}</p><h2>${l.question}</h2><p class="review-meta">先用自己的话回答，不必记得公式原样。</p><button id="reveal-answer" class="primary">查看解释</button><div id="review-reveal" hidden><div class="review-answer"><p>${l.answer}</p><p>${l.explanation}</p></div><div class="review-actions"><button id="remember" class="primary">我记得</button><button id="forgot">还没记住</button><a href="#${l.id}">回章节看实验</a></div></div></div><details><summary>需要一点线索</summary><p>${l.memory}</p></details>`;
    $('#reveal-answer').onclick=()=>{$('#review-reveal').hidden=false;$('#reveal-answer').hidden=true;};
    $('#remember').onclick=()=>{retry.delete(l.cardId);reviewKnown++;persist();reviewIndex++;showReviewCard();};
    $('#forgot').onclick=()=>{retry.add(l.cardId);persist();reviewIndex++;showReviewCard();};
  }
  function renderTodo(){
    $('#main').innerHTML=head('现代图形学，留在下一张地图。','当前交付只完成基础篇。下面是后续学习路线，所有专题均为 TODO，尚未编写对应课程或实验。','后续 TODO')+`<div class="scope">当前基础篇的完成标准：能说清一个像素从哪里来、判断可见性、解释基础材质与采样，并定位常见画面错误。这里列出的专题不计入基础篇进度。</div><table class="todo-table"><thead><tr><th scope="col">后续专题</th><th scope="col">计划内容</th><th scope="col">先掌握什么</th><th scope="col">状态</th></tr></thead><tbody>${C.todo.map(([n,t,p])=>`<tr><td>${n}</td><td>${t}</td><td>${p}</td><td><span class="todo-label">TODO</span></td></tr>`).join('')}</tbody></table><p class="review-meta">这是一份学习清单，不是 AlphaEngine 技术栈或里程碑合同。具体专题的顺序和范围可在基础掌握后再决定。</p>`;
  }
  // ---- 画布：几何与像素均由本页计算，无网络或 GPU 依赖。 ----
  function text(t,x,y,color=colors.ink,size=plotSize,align='left'){ctx.fillStyle=color;ctx.font=`${size}px "Segoe UI","Microsoft YaHei",sans-serif`;ctx.textAlign=align;ctx.fillText(t,x,y);ctx.textAlign='left';}
  function line(a,b,color=colors.grid,width=1,dash=[]){ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();ctx.setLineDash([]);}
  function arrow(a,b,color=colors.blue,width=3){line(a,b,color,width);const v=M.normalize([b[0]-a[0],b[1]-a[1]]),n=[-v[1],v[0]];poly([b,[b[0]-12*v[0]+5*n[0],b[1]-12*v[1]+5*n[1]],[b[0]-12*v[0]-5*n[0],b[1]-12*v[1]-5*n[1]]],color);}
  function poly(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}}
  function dot(x,y,r=5,color=colors.blue){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
  function grid(x0=0,y0=0,w=640,h=380,spacing=32){for(let x=x0;x<=x0+w;x+=spacing)line([x,y0],[x,y0+h]);for(let y=y0;y<=y0+h;y+=spacing)line([x0,y],[x0+w,y]);}
  function result(t){$('#result').textContent=t;canvas.setAttribute('aria-description',t);}
  function clear(){ctx.clearRect(0,0,640,380);ctx.fillStyle='#eef3fb';ctx.fillRect(0,0,640,380);plotSize=canvas.clientWidth<450?22:16;}
  function draw(){if(!ctx)return;clear();({overview:drawPipeline,vectors:drawVectors,transforms:drawTransforms,camera:drawCamera,raster:drawRaster,depth:drawDepth,texture:drawTexture,lighting:drawLighting,rays:drawRays,sampling:drawSampling,color:drawColor,connections:drawPipeline}[id])();}
  const tri=[[180,284],[320,78],[490,284]],rgb=[[35,92,220],[189,70,60],[177,123,16]];
  function rasterTri(points,mode='color',progress=1){let count=0;for(let y=70;y<302;y+=12)for(let x=116;x<524;x+=12){const w=M.bary([x+6,y+6],...points);if(!M.inside(w)||((y-70)*408+(x-116))/(232*408)>progress)continue;const c=mode==='color'?[0,1,2].map(k=>Math.round(w.reduce((s,v,i)=>s+v*rgb[i][k],0))):[35,92,220];ctx.fillStyle=`rgb(${c})`;ctx.fillRect(x+1,y+1,10,10);count++;}return count;}
  function drawPipeline(){
    const s=Math.round(state.stage),isRay=id==='connections'&&state.route==='ray';grid(32,56,576,255,32);
    if(s===0){tri.forEach((p,i)=>{dot(...p,7,[colors.blue,colors.red,colors.gold][i]);text(String.fromCharCode(65+i),p[0]+12,p[1],colors.ink);});}
    if(s===1){poly(tri,'#dce6fa',colors.blue);tri.forEach(p=>dot(...p));}
    if(s===2){poly(tri,null,colors.blue);ctx.strokeStyle=colors.ink;ctx.strokeRect(135,65,390,240);text('取景范围',160,58,colors.muted);}
    if(s>=3){rasterTri(tri,s>=4?'color':'coverage');poly(tri,null,colors.blue);}
    if(s===5){ctx.strokeStyle='#93a8c8';ctx.lineWidth=4;ctx.strokeRect(100,40,440,282);text('一帧图像',320,353,colors.ink,plotSize,'center');}
    if(isRay&&s>=2){for(let i=0;i<7;i++){const p=[200+i*35,280];arrow([320,345],p,colors.red,1.5);}text('相机射线 → 求最近命中',320,27,colors.red,plotSize,'center');}
    else text('顶点 → 三角形 → 采样位置 → 颜色',320,27,colors.muted,plotSize,'center');
    const labels=['输入顶点：位置只是场景的一部分。','连接与摆放：顶点组成一个三角形。','取景：确定相机可见的范围。','可见性：找被三角形覆盖的采样位置。','着色：将顶点属性插值到采样位置。','输出：这些离散颜色形成图像。'];
    result(isRay&&s>=2?`${s}/5 · 光追从图像采样生成射线，用最近求交替代光栅覆盖；这里的三角形像素展示共享的最终图像。`:`${s}/5 · ${labels[s]}`);
  }
  function drawVectors(){
    grid(40,55,560,265,32);const a=[300,190],theta=state.angle*Math.PI/180,b=[a[0]+90*state.length*Math.cos(theta),a[1]-90*state.length*Math.sin(theta)],proj=[b[0],a[1]];
    arrow([70,a[1]],[565,a[1]],colors.muted,1);arrow([a[0],320],[a[0],50],colors.muted,1);
    line(b,proj,colors.muted,2,[4,5]);line(a,proj,'#e2ac36',8);arrow(a,[a[0]+90,a[1]],colors.red);arrow(a,b,colors.blue);dot(...a,5,colors.ink);
    text('a = (1, 0, 0)',400,250,colors.red);text('b',b[0]+8,Math.max(40,b[1]-12),colors.blue,24);text('Y',a[0]+9,47,colors.muted);text('X',572,a[1]+5,colors.muted);
    const d=state.length*Math.cos(theta),cross=state.length*Math.sin(theta);
    text(`沿 a 的投影 = ${d.toFixed(2)}`,320,351,colors.gold,plotSize,'center');
    result(`a·b = ${d.toFixed(3)}；a×b = (0, 0, ${cross.toFixed(3)})。${Math.abs(d)<.001?'两向量垂直。':d>0?'方向部分一致，点积为正。':'方向相背，点积为负。'}`);
  }
  function drawTransforms(){
    grid(32,30,576,320,32);const origin=[320,205],map=p=>[origin[0]+p[0]*55,origin[1]-p[1]*55],base=[[-.6,-.5],[.05,.8],[.7,-.5]];
    arrow([45,205],[596,205],colors.muted,1);arrow([320,340],[320,28],colors.muted,1);
    const q=base.map(p=>M.transform(p,state.angle*Math.PI/180,state.scale,state.translate,state.order));
    poly(base.map(map),'#e0e5ee','#9eacc0');poly(q.map(map),'#a8bff3',colors.blue);base.forEach((p,i)=>line(map(p),map(q[i]),colors.muted,1,[4,5]));
    const o=M.transform([0,0],state.angle*Math.PI/180,state.scale,state.translate,state.order);dot(...map(o),5,colors.red);
    text('灰：原模型',38,35,colors.muted);text('蓝：变换结果',38,65,colors.blue);text(state.order==='RT'?'T · R · S · p':'S · R · T · p',320,364,colors.blue,plotSize,'center');
    result(`模型原点现在位于 (${o[0].toFixed(2)}, ${o[1].toFixed(2)})。${state.order==='RT'?'平移最后执行，沿世界 X 轴移动。':'平移先执行，位移也参与之后的旋转和缩放。'}`);
  }
  function drawCamera(){
    const cam=[65,190],plane=cam[0]+68,z=state.depth,f=state.fov*Math.PI/360,screenHalf=105;
    line([35,190],[430,190],colors.muted,1,[6,5]);dot(...cam,8,colors.ink);text('相机',35,345,colors.ink);
    const objectX=cam[0]+z*44,objectHalf=48;line([objectX,190-objectHalf],[objectX,190+objectHalf],colors.blue,7);
    const projected=state.projection==='perspective'?M.project(1,z,state.fov)*screenHalf:.45*screenHalf;
    line([plane,55],[plane,325],colors.gold,3);
    if(state.projection==='perspective'){
      line(cam,[cam[0]+360,190-Math.tan(f)*360],colors.grid,2);line(cam,[cam[0]+360,190+Math.tan(f)*360],colors.grid,2);
      line(cam,[objectX,190-objectHalf],colors.blue,2);line(cam,[objectX,190+objectHalf],colors.blue,2);
    }else{line([65,190-objectHalf],[objectX,190-objectHalf],colors.blue,2);line([65,190+objectHalf],[objectX,190+objectHalf],colors.blue,2);}
    ctx.fillStyle='#fff';ctx.fillRect(466,52,150,276);ctx.strokeStyle=colors.grid;ctx.strokeRect(466,52,150,276);line([480,190],[602,190],colors.grid);line([541,190-projected],[541,190+projected],colors.blue,13);
    text('侧面截面',32,30,colors.muted);text('投影',541,355,colors.ink,plotSize,'center');text(`Z = ${z.toFixed(1)}`,objectX-25,330,colors.blue);
    result(`${state.projection==='perspective'?'透视':'正交'}投影：归一化半宽 ${state.projection==='perspective'?M.project(1,z,state.fov).toFixed(3):'0.450'}。${state.projection==='perspective'?'深度增大，物体投影变小；增大 FOV 也会缩小投影。':'深度与 FOV 控件不改变正交大小；正交视域范围在本实验中固定。'}`);
  }
  function drawRaster(){
    grid(116,70,408,228,12);const count=rasterTri(tri,state.fill,state.reveal/100);poly(tri,null,colors.ink);
    tri.forEach((p,i)=>{dot(...p,6,[colors.blue,colors.red,colors.gold][i]);text(String.fromCharCode(65+i),p[0]+10,p[1]+(i===1?-15:25),colors.ink);});
    const p=[state.probeX,state.probeY],w=M.bary(p,...tri);line([p[0]-10,p[1]],[p[0]+10,p[1]],colors.ink,2);line([p[0],p[1]-10],[p[0],p[1]+10],colors.ink,2);dot(...p,3,'#fff');
    text('每格一个中心采样点',320,350,colors.muted,plotSize,'center');
    result(`探针权重 (${w.map(v=>v.toFixed(2)).join(', ')})，和为 ${w.reduce((a,b)=>a+b,0).toFixed(2)}；${M.inside(w)?'在三角形内。':'在三角形外。'} 已显示 ${count} 个覆盖格。`);
  }
  function drawDepth(){
    const tris=[[[150,285],[325,68],[462,285]],[[180,100],[505,146],[408,316]]],depths=[state.depthA,.6],cols=[[35,92,220],[218,170,70]],order=state.orderFlip?[1,0]:[0,1];let aWins=0,bWins=0;
    grid(90,45,468,288,12);
    for(let y=45;y<333;y+=8)for(let x=90;x<558;x+=8){let depth=1,c=state.mode==='alpha'?[238,243,251].map(v=>M.srgbToLinear(v/255)):[238,243,251],winner=-1;for(const i of order){if(!M.inside(M.bary([x+4,y+4],...tris[i])))continue;if(state.mode==='alpha'){c=M.over(cols[i].map(v=>M.srgbToLinear(v/255)),c,.55);winner=i;}else if(state.mode==='paint'||depths[i]<depth){c=cols[i];depth=depths[i];winner=i;}}if(winner>=0){const pixel=state.mode==='alpha'?c.map(v=>255*M.linearToSrgb(v)):c;ctx.fillStyle=`rgb(${pixel.map(Math.round)})`;ctx.fillRect(x,y,8,8);if(winner===0)aWins++;else bWins++;}}
    tris.forEach((t,i)=>poly(t,null,i===0?colors.blue:colors.gold));text(`蓝 z=${state.depthA.toFixed(2)}`,32,30,colors.blue);text('黄 z=0.60',400,30,colors.gold);
    text(`顺序：${state.orderFlip?'黄色 → 蓝色':'蓝色 → 黄色'}`,320,362,colors.ink,plotSize,'center');
    result(state.mode==='alpha'?'透明模式：α=0.55，逐层 over 混合，不做深度测试。交换顺序会改变重叠处的颜色。':`蓝色可见 ${aWins} 格，黄色可见 ${bWins} 格。${state.mode==='depth'?(Math.abs(state.depthA-.6)<1e-9?'两者等深时，严格小于比较让先画者保留。':'深度测试保留更近者；交换顺序后遮挡不变。'):'未做深度测试，后画者覆盖前画者。'}`);
  }
  function checkerIntegral(t){const q=Math.floor(t),r=t-q;return (q%2===0?r:1-r);}
  function checkerMean(a,b){if(b-a<1e-10)return Math.floor(a)%2===0?1:-1;return (checkerIntegral(b)-checkerIntegral(a))/(b-a);}
  function drawTexture(){
    const n=state.frequency,res=48,sz=5,ox=40,oy=56;
    function coverage(x,y,area){if(!area)return (Math.floor((x+.5)/res*n+state.offset)+Math.floor((y+.5)/res*n*.7))%2===0?1:0;const u0=x/res*n+state.offset,u1=(x+1)/res*n+state.offset,v0=y/res*n*.7,v1=(y+1)/res*n*.7;return M.clamp(.5*(1+checkerMean(u0,u1)*checkerMean(v0,v1)));}
    for(let panel=0;panel<2;panel++){const area=panel===1&&state.filter==='area';for(let y=0;y<res;y++)for(let x=0;x<res;x++){const v=Math.round(30+coverage(x,y,area)*207);ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(ox+panel*310+x*sz,oy+y*sz,sz,sz);}}
    text('点采样',160,35,colors.ink,plotSize,'center');text(state.filter==='area'?'区域平均':'点采样（同设置）',470,35,colors.blue,plotSize,'center');text('48 × 48 个输出像素，已放大',320,342,colors.muted,plotSize,'center');
    result(`横向 ${n} 格纹理映射到 48 像素，每像素横向覆盖约 ${(n/48).toFixed(2)} 个纹理格。${state.filter==='area'?'右图先平均像素足迹：细格逐渐成为稳定灰色。':'两图都是点采样，拖动平移可看图案跳变。'}`);
  }
  function drawLighting(){
    const theta=state.angle*Math.PI/180,l=[Math.sin(theta),0,Math.cos(theta)],v=[0,0,1],h=M.normalize(l.map((x,i)=>x+v[i])),r=115,cx=315,cy=192;
    for(let y=-r;y<=r;y+=3)for(let x=-r;x<=r;x+=3){const nx=x/r,ny=-y/r,d=nx*nx+ny*ny;if(d>1)continue;const n=[nx,ny,Math.sqrt(1-d)],diff=state.albedo*Math.max(0,M.dot(n,l)),spec=state.specular==='on'&&M.dot(n,l)>0?.6*Math.pow(Math.max(0,M.dot(n,h)),40):0;const intensity=M.clamp(.025+diff+spec),base=[.19,.4,.9];const pixel=base.map(z=>Math.round(255*M.linearToSrgb(M.clamp(z*intensity+spec*.25))));ctx.fillStyle=`rgb(${pixel})`;ctx.fillRect(cx+x,cy+y,3.2,3.2);}
    const p=[cx,cy-r-13];arrow(p,[p[0]+l[0]*90,p[1]-l[2]*52],colors.gold,3);text('指向光源 l',state.angle<0?55:425,45,colors.gold);arrow([cx,cy],[cx,cy-72],colors.blue,2);text('表面法线随位置变化',320,350,colors.muted,plotSize,'center');
    const d=state.albedo*Math.max(0,l[2]);result(`球心朝向相机的法线 n=(0,0,1)，n·l=${l[2].toFixed(3)}，漫反射项=${d.toFixed(3)}。球面各点法线不同，所以明暗也不同。`);
  }
  function drawRays(){
    grid(32,45,576,275,32);const origin=[75,190],c=[365,190],r=80,theta=state.angle*Math.PI/180,d=[Math.cos(theta),-Math.sin(theta)],roots=M.sphere(origin,d,c,r),valid=roots.filter(t=>t>.001),hit=valid.length?Math.min(...valid):null;
    ctx.beginPath();ctx.arc(...c,r,0,Math.PI*2);ctx.fillStyle='#dce6fa';ctx.fill();ctx.strokeStyle=colors.blue;ctx.lineWidth=2;ctx.stroke();
    const end=[origin[0]+d[0]*525,origin[1]+d[1]*525];line(origin,end,colors.muted,1,[5,5]);
    const endT=hit===null?525:hit,travel=endT*state.travel,p=[origin[0]+d[0]*travel,origin[1]+d[1]*travel];line(origin,p,colors.red,3);dot(...origin,7,colors.ink);dot(...p,5,colors.red);
    roots.forEach((t,i)=>{if(t>0){const q=origin.map((z,k)=>z+d[k]*t);dot(...q,5,i===0?colors.red:colors.gold);}});
    if(hit!==null&&state.travel>=.98){const h=origin.map((z,k)=>z+d[k]*hit),n=M.normalize(h.map((z,k)=>z-c[k])),ref=M.reflect(d,n);arrow(h,h.map((z,k)=>z+ref[k]*95),colors.green,3);arrow(h,h.map((z,k)=>z+n[k]*50),colors.blue,2);}
    text('O：相机',40,350,colors.ink);text('圆 = 球体的截面',335,350,colors.blue);
    result(hit===null?'判别式小于 0：射线没有命中圆。本次查询可返回背景。':`两个候选参数 t：${roots.map(t=>t.toFixed(1)).join('、')}；最近有效根 ${hit.toFixed(1)}。进度 100% 时，绿色箭头表示镜面反射方向。`);
  }
  function sampleCoverage(x,y,n,rng){let sum=0;for(let i=0;i<n;i++){const px=(x+rng()-24)/22,py=(y+rng()-24)/22;if(px*px+py*py<.66*.66)sum++;}return sum/n;}
  function drawSampling(){
    const n=2**state.samples,res=48,s=5,ox=35,oy=60,rng=M.noise(1957);
    for(let y=0;y<res;y++)for(let x=0;x<res;x++){const local=M.noise(Math.floor(rng()*2147483647)),v=sampleCoverage(x,y,n,local),c=Math.round(28+v*210);ctx.fillStyle=`rgb(${c},${c},${c})`;ctx.fillRect(ox+x*s,oy+y*s,s,s);}
    text(`${n} SPP 的边缘覆盖估计`,155,35,colors.ink,plotSize,'center');
    const a=[345,285],b=[605,285];arrow(a,[610,285],colors.muted,1);arrow(a,[345,65],colors.muted,1);
    const points=[];for(let i=0;i<=6;i++)points.push([355+i*39,285-190/Math.sqrt(2**i)]);for(let i=1;i<points.length;i++)line(points[i-1],points[i],colors.blue,3);dot(...points[state.samples],7,colors.red);
    text('相对噪声',350,42,colors.muted);text('1',350,318,colors.muted);text('64 SPP',535,318,colors.muted);text(`1 / √${n} = ${(1/Math.sqrt(n)).toFixed(3)}`,460,357,colors.blue,plotSize,'center');
    result(`${n} SPP：相对标准差量级 ${(1/Math.sqrt(n)).toFixed(3)}。图像仅模拟像素覆盖率，不含光照与多次弹射。边缘估计不保证每加一个样本都单调更接近真值。`);
  }
  function drawColor(){
    const t=state.mix,wrong=t,right=M.linearToSrgb(t),ox=42,w=244;
    [wrong,right].forEach((v,i)=>{const c=Math.round(v*255);ctx.fillStyle=`rgb(${c},${c},${c})`;ctx.fillRect(ox+i*310,67,w,145);ctx.strokeStyle='#9aa9bf';ctx.strokeRect(ox+i*310,67,w,145);});
    text('直接混合编码值',164,40,colors.ink,plotSize,'center');text('线性混合后编码',474,40,colors.blue,plotSize,'center');text(`sRGB ${wrong.toFixed(3)}`,164,245,colors.ink,plotSize,'center');text(`sRGB ${right.toFixed(3)}`,474,245,colors.blue,plotSize,'center');
    const lum=4*2**state.exposure,mapped=lum/(1+lum),encoded=M.linearToSrgb(mapped);ctx.fillStyle=`rgb(${[encoded,encoded*.87,encoded*.52].map(z=>Math.round(z*255))})`;ctx.fillRect(42,281,554,42);
    text(`HDR 4 → 曝光 ${lum.toFixed(2)} → 映射 ${mapped.toFixed(3)}`,320,360,colors.muted,plotSize,'center');
    result(`白色份额 ${(t*100).toFixed(0)}%，黑色份额 ${((1-t)*100).toFixed(0)}%。线性亮度 ${t.toFixed(3)} 编码为 sRGB ${right.toFixed(3)}；直接编码值 ${t.toFixed(3)} 解码仅为线性 ${M.srgbToLinear(t).toFixed(3)}。`);
  }
  // 页面路由与状态：全部在本机，不读取或发送账户数据。
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $('#search').oninput=renderNav;$('#search').onkeydown=e=>{if(e.key==='Enter'){setView('reference');$('#ref-search').focus();}};
  document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(a&&C.lessons.some(l=>l.id===a.hash.slice(1))&&location.hash===a.hash){view='learn';render();window.scrollTo({top:0,behavior:'instant'});}});
  window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(C.lessons.some(l=>l.id===next)){id=next;view='learn';render();window.scrollTo({top:0,behavior:'instant'});}});
  window.addEventListener('resize',()=>{if(view==='learn')draw();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('pagehide',()=>{stop();window.RasterPipelineUI.pause();});
  render();
})();
