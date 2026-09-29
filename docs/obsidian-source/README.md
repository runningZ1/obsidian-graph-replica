# Obsidian 关系图谱源码（1.13.7，注释版）

> **仅供个人学习分析。** Obsidian 是闭源软件（`package.json` 中为 `"license": "UNLICENSED"`）。本目录的源码文件提取自本机安装的 Obsidian，**已被 `.gitignore` 排除，仓库中只有这份说明**。请在装有 Obsidian 的电脑上按下文“重新生成”一节在本地生成，不要公开传播。

## 文件（本地生成后）

| 文件 | 内容 |
|---|---|
| `01-graph-renderer.raw.js` | `app.js` 中的渲染层片段（prettier 格式化后的原样代码） |
| `01-graph-renderer.annotated.js` | 同上，压缩符号已重命名，并加了中文注释：`GraphNode`、`GraphLink`、`GraphRenderer`、`buildLocalGraph`、Publish 图谱 |
| `02-graph-plugin.raw.js` / `.annotated.js` | 插件、视图、数据引擎、控制面板：`GraphCorePlugin`、`GraphView`、`LocalGraphView`、`GraphDataEngine`、四个面板分组 |
| `03-sim-worker.raw.js` / `.annotated.js` | 物理 Worker `sim.js` 全文：消息协议、WebAssembly 胶水代码、JS 备用 d3-force、SharedArrayBuffer 输出 |
| `04-sim-kernel.wat` | `sim.js` 内嵌 WebAssembly（3322 字节）的反汇编，加了人工注释 |
| `05-graph.css` | `app.css` 中与图谱相关的规则和 `--graph-*` 变量 |

按章节阅读请看同时生成的 `../Obsidian关系图谱源码解读.md`（同样只在本地）；架构和原理请看 [../Obsidian关系图谱技术底层分析.md](../Obsidian关系图谱技术底层分析.md)。

## 注释版的可信度

- `.annotated.js` 只做了两件事：**作用域安全的重命名**（Babel `scope.rename`，改名分两步完成，避免链式改名冲突），以及**添加注释**。
- 每次生成后都会运行 `tools/obsidian-source/verify.cjs`，对比原始版和注释版：
  - AST 节点类型、字面量、属性名逐一相同；
  - 每个标识符引用解析到的声明位置相同，也就是不存在变量捕获。
- 当前三份文件的校验结果都是“差异 0”。
- 注释中标注“推断”的内容，是根据上下文判断的，没有直接读到。WAT 中 `init` 和 `simulate` 的注释已对照指令逐条核实。

## 重新生成

在项目根目录执行：

```bash
npm install
npm run obsidian:all        # = obsidian:extract + obsidian:annotate
```

- `obsidian:extract`：自动找到 `%APPDATA%/obsidian/` 下版本最高的 `obsidian-*.asar`（也可以把路径作为参数传入），生成 `*.raw.js`、`04-sim-kernel.wat`、`05-graph.css`。中间文件放在 `tools/obsidian-source/.work/`（约 30MB，可以随时删除）。
- `obsidian:annotate`：生成 `*.annotated.js`，运行等价校验，再重新生成《源码解读》文档。校验不通过时流程会失败退出。

片段边界按压缩后的代码特征定位（例如 `e$ = 0.2,`、`i0 = bd.plugins.graphView,`），只在 1.13.7 上验证过。Obsidian 升级后压缩名可能变化，届时提取脚本会报错，需要调整 `extract.cjs` 中的边界规则和各 `cfg-*.cjs` 中的重命名表。
