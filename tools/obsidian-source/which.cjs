// 调试工具：按遍历序号打印 AST 节点（配合 verify.cjs 输出的“差异 #序号”定位是哪个标识符出了问题）
// 用法：node which.cjs <文件> <前缀，无则传 -> <序号...>
//   例：node which.cjs ../../docs/obsidian-source/01-graph-renderer.raw.js "var " 935 1054
const fs = require('fs'), parser = require('@babel/parser'), traverse = require('@babel/traverse').default;
const [file, prefix, ...ords] = process.argv.slice(2);
const ast = parser.parse((prefix === '-' ? '' : prefix) + fs.readFileSync(file, 'utf8'), { sourceType: 'script', allowReturnOutsideFunction: true });
let i = 0; const want = new Set(ords.map(Number));
traverse(ast, { enter(p) { if (want.has(i)) { const n = p.node; console.log(i, n.type, n.name || '', 'line', n.loc.start.line, '|', (p.parentPath.node.type)); } i++; } });
