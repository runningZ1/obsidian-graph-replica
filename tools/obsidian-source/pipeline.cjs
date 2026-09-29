// 注释 → 结构等价校验 → 生成《源码解读》文档
// 用法：node tools/obsidian-source/pipeline.cjs（先执行 extract.cjs 生成 *.raw.js）
const { execFileSync } = require('child_process');
const path = require('path');
const SRC = path.resolve(__dirname, '../../docs/obsidian-source');
const run = (script, ...args) => execFileSync(process.execPath, [path.join(__dirname, script), ...args], { stdio: 'inherit' });

const JOBS = [
  // [配置, 原始文件, 注释版文件, 校验时补在原始文件前的前缀（片段以声明列表中途开始）]
  ['cfg-renderer.cjs', '01-graph-renderer.raw.js', '01-graph-renderer.annotated.js', 'var '],
  ['cfg-plugin.cjs', '02-graph-plugin.raw.js', '02-graph-plugin.annotated.js', 'var '],
  ['cfg-sim.cjs', '03-sim-worker.raw.js', '03-sim-worker.annotated.js', ''],
];
try {
  for (const [cfg, raw, ann] of JOBS) run('annotate.cjs', path.join(__dirname, cfg), path.join(SRC, raw), path.join(SRC, ann));
  console.info('\n[pipeline] 结构等价校验');
  for (const [, raw, ann, prefix] of JOBS) run('verify.cjs', path.join(SRC, raw), path.join(SRC, ann), prefix);
  run('build-guide.cjs');
  console.info('[pipeline] 全部完成');
} catch (e) {
  console.error('[pipeline] 失败，已停止：', e.message);
  process.exit(1);
}
