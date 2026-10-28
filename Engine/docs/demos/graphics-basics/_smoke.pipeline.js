/* 在教程浏览器中执行；用实际画布和时间轴确认连续运动，而不只检查阶段名称。 */
(async function(){
  const checks=[],errors=[],assert=(v,t)=>{if(!v)throw Error(t);checks.push(t);},q=s=>document.querySelector(s),wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const onError=e=>errors.push(e.message);window.addEventListener('error',onError);
  function time(t){const e=q('#pipe-time');e.value=t;e.dispatchEvent(new Event('input',{bubbles:true}));}
  function check(id,checked){const e=q(id);e.checked=checked;e.dispatchEvent(new Event('change',{bubbles:true}));}
  function picture(){const a=q('#pipe-canvas').getContext('2d').getImageData(0,0,900,500).data;let hash=0;for(let i=0;i<a.length;i+=16)hash=(Math.imul(hash,31)+a[i]+a[i+1]*3+a[i+2]*7)|0;return hash;}
  function pixel(x,y){return [...q('#pipe-canvas').getContext('2d').getImageData(x,y,1,1).data].slice(0,3).join(',');}
  try{
    location.hash='raster';await wait();q('[data-view="learn"]').click();assert(q('#pipe-play').getBoundingClientRect().top<q('#pipe-canvas').getBoundingClientRect().top,'播放入口位于画布上方');
    const hashes=[];
    for(let i=0;i<10;i++){q(`[data-pipe-stage="${i}"]`).click();assert(q('#raster-pipeline').dataset.stage===String(i),`阶段 ${i+1} 可跳转`);hashes.push(picture());assert(q('#pipe-data').textContent.length>20,`阶段 ${i+1} 有实际数值`);}
    assert(new Set(hashes).size===10,'十个阶段真实画面不同');
    for(let i=1;i<=6;i++){time(i*3.4+.1);const start=picture();time(i*3.4+2.8);assert(start!==picture(),`阶段 ${i+1} 内部有连续位移`);}
    q('[data-pipe-stage="4"]').click();assert(q('#pipe-data').textContent.includes('I2'),'越界产生两个交点');check('#pipe-outside',false);assert(!q('#pipe-data').textContent.includes('I1'),'关闭越界不产生新交点');check('#pipe-outside',true);
    time(7*3.4+.02);const first=picture();time(8*3.4-.02);assert(first!==picture(),'光栅覆盖随扫描累积');
    time(8*3.4+.02);const mask=picture();time(9*3.4-.02);assert(mask!==picture(),'片元由覆盖蓝色变为插值颜色');
    time(34);const withOccluder=pixel(600,270);const rejected=+q('#raster-pipeline').dataset.rejected;assert(rejected>0&&q('#pipe-data').textContent.includes('失败'),'挡板拒绝较远片元');check('#pipe-occluder',false);const withoutOccluder=pixel(600,270);assert(withOccluder!==withoutOccluder,'深度开关改变真实帧缓冲像素');assert(+q('#raster-pipeline').dataset.rejected===0,'无挡板时所有片元通过');assert(+q('#raster-pipeline').dataset.passed===+q('#raster-pipeline').dataset.covered,'最终片元通过计数与覆盖一致');
    q('#pipe-restart').click();const speed=q('#pipe-speed');speed.value=2;speed.dispatchEvent(new Event('change'));q('#pipe-play').click();for(let n=0;n<40&&+q('#pipe-time').value===0;n++)await new Promise(r=>setTimeout(r,50));q('#pipe-play').click();const paused=+q('#pipe-time').value;await new Promise(r=>setTimeout(r,100));assert(paused>0&&+q('#pipe-time').value===paused,'播放、速度与暂停有效');
    q('#pipe-restart').click();const nativeRAF=window.requestAnimationFrame;try{window.requestAnimationFrame=fn=>nativeRAF.call(window,t=>fn(t-10000));q('#pipe-play').click();await new Promise(r=>setTimeout(r,80));q('#pipe-play').click();assert(+q('#pipe-time').value>=0,'首帧时间戳滞后不产生负阶段');}finally{window.requestAnimationFrame=nativeRAF;}
    time(33.9);q('#pipe-play').click();for(let n=0;n<40&&q('#pipe-play').getAttribute('aria-pressed')==='true';n++)await new Promise(r=>setTimeout(r,50));assert(+q('#pipe-time').value===34&&q('#pipe-play').getAttribute('aria-pressed')==='false','播放到结尾自动停止');
    q('#pipe-restart').click();q('#pipe-play').click();q('#play').click();assert(q('#pipe-play').getAttribute('aria-pressed')==='false','局部演示与全流程互斥播放');q('#play').click();
    assert(document.documentElement.scrollWidth<=innerWidth,'全流程窄屏无横向溢出');
    q('#pipe-play').click();location.hash='overview';await wait();assert(!q('#pipe-canvas'),'离开章节移除旧管线');location.hash='raster';await wait();assert(q('#pipe-play').getAttribute('aria-pressed')==='false','回到章节无残留动画');assert(errors.length===0,'全流程零运行错误');
    return {passed:checks.length,stages:10,width:innerWidth,rejectedWithOccluder:rejected,withOccluder,withoutOccluder,errors};
  }finally{window.removeEventListener('error',onError);}
})();
