const path = require('path');
const OUT = path.join(__dirname, '.output') + '/';             // 截图输出目录
require('fs').mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT_URL = require('url').pathToFileURL(path.resolve(__dirname, '..')).href + '/';   // file:// 项目根目录
const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--window-size=1500,950', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], defaultViewport: { width: 1500, height: 950 } });
  const p = await b.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto('http://localhost:5173/replica/index.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 7000));
  await p.screenshot({ path: OUT + 'kg10_settled.png' });
  // 找度数最大的节点，悬停 + 拖拽
  const info = await p.evaluate(() => {
    const r = window.__renderer; const n = r.nodes.reduce((a, b) => b.weight > a.weight ? b : a);
    const top = document.getElementById('graph').getBoundingClientRect().top;
    return { id: n.id, x: n.x * r.scale + r.panX, y: n.y * r.scale + r.panY + top, scale: r.scale, rendered: r.nodes.filter(n => n.rendered).length, total: r.nodes.length };
  });
  console.log('info', JSON.stringify(info));
  await p.mouse.move(info.x, info.y);
  await new Promise(r => setTimeout(r, 800));
  await p.screenshot({ path: OUT + 'kg10_hover.png' });
  await p.mouse.down();
  for (let i = 0; i < 30; i++) { await p.mouse.move(info.x + i * 8, info.y + i * 5); await new Promise(r => setTimeout(r, 16)); }
  await new Promise(r => setTimeout(r, 300));
  await p.screenshot({ path: OUT + 'kg10_drag.png' });
  await p.mouse.up();
  // 缩放
  await p.mouse.move(750, 500);
  for (let i = 0; i < 4; i++) { await p.mouse.wheel({ deltaY: -120 }); await new Promise(r => setTimeout(r, 100)); }
  await new Promise(r => setTimeout(r, 1200));
  await p.screenshot({ path: OUT + 'kg10_zoom.png' });
  const s2 = await p.evaluate(() => window.__renderer.scale);
  console.log('scale after zoom', s2);
  console.log('errors:', errs.length ? errs.join('\n') : 'none');
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
