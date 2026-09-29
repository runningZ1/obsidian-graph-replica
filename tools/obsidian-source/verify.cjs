// 验证注释版与原始版“除名字和注释外完全等价”：
// 1) 节点类型、字面量、非计算属性名逐一相同
// 2) 每个标识符引用解析到的声明位置（按遍历序号）相同 → 不存在变量捕获
const fs = require('fs'), parser = require('@babel/parser'), traverse = require('@babel/traverse').default;
function signature(src) {
  const ast = parser.parse(src, { sourceType: 'script', allowReturnOutsideFunction: true });
  const ord = new Map(); let i = 0;
  traverse(ast, { enter(p) { ord.set(p.node, i++); } });
  const sig = [];
  traverse(ast, {
    enter(p) {
      const n = p.node;
      let s = n.type;
      if ('value' in n && typeof n.value !== 'object') s += ':' + JSON.stringify(n.value);
      if (n.type === 'RegExpLiteral') s += ':' + n.pattern + '/' + n.flags;
      if (p.isIdentifier()) {
        const parentIsProp = (p.parentPath.isMemberExpression({ property: n }) && !p.parent.computed) ||
          (p.parentPath.isObjectProperty({ key: n }) && !p.parent.computed) ||
          (p.parentPath.isObjectMethod({ key: n }) && !p.parent.computed);
        if (parentIsProp) s += ':prop=' + n.name;
        else {
          // 函数声明的名字绑定在外层作用域
          const sc = (p.parentPath.isFunctionDeclaration() && p.parent.id === n) ? p.parentPath.scope.parent : p.scope;
          const b = sc.getBinding(n.name);
          s += b ? ':bind@' + ord.get(b.identifier) : ':free';
        }
      }
      sig.push(s);
    },
  });
  return sig;
}
const [raw, ann, prefix] = process.argv.slice(2);
const a = signature((prefix || '') + fs.readFileSync(raw, 'utf8'));
const b = signature(fs.readFileSync(ann, 'utf8'));
let diff = 0;
for (let k = 0; k < Math.max(a.length, b.length); k++) {
  if (a[k] !== b[k]) { if (diff < 5) console.log(`  差异 #${k}: 原始=${a[k]}  注释版=${b[k]}`); diff++; }
}
console.log(`${require('path').basename(ann)}: 节点 ${a.length} / ${b.length}，差异 ${diff} → ${diff === 0 && a.length === b.length ? '✅ 结构等价' : '❌ 不等价'}`);
if (diff !== 0 || a.length !== b.length) process.exitCode = 1;   // 不等价时让流水线失败
