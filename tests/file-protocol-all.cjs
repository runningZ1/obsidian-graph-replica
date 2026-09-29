const path = require('path');
const OUT = path.join(__dirname, '.output') + '/';             // 截图输出目录
require('fs').mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT_URL = require('url').pathToFileURL(path.resolve(__dirname, '..')).href + '/';   // file:// 项目根目录
const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1400, height: 900 } });
  const A = 'archive/explorations/';
  const PAGES = ['index.html', 'replica/index.html', A + 'index.html', ...['01-force-graph','02-d3-pixi','03-d3-svg','04-sigma','05-g6','06-vis-network','07-cytoscape-cola','08-echarts','09-3d-force-graph'].map(d => A + d)];
  for (const d of PAGES) {
    const p = await b.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(ROOT_URL + (d.endsWith('.html') ? d : d + '/index.html'), { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2500));
    const canvases = await p.evaluate(() => document.querySelectorAll('canvas, svg circle').length);
    // 链接检查：页面上所有指向本地文件的链接，目标都必须存在
    const hrefs = await p.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.href).filter(h => h.startsWith('file:')));
    for (const h of hrefs) {
      const f = require('url').fileURLToPath(h.split('#')[0].split('?')[0]);
      if (!require('fs').existsSync(f)) errs.push('死链: ' + h);
    }
    console.log(d.padEnd(40), 'canvas/svg:', String(canvases).padStart(4), '链接:', String(hrefs.length).padStart(2), errs.length ? 'ERR: ' + errs.join(' | ') : 'ok');
    if (errs.length) process.exitCode = 1;
    await p.close();
  }
  await b.close();
})();
