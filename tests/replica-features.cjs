const path = require('path');
const OUT = path.join(__dirname, '.output') + '/';             // 截图输出目录
require('fs').mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT_URL = require('url').pathToFileURL(path.resolve(__dirname, '..')).href + '/';   // file:// 项目根目录
const puppeteer = require('puppeteer-core');
const S = (n) => OUT + 'kg10_' + n + '.png';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], defaultViewport: { width: 1500, height: 950 } });
  const p = await b.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text() + ' @ ' + (m.location().url || '')); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto('http://localhost:5173/replica/index.html', { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle0' });
  await wait(9000);
  await p.screenshot({ path: S('a_default') });
  // 打开附件 + 标签，加颜色组
  await p.click('.toggle[data-key=showAttachments]');
  await p.click('.toggle[data-key=showTags]');
  await p.click('.gc-section[data-sec=groups] .gc-head');
  await p.click('#cg-add'); await p.keyboard.type('path:Java');
  await p.click('#cg-add'); await p.keyboard.type('tag:#AI');
  await p.click('#cg-add'); await p.keyboard.type('path:后端');
  await wait(6000);
  await p.screenshot({ path: S('b_groups') });
  // 点击节点 -> 笔记卡片
  const pos = await p.evaluate(() => { const r = window.__renderer; const n = r.nodes.find(n => n.id === 'Redis');
    return { x: n.x * r.scale + r.panX, y: n.y * r.scale + r.panY + 44 }; });
  await p.mouse.click(pos.x, pos.y); await wait(1500);
  const card = await p.evaluate(() => document.getElementById('note-card').innerText.slice(0, 80));
  console.log('card:', JSON.stringify(card));
  // 深色主题
  await p.click('#btn-theme'); await wait(1500);
  await p.screenshot({ path: S('c_dark') });
  // 播放动画
  await p.click('#timelapse'); await wait(4000);
  await p.screenshot({ path: S('d_timelapse') });
  const tl = await p.evaluate(() => window.__renderer.nodes.length);
  console.log('timelapse nodes after 4s:', tl);
  // 搜索
  await p.click('#timelapse'); // 重新开始不影响
  await p.evaluate(() => { const i = document.getElementById('search'); i.value = 'path:Java'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await wait(1500);
  console.log('search path:Java nodes:', await p.evaluate(() => window.__renderer.nodes.length));
  await p.evaluate(() => localStorage.clear());
  // 大规模
  await p.goto('http://localhost:5173/replica/index.html?scale=8', { waitUntil: 'networkidle0' });
  await wait(12000);
  await p.screenshot({ path: S('e_big') });
  console.log('big:', await p.evaluate(() => document.getElementById('fps').textContent));
  console.log('errors:', errs.filter(e => !/favicon/.test(e)).join('\n') || 'none');
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
