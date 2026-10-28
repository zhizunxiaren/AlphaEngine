'use strict';
/* CDP 截图：node _shot.js <html路径> <out.png> [选择器] [序号] [缩放]
   不要用 chrome --screenshot：本页首帧由内联脚本绘制，--screenshot 会抓到空白帧。 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TARGET = process.argv[2];
const OUT = process.argv[3];
const SEL = process.argv[4] || null;
const IDX = Number(process.argv[5] || 0);
const SCALE = Number(process.argv[6] || 2);
const PORT = 9300 + Math.floor(Math.random() * 300);
const PROFILE = path.join(os.tmpdir(), 'wb-cdp-profile-importance');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(PROFILE, { recursive: true });
  const fileUrl = 'file:///' + path.resolve(TARGET).replace(/\\/g, '/');
  const chrome = cp.spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
    '--window-size=900,1400', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', fileUrl,
  ], { stdio: 'ignore' });

  let ws, page;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) break;
    } catch (e) { /* 还没起来 */ }
  }
  if (!page) { console.error('CDP 连接失败'); chrome.kill(); process.exit(1); }

  let id = 0;
  const pending = new Map();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1400, deviceScaleFactor: 1, mobile: false });
  await sleep(1600);                                  /* 等真实绘制，不靠 --virtual-time-budget */

  let clip = null;
  if (SEL) {
    const r = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(()=>{const e=document.querySelectorAll(${JSON.stringify(SEL)})[${IDX}];
        if(!e) return null; e.scrollIntoView({block:'center'});
        const b=e.getBoundingClientRect();
        return {x:b.x+scrollX,y:b.y+scrollY,width:b.width,height:b.height};})()`,
    });
    clip = r.result && r.result.value;
    if (!clip) { console.error('选择器没命中：' + SEL); }
  }
  /* 可选裁剪：node _shot.js ... "dx,dy,w,h"（相对元素左上角） */
  const CROP = process.argv[7];
  if (clip && CROP) {
    const [dx, dy, cw, ch] = CROP.split(',').map(Number);
    clip = { x: clip.x + dx, y: clip.y + dy, width: cw, height: ch };
  }
  await sleep(300);
  const shot = await send('Page.captureScreenshot', {
    format: 'png', clip: clip ? { ...clip, scale: SCALE } : undefined, captureBeyondViewport: true,
  });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  const probe = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(()=>{const o=[];document.querySelectorAll('canvas').forEach(c=>{
      const b=c.getBoundingClientRect();const g=c.getContext('2d');
      let d=0;try{const im=g.getImageData(0,0,c.width,c.height);const s=new Set();
        for(let i=0;i<im.data.length;i+=4*997)s.add(im.data[i]+','+im.data[i+1]+','+im.data[i+2]);
        d=s.size;}catch(e){d=-1}
      o.push({id:c.id,w:c.width,h:c.height,cssW:Math.round(b.width),distinctColors:d});});return o;})()`,
  });
  console.log('saved ' + OUT);
  console.log('canvas:', JSON.stringify(probe.result && probe.result.value));
  ws.close();
  cp.spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})();
