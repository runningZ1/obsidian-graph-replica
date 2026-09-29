const path = require('path');
const OUT = path.join(__dirname, '.output') + '/';             // 截图输出目录
require('fs').mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT_URL = require('url').pathToFileURL(path.resolve(__dirname, '..')).href + '/';   // file:// 项目根目录
const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1400, height: 900 } });
  const p = await b.newPage(); const logs = [];
  p.on('console', m => logs.push(m.type() + ': ' + m.text()));
  p.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await p.goto(ROOT_URL + process.argv[2], { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 5000));
  await p.screenshot({ path: OUT + 'file_test.png' });
  console.log(logs.join('\n'));
  console.log('nodes:', await p.evaluate(() => window.__renderer ? window.__renderer.nodes.length : 'no renderer'));
  await b.close();
})();
