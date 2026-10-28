/* 在打开教程的浏览器控制台中粘贴执行，或由浏览器 evaluate 工具运行。
   使用真实 DOM、Canvas 和事件；结束时恢复原有阅读/复习数据。 */
(async function graphicsBrowserSmoke(){
  'use strict';
  const storageKey='alpha-graphics-basics-v1';
  const original=localStorage.getItem(storageKey),errors=[],checks=[];
  const onError=e=>errors.push(e.message);
  window.addEventListener('error',onError);
  const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  const settle=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const go=async id=>{location.hash=id;await settle();document.querySelector('[data-view="learn"]').click();};
  const set=(key,value)=>{const e=document.querySelector('#ctl-'+key);e.value=value;e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const pixel=(x,y)=>Array.from(document.querySelector('#demo').getContext('2d').getImageData(x,y,1,1).data).slice(0,3).join(',');
  try{
    for(const l of GraphicsContent.lessons){
      await go(l.id);document.querySelector('#reset').click();
      const pixels=document.querySelector('#demo').getContext('2d').getImageData(0,0,640,380).data;
      let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]!==238||pixels[i+1]!==243||pixels[i+2]!==251)ink++;
      assert(ink>500,`${l.id}: 真实画面非空`);
      for(const c of l.controls){
        document.querySelector('#reset').click();
        for(const value of Array.isArray(c[2])?c.slice(2).map(o=>o[0]):[c[2],c[3]])set(c[0],value);
      }
      document.querySelector('#reset').click();document.querySelector('#step').click();
      const flow=Array.from(document.querySelectorAll('[data-flow]')).at(-1);flow.click();assert(flow.getAttribute('aria-pressed')==='true',`${l.id}: 流程图联动`);
      const answers=document.querySelectorAll('[data-answer]');answers[(l.quiz[2]+1)%answers.length].click();assert(!!document.querySelector('.wrong'),`${l.id}: 错答反馈`);
      answers[l.quiz[2]].click();assert(!!document.querySelector('.correct'),`${l.id}: 正答反馈`);
      assert(document.documentElement.scrollWidth<=innerWidth,`${l.id}: 无横向溢出`);
    }
    await go('depth');document.querySelector('#reset').click();const a=pixel(340,200);document.querySelector('#swap').click();assert(a==='35,92,220'&&pixel(340,200)===a,'深度测试独立于绘制顺序');
    set('mode','paint');const b=pixel(340,200);document.querySelector('#swap').click();assert(pixel(340,200)!==b,'关闭深度后绘制顺序改变遮挡');
    set('mode','alpha');const c=pixel(340,200);document.querySelector('#swap').click();assert(pixel(340,200)!==c,'透明 over 次序改变真实像素');
    await go('color');document.querySelector('#reset').click();assert(pixel(164,140)==='128,128,128'&&pixel(474,140)==='188,188,188','sRGB 两种平均的独立像素真值');
    await go('vectors');set('angle',0);document.querySelector('#play').click();for(let i=0;i<40&&document.querySelector('#ctl-angle').value==='0';i++)await new Promise(r=>setTimeout(r,50));document.querySelector('#play').click();const angle=document.querySelector('#ctl-angle').value;await new Promise(r=>setTimeout(r,90));assert(angle!=='0'&&document.querySelector('#ctl-angle').value===angle,'动画播放且暂停后停止');
    document.querySelector('[data-view="reference"]').click();const search=document.querySelector('#ref-search');search.value='normal';search.dispatchEvent(new Event('input'));assert(document.querySelectorAll('.reference-item').length>0,'中英术语搜索');search.value='无此概念xyz';search.dispatchEvent(new Event('input'));assert(document.querySelectorAll('.reference-item').length===0,'搜索空状态');
    document.querySelector('[data-view="review"]').click();let cards=0;while(document.querySelector('#reveal-answer')){document.querySelector('#reveal-answer').click();assert(!document.querySelector('#review-reveal').hidden,`复习卡 ${++cards}: 揭示答案`);document.querySelector('#remember').click();}assert(cards===78,'12 题 + 66 概念卡均可完成');
    document.querySelector('[data-view="todo"]').click();assert(document.querySelectorAll('.todo-label').length===10,'现代内容仅列为十组 TODO');assert(document.documentElement.scrollWidth<=innerWidth,'TODO 无横向溢出');
    assert(errors.length===0,'所有操作零运行异常');
    return {passed:checks.length,chapters:12,concepts:66,reviewCards:cards,viewport:innerWidth,errors};
  }finally{
    if(original===null)localStorage.removeItem(storageKey);else localStorage.setItem(storageKey,original);
    window.removeEventListener('error',onError);
    // 重新加载后，界面从已恢复的持久数据初始化。
  }
})();
