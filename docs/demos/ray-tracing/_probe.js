/* 通用画布探针：用 headless Chrome + CDP 打开页面，逐个 canvas 读真实像素。
 * 用途：当「画布是黑的」时，截屏无法区分以下三种原因（它们视觉上完全一样）：
 *   ① 元素根本没被绘制（露出 CSS 背景）
 *   ② 被绘制了但内容本身是背景色（如解码阶段全填背景色）
 *   ③ 内容正确但没有合成上来
 * 只有读像素能区分。本脚本对每个 canvas 报告尺寸 / CSS 背景 / 采样像素 / 颜色结构度。
 *
 * 用法: node _probe.js [url]
 */
const { spawn, spawnSync } = require('child_process');
const os = require('os'), path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TARGET_URL = process.argv[2] || require('url').pathToFileURL(path.join(__dirname, 'index.html')).href;
const PORT = 9611 + (process.pid % 200);
const UDD = path.join(os.tmpdir(), '_probe_profile');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--disable-background-networking', '--disable-sync',
  '--disable-extensions', '--disable-component-update', '--force-device-scale-factor=1',
  '--window-size=1180,900', `--remote-debugging-port=${PORT}`, `--user-data-dir=${UDD}`, TARGET_URL,
], { stdio: 'ignore' });

function killChrome() {
  try { spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); }
  catch (e) {}
}

/* 在页面里跑：遍历所有 canvas，返回结构化摘要（只回传数字，不回传像素数组） */
const PROBE = `(() => {
  const out = [];
  document.querySelectorAll('canvas').forEach(cv => {
    const ctx = cv.getContext('2d');
    let sample = null, struct = null, err = null;
    try {
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      const at = (x, y) => { const i = (y*cv.width + x)*4; return [d[i],d[i+1],d[i+2],d[i+3]].join(','); };
      sample = {
        center: at(Math.floor(cv.width/2), Math.floor(cv.height/2)),
        q1:     at(Math.floor(cv.width*0.3), Math.floor(cv.height*0.35)),
        q2:     at(Math.floor(cv.width*0.7), Math.floor(cv.height*0.65)),
        corner: at(2, 2),
      };
      // 颜色结构度：20x20 网格采样，统计不同颜色数与出现最多的颜色占比
      const counts = {};
      const G = 20;
      for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
        const c = at(Math.floor(gx*cv.width/G), Math.floor(gy*cv.height/G));
        counts[c] = (counts[c] || 0) + 1;
      }
      const vals = Object.values(counts).sort((a,b) => b-a);
      struct = { distinct: vals.length, topShare: +(vals[0]/(G*G)).toFixed(2), topColor: Object.keys(counts).find(k => counts[k] === vals[0]) };
    } catch (e) { err = e.message; }
    const r = cv.getBoundingClientRect();
    out.push({
      id: cv.id, buf: cv.width + 'x' + cv.height, css: Math.round(r.width) + 'x' + Math.round(r.height),
      bg: getComputedStyle(cv).backgroundColor, sample, struct, err,
    });
  });
  return out;
})()`;

(async () => {
  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    try {
      const arr = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      page = arr.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch (e) {}
    if (!page) await sleep(250);
  }
  if (!page) { console.log('❌ 调试端口未就绪'); killChrome(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let seq = 0;
  const pageErrors = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      pageErrors.push((d.exception && d.exception.description || d.text || '').split('\n')[0]);
    }
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

  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(2000);

  const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  const rows = r.result && r.result.result && r.result.result.value;
  if (!rows) { console.log('❌ 探测失败: ' + JSON.stringify(r).slice(0, 400)); ws.close(); killChrome(); process.exit(1); }

  console.log('页面 JS 异常 (' + pageErrors.length + '):' + (pageErrors.length ? '\n  ' + pageErrors.slice(0, 5).join('\n  ') : ' 无'));
  console.log('\n画布探针 (共 ' + rows.length + ' 个):');
  for (const c of rows) {
    if (!c.id) continue;
    const s = c.struct || {};
    console.log('\n# ' + c.id);
    console.log('   缓冲区 ' + c.buf + '   显示 ' + c.css + '   CSS背景 ' + c.bg);
    console.log('   像素 中心=' + (c.sample && c.sample.center) + '  左上=' + (c.sample && c.sample.corner)
      + '  30%/35%=' + (c.sample && c.sample.q1) + '  70%/65%=' + (c.sample && c.sample.q2));
    console.log('   颜色结构 不同色数=' + s.distinct + '  主色占比=' + s.topShare + '  主色=' + s.topColor);
    if (c.err) console.log('   ⚠️ getImageData 失败: ' + c.err);
  }

  ws.close(); killChrome(); await sleep(400); process.exit(0);
})().catch(e => { console.log('❌ ' + e.message); killChrome(); process.exit(1); });
