const path = require('path');
const OUT = path.join(__dirname, '.output') + '/';             // 截图输出目录
require('fs').mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT_URL = require('url').pathToFileURL(path.resolve(__dirname, '..')).href + '/';   // file:// 项目根目录
const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], defaultViewport: { width: 1500, height: 950 } });
  for (const sc of ['1', '3']) {
    const p = await b.newPage();
    await p.goto('http://localhost:5173/replica/index.html?scale=' + sc, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 12000));
    const m = await p.evaluate(() => {
      const r = window.__renderer, xs = r.nodes.map(n => Math.hypot(n.x, n.y)).sort((a, b) => a - b);
      return { n: r.nodes.length, links: r.links.length, r90: xs[Math.floor(xs.length * 0.9)] | 0, rmax: xs[xs.length - 1] | 0 };
    });
    console.log('scale', sc, JSON.stringify(m), 'k=r90/sqrt(n)=', (m.r90 / Math.sqrt(m.n)).toFixed(1));
    if (sc === '1') await p.screenshot({ path: OUT + 'kg10_v2.png' });
    await p.close();
  }
  await b.close();
})();
