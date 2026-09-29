// 对 Obsidian 压缩源码做“作用域安全的重命名 + 中文注释”
// 用法：node annotate.cjs <config.cjs> <input> <output>
const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const prettier = require('prettier');

(async () => {
  const [cfgPath, input, output] = process.argv.slice(2);
  const cfg = require(require('path').resolve(cfgPath));
  let src = fs.readFileSync(input, 'utf8');
  if (cfg.prefix) src = cfg.prefix + src;
  const ast = parser.parse(src, { sourceType: 'script', allowReturnOutsideFunction: true });

  // 1) 找到重命名的目标作用域
  let targetScope = null;
  traverse(ast, {
    Program(p) { if (!cfg.scopeFinder) targetScope = p.scope; },
    'FunctionExpression|ArrowFunctionExpression'(p) {
      // 最外层 IIFE：Program > ExpressionStatement > CallExpression > 函数
      if (cfg.scopeFinder === 'iife' && !targetScope && p.parentPath.isCallExpression() &&
          p.parentPath.parentPath.isExpressionStatement() && p.parentPath.parentPath.parentPath.isProgram()) { targetScope = p.scope; p.stop(); }
    },
  });

  // 2) 已绑定的：scope.rename（自动避开被遮蔽的同名局部变量）
  const renamed = new Set();
  // 两阶段改名：先改成唯一临时名，再改成目标名，避免 a→b、b→c 这类链式冲突造成变量捕获
  const twoPhase = (scope, map) => {
    const tmp = [];
    let n = 0;
    for (const [from, to] of Object.entries(map)) {
      if (!scope.hasOwnBinding(from)) continue;
      const t = '__tmp_' + (twoPhase.seq = (twoPhase.seq || 0) + 1);
      scope.rename(from, t); tmp.push([t, to, from]); n++;
    }
    for (const [t, to, from] of tmp) {
      if (scope.hasBinding(to) && to !== t) console.warn('  ⚠ 目标名已存在，可能冲突:', to, '(原名 ' + from + ')');
      scope.rename(t, to);
    }
    return tmp.map(x => x[2]);
  };
  for (const f of twoPhase(targetScope, cfg.rename || {})) renamed.add(f);
  // 3) 未绑定的外部引用（来自 app.js 其他模块）：只改没有任何绑定的标识符
  const ext = { ...(cfg.rename || {}), ...(cfg.external || {}) };
  traverse(ast, {
    Identifier(p) {
      const n = p.node.name;
      if (!(n in ext) || renamed.has(n)) return;
      if (p.parentPath.isMemberExpression({ property: p.node }) && !p.parent.computed) return;
      if (p.parentPath.isObjectProperty({ key: p.node }) && !p.parent.computed) return;
      if (p.scope.hasBinding(n)) return;
      p.node.name = ext[n];
    },
  });

  // 3.5) 局部变量重命名：key = "类.方法" | "类#属性" | "函数名"，可用 "A/B" 表示 A 内部名为 B 的嵌套函数
  const classOfEarly = (p) => {
    const d = p.findParent(q => q.isVariableDeclarator() || q.isFunctionDeclaration());
    return d ? (d.isVariableDeclarator() ? d.node.id.name : d.node.id && d.node.id.name) : null;
  };
  const findFn = (key, rootPath) => {
    let found = null;
    const iife = key.match(/^\((.+)\)$/);   // "(name)"：var name = (function(){...})(...) 中的那个函数
    if (iife) {
      const v = { VariableDeclarator(p) {
        let init = p.node.init, key = 'init';
        if (init && init.type === 'LogicalExpression') { init = init.left; key = 'init.left'; }   // (function(){})() || 备用
        if (!found && p.node.id.name === iife[1] && init && init.type === 'CallExpression' && init.callee.type === 'FunctionExpression') {
          found = p.get(key + '.callee'); p.stop();
        }
      } };
      if (rootPath) rootPath.traverse(v); else traverse(ast, v);
      return found;
    }
    const visitor = {
      AssignmentExpression(p) {
        const l = p.node.left;
        if (found || l.type !== 'MemberExpression' || l.computed || !/Function/.test(p.node.right.type)) return;
        const isProto = l.object.type === 'MemberExpression' && l.object.property && l.object.property.name === 'prototype';
        const k = `${classOfEarly(p)}${isProto ? '.' : '#'}${l.property.name}`;
        if (k === key) { found = p.get('right'); p.stop(); }
      },
      VariableDeclarator(p) {
        if (!found && p.node.id.name === key && p.node.init && /Function/.test(p.node.init.type)) { found = p.get('init'); p.stop(); }
      },
      FunctionDeclaration(p) { if (!found && p.node.id && p.node.id.name === key) { found = p; p.stop(); } },
    };
    if (rootPath) rootPath.traverse(visitor); else traverse(ast, visitor);
    return found;
  };
  let localCount = 0;
  for (const [key, map] of Object.entries(cfg.locals || {})) {
    let fn = null;
    for (const part of key.split('/')) fn = findFn(part, fn);
    if (!fn) { console.warn('  找不到函数:', key); continue; }
    for (const from of Object.keys(map)) if (!fn.scope.hasOwnBinding(from)) console.warn(`  ${key}: 没有局部变量 ${from}`);
    localCount += twoPhase(fn.scope, map).length;
  }
  if (localCount) console.log(`  局部变量重命名 ${localCount} 个`);

  // 4) 注释
  const C = cfg.comments || {};
  const add = (node, text) => {
    if (!text || node.__annotated) return;
    node.__annotated = true;
    const lines = text.trim().split('\n');
    node.leadingComments = (node.leadingComments || []).concat({
      type: 'CommentBlock', value: '*\n' + lines.map(l => ' * ' + l).join('\n') + '\n ',
    });
  };
  const classOf = (p) => {
    const d = p.findParent(q => q.isVariableDeclarator() || q.isFunctionDeclaration());
    if (!d) return null;
    return d.isVariableDeclarator() ? d.node.id.name : d.node.id && d.node.id.name;
  };
  let hits = 0;
  traverse(ast, {
    VariableDeclarator(p) { const k = p.node.id.name; if (C[k]) { add(p.node, C[k]); hits++; } },
    FunctionDeclaration(p) {
      const k = p.node.id && p.node.id.name;
      if (C[k]) { add(p.node, C[k]); hits++; return; }
      const cls = classOf(p.parentPath);
      if (cls && C[cls + '.constructor'] && p.parentPath.parentPath.isFunctionExpression()) { add(p.node, C[cls + '.constructor']); hits++; }
    },
    AssignmentExpression(p) {
      const l = p.node.left;
      if (l.type !== 'MemberExpression' || l.computed) return;
      if (l.object.type === 'Identifier' && C[`${l.object.name}.${l.property.name}`]) {   // 如 self.onmessage
        add(p.parentPath.isExpressionStatement() ? p.parent : p.node, C[`${l.object.name}.${l.property.name}`]); hits++; return;
      }
      const cls = classOf(p);
      if (!cls) return;
      const isProto = l.object.type === 'MemberExpression' && l.object.property.name === 'prototype';
      const key = isProto ? `${cls}.${l.property.name}` : `${cls}#${l.property.name}`;
      if (C[key]) {
        // 挂到所在语句或序列表达式的子项上
        const target = p.parentPath.isExpressionStatement() ? p.parent : p.node;
        add(target, C[key]); hits++;
      } else if (isProto && l.object.object.type === 'Identifier' && l.object.object.name.length <= 2 && !C[`${cls}.${l.property.name}`] && cfg.listMethods) {
        console.log('  未注释方法:', key);
      }
    },
  });

  let code = generate(ast, { comments: true, retainLines: false }).code;
  if (cfg.prefix) code = code.replace(/^var /, cfg.prefixOut || 'var ');
  // "var /** 注释 */ 名字" → "/** 注释 */ var 名字"（只移动注释位置）
  const moveVarComment = (s) => s.replace(/(^|\n)([ \t]*)var (\/\*\*[\s\S]*?\*\/)[ \t]*\n[ \t]*/g, (m, a, ind, c) => a + ind + c + '\n' + ind + 'var ');
  code = await prettier.format(code, { parser: 'babel', printWidth: 110 });
  code = await prettier.format(moveVarComment(code), { parser: 'babel', printWidth: 110 });
  fs.writeFileSync(output, (cfg.header || '') + code);
  console.log(`${output}: 重命名 ${renamed.size} 个绑定，注释 ${hits} 处，${code.split('\n').length} 行`);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
