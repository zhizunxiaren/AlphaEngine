/* 语法校验：抽取 index.html 中最后一个 <script> 块，用 new Function 只解析不执行 */
const fs = require('fs');
const path = process.argv[2] || require('path').join(__dirname, 'index.html');
const html = fs.readFileSync(path, 'utf8');

const start = html.lastIndexOf('<script>');
const end = html.lastIndexOf('</script>');
if (start < 0 || end < 0 || end < start) { console.log('❌ 找不到完整的 <script> 块'); process.exit(1); }
const code = html.slice(start + '<script>'.length, end);

console.log('HTML 总行数: ' + html.split('\n').length);
console.log('脚本行数: ' + code.split('\n').length + '  字符数: ' + code.length);

try {
  new Function(code);
  console.log('✅ 语法校验通过');
} catch (e) {
  console.log('❌ 语法错误: ' + e.message);
  const m = /(\d+):(\d+)/.exec(e.stack || '');
  if (m) {
    const ln = +m[1];
    const lines = code.split('\n');
    for (let i = Math.max(0, ln - 3); i < Math.min(lines.length, ln + 2); i++) {
      console.log((i + 1 === ln ? ' >> ' : '    ') + (i + 1) + '| ' + lines[i]);
    }
  }
  process.exit(1);
}

/* 静态检查：常见错误模式 */
const checks = [
  [/normalMode\s*=\s*\(sceneSel/, 'normalMode 赋值'],
  [/var sceneSel = 'classic', normalMode = false/, 'normalMode 声明'],
  [/var ux = wz, uy = 0, uz = -wx/, '§6 相机 u 向量'],
  [/var ux = upy\*wz-upz\*wy/, '§4 相机 u 向量'],
  [/lx = S\.x\[i\]-ox/, '§6 求交用 oc = C − O'],
  [/hb = -\(cam\.ex\*dx/, '§4 求交 h 符号'],
  [/var t = \(hb-sq\)\/a/, '§4 求根用 (h−√Δ)/a（不是 (−h−√Δ)/a）'],
  [/var h = Math\.max\(2, Math\.round\(w\*ch\/cw\)\)/, '§4 缓冲高度按画布宽高比推导'],
  [/var px = O\.x \+ q\.dx\*t, py = O\.y \+ q\.dy\*t/, '§3 交点落点用 O + t·D（不是 O + t·û）'],
  /* §7 光路示意：几何是解析反推的，这几处符号/取向一旦写反，画面照样是"一条漂亮折线" */
  [/var n1 = nrm\(\{x: RDIR\.x - d0\.x, y: RDIR\.y - d0\.y\}\);/, '§7 镜面法线由 (D_out − D) 反推'],
  [/if\(dot\(d0, n1\) > 0\)\{ n1 = \{x:-n1\.x, y:-n1\.y\}; \}/, '§7 法线取 D·N<0 的入射一侧分支'],
  [/var MC = \{x: P1\.x - R_METAL\*n1\.x, y: P1\.y - R_METAL\*n1\.y\};/, '§7 球心 M = P1 − r·N'],
  [/var O_OFF = R_GLASS\*Math\.sin\(TH_GLASS_IN\/DEG\);/, '§7 玻璃偏垂距 o = r·sinθ 直接决定入场入射角'],
  [/var kk = 1 - eta\*eta\*\(1 - cosi\*cosi\);/, '§7 折射用标准 Snell 判别式 1 − η²(1−cos²i)'],
  [/if\(kk < 0\)\{ dOutG = dRefl; kind = '全内反射'; \}/, '§7 保留全内反射分支（kk<0 才反射）'],
  [/var row = document\.createElement\('div'\); row\.className = 'row ' \+ rw\.k;/, '§7 账本用 DOM API 建行（不依赖 children）'],
  [/prog >= TRAVEL\[3\]\[1\] - 1e-6/, '§7 完成判据按末段终点而非 1.0'],
  /* §8 命中次数示意：与 §7 共用几何，风险点是「终止条件」与「自相交」两处 */
  [/function advance\(hit, dOut\)/, '§7 命中后起点做 ε 偏移（防自相交）'],
  [/isFinite\(tSky\) && tSky > 1e-9 && \(!h \|\| tSky < h\.t\)/, '§7/§8 天光判据同时要求 tSky 有限（否则 NaN 坐标 + 逃逸分支成死代码）'],
  /* §8 的物理内核抽成了 interact()，trace() 与 buildTree() 共用它。
     ε 偏移因此有两处（沿选定分支的 trace、枚举全树的 walk），少一处就会出现自相交。 */
  [/x: it\.hit\.P\.x \+ b\.dOut\.x\*EPS/, '§8 命中后起点做 ε 偏移（防自相交）· trace'],
  [/x: h\.P\.x \+ b\.dOut\.x\*EPS/, '§8 命中后起点做 ε 偏移（防自相交）· buildTree'],
  [/hits\+\+;/, '§8 统计球面交互次数 hits++'],
  [/term:'射向天空'/, '§8 终止分类：射向天空'],
  [/term:'逃出场景'/, '§8 终止分类：逃出场景'],
  [/if\(!term\) term = 'maxDepth 截断';/, '§8 终止分类：预算用尽'],
  /* 玻璃反射支：§8 曾经整条漏掉，只画折射。这条守卫就是防止它再次消失。 */
  [/kind:'玻璃表面反射'/, '§8 玻璃 Fresnel 反射分支存在（不只是折射）'],
  [/var R = fresnel\(cosi, eta\);/, '§8 反射率由 Schlick/Fresnel 算出（不是写死的常数）'],
  /* rs 必须是「面反射率 it.R」，不能是「分支权重 b.R」：两者在玻璃表面互补，
     混用会让扫描带那条曲线变成 1−R 却顶着「反射率」的纵轴（峰值跑到正入射端）。 */
  [/rs\.push\(it\.R\);/, '§8 rs 记的是面反射率 it.R（不是分支权重 b.R）'],
  [/rs\.concat\(\[it\.R\]\)/, '§8 分支树的 rs 同样记面反射率'],
  [/var out = \[\];[\s\S]{0,600}?out\.push\(\{kind:'玻璃表面反射'/, '§8 玻璃一次交互产出 2 条分支（折射 + 反射）'],
  /* buildTree 现在先「完整枚举」再按 minProb 过滤要画/要列的那些：
     这样期望值仍在完整叶集上算，剪枝只影响画几支、列几行。 */
  [/if\(all\[q2\]\.prob >= minProb\) leaves\.push\(all\[q2\]\);/, '§8 分支树按概率剪枝（否则指数爆炸）'],
  [/exp \+= all\[q\]\.hits \* all\[q\]\.prob;/, '§8 期望命中次数按概率加权（不是取最大值）'],
  [/var A0 = -90, A1 = 90;/, '§8 扫描朝前的半圈 −90°~90°'],
  [/var HLF_M = Math\.asin\(R_METAL\/D_M\)\*DEG/, '§8 切线半角 = asin(r/D)'],
  [/prev\.hits !== r\.hits/, '§8 扫描按命中次数切段（而不是按终止原因）'],
  /* 反射率剖面：采样中心必须是玻璃球心方向 A_G。
     R 只看撞击参数 b = D_G·sin|α − A_G|，对 A_G ± δ 同值 —— 物理是严格对称的。
     栅格若以别处（−90° 或 0°）为心，两端落在两条切线上的距离就不相等
     （0.0092° 对 0.0014°），而掠射端最后 0.1° 的 R 就从 40% 冲到 96%，
     同一现象会被画成 81% 与 92% 两个峰。 */
  [/a = A_G \+ k\*RSTEP;/, '§8 反射率剖面以球心方向 A_G 为采样中心（两峰才等高）'],
  [/k % 5 === 0 \|\| k === K_TAN \|\| k === -K_TAN/, '§8 剖面抽稀按 |k| 对称且强制保留两个掠射峰点'],
  [/两峰等高/, '§8 峰值标注写明两峰等高（并给出两个角度）'],
  [/function presentFiles|present_files/, null],
];
console.log('\n关键代码点检查:');
checks.forEach(([re, name]) => {
  if (!name) return;
  console.log('  ' + (re.test(code) ? '✅' : '❌') + '  ' + name);
});

/* ---- 反向守卫：反射率剖面不能再被「按下标抽稀」----
   按下标 pi += 5 抽稀，会把「左峰被抽掉、右峰被留下」变成随机事件：
   曲线重新变成一边高一边低，而文字标注仍写着两峰等高。
   这一类「曾经写错过的写法」用正则正面检查是查不到的，只能断言它不再出现。 */
{
  const NEG = [
    [/for\(var pi\w* = 1; pi\w* < RPROF\.length; pi\w* \+= \d+\)/,
     '§8 反射率剖面不按下标抽稀（改按 |k| 对称取点）'],
    [/RPROF\[pk\]\.r > rPeak\b/, '§8 峰值统计分左右两侧各取一个（不再只取全局最大）'],
  ];
  NEG.forEach(([re, name]) => {
    console.log('  ' + (re.test(code) ? '❌' : '✅') + '  ' + name);
  });
}

/* ---- 顺序断言：期望值必须在剪枝之前算完 ----
   只查「两段代码都存在」是不够的：把 exp 的循环挪到过滤之后，两段代码都还在，
   上面那三条守卫照样全绿，而 E[命中次数] 会从 3.000 悄悄退化成 2.984。
   这类「顺序敏感」的约束只能靠比较下标来守。 */
{
  const iExp = code.indexOf('exp += all[q].hits * all[q].prob;');
  const iKeep = code.indexOf('if(all[q2].prob >= minProb) leaves.push(all[q2]);');
  if (iExp < 0 || iKeep < 0) {
    console.log('  ❌  §8 期望值/剪枝的顺序检查：找不到代码点（期望 ' + iExp + '，剪枝 ' + iKeep + '）');
  } else if (iExp < iKeep) {
    console.log('  ✅  §8 期望值在剪枝之前算完（下标 ' + iExp + ' < ' + iKeep + '）');
  } else {
    console.log('  ❌  §8 期望值在剪枝之后才算（下标 ' + iExp + ' ≥ ' + iKeep + '）——剪枝会污染期望值');
  }
}

/* ============ 跨节一致性：§7 与 §8 必须共用同一套几何 ============
   两节的几何各自独立写了一份（本页每节自包含）。一旦只改其中一处，
   两节就会画在两个不同的场景里，而各自单独跑都「看起来正常」。 */
console.log('\n跨节一致性检查（§7 / §8 共用几何）:');
const countOf = re => (code.match(re) || []).length;
const SHARED = [
  [/var EYE = \{x:0\.70, y:4\.40\};/g, 2, '眼位 EYE'],
  [/var R_METAL = 1\.00, R_GLASS = 1\.20, IOR = 1\.5;/g, 2, '半径与折射率'],
  [/R_GLASS\*Math\.sin\(TH_GLASS_IN\/DEG\)/g, 2, '玻璃球偏垂距 o = r·sinθ'],
  [/var n1 = nrm\(\{x: RDIR\.x - d0\.x, y: RDIR\.y - d0\.y\}\);/g, 2, '镜面法线由 (D_out − D) 反推'],
  [/var MC = \{x: P1\.x - R_METAL\*n1\.x, y: P1\.y - R_METAL\*n1\.y\};/g, 2, '金属球心 M = P1 − r·N'],
  [/var sG = \(G_TARGET_X - P1\.x \+ O_OFF\*RDIR\.y\)\/RDIR\.x;/g, 2, '玻璃球沿反射光线的落位解'],
  [/var METAL = \{name:'金属球', type:'metal', c:MC, r:R_METAL\};/g, 2, '金属球对象'],
  [/var GLASS = \{name:'玻璃球', type:'glass', c:GC, r:R_GLASS\};/g, 2, '玻璃球对象'],
  /* 标签避让的判据是「最小间隙」而不是「不重叠」：两份 chip() 各一份，少改一处
     就会有一节的标签在深色画布上糊成一团，而两节各自单看都不报错。 */
  [/var MG = 3;/g, 2, '标签避让最小间隙 MG = 3px'],
];
let sharedOk = true;
SHARED.forEach(([re, want, name]) => {
  const n = countOf(re);
  const ok = n === want;
  if (!ok) sharedOk = false;
  console.log('  ' + (ok ? '✅' : '❌') + '  ' + name + '：出现 ' + n + ' 次（期望 ' + want + '）');
});

/* ============ 目录 ↔ 章节一致性 ============
   插入 / 重排章节最容易漏改编号与目录，而页面本身不会报错。 */
console.log('\n目录与章节一致性:');
const navM = /<nav class="toc">([\s\S]*?)<\/nav>/.exec(html);
const tocIds = navM ? [...navM[1].matchAll(/<a href="#(s\d+)">/g)].map(m => m[1]) : [];
const secIds = [...html.matchAll(/<section id="(s\d+)">/g)].map(m => m[1]);
const secMissing = tocIds.filter(id => secIds.indexOf(id) < 0);
const secNotInToc = secIds.filter(id => tocIds.indexOf(id) < 0);
const noBad = [];
secIds.forEach(id => {
  const i = html.indexOf('<section id="' + id + '">');
  const m = /<div class="no">(\d+)<\/div>/.exec(html.slice(i, i + 400));
  if (!m || m[1] !== id.slice(1)) noBad.push(id + ' → ' + (m ? m[1] : '找不到编号'));
});
const orderBad = JSON.stringify(secIds) !== JSON.stringify(tocIds);
/* 正文里所有 #sN 交叉引用都必须指向真实存在的章节 —— 章节重编号后最容易留下的悬空锚点 */
const allRefs = [...new Set([...html.matchAll(/href="#(s\d+)"/g)].map(m => m[1]))];
const dangling = allRefs.filter(id => secIds.indexOf(id) < 0);
console.log('  ' + (secMissing.length ? '❌ 目录指向不存在的章节: ' + secMissing.join(', ')
  : '✅ 目录 ' + tocIds.length + ' 项全部指向存在的章节'));
console.log('  ' + (secNotInToc.length ? '❌ 章节未进目录: ' + secNotInToc.join(', ')
  : '✅ 全部 ' + secIds.length + ' 个章节都在目录里'));
console.log('  ' + (noBad.length ? '❌ 章节徽标编号与 id 不符: ' + noBad.join(', ')
  : '✅ 每个章节的徽标编号与 id 一致'));
console.log('  ' + (orderBad ? '❌ 目录顺序与章节顺序不一致\n      目录: ' + tocIds.join(',') + '\n      正文: ' + secIds.join(',')
  : '✅ 目录顺序与章节顺序一致'));
console.log('  ' + (dangling.length ? '❌ 正文存在悬空锚点: ' + dangling.join(', ')
  : '✅ 正文 ' + allRefs.length + ' 个锚点引用全部有效'));
if (secMissing.length || secNotInToc.length || noBad.length || orderBad || dangling.length) sharedOk = false;

/* HTML 结构检查 */
const ids = ['cv-raster','cv-rt','cv-ray','cv-hit','cv-quad','cv-normal','cv-chain','cv-pt','cv-path',
             'cv-count','cv-cone','count-spans','count-now','count-ledger','count-cap',
             'rg-prog','rg-t','rg-r','rg-depth','se-scene','se-res','se-light','ck-aa',
             'bt-play','bt-chain','bt-pause','bt-reset','bt-save','bt-scan',
             'bt-path-play','bt-path-step','bt-path-reset',
             'bt-cnt-m0','bt-cnt-m1','bt-cnt-m2','bt-cnt-m3','bt-cnt-mx','bt-cnt-me','bt-cnt-all',
             'ck-path-normal','ck-path-fresnel','ck-path-grid',
             'ck-cnt-normal','ck-cnt-grid',
             'o-a','o-h','o-c','o-d','o-t1','o-t2','o-pass','o-spp','o-cur','o-time','o-speed','o-noise',
             'o-mth','o-mtr','o-mtd','o-gin','o-gout','o-chord',
             'o-ca','o-chit','o-cterm','o-ccol','o-cshare','o-cdepth',
             'path-now','path-ledger',
             'lb-prog','lb-ray','lb-r','lb-disc','lb-verdict','lb-chain','lb-depth','lb-stat','lb-fov','lb-path','lb-cnt'];
console.log('\nDOM 元素引用检查 (' + ids.length + ' 个):');
const missing = ids.filter(id => html.indexOf('id="' + id + '"') < 0);
if (missing.length) console.log('  ❌ 缺失: ' + missing.join(', '));
else console.log('  ✅ 全部存在');

/* 外部资源检查（必须零依赖） */
console.log('\n外部资源检查:');
const ext = html.match(/(src|href)\s*=\s*["'](https?:)?\/\//g);
console.log('  ' + (ext ? '⚠️  发现外链: ' + ext.join(' ') : '✅ 无外链资源（仅文档链接用 <a href>，不影响加载）'));
const cdn = html.match(/<script[^>]+src=|<link[^>]+href=[^>]*http/g);
console.log('  ' + (cdn ? '❌ 存在外部脚本/样式: ' + cdn.join(' ') : '✅ 无外部 script/link 标签'));

/* ============ CSS 大小写守卫 ============
   数学变量名（a/h/c/oc/r²/t₁/t₂）是有大小写含义的符号，任何 text-transform:uppercase
   都会把它们改成 A/H/C/OC/R² 从而改变语义。这里做一次 CSS 层叠机械求值，确保没有
   任何规则作用于读数标签。 */
console.log('\nCSS 大小写守卫:');
const styleM = /<style>([\s\S]*?)<\/style>/.exec(html);
let cssGuardOk = true;
if (!styleM) { console.log('  ❌ 找不到 <style> 块'); cssGuardOk = false; }
else {
  const css = styleM[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const rx = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = rx.exec(css)) !== null) {
    const sel = m[1].trim();
    if (!sel || sel[0] === '@') continue;          // 跳过 @media 前缀；其内部规则后续会各自被捕获
    m[2].split(';').forEach(d => {
      const i = d.indexOf(':');
      if (i > 0) rules.push({ sel, prop: d.slice(0, i).trim().toLowerCase(), val: d.slice(i + 1).trim().toLowerCase() });
    });
  }

  // 复合选择器（tag/.class）匹配单个元素
  const compoundHit = (compound, el) => {
    const parts = compound.match(/\.[\w-]+|[a-zA-Z][\w-]*|\[[^\]]*\]|:{1,2}[\w-]+/g) || [];
    let sawTag = false;
    for (const p of parts) {
      if (p[0] === '.') { if (el.classes.indexOf(p.slice(1)) < 0) return false; }
      else if (p[0] === '[' || p[0] === ':') { /* 属性/伪类：本页未用于读数标签，忽略 */ }
      else { if (el.tag !== p.toLowerCase()) return false; sawTag = true; }
    }
    return sawTag || parts.length > 0;             // 纯 class 选择器也算命中
  };

  // 选择器匹配链上第 idx 个元素（支持后代组合子）
  const selectorHit = (sel, chain, idx) => {
    const parts = sel.replace(/\s*[>+~]\s*/g, ' ').trim().split(/\s+/);
    if (parts.length === 1 && parts[0].indexOf(',') > 0) return false;
    let cur = idx;
    for (let i = parts.length - 1; i >= 0; i--) {
      let found = -1;
      for (let j = cur; j >= 0; j--) if (compoundHit(parts[i], chain[j])) { found = j; break; }
      if (found < 0) return false;
      cur = found - 1;
    }
    return true;
  };

  // §3 读数标签的元素链: <div class="read"> <div> <div class="k">
  const chain = [
    { tag: 'div', classes: ['read'] },
    { tag: 'div', classes: [] },
    { tag: 'div', classes: ['k'] },
  ];
  const hits = rules.filter(r => r.prop === 'text-transform' && selectorHit(r.sel, chain, chain.length - 1));
  const bad = hits.filter(r => r.val !== 'none' && r.val !== 'initial' && r.val !== 'revert');
  if (!bad.length) {
    console.log('  ✅ 无 text-transform 作用于读数标签' + (hits.length ? '（命中 ' + hits.map(r => r.sel + '→' + r.val).join(', ') + '）' : ''));
  } else {
    console.log('  ❌ 下列规则会改写数学变量名大小写: ' + bad.map(r => r.sel + ' → text-transform:' + r.val).join(' | '));
    cssGuardOk = false;
  }
}

/* 标签文本必须逐字正确（大小写敏感） */
const EXPECT = ['a = D·D', 'h = D·oc', 'c = oc·oc−r²', 'Δ = h²−ac', 't₁ 近根', 't₂ 远根'];
const wrong = EXPECT.filter(t => html.indexOf(t) < 0);
console.log('  ' + (wrong.length ? '❌ 标签文本不符: ' + wrong.join(' / ') : '✅ 6 个读数标签与公式符号逐字一致（大小写敏感）'));
if (wrong.length) cssGuardOk = false;
if (!cssGuardOk || !sharedOk) process.exitCode = 1;
