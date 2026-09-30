/* §7 校验的负向测试：人为注入四种「画面看着正常、物理已经错了」的缺陷，
 * 逐个跑 verify.render.js，确认对应检查点确实会 FAIL。
 *
 * 为什么必须做负向测试：一条永远 PASS 的检查等于没有检查。
 * 尤其 §7 的几何是解析反推出来的，改一个符号画面照样是"一条漂亮折线"。
 *
 * 用法: node _neg7.js
 * 临时文件写在系统临时目录，跑完一个个删除（不做批量删除）。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HTML = path.join(__dirname, 'index.html');
const VR = path.join(__dirname, 'verify.render.js');
const NODE = process.execPath;
const src = fs.readFileSync(HTML, 'utf8');
const tmp = os.tmpdir();

/* 每条：名字 + 注入替换 + 期望失败的检查点关键字 */
const MUTANTS = [
  {
    name: 'M1 绘制用的玻璃球半径比物理半径大 8%',
    desc: '画面里圆画得更大，但交点仍按真实半径算 → 顶点会落在圆周外侧',
    find: "drawBall(ctx,V,GC,R_GLASS,'glass');",
    repl: "drawBall(ctx,V,GC,R_GLASS*1.08,'glass');",
    expect: ['不在球面上', '轮廓半径比'],
  },
  {
    name: 'M2 交换出场面两个角度弧的绘制半径',
    desc: '把入射弧与折射弧的半径对调，图形看着仍是一对角度弧',
    find: "          var thOut = Math.acos(Math.min(1, Math.abs(dot(s.dOut, s.n))))*DEG;\n"
        + "          angleArc(ctx,V,s.to,aIn,mIn,0.60,'#ffb08a', s.inc.toFixed(2) + '°');\n"
        + "          angleArc(ctx,V,s.to,mOut,aOut,0.74,'#9fe8b0', thOut.toFixed(2) + '°');",
    repl: "          var thOut = Math.acos(Math.min(1, Math.abs(dot(s.dOut, s.n))))*DEG;\n"
        + "          angleArc(ctx,V,s.to,aIn,mIn,0.74,'#ffb08a', s.inc.toFixed(2) + '°');\n"
        + "          angleArc(ctx,V,s.to,mOut,aOut,0.60,'#9fe8b0', thOut.toFixed(2) + '°');",
    expect: ['空气→玻璃', '玻璃→空气', '构成镜像'],
  },
  {
    name: 'M3 玻璃入场角由 50° 改成 20°',
    desc: '布局本身仍自洽（页面所有数字都是算出来的），但偏离标定值',
    find: 'var TH_GLASS_IN = 50, G_TARGET_X = 5.90;',
    repl: 'var TH_GLASS_IN = 20, G_TARGET_X = 5.90;',
    expect: ['构成镜像'],
  },
  {
    name: 'M4 镜面反射的第二条角度弧起止向量画反',
    desc: '反射弧退化成零夹角，等于"反射定律没画出来"',
    find: "          angleArc(ctx,V,s.to,mOut,aOut,0.60,'#9fe8b0', s.inc.toFixed(1) + '°');",
    repl: "          angleArc(ctx,V,s.to,mOut,mIn,0.60,'#9fe8b0', s.inc.toFixed(1) + '°');",
    expect: ['镜面反射'],
  },
  {
    name: 'M5 关掉标签避让，固定用第一个候选位置',
    desc: '物理与几何全部不变，只是「球内角」的两个标注又叠回弦的中段',
    /* 注入点注意：§7 与 §8 各有一份 chip()，两者在这一行**逐字相同**
       （_check.js 的跨节一致性检查要求如此），且本文件用 split/join 替换全部出现，
       所以这条变异会同时关掉两节的避让。这是可接受的：本测试要证明的是
       「关掉避让 ⇒ 标签互相压住这个检查点会响」，而不是精确定位到某一节。
       锚点曾写成 if(!clash)，那是重写避让算法之前的旧变量名，页面改动后已失效
       —— 失效时本文件会打印「注入点没找到」，所以它报了错，没有变成假通过。 */
    find: '      if(over === 0){ rect = r; baseY = ay; break; }',
    repl: '      if(over === 0 || true){ rect = r; baseY = ay; break; }',
    expect: ['标签互相压住'],
  },
  {
    name: 'M6 把球名提前到光线之前落字（旧的绘制次序）',
    desc: '几何与标签避让都没变，只是出射光线又会压在「玻璃球 ior = 1.5」上',
    find: "    reserve(ctx, mPos.x, mPos.y, mLabel, 'center');\n"
        + "    reserve(ctx, gPos.x, gPos.y, gLabel, 'center');",
    repl: "    ctx.fillText(mLabel, mPos.x, mPos.y);\n"
        + "    ctx.fillText(gLabel, gPos.x, gPos.y);\n"
        + "    reserve(ctx, mPos.x, mPos.y, mLabel, 'center');\n"
        + "    reserve(ctx, gPos.x, gPos.y, gLabel, 'center');",
    expect: ['落字次序'],
  },
];

const written = [];
let allGood = true;

for (let i = 0; i < MUTANTS.length; i++) {
  const m = MUTANTS[i];
  if (src.indexOf(m.find) < 0) {
    console.log('\n❌ ' + m.name + '\n   注入点没找到（页面已被改动？），无法测试');
    allGood = false;
    continue;
  }
  const out = src.split(m.find).join(m.repl);
  const p = path.join(tmp, 'alpha_neg7_' + i + '.html');
  fs.writeFileSync(p, out, 'utf8');
  written.push(p);

  let stdout = '', code = 0;
  try {
    stdout = execFileSync(NODE, [VR, p], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    stdout = (e.stdout || '') + (e.stderr || '');
    code = e.status;
  }
  const lines = stdout.split('\n');
  const failed = lines.filter(l => l.indexOf('FAIL') >= 0).map(l => l.trim());
  const tail = lines.filter(l => /\d+ passed, \d+ failed/.test(l))[0] || '(无汇总行)';

  const hitExpect = m.expect.filter(k => failed.some(f => f.indexOf(k) >= 0));
  const okAll = hitExpect.length === m.expect.length && /0 failed/.test(tail) === false;

  console.log('\n=== ' + m.name + ' ===');
  console.log('   ' + m.desc);
  console.log('   ' + tail + '   退出码 ' + code);
  failed.forEach(f => console.log('   · ' + f));
  if (okAll) {
    console.log('   ✅ 期望的检查点已触发: ' + hitExpect.join(' / '));
  } else {
    console.log('   ❌ 期望触发的检查点 ' + JSON.stringify(m.expect)
      + '，实际只命中 ' + JSON.stringify(hitExpect));
    allGood = false;
  }
}

/* 一次只删一个明确路径的文件 */
console.log('\n清理临时文件:');
for (const p of written) {
  try { fs.unlinkSync(p); console.log('   已删除 ' + p); }
  catch (e) { console.log('   删除失败 ' + p + ' : ' + e.message); }
}

console.log('\n' + (allGood ? '✅ 负向测试全部按预期失败（检查点非空转）' : '❌ 有检查点未能被缺陷触发'));
process.exit(allGood ? 0 : 1);
