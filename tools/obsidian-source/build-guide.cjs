// 从已校验的注释版源码中按顶层声明切片，生成《Obsidian关系图谱源码解读.md》
const fs = require('fs');
const parser = require('@babel/parser');
const path = require('path');
const DIR = path.resolve(__dirname, '../../docs/obsidian-source') + '/';
const OUT = path.resolve(__dirname, '../../docs/Obsidian关系图谱源码解读.md');

function declSlices(file) {
  const src = fs.readFileSync(DIR + file, 'utf8');
  const ast = parser.parse(src, { sourceType: 'script', allowReturnOutsideFunction: true });
  const map = new Map();
  const lineStart = (pos) => src.lastIndexOf('\n', pos - 1) + 1;
  for (const st of ast.program.body) {
    const decls = st.type === 'VariableDeclaration' ? st.declarations : st.type === 'FunctionDeclaration' ? [st] : [];
    for (const [idx, d] of decls.entries()) {
      // 声明列表的第一个变量、以及函数声明：注释挂在整条语句上
      const lead = (d.leadingComments || (idx === 0 ? st.leadingComments : null) || []).at(-1);
      const start = lineStart(lead ? lead.start : d.start);
      map.set(d.id.name, src.slice(start, d.end).replace(/^\s*\n/, ''));
    }
  }
  return { map, src };
}
const dedent = (s) => {
  const lines = s.split('\n');
  const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
  return lines.map(l => l.slice(ind)).join('\n');
};
const block = (code, lang = 'js') => '```' + lang + '\n' + dedent(code).trimEnd() + '\n```\n';

const R = declSlices('01-graph-renderer.annotated.js').map;
const P = declSlices('02-graph-plugin.annotated.js').map;
const need = (m, k) => { if (!m.has(k)) throw new Error('缺少声明 ' + k); const v = m.get(k); m.delete(k); return v; };
const group = (m, keys) => keys.map(k => need(m, k)).join('\n\n');

const out = [];
out.push(`# Obsidian 关系图谱源码解读（完整注释版源码）

> 版本：Obsidian 桌面版 1.13.7；来源：本机 \`%APPDATA%\\obsidian\\obsidian-1.13.7.asar\`
> **仅供个人学习分析。Obsidian 为闭源软件（UNLICENSED），请勿公开传播本文或 \`docs/obsidian-source/\` 中的文件。**
>
> 配套阅读：[技术底层分析](Obsidian关系图谱技术底层分析.md)（架构与原理）。本文是“看代码”的部分。

## 怎么读这份代码

**处理流程**：解包 asar → prettier 格式化 → 按边界切出图谱模块 → 用 Babel 做**作用域安全的重命名**（把 \`v$\`、\`p$\`、\`t$\` 这类压缩符号换成 \`GraphRenderer\`、\`GraphNode\`、\`lerp\` 等）→ 加中文注释。

**正确性保证**：每份注释版都和原始格式化版做了**结构等价校验**：
- AST 节点类型、字面量、属性名逐一相同；
- 每个标识符引用指向的声明位置相同，不存在变量捕获。

三份文件的校验结果都是“差异 0”，也就是说**除了名字和注释，逻辑与 Obsidian 原始代码逐节点一致**。

**读代码的几个约定**：
- 代码是 TypeScript 编译成 ES5 后的产物：类写成 \`X = (function(){ function e(){...} e.prototype.m = function(){...}; return e; })()\`，继承用 \`v(子类, 父类)\`（__extends），\`async\` 函数被编译成 \`y(...)\` + \`b(...)\` 状态机（__awaiter / __generator）。
- 重命名覆盖了模块级符号和核心方法里的局部变量；其余方法里的单字母局部变量保持原样。方法里常见 \`var e = this\` 或 \`self\`，指向当前实例。
- 仍保留压缩名的外部符号（如 \`AP\`、\`PP\`、\`Cb\`、\`Vl\`），在各文件头部的注释里列出了推断的含义。
- 下面每个代码块都截取自注释版文件的顶层声明；源文件中它们大多位于 \`var a = ..., b = ...;\` 声明列表里，所以除了列表中的第一个，代码块开头都没有 \`var\`。

**文件清单**（\`docs/obsidian-source/\`）：

| 文件 | 内容 | 行数 |
|---|---|---|
| \`01-graph-renderer.annotated.js\` / \`.raw.js\` | 渲染层：节点、连线、渲染器、局部图谱 BFS、Publish 图谱 | ${fs.readFileSync(DIR + '01-graph-renderer.annotated.js', 'utf8').split('\n').length} |
| \`02-graph-plugin.annotated.js\` / \`.raw.js\` | 插件、视图、数据引擎、控制面板 | ${fs.readFileSync(DIR + '02-graph-plugin.annotated.js', 'utf8').split('\n').length} |
| \`03-sim-worker.annotated.js\` / \`.raw.js\` | 物理 Worker（sim.js 全文） | ${fs.readFileSync(DIR + '03-sim-worker.annotated.js', 'utf8').split('\n').length} |
| \`04-sim-kernel.wat\` | WebAssembly 物理内核反汇编（带注释） | ${fs.readFileSync(DIR + '04-sim-kernel.wat', 'utf8').split('\n').length} |
| \`05-graph.css\` | app.css 中与图谱相关的规则 | ${fs.readFileSync(DIR + '05-graph.css', 'utf8').split('\n').length} |

**推荐阅读顺序**：数据怎么来（第 2 部分的 \`GraphDataEngine.render\`）→ 怎么画（\`GraphRenderer.setData\` → \`renderCallback\` → \`GraphNode.render\` / \`GraphLink.render\`）→ 怎么动（第 3 部分的 \`sim.js\` 和 WebAssembly 内核）→ 怎么交互（\`GraphRenderer.initGraphics\` 里的事件处理）。

---

# 第 1 部分：渲染层（01-graph-renderer）

## 1.1 工具函数与常量

所有“丝滑”渐变的基础是 \`lerp(a, b, 0.9)\`：每帧向目标值靠近 10%，形成指数缓动。颜色渐变用 \`lerpColor\` 对 RGB 三个通道分别插值。
`);
out.push(block(group(R, ['DIM_ALPHA', 'lerp', 'lerpColor', 'isOutsideViewport', 'boundsOf', 'resetElementStyle',
  'DEFAULT_GRAPH_FILTER', 'createNodeData', 'cloneNodeData', 'NON_EXPANDING_TYPES', 'COLOR_CLASS_MAP', 'CIRCLE_RADIUS'])));

out.push(`## 1.2 GraphNode：节点

重点看 \`render()\`：透明度、颜色、标签位置每帧都经过 \`lerp\`；\`getSize()\` 决定节点大小；\`getFillColor()\` 决定颜色优先级。
`);
out.push(block(need(R, 'GraphNode')));

out.push(`## 1.3 GraphLink：连线

连线不是用 Graphics 画的线段，而是把 \`Texture.WHITE\` 拉伸成细长矩形的 Sprite，这样 Pixi 可以批量合并绘制。注意 \`render()\` 里“双向链接只画一条”的判断和箭头随缩放淡出的逻辑。
`);
out.push(block(need(R, 'GraphLink')));

out.push(`## 1.4 GraphRenderer：渲染器（核心）

整个图谱最重要的一个类。建议按这个顺序看：
1. \`constructor\`：iframe、交互层 canvas、Worker 的创建
2. \`initGraphics\`：Pixi 初始化、拖拽/平移/触屏事件、**\`renderCallback\` 主渲染循环**
3. \`setData\`：增量对比与新节点初始摆放
4. \`onWheel\` → \`updateZoom\` → \`setScale\`：缩放链路
5. \`testCSS\`：从 CSS 读取主题颜色
`);
out.push(block(need(R, 'GraphRenderer')));

out.push(`## 1.5 buildLocalGraph：局部图谱 BFS

局部图谱的节点大小不按连接数，而按深度：中心为 30，每往外一层递减 \`30/深度\`。标签节点不继续扩展。
`);
out.push(block(need(R, 'buildLocalGraph')));

out.push(`## 1.6 Obsidian Publish（网页版）的图谱

同一个 \`GraphRenderer\` 在网页版中的用法：默认缩放 0.5、文本透明度 −1、只显示当前页面深度为 1 的局部图谱。
`);
out.push(block(group(R, ['PowerTag', 'pixiLoaded', 'PublishGraphView', 'buildPublishGraphData'])));
if (R.size) out.push(`其余声明：\n\n` + block([...R.values()].join('\n\n')));

out.push(`---

# 第 2 部分：插件、视图与数据引擎（02-graph-plugin）

## 2.1 GraphCorePlugin：核心插件

命令、快捷键（Mod+G）、视图注册、文件右键菜单、\`graph.json\` 的读写。
`);
out.push(block(group(P, ['i18nGraph', 'GraphCorePlugin', 'VIEW_TYPE_GRAPH'])));

out.push(`## 2.2 GraphView / LocalGraphView：视图

两种视图都创建 \`new GraphRenderer(contentEl, !Platform.isIosApp, true)\`。局部图谱跟随当前文件，配置存在工作区布局里。
`);
out.push(block(group(P, ['GraphView', 'VIEW_TYPE_LOCALGRAPH', 'LocalGraphView'])));

out.push(`## 2.3 滑块 ↔ 物理参数

向心力和吸引力用对数曲线，排斥力在 \`ForceSection\` 里用 \`v³\`（见 2.5）。
`);
out.push(block(group(P, ['sliderToForce', 'forceToSlider'])));

out.push(`## 2.4 GraphDataEngine：数据引擎（核心）

重点：
- \`render()\` 里的 \`graphData(...)\` 立即执行函数：**MetadataCache → 图数据** 的全部逻辑，播放动画的截断也在这里
- \`setQuery()\`：分批异步搜索，每 333ms 增量刷新
- \`load()\`：事件订阅与键盘控制
`);
out.push(block(need(P, 'GraphDataEngine')));

out.push(`## 2.5 控制面板四个分组

筛选、颜色组、外观、力度。注意 \`ForceSection\` 中每个滑块 \`onChange\` 的换算：\`sliderToForce(e, 0.01)\` 和 \`e * e * e\`。
`);
out.push(block(group(P, ['GraphControlSection', 'FilterSection', 'ColorGroupSection', 'DEFAULT_DISPLAY_OPTIONS', 'DisplaySection',
  'DEFAULT_FORCE_OPTIONS', 'ForceSection'])));
if (P.size) out.push(`其余声明：\n\n` + block([...P.values()].join('\n\n')));

const sim = fs.readFileSync(DIR + '03-sim-worker.annotated.js', 'utf8');
out.push(`---

# 第 3 部分：物理 Worker（03-sim-worker，sim.js 全文）

阅读顺序：状态变量（\`alpha\` 等）→ \`self.onmessage\`（消息协议）→ \`step\`（WebAssembly 胶水代码，以及 \`||\` 之后的 JS 备用方案）→ \`postPositions\`（SharedArrayBuffer / 转移）→ \`tick\` / \`schedule\`（60Hz 循环）。

开头约 400 行是内联的 d3-quadtree / d3-force 精简版，只在 WebAssembly 不可用时使用，可以跳过。WebAssembly 的 base64 字符串很长，已原样保留。
`);
out.push(block(sim));

const wat = fs.readFileSync(DIR + '04-sim-kernel.wat', 'utf8');
out.push(`---

# 第 4 部分：WebAssembly 物理内核（04-sim-kernel.wat）

\`simulate\`（func 6）和 \`init\`（func 1）已对照指令逐条核实（注释中有标注），\`manyBody\` / \`visitCharge\` / \`visitCollide\` 的注释是按指令结构解读的。

<details>
<summary>展开完整反汇编（${wat.split('\n').length} 行）</summary>

${block(wat, 'wat')}
</details>

---

# 第 5 部分：图谱相关 CSS（05-graph.css）

<details>
<summary>展开完整 CSS</summary>

${block(fs.readFileSync(DIR + '05-graph.css', 'utf8'), 'css')}
</details>
`);

fs.writeFileSync(OUT, out.join('\n'));
console.log('写入', OUT, fs.readFileSync(OUT, 'utf8').split('\n').length, '行');
