// 验证复刻版（replica/）按源码审计后的修复项（需要先 npm run serve）
const path = require('path');
const OUT = path.join(__dirname, '.output') + '/';
require('fs').mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE_URL || 'http://localhost:5173/replica/index.html';
const puppeteer = require('puppeteer-core');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✅' : '❌'} ${name}${detail ? '  ' + detail : ''}`); if (!ok) failed++; };

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1500, height: 950 } });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });   // 忽略浏览器自动请求 favicon 的 404

  // 1) 旧版设置迁移 + 标签默认始终显示（超大库，初始缩放很小）
  await p.goto(BASE + '?scale=8', { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.setItem('obsidian-replica-graph', JSON.stringify({ textFadeMultiplier: 0, open: true })));
  await p.reload({ waitUntil: 'networkidle0' });
  await wait(9000);
  const labels = await p.evaluate(() => {
    const r = window.__renderer;
    const inView = r.nodes.filter(n => n.rendered && n.circle.visible);
    return { fade: r.opts.textFade, scale: +r.scale.toFixed(3), textAlpha: r.textAlpha,
      inView: inView.length, labelShown: inView.filter(n => n.text.visible && n.text.alpha > 0.5).length,
      saved: JSON.parse(localStorage.getItem('obsidian-replica-graph')).textFadeMultiplier };
  });
  check('旧设置迁移：文本透明度 0 → -7', labels.fade === -7 && labels.saved === -7, JSON.stringify({ fade: labels.fade, saved: labels.saved }));
  check('拉远时标签仍显示', labels.textAlpha === 1 && labels.labelShown >= labels.inView * 0.95,
    `缩放 ${labels.scale}，视口内 ${labels.inView} 个节点，显示标签 ${labels.labelShown} 个`);
  await p.screenshot({ path: OUT + 'audit_labels_zoomed_out.png' });

  // 2) 双向链接只画一条线
  const mutual = await p.evaluate(() => {
    const r = window.__renderer; let pairs = 0, bothDrawn = 0, oneDrawn = 0;
    for (const [key, l] of r.linkLookup) {
      const [s, t] = key.split('\u0000');
      if (s.localeCompare(t) >= 0) continue;                  // 每对只数一次
      const rev = r.linkLookup.get(t + '\u0000' + s);
      if (!rev || !l.rendered || !rev.rendered) continue;
      pairs++;
      const a = l.px.visible, c = rev.px.visible;
      if (a && c) bothDrawn++; else if (a || c) oneDrawn++;
    }
    return { pairs, bothDrawn, oneDrawn };
  });
  check('双向链接只画一条线', mutual.pairs > 0 && mutual.bothDrawn === 0, JSON.stringify(mutual));

  // 3) 键盘平移与缩放
  const before = await p.evaluate(() => ({ x: window.__renderer.panX, s: window.__renderer.targetScale }));
  await p.keyboard.down('ArrowLeft'); await wait(600); await p.keyboard.up('ArrowLeft');
  await p.keyboard.down('Equal'); await wait(400); await p.keyboard.up('Equal');
  await wait(800);
  const after = await p.evaluate(() => ({ x: window.__renderer.panX, s: window.__renderer.targetScale }));
  check('键盘 ← 平移', after.x - before.x > 50, `panX ${before.x.toFixed(0)} → ${after.x.toFixed(0)}`);
  check('键盘 + 缩放', after.s > before.s * 1.1, `targetScale ${before.s.toFixed(3)} → ${after.s.toFixed(3)}`);

  // 4) 缩放记忆：等待 2 秒轮询保存后刷新，应恢复
  await wait(2500);
  const savedZoom = await p.evaluate(() => JSON.parse(localStorage.getItem('obsidian-replica-graph')).zoom['8']);
  await p.reload({ waitUntil: 'networkidle0' });
  await wait(1000);
  const restored = await p.evaluate(() => window.__renderer.targetScale);
  check('缩放值保存并恢复', savedZoom && Math.abs(restored - savedZoom) < 1e-9, `保存 ${savedZoom && savedZoom.toFixed(4)}，恢复 ${restored.toFixed(4)}`);

  // 5) 颜色组只作用于笔记，不作用于标签
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.setItem('obsidian-replica-graph', JSON.stringify({
    settingsVersion: 2, showTags: true, colorGroups: [{ query: 'tag:#AI', color: '#e93147' }] })));
  await p.reload({ waitUntil: 'networkidle0' });
  await wait(1500);
  const colors = await p.evaluate(() => {
    const r = window.__renderer, tag = r.nodeLookup.get('#AI'), note = r.nodeLookup.get('Transformer');
    return { tagColored: !!(tag && tag.color), noteColored: !!(note && note.color), tagExists: !!tag };
  });
  check('颜色组给笔记上色', colors.noteColored);
  check('颜色组不给标签上色', colors.tagExists && !colors.tagColored);

  // 6) 播放动画：节点与连线逐个计数，先出现笔记再连出链接
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle0' });
  await wait(1000);
  await p.click('#timelapse');
  const samples = [];
  for (let i = 0; i < 4; i++) {
    await wait(1000);
    samples.push(await p.evaluate(() => ({ n: window.__renderer.nodes.length, l: window.__renderer.links.length })));
  }
  const growing = samples.every((s, i) => i === 0 || s.n + s.l >= samples[i - 1].n + samples[i - 1].l);
  check('播放动画逐步生长', growing && samples[3].n + samples[3].l > samples[0].n + samples[0].l, JSON.stringify(samples));

  check('无 JS 错误', errors.length === 0, errors.join(' | '));
  await b.close();
  console.log(failed ? `\n${failed} 项未通过` : '\n全部通过');
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error('测试异常：', e); process.exit(1); });
