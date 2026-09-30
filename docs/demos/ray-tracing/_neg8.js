/* §8 校验的负向测试：人为注入十九种「画面看着仍然合理、物理/统计已经错了」的缺陷，
 * 逐个跑 verify.render.js，确认对应检查点确实会 FAIL。
 *
 * 为什么必须做负向测试：一条永远 PASS 的检查等于没有检查。
 * §8 尤其危险——它考的是「统计分布」和「分段边界」这类抽象结论，
 * 把 hits++ 删掉、把扫描范围缩短 10°、把分段条件从 hits 换成 term，
 * 画面依旧是一条漂亮的彩色条带，肉眼根本看不出来。
 *
 * 其中 M1 与 M8 是本次真实修掉的两个 bug 的「反向注入」：
 *   · tSky 漏判有限性 → 朝下打空被算成到达天光，坐标变 Infinity/NaN
 *   · 新起点不沿新方向偏移 EPS → 近根被 t>1e-9 挡掉，出射被记成再次进入
 * 把它们注回去，校验必须报警；否则说明这两条检查是空转的。
 *
 * 用法: node _neg8.js
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

const MUTANTS = [
  {
    name: 'M1 去掉 §8 的 isFinite(tSky) 守卫',
    desc: '朝下打空的光线被当成「到达天光」，终点坐标为 ±Infinity（画面只是少一条线，不报错）',
    find: "    var tSky = (d.y > 1e-9) ? (SKY_Y - p.y)/d.y : Infinity;\n"
        + "    if(isFinite(tSky) && tSky > 1e-9 && (!h || tSky < h.t)){",
    repl: "    var tSky = (d.y > 1e-9) ? (SKY_Y - p.y)/d.y : Infinity;\n"
        + "    if(tSky > 1e-9 && (!h || tSky < h.t)){",
    expect: ['不是有限数'],
  },
  {
    name: 'M2 扫描范围从 −90°~+90° 缩成 −80°~+90°',
    desc: '少扫了最左 10°，分段总数与切线角对照看上去都还成立',
    find: '  var A0 = -90, A1 = 90;                              // 扫描范围：朝前的半圈',
    repl: '  var A0 = -80, A1 = 90;                              // 扫描范围：朝前的半圈',
    expect: ['没有覆盖'],
  },
  {
    name: 'M3 命中计数器 hits++ 不递增',
    desc: '所有方向都记成 0 次命中，于是「占比」「五种终局读数」全部退化成同一类。'
        + '§8 的物理内核 interact() 被 trace() 与 buildTree() 共用，所以两处的 hits++ 都要注掉',
    pairs: [
      ["      hits++;\n      if(!first) first = {obj:it.hit.obj, P:it.hit.P, n:it.hit.n, inc:it.inc};",
       "      if(!first) first = {obj:it.hit.obj, P:it.hit.P, n:it.hit.n, inc:it.inc};"],
      ["      hits++;\n      var h = it.hit;",
       "      var h = it.hit;"],
    ],
    expect: ['bt-cnt-m1'],
  },
  {
    name: 'M4 分段判据从命中次数换成终止原因',
    desc: '色块按「射向天空 / 逃出场景」切分——巧合的话仍会得到若干条彩色色块',
    find: "      if(!prev || prev.hits !== r.hits){",
    repl: "      if(!prev || prev.term !== r.term){",
    expect: ['分段数不是'],
  },
  {
    name: 'M5 maxDepth 截断演示的预算从 2 改回 8',
    desc: '截断那一格不再截断，与「命中 3 次」完全重合，读数却仍标着 maxDepth 截断',
    find: "    mx: {key:'mx', label:'maxDepth 截断', a:-38, depth:2, hits:2, col:'#ff8f8f'}",
    repl: "    mx: {key:'mx', label:'maxDepth 截断', a:-38, depth:8, hits:2, col:'#ff8f8f'}",
    expect: ['bt-cnt-mx'],
  },
  {
    name: 'M6 命中次数调色板把「0 次」与「2 次」对调',
    desc: '图例与色块颜色互换；校验是从色块颜色反读命中次数的，必须能识破',
    find: "  var HITS_COL = {0:'#8b93a8', 1:'#ffd666', 2:'#7fe3ff', 3:'#ffb08a'};",
    repl: "  var HITS_COL = {0:'#7fe3ff', 1:'#ffd666', 2:'#8b93a8', 3:'#ffb08a'};",
    expect: ['第一段'],
  },
  {
    name: 'M7 关掉标签避让，固定用第一个候选位置',
    desc: '物理与几何全部不变，只是 §8 画布上入射角/出射角的标注又叠在一起。'
        + '现在 chip() 会记录「重叠最轻的候选位」作为兜底，所以这里直接砍掉择优逻辑、'
        + '一律采用第一个候选位（等价于完全不做避让）',
    find: '      if(over === 0){ rect = r; baseY = ay; break; }',
    repl: '      if(over >= 0){ rect = r; baseY = ay; break; }',
    expect: ['标签互相压住'],
  },
  {
    name: 'M8 去掉 §8 的自相交 EPS 偏移',
    desc: '新起点正落在球面上，近根被 t>1e-9 丢掉 → 「折射出射」被误判为「再次进入」，擦碰次数翻倍。'
        + 'trace() 与 buildTree() 各有一处偏移，两处都要注掉才算真的去掉',
    pairs: [
      ["      p = {x: it.hit.P.x + b.dOut.x*EPS, y: it.hit.P.y + b.dOut.y*EPS};",
       "      p = {x: it.hit.P.x, y: it.hit.P.y};"],
      ["        walk({x: h.P.x + b.dOut.x*EPS, y: h.P.y + b.dOut.y*EPS}, b.dOut,",
       "        walk({x: h.P.x, y: h.P.y}, b.dOut,"],
    ],
    expect: ['bt-cnt-m2'],
  },
  {
    name: 'M9 扫描步长从 0.01° 放粗到 0.5°',
    desc: '分段边界被量化到 0.5° 网格，四条切线与边界的逐位对齐关系随之失效',
    find: '    var step = 0.01, out = [], prev = null, a;',
    repl: '    var step = 0.5, out = [], prev = null, a;',
    expect: ['不在分段边界上'],
  },
  {
    name: 'M10 把 §8 球名的 reserve 挪回画光线之后',
    desc: '标签找位置时避让表里还没有球名，于是挑了个正好压在「金属球 r = 1.00」上的位置。'
        + '必须两处同时改：先撤掉前面的占位，再补到落字之前 —— 这正是修复前的写法',
    pairs: [
      ["    reserve(ctx, mPos.x, mPos.y, mLabel, 'center');\n"
     + "    reserve(ctx, gPos.x, gPos.y, gLabel, 'center');\n"
     + "\n"
     + "    if(cur === 'all'){",
       "    if(cur === 'all'){"],
      ["    drawEye(ctx,V);\n"
     + "\n"
     + "    ctx.font = '600 11.5px ui-monospace,Consolas,monospace'; ctx.textAlign='center';\n"
     + "    ctx.fillStyle = 'rgba(206,212,226,0.85)';",
       "    drawEye(ctx,V);\n"
     + "\n"
     + "    reserve(ctx, mPos.x, mPos.y, mLabel, 'center');\n"
     + "    reserve(ctx, gPos.x, gPos.y, gLabel, 'center');\n"
     + "    ctx.font = '600 11.5px ui-monospace,Consolas,monospace'; ctx.textAlign='center';\n"
     + "    ctx.fillStyle = 'rgba(206,212,226,0.85)';"],
    ],
    expect: ['压住了静态文字'],
  },
  /* ---- 以下五种针对「本次补上的玻璃 Fresnel 反射 / 分支树」----
     这一块的风险全部是「静默失效」：函数写好了、读数填上了，
     但分支没进 branches、表没填、点击没接、期望值被剪枝污染。
     _smoke.js 只会说「无运行时异常」，所以必须逐个注回去验证。 */
  {
    name: 'M11 玻璃一次交互只产出折射一条分支（砍掉 Fresnel 反射支）',
    desc: '正是 §8 修改前的状态：画面照样是「一条漂亮折线」，但玻璃表面反射的那一半整条消失',
    find: "    out.push({kind:'玻璃表面反射', obj:'玻璃球', refl:true, surf:surf, entering:entering,\n"
        + "              dOut:dRefl, inc:inc, refr:inc, R:R});\n",
    repl: "",
    expect: ['入场面反射'],
  },
  {
    name: 'M12 不填充分支表',
    desc: '分支树算得再对，只要不渲染成行，用户就看不见「这条光还有别的走法」',
    find: "    else renderBtree(MODES[cur]);",
    repl: "    else { /* 故意不填 */ }",
    expect: ['分支表没被填充'],
  },
  {
    name: 'M13 期望命中次数按剪枝后的叶集计算',
    desc: '把 0.30% 与 0.02% 两枝的概率质量一起丢掉，E[命中次数] 从 3.000 掉到 2.984 ——'
        + '正好否掉正文那条「E = 只走折射时的命中次数」的恒等式',
    find: "    var exp = 0, fullMass = 0;\n"
        + "    for(var q=0;q<all.length;q++){ exp += all[q].hits * all[q].prob; fullMass += all[q].prob; }\n"
        + "\n"
        + "    var leaves = [];\n"
        + "    for(var q2=0;q2<all.length;q2++) if(all[q2].prob >= minProb) leaves.push(all[q2]);",
    repl: "    var leaves = [];\n"
        + "    for(var q2=0;q2<all.length;q2++) if(all[q2].prob >= minProb) leaves.push(all[q2]);\n"
        + "    var exp = 0, fullMass = 0;\n"
        + "    for(var q=0;q<leaves.length;q++){ exp += leaves[q].hits * leaves[q].prob; fullMass += leaves[q].prob; }",
    expect: ['期望命中次数'],
  },
  {
    name: 'M14 玻璃反射率写成常数 0.04（正入射极限）',
    desc: '这是最常见的「把教科书公式背成了常数」——正入射确实是 4%，'
        + '但本页这条路径的入射角是 50°，真值 5.77%，而且掠射端会冲到 90% 以上',
    find: "    var R = fresnel(cosi, eta);",
    repl: "    var R = 0.04;",
    expect: ['5.77'],
  },
  {
    name: 'M15 点分支行不切换主线',
    desc: '分支表能点、也有 hover 效果，但点下去主线纹丝不动 —— 选择器成了装饰',
    find: "          mm.shownIdx = (mm.shownIdx === idx) ? mm.tree.mainIdx : idx;\n"
        + "          _lastKey = ''; _btKey = '';",
    repl: "          _lastKey = ''; _btKey = '';",
    expect: ['点分支行后主线没换'],
  },
  {
    name: 'M16 标签避让的最小间隙从 3px 放到 0（退回「只要不重叠就行」）',
    desc: '画面上标签一个都没真压住，但两两只差 1~2px，在深色画布上糊成一整段叠字。'
        + '两份 chip() 各有一份 MG —— inject() 用的是 split/join，一处替换会同时命中两份',
    find: "    var MG = 3;\n",
    repl: "    var MG = 0;\n",
    expect: ['最近两个标签只隔'],
  },
  {
    name: 'M17 扫描带的反射率纵轴画成 1−R（透射率）',
    desc: 'rs 记成「所走分支的权重 b.R」而不是「这一面的反射率 it.R」。'
        + '玻璃表面两者的数值恰好像互补，于是曲线形状依旧是「一边低一边高」，'
        + '峰值大小也仍在 96%（正确的 92% 只差几个点）——'
        + '只有「峰值出现的角度」能从掠射端（21.8°）跑到正入射端（8.6°）',
    pairs: [
      ["      if(b.obj === '金属球') nMetal++; else { nGlass++; rs.push(it.R); }",
       "      if(b.obj === '金属球') nMetal++; else { nGlass++; rs.push(b.R); }"],
      ["        var nrs = isM ? rs : rs.concat([it.R]);",
       "        var nrs = isM ? rs : rs.concat([b.R]);"],
    ],
    expect: ['纵轴很可能画成了'],
  },
  /* ---- 以下两种针对「反射率剖面的采样轴」----
     剖面必须关于玻璃球心方向对称：R 只看撞击参数 b = D_G·sin|α − A_G|，
     对 α = A_G ± δ 完全同值。这两个变体注入的都是「让人觉得无所谓」的改动。 */
  {
    name: 'M18 剖面采样栅格改成以 0°（扫描范围中点）为心，而不是以球心方向为心',
    desc: '正是修好之前的状态：光栅的两端落在两条切线上时距离不等'
        + '（下切线差 0.0092°、上切线差 0.0014°），而掠射端最后 0.1° 的 R 就从 40% 冲到 96% ——'
        + '同一个物理现象被画成两个不同的峰高，看着像物理不对称',
    find: '      a = A_G + k*RSTEP;',
    repl: '      a = 0 + k*RSTEP;',
    expect: ['掠射峰不等高', '标注写'],
  },
  {
    name: 'M19 剖面折线抽稀时不强制保留两个掠射峰所在的那一点',
    desc: '只按 k % 5 === 0 取点：峰值点恰好不被 5 整除，于是文字还报「掠射 96%」，'
        + '折线上实际只画到 83% —— 两个峰仍然等高、角度也仍然在切线附近，'
        + '只有把「标注值」与「真正画出来的峰高」对照才看得出来',
    find: '      if(k % 5 === 0 || k === K_TAN || k === -K_TAN) o.push(RPROF[i]);',
    repl: '      if(k % 5 === 0) o.push(RPROF[i]);',
    expect: ['标注写'],
  },
];

/* 支持两种写法：单处注入的 find/repl，或多处必须同时改的 pairs */
function inject(src, m) {
  const pairs = m.pairs || [[m.find, m.repl]];
  let out = src;
  for (const [f, r] of pairs) {
    if (out.indexOf(f) < 0) return null;
    out = out.split(f).join(r);
  }
  return out;
}

const written = [];
let allGood = true;

for (let i = 0; i < MUTANTS.length; i++) {
  const m = MUTANTS[i];
  const out = inject(src, m);
  if (out === null) {
    console.log('\n❌ ' + m.name + '\n   注入点没找到（页面已被改动？），无法测试');
    allGood = false;
    continue;
  }
  const p = path.join(tmp, 'alpha_neg8_' + i + '.html');
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
  failed.slice(0, 6).forEach(f => console.log('   · ' + f));
  if (failed.length > 6) console.log('   · …还有 ' + (failed.length - 6) + ' 条');
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

console.log('\n' + (allGood ? '✅ §8 负向测试全部按预期失败（检查点非空转）' : '❌ 有检查点未能被缺陷触发'));
process.exit(allGood ? 0 : 1);
