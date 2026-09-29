const path = require('path');
const OUT = path.join(__dirname, '.output') + '/';             // 截图输出目录
require('fs').mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT_URL = require('url').pathToFileURL(path.resolve(__dirname, '..')).href + '/';   // file:// 项目根目录
const puppeteer = require('puppeteer-core');
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1500, height: 950 } });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/replica/index.html', { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'networkidle0' }); await wait(2000);
  await p.click('#timelapse'); await wait(1000);
  await p.evaluate(() => { const i = document.getElementById('search'); i.value = 'path:Java'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await wait(2500);
  console.log('search during timelapse -> nodes:', await p.evaluate(() => window.__renderer.nodes.length));
  await p.evaluate(() => { const i = document.getElementById('search'); i.value = 'tag:#AI -path:AI/模型家族'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await wait(1000);
  console.log('tag:#AI -path:AI/模型家族 -> nodes:', await p.evaluate(() => window.__renderer.nodes.length));
  await p.evaluate(() => localStorage.clear());
  console.log('errors:', errs.join('\n') || 'none'); await b.close();
})();
