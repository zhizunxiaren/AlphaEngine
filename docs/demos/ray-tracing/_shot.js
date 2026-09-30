/* 用 headless Chrome + CDP 精确截取页面某区域 —— 用于目视验证 CSS / 排版 / 大小写
 * 用法: node _shot.js [url] [输出png] [选择器] [截图前要执行的脚本] [裁剪区]
 *   选择器为空 → 截整屏；给定选择器 → 把该元素滚入视野并按页面坐标裁剪（2x 高清）
 *   第 4 个参数是可选的 JS 表达式，在等待稳定后、截图前求值一次，
 *   用来把动画推进到想看的状态（例如 §7 光路要先把 6 个节点单步走完，否则画面是空的）。
 *   第 5 个参数是可选的自定义裁剪区 "x,y,w,h"（页面坐标，2x），用于放大看某个细节。
 * 说明：不能用 `chrome --screenshot`，它在页面首帧渲染完成前就抓图（本页实测得到全白图）；
 *      且本页 §6 有持续运行的渐进式路径追踪器，`--virtual-time-budget` 会把虚拟时间推进
 *      拖成几十秒导致超时。CDP 手动等待 + 元素裁剪是唯一稳定路径。
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TARGET_URL = process.argv[2] || require('url').pathToFileURL(path.join(__dirname, 'index.html')).href;
const OUT = process.argv[3] || path.join(os.tmpdir(), '_shot.png');
const SEL = process.argv[4] || '';
const SETUP = process.argv[5] || '';
const CROP = process.argv[6] || '';
const PORT = 9411 + (process.pid % 200);
const W = 1180, H = 900;
const UDD = path.join(os.tmpdir(), '_shot_profile');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--disable-background-networking', '--disable-sync',
  '--disable-extensions', '--disable-component-update', '--force-device-scale-factor=1',
  `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, `--user-data-dir=${UDD}`, TARGET_URL,
], { stdio: 'ignore', detached: false });

function killChrome() {
  try { spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); }
  catch (e) { try { chrome.kill(); } catch (e2) {} }
}

(async () => {
  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    try {
      const arr = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      page = arr.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch (e) { /* 端口未就绪 */ }
    if (!page) await sleep(250);
  }
  if (!page) { console.log('❌ 调试端口未就绪'); killChrome(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let seq = 0;
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', () => rej(new Error('WebSocket 连接失败')));
  });
  const send = (method, params = {}) => new Promise(res => {
    const n = ++seq; pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(1500);                                   // 等首帧布局/动画稳定

  // 顺手抓一下页面里的 JS 异常，避免"截到图但脚本其实崩了"
  const errs = await send('Runtime.evaluate', {
    expression: 'window.__errs ? window.__errs.length : 0', returnByValue: true,
  });

  /* 截图前先把动画推进到目标状态（例如 §7 需要先把光路单步走完；§8 切模式会改变
     某个容器的高度）。这一步必须发生在「量选区」之前：否则裁到的是推进前的尺寸 ——
     典型症状是 §8 的分支表在 m0 只有 1 行、切到 m3 变 3 行，图却只截到第一行。 */
  if (SETUP) {
    const s = await send('Runtime.evaluate', { expression: SETUP, returnByValue: true, awaitPromise: true });
    const desc = s.result && s.result.result ? JSON.stringify(s.result.result.value) : '';
    if (s.result && s.result.exceptionDetails) {
      console.log('⚠️  SETUP 抛异常: ' + (s.result.exceptionDetails.text || '') + ' ' + desc);
    } else {
      console.log('   SETUP 已执行 → ' + desc);
    }
    await sleep(700);                                  // 等下一帧把新状态画出来
  }

  let clip = null;
  if (SEL) {
    const r = await send('Runtime.evaluate', {
      expression: `(() => { const el = document.querySelector(${JSON.stringify(SEL)});
        if (!el) return null; el.scrollIntoView({ block: 'center' });
        const b = el.getBoundingClientRect();
        return { x: b.x + scrollX, y: b.y + scrollY, width: b.width, height: b.height }; })()`,
      returnByValue: true,
    });
    const v = r.result && r.result.result && r.result.result.value;
    if (v) {
      /* CROP = "dx,dy,w,h"：相对该元素左上角的裁剪区，用来放大看细节 */
      if (CROP) {
        const [dx, dy, cw, ch] = CROP.split(',').map(Number);
        clip = { x: Math.max(0, v.x + dx), y: Math.max(0, v.y + dy), width: cw, height: ch, scale: 2 };
      } else {
        clip = { x: Math.max(0, v.x - 12), y: Math.max(0, v.y - 12), width: v.width + 24, height: v.height + 24, scale: 2 };
      }
    } else console.log('⚠️  未找到选择器: ' + SEL);
    await sleep(500);                                  // 等滚动后的重绘
  }

  const shot = await send('Page.captureScreenshot',
    clip ? { format: 'png', clip, captureBeyondViewport: true } : { format: 'png' });
  const data = shot.result && shot.result.data;
  if (!data) {
    console.log('❌ 截图失败: ' + JSON.stringify(shot).slice(0, 300));
    ws.close(); killChrome(); process.exit(1);
  }
  fs.writeFileSync(OUT, Buffer.from(data, 'base64'));
  console.log('✅ 截图 ' + fs.statSync(OUT).size + ' bytes → ' + OUT
    + (clip ? `  选区 ${Math.round(clip.width)}×${Math.round(clip.height)} @2x` : '  整屏'
    + (errs.result && errs.result.result ? `  页面异常计数=${errs.result.result.value}` : '')));
  ws.close();
  killChrome();
  await sleep(400);
  process.exit(0);
})().catch(e => { console.log('❌ ' + e.message); killChrome(); process.exit(1); });
