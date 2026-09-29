// 从本机 Obsidian 安装包提取关系图谱相关源码，生成 docs/obsidian-source/ 下的原始格式化文件
//
// 用法：node tools/obsidian-source/extract.cjs [asar 路径]
//   不传路径时，自动选择 %APPDATA%/obsidian/ 下版本号最高的 obsidian-*.asar
//
// 输出（docs/obsidian-source/）：
//   01-graph-renderer.raw.js   app.js 中渲染层片段
//   02-graph-plugin.raw.js     app.js 中插件 / 视图 / 数据引擎片段
//   03-sim-worker.raw.js       sim.js 全文
//   04-sim-kernel.wat          sim.js 内嵌 WebAssembly 的反汇编 + 人工注释（cfg-wat.cjs）
//   05-graph.css               app.css 中与图谱相关的规则
// 中间文件放在 tools/obsidian-source/.work/，可随时删除
//
// 注意：片段边界按代码特征定位（压缩符号名），只针对 Obsidian 1.13.7 验证过；
//       版本升级后压缩名可能变化，找不到边界时会直接报错。
const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');
const prettier = require('prettier');

const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'docs/obsidian-source');
const WORK = path.join(__dirname, '.work');

function findAsar() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  const dir = path.join(process.env.APPDATA || '', 'obsidian');
  const list = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^obsidian-[\d.]+\.asar$/.test(f)) : [];
  if (!list.length) throw new Error(`在 ${dir} 下找不到 obsidian-*.asar，请手动传入 asar 路径`);
  const ver = (f) => f.match(/[\d.]+(?=\.asar)/)[0].split('.').map(Number);
  list.sort((a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; });
  return path.join(dir, list[0]);
}

// 在行数组中按正则找唯一一行
function findLine(lines, re, what) {
  const idx = lines.map((l, i) => (re.test(l) ? i : -1)).filter(i => i >= 0);
  if (idx.length !== 1) throw new Error(`定位“${what}”失败：匹配到 ${idx.length} 行（${re}）。Obsidian 版本可能已变化`);
  return idx[0];
}

async function main() {
  const asarPath = findAsar();
  const version = (asarPath.match(/obsidian-([\d.]+)\.asar/) || [])[1] || '未知';
  console.info(`[extract] 安装包：${asarPath}（版本 ${version}）`);
  if (version !== '1.13.7') console.warn('[extract] ⚠ 边界规则只在 1.13.7 上验证过，其他版本可能需要调整');

  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  asar.extractAll(asarPath, path.join(WORK, 'asar'));
  const read = (f) => fs.readFileSync(path.join(WORK, 'asar', f), 'utf8');

  // 1) 格式化 app.js / sim.js / app.css
  const fmt = (code, parser) => prettier.format(code, { parser, printWidth: 110 });
  const appJs = await fmt(read('app.js'), 'babel');
  const simJs = await fmt(read('sim.js'), 'babel');
  const appCss = await fmt(read('app.css'), 'css');
  fs.writeFileSync(path.join(WORK, 'app.pretty.js'), appJs);
  console.info(`[extract] 格式化完成：app.js ${appJs.split('\n').length} 行，sim.js ${simJs.split('\n').length} 行`);

  // 2) 按代码特征切出两个片段（与 1.13.7 中手工确认的边界一致）
  const L = appJs.split('\n');
  const slice = (a, b) => L.slice(a, b + 1).join('\n') + '\n';
  const rStart = findLine(L, /^\s+e\$ = 0\.2,$/, '渲染层起点 e$ = 0.2');
  const rEnd = findLine(L, /^\s+function w\$\(e\) \{$/, '渲染层终点（function w$ 之前）') - 1;
  const pStart = findLine(L, /^\s+i0 = bd\.plugins\.graphView,$/, '插件段起点 i0 = bd.plugins.graphView');
  const pEnd = findLine(L, /^\s+var b0 = Symbol\("parent"\),$/, '插件段终点（var b0 之前）') - 1;
  fs.writeFileSync(path.join(OUT_DIR, '01-graph-renderer.raw.js'), slice(rStart, rEnd));
  fs.writeFileSync(path.join(OUT_DIR, '02-graph-plugin.raw.js'), slice(pStart, pEnd));
  fs.writeFileSync(path.join(OUT_DIR, '03-sim-worker.raw.js'), simJs);
  console.info(`[extract] 渲染层 ${rStart + 1}–${rEnd + 1} 行，插件段 ${pStart + 1}–${pEnd + 1} 行`);

  // 3) WebAssembly：取出 base64 → 反汇编 → 套用人工注释
  const b64 = (read('sim.js').match(/atob\(A\)[^}]*\}\("([A-Za-z0-9+/=]+)"\)/) || [])[1];
  if (!b64) throw new Error('sim.js 中找不到内嵌的 WebAssembly');
  const wasmBuf = Buffer.from(b64, 'base64');
  fs.writeFileSync(path.join(WORK, 'sim.wasm'), wasmBuf);
  const wabt = await require('wabt')();
  const mod = wabt.readWasm(new Uint8Array(wasmBuf), { readDebugNames: true });
  let wat = mod.toText({ foldExprs: false, inlineExport: false });
  mod.destroy();
  const { header, funcNotes } = require('./cfg-wat.cjs');
  wat = wat.replace(/^  \(func \(;(\d+);\)/mg, (m, i) => (funcNotes[i] ? funcNotes[i] + '\n' : '') + m);
  fs.writeFileSync(path.join(OUT_DIR, '04-sim-kernel.wat'), header + wat);
  console.info(`[extract] WebAssembly ${wasmBuf.length} 字节，反汇编 ${wat.split('\n').length} 行`);

  // 4) CSS：保留选择器含 graph 的规则块；其余块（如 body 变量表）只保留 --graph-* 相关行
  const blocks = [];
  for (let i = 0, depth = 0, start = 0; i < appCss.length; i++) {
    if (appCss[i] === '{') depth++;
    else if (appCss[i] === '}' && --depth === 0) { blocks.push(appCss.slice(start, i + 1).trim()); start = i + 1; }
  }
  const isGraph = (s) => /\bgraph/i.test(s);      // \b 排除 “Paragraphs” 这类误匹配
  const css = blocks.filter(isGraph).map(b => {
    const head = b.slice(0, b.indexOf('{'));
    if (isGraph(head)) return b;
    const lines = b.split('\n').filter(isGraph);
    return `${head.trim()} {\n${lines.join('\n')}\n}  /* 只保留与 graph 相关的变量 */`;
  });
  fs.writeFileSync(path.join(OUT_DIR, '05-graph.css'),
    `/* Obsidian ${version} app.css 中与关系图谱相关的规则（prettier 格式化） */\n\n${css.join('\n\n')}\n`);
  console.info(`[extract] CSS 规则块 ${css.length} 个`);
  console.info('[extract] 完成。下一步：npm run obsidian:annotate');
}

main().catch(e => { console.error('[extract] 失败：', e.message); process.exit(1); });
