/* 一条三角形的可暂停动画。UI 只读取同一个实际计算的管线结果。 */
(function(){
  'use strict';
  const K=window.RasterPipelineMath;
  const stages=[
    ['顶点输入','Input assembly','三个位置和三种顶点颜色进入管线，按索引 0、1、2 连接成三角形。','顶点 / 索引','模型空间顶点','index = [0, 1, 2]'],
    ['模型 → 世界','Model transform','同一组顶点先旋转，再平移到场景中。三个点的身份与颜色始终保留。','模型坐标','世界坐标','pworld = M · pmodel'],
    ['世界 → 观察','View transform','换到相机的参照系：相机变为原点。改变的是坐标描述，不是物体自身形状。','世界坐标','观察坐标','pview = V · pworld'],
    ['投影到裁剪空间','Projection','投影矩阵输出四维坐标。本图用 x 与 w 的截面表示裁剪条件，此时还没有做透视除法。','观察坐标','裁剪坐标 (x,y,z,w)','pclip = P · pview'],
    ['裁剪','Clipping','C 越过右边界 x=w。沿两条边产生 I1、I2；三角形可见部分成为四边形，再拆成两个三角形。','越界图元','可见多边形 + 新顶点','−w ≤ x,y ≤ w；0 ≤ z ≤ w'],
    ['透视除法','Perspective divide','每个保留顶点的 x、y、z 都除以它自己的 w，得到 NDC。不同深度的顶点会按不同的比例缩放。','四维裁剪坐标','三维 NDC','pndc = (x/w, y/w, z/w)'],
    ['视口变换','Viewport','把 NDC 的 −1…1 映射到 64×40 的像素网格，同时把向上的 Y 映射到图像中向下的 Y。','标准化坐标','屏幕坐标与深度','xs=(xndc+1)W/2；ys=(1−yndc)H/2'],
    ['光栅化与插值','Rasterization','扫描像素中心，判断覆盖，生成候选片元。蓝格表示被覆盖的位置；探针的权重说明它来自哪个三角形。','屏幕三角形','覆盖 + 片元属性','采样位置 = (x+0.5, y+0.5)'],
    ['片元着色','Fragment shading','本例用透视校正后的顶点色作为片元输出。颜色在这里算出，尚未保证能写进最终画面。','插值属性','候选颜色','C = (Σλi Ci/wi) / (Σλi/wi)'],
    ['深度测试与写入','Depth / framebuffer','灰色挡板已在缓冲中。逐个比较新片元深度：更近者更新颜色与深度，被挡住的候选不会写入。','颜色 + 新深度','最终帧缓冲','若 znew < zstored，则写入']
  ];
  const palette=['#235cdc','#bd463c','#8c610c'],bg='#eef3fb',ink='#182740',muted='#52647a',blue='#235cdc';
  const film={x:142,y:70,w:600,h:375},ndcBox={x:270,y:65,w:370,h:370};
  const stageDuration=3.4,total=stages.length*stageDuration;
  let active=null;
  function markup(){return `<section id="raster-pipeline" class="pipe" aria-labelledby="pipe-heading"><div class="pipe-heading"><div><h2 id="pipe-heading">跟着一个三角形，走完整条管线</h2><p>先点“播放完整流程”。随时暂停，看清这一步究竟改了什么。</p></div><span>同一个三角形 · 10 个阶段</span></div><ol class="pipe-rail" aria-label="光栅化管线动画步骤">${stages.map((s,i)=>`<li><button type="button" data-pipe-stage="${i}" aria-pressed="${i===0}"><span>${String(i+1).padStart(2,'0')}</span>${s[0]}</button></li>`).join('')}</ol><div class="pipe-layout"><div class="pipe-picture"><canvas id="pipe-canvas" width="900" height="500" role="img" aria-label="跟踪同一三角形的光栅化管线动画"></canvas><div class="pipe-caption" id="pipe-caption"></div></div><aside class="pipe-inspector" aria-label="当前管线阶段数据"><div class="pipe-number" id="pipe-number"></div><h3 id="pipe-title"></h3><p class="pipe-en" id="pipe-en"></p><p id="pipe-explanation"></p><dl><div><dt>输入</dt><dd id="pipe-input"></dd></div><div><dt>输出</dt><dd id="pipe-output"></dd></div></dl><code id="pipe-formula"></code><div id="pipe-data"></div></aside></div><div class="pipe-player"><button type="button" id="pipe-play" class="primary" aria-pressed="false">播放完整流程</button><button type="button" id="pipe-prev">上一步</button><button type="button" id="pipe-next">下一步</button><button type="button" id="pipe-restart">回到开头</button><label for="pipe-speed">速度 <select id="pipe-speed"><option value="0.25">0.25× 慢放</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label></div><label class="pipe-timeline" for="pipe-time"><span><span id="pipe-time-label">0.0 / ${total.toFixed(0)} 秒</span><span>拖动时间轴，来回观察变化</span></span><input type="range" id="pipe-time" min="0" max="${total}" step="0.01" value="0"></label><div class="pipe-options"><label><input id="pipe-outside" type="checkbox" checked> 让 C 越出视野，观察裁剪</label><label><input id="pipe-occluder" type="checkbox" checked> 帧缓冲中放一块前方挡板</label></div><p class="pipe-boundary">教学约定：+Z 向前、列向量、NDC 深度 0…1、64×40 单中心采样；实际 GPU 会并行处理，也可能提前做深度测试。这里按概念顺序慢放，不模拟硬件执行时序。</p></section>`;}
  function pause(){if(!active)return;active.playing=false;cancelAnimationFrame(active.raf);const b=active.root.querySelector('#pipe-play');b.textContent=active.time>=total?'重新播放':'播放完整流程';b.setAttribute('aria-pressed','false');}
  function destroy(){if(!active)return;pause();window.removeEventListener('resize',active.resize);document.removeEventListener('visibilitychange',active.hidden);active=null;}
  function mount(root,onPlay){
    destroy();if(!root)return;
    const a={root,time:0,speed:1,playing:false,raf:0,scene:K.build(true),occluder:true,lastStage:-1,onPlay};active=a;
    const q=s=>root.querySelector(s);
    // 让播放和时间轴先出现在步骤图之前，窄屏也能立即开始观看。
    root.insertBefore(q('.pipe-player'),q('.pipe-rail'));
    root.insertBefore(q('.pipe-timeline'),q('.pipe-rail'));
    a.canvas=q('#pipe-canvas');a.ctx=a.canvas.getContext('2d');
    function jump(i){pause();a.time=Math.max(0,Math.min(9,i))*stageDuration+stageDuration*.99;render(a);}
    q('#pipe-play').onclick=()=>{if(a.playing){pause();return;}if(a.onPlay)a.onPlay();if(a.time>=total)a.time=0;a.playing=true;q('#pipe-play').textContent='暂停';q('#pipe-play').setAttribute('aria-pressed','true');let last=performance.now();function tick(now){if(!a.playing||active!==a)return;const dt=Math.max(0,Math.min(.1,(now-last)/1000));last=now;a.time=Math.min(total,a.time+dt*a.speed);render(a);if(a.time>=total)pause();else a.raf=requestAnimationFrame(tick);}a.raf=requestAnimationFrame(tick);};
    q('#pipe-prev').onclick=()=>jump(Math.floor(Math.min(a.time,total-.001)/stageDuration)-1);
    q('#pipe-next').onclick=()=>jump(Math.floor(Math.min(a.time,total-.001)/stageDuration)+1);
    q('#pipe-restart').onclick=()=>{pause();a.time=0;render(a);};
    q('#pipe-time').oninput=e=>{pause();a.time=+e.target.value;render(a);};
    q('#pipe-speed').onchange=e=>a.speed=+e.target.value;
    q('#pipe-outside').onchange=e=>{pause();a.scene=K.build(e.target.checked);render(a);};
    q('#pipe-occluder').onchange=e=>{pause();a.occluder=e.target.checked;render(a);};
    root.querySelectorAll('[data-pipe-stage]').forEach(b=>b.onclick=()=>jump(+b.dataset.pipeStage));
    a.resize=()=>render(a);a.hidden=()=>{if(document.hidden)pause();};window.addEventListener('resize',a.resize);document.addEventListener('visibilitychange',a.hidden);render(a);
  }
  function render(a){
    const q=s=>a.root.querySelector(s),i=Math.min(9,Math.floor(a.time/stageDuration)),p=a.time>=total?1:(a.time-i*stageDuration)/stageDuration,e=p*p*(3-2*p),s=stages[i];
    const scene=a.scene,ctx=a.ctx,large=a.canvas.clientWidth<500,font=large?29:18;
    ctx.fillStyle=bg;ctx.fillRect(0,0,900,500);
    function text(t,x,y,color=ink,size=font,align='left'){ctx.font=`${size}px "Segoe UI","Microsoft YaHei",sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(t,x,y);ctx.textAlign='left';}
    function line(points,color='#c6d3e5',width=1,dash=[]){ctx.beginPath();points.forEach((pt,j)=>j?ctx.lineTo(...pt):ctx.moveTo(...pt));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
    function polygon(points,fill='#dce6fa',stroke=blue){if(!points.length)return;ctx.beginPath();points.forEach((pt,j)=>j?ctx.lineTo(...pt):ctx.moveTo(...pt));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}
    function mark(vertices,points){vertices.forEach((v,j)=>{const pt=points[j],n=v.label==='A'?0:v.label==='B'?1:2;ctx.beginPath();ctx.arc(...pt,6,0,Math.PI*2);ctx.fillStyle=v.generated?'#14745c':palette[n];ctx.fill();text(v.label,pt[0]+10,pt[1]+(v.label==='I2'?(large?36:27):-10),v.generated?'#14745c':palette[n],large?30:20);});}
    const worldMap=v=>[335+85*(v[0]+.35*v[2]),330-85*(v[1]+.16*v[2])];
    const clipMap=v=>[330+72*v[0],420-85*v[3]];
    const ndcMap=v=>[ndcBox.x+(v[0]+1)/2*ndcBox.w,ndcBox.y+(1-v[1])/2*ndcBox.h];
    const pixelMap=v=>[film.x+v[0]/64*film.w,film.y+v[1]/40*film.h];
    const ndc=scene.ndc,screen=scene.screen;
    function clipAxes(){polygon([[330,420],[330+72*4.5,420-85*4.5],[330-72*4.5,420-85*4.5]],'#e1eafb','#9aaecb');line([[80,420],[780,420]],muted);line([[330,420],[330,45]],'#abbcd4',1,[5,6]);text('xclip',787,424,muted);text('w',342,65,muted);text('x = −w',43,76,muted);text('x = w',658,76,muted);}
    function frame(box,normalized=false){ctx.fillStyle='#f9fbff';ctx.fillRect(box.x,box.y,box.w,box.h);ctx.strokeStyle='#9bafcb';ctx.lineWidth=2;ctx.strokeRect(box.x,box.y,box.w,box.h);text(normalized?'−1, +1':'0, 0',box.x,box.y-14,muted);text(normalized?'+1, −1':'64, 40',box.x+box.w,box.y+box.h+29,muted,font,'right');}
    const toScreen=screen.map(pixelMap);
    let shownVertices=scene.model,tableRows=[],tableHead='x / y / z / w',caption='',stats={covered:scene.fragments.length,passed:0,rejected:0};
    const fmt=v=>v.map(x=>Math.abs(x)<.0005?'0.00':x.toFixed(2)).join('  ');
    if(i<=2){
      for(let z=0;z<6;z++)line([worldMap([-1,0,z]),worldMap([3,0,z])]);for(let x=-1;x<=3;x++)line([worldMap([x,0,0]),worldMap([x,0,5])]);
      const O=worldMap([0,0,0]);line([O,worldMap([3.3,0,0])],palette[0],2);line([O,worldMap([0,2.3,0])],palette[1],2);line([O,worldMap([0,0,5])],palette[2],2);text('X',...worldMap([3.4,0,0]),palette[0]);text('Y',...worldMap([0,2.45,0]),palette[1]);text('Z',...worldMap([0,0,5.4]),palette[2]);
      const from=i===0?scene.model:i===1?scene.model:scene.world,to=i===0?scene.model:i===1?scene.world:scene.view;
      shownVertices=to.map((v,j)=>({...v,pos:K.mix(from[j].pos,v.pos,i===0?1:e)}));
      const points=shownVertices.map(v=>worldMap(v.pos));if(i===0){const edges=[[0,1],[1,2],[2,0]];edges.forEach(([x,y],j)=>{const t=Math.max(0,Math.min(1,p*3-j));line([points[x],K.mix(points[x],points[y],t)],blue,3);});}else{polygon(from.map(v=>worldMap(v.pos)),'#edf1f7','#bcc8d9');polygon(points);}
      mark(shownVertices,points);tableRows=shownVertices.map(v=>[v.label,fmt(v.pos)]);caption=i===0?'顶点位置 + 颜色 + 索引，尚未生成任何像素。':i===1?'灰色保留原位置；彩色三角形连续完成旋转与平移。':'同一物体换到相机坐标中；+Z 是相机前方。';
    }else if(i===3){
      clipAxes();const points=scene.clipInput.map((v,j)=>K.mix(worldMap(scene.view[j].pos),clipMap(v.pos),e));polygon(points);mark(scene.clipInput,points);shownVertices=scene.clipInput;tableRows=shownVertices.map(v=>[v.label,fmt(v.pos)]);caption='这是 xclip–w 截面：C 在 x>w 一侧，不能直接交给屏幕。';
    }else if(i===4){
      clipAxes();polygon(scene.clipInput.map(v=>clipMap(v.pos)),'rgba(189,70,60,.08)','#c59c97');line([...scene.clipInput.map(v=>clipMap(v.pos)),clipMap(scene.clipInput[0].pos)],'#bd463c',2,[5,6]);
      if(scene.clipped.length===4){const outside=clipMap(scene.clipInput[2].pos);text('C（越界）',outside[0]+12,outside[1]+20,'#bd463c',large?28:18);}
      shownVertices=scene.clipped.map(v=>({...v,pos:v.generated?K.mix(v.from,v.pos,e):v.pos}));polygon(shownVertices.map(v=>clipMap(v.pos)),'#dce6fa');mark(shownVertices,shownVertices.map(v=>clipMap(v.pos)));tableRows=scene.clipped.map(v=>[v.label,fmt(v.pos)]);caption=scene.clipped.length===4?'绿色 I1、I2 沿原边移动到边界；可见部分有 4 个顶点。':'关闭越界设置后，三个顶点都在裁剪体内，不生成新顶点。';
    }else if(i===5){
      frame(ndcBox,true);const pts=scene.clipped.map((v,j)=>K.mix(clipMap(v.pos),ndcMap(ndc[j]),e));polygon(pts);mark(scene.clipped,pts);shownVertices=scene.clipped;tableHead='x / y / z（逐渐除以 w）';tableRows=scene.clipped.map(v=>[v.label,fmt(v.pos.slice(0,3).map(x=>x/(1+(v.pos[3]-1)*e)))]);caption='每个顶点用自己的 w 做除法；现在得到 NDC，还不是像素坐标。';
    }else if(i===6){
      const box={x:ndcBox.x+(film.x-ndcBox.x)*e,y:ndcBox.y+(film.y-ndcBox.y)*e,w:ndcBox.w+(film.w-ndcBox.w)*e,h:ndcBox.h+(film.h-ndcBox.h)*e};frame(box,p<.5);const pts=ndc.map((v,j)=>K.mix(ndcMap(v),toScreen[j],e));polygon(pts);mark(scene.clipped,pts);tableHead='xscreen / yscreen / z';tableRows=screen.map((v,j)=>[scene.clipped[j].label,fmt(v)]);caption='方形标准化坐标展开为 64×40 视口；Y 轴改为从上向下。';
    }else{
      frame(film);const sx=film.w/64,sy=film.h/40;
      for(let x=0;x<=64;x++)line([[film.x+x*sx,film.y],[film.x+x*sx,film.y+film.h]],'#d9e2ef',.7);for(let y=0;y<=40;y++)line([[film.x,film.y+y*sy],[film.x+film.w,film.y+y*sy]],'#d9e2ef',.7);
      const occluded=f=>a.occluder&&f.x>=42&&f.x<56&&f.y>=17&&f.y<30;
      if(i===9&&a.occluder){ctx.fillStyle='#65778f';ctx.fillRect(film.x+42*sx,film.y+17*sy,14*sx,13*sy);}
      const cursor=Math.min(2560,Math.floor(p*2560)),linearToSrgb=x=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
      for(const f of scene.fragments){const processed=f.y*64+f.x<cursor;
        let color=blue;if(i===7&&!processed)continue;
        const shaded=`rgb(${f.color.map(v=>Math.round(255*linearToSrgb(Math.max(0,Math.min(1,v))))).join(',')})`;
        if(i===8)color=processed?shaded:blue;
        if(i===9){const passed=K.depthPass(f.depth,occluded(f)?.45:1);if(processed){if(passed)stats.passed++;else stats.rejected++;}if(!processed||!passed)continue;color=shaded;}
        ctx.fillStyle=color;ctx.fillRect(film.x+f.x*sx+1,film.y+f.y*sy+1,sx-1,sy-1);
      }
      if(i===7||i===8||i===9){const y=film.y+Math.min(40,Math.floor(cursor/64))*sy;line([[film.x,y],[film.x+film.w,y]],'#b17b10',3);}
      line([...toScreen,toScreen[0]],blue,2);
      if(scene.clipped.length>3)line([toScreen[0],toScreen[2]],'#52647a',1,[5,5]);
      const f=scene.probe;if(f){const x=film.x+(f.x+.5)*sx,y=film.y+(f.y+.5)*sy;ctx.strokeStyle='#182740';ctx.lineWidth=2;ctx.strokeRect(x-sx*1.2,y-sy*1.2,sx*2.4,sy*2.4);tableHead=`探针像素 (${f.x}, ${f.y})`;tableRows=[['权重 λ',fmt(f.weights)],['NDC 深度',f.depth.toFixed(4)],['线性 RGB',fmt(f.color)]];if(i===9)tableRows.push(['已有深度',occluded(f)?'0.4500':'1.0000'],['测试结果',f.y*64+f.x>=cursor?'等待处理':K.depthPass(f.depth,occluded(f)?.45:1)?'通过 → 写入':'失败 → 保留挡板']);}
      caption=i===7?`扫描中心采样位置，完整覆盖共有 ${scene.fragments.length} 个候选片元。`:i===8?'扫描经过的位置由蓝色覆盖变为透视校正颜色；颜色还只是候选输出。':`当前已处理：通过 ${stats.passed}，被挡住 ${stats.rejected}。灰色区域是先前写入的挡板。`;
    }
    text(i<3?'位置改变 / 坐标系切换':i<5?'裁剪空间：xclip 与 w 的二维截面':i===5?'NDC：标准化设备坐标':'屏幕与采样网格',30,32,muted,font);
    q('#pipe-time').value=String(a.time);q('#pipe-time-label').textContent=`${a.time.toFixed(1)} / ${total.toFixed(0)} 秒`;
    if(a.lastStage!==i){a.root.querySelectorAll('[data-pipe-stage]').forEach(b=>{const n=+b.dataset.pipeStage;b.setAttribute('aria-pressed',String(n===i));b.classList.toggle('pipe-done',n<i);});q('#pipe-number').textContent=`${String(i+1).padStart(2,'0')} / 10`;q('#pipe-title').textContent=s[0];q('#pipe-en').textContent=s[1];q('#pipe-input').textContent=s[3];q('#pipe-output').textContent=s[4];q('#pipe-formula').textContent=s[5];a.lastStage=i;}
    q('#pipe-explanation').textContent=i===4&&scene.clipped.length===3?'所有顶点都在视野内，因此本次裁剪不改变这个三角形。':s[2];
    q('#pipe-data').innerHTML=`<div class="pipe-table-label">${tableHead}</div><table><tbody>${tableRows.map(([name,value])=>`<tr><th scope="row">${name}</th><td>${value}</td></tr>`).join('')}</tbody></table>`;
    q('#pipe-caption').textContent=caption;a.canvas.setAttribute('aria-description',`${s[0]}。${caption}`);a.root.dataset.stage=String(i);a.root.dataset.covered=String(stats.covered);a.root.dataset.passed=String(stats.passed);a.root.dataset.rejected=String(stats.rejected);q('#pipe-prev').disabled=i===0;q('#pipe-next').disabled=i===9;
  }
  window.RasterPipelineUI={markup,mount,pause,destroy,stages,duration:total};
})();
