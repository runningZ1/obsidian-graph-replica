# 早期方案探索（归档）

项目早期的选型尝试：用 9 个开源方案分别实现同一个“类 Obsidian”的知识图谱，比较拖拽手感、大图性能和实现成本。**这些代码已归档，保持原样，不再维护。** 项目主体是根目录下的 [`replica/`](../../replica/)。

## 运行

纯静态页面，依赖库从 CDN（jsDelivr）加载，版本都已固定。可以直接双击本目录的 `index.html`，也可以在项目根目录执行 `npm run serve` 后访问 http://localhost:5173/archive/explorations/ 。

所有方案共用同一份虚构的“大模型知识库”数据（`shared/data.js`）和同一套 Obsidian 风格的力度面板（`shared/panel.js`）。每个页面右上角都能调节力度、切换数据规模（300 / 1000 / 3000 个节点），左上角显示实时 FPS。

## 方案清单

| 目录 | 方案 | 技术 | 依赖版本（CDN） |
|---|---|---|---|
| 01-force-graph | force-graph | Canvas 2D + d3-force | force-graph@1.51.5, d3@7.9.0 |
| 02-d3-pixi | d3-force + PixiJS | WebGL + d3-force | pixi.js@8.21.0, d3@7.9.0 |
| 03-d3-svg | d3-force + SVG | SVG DOM + d3-force | d3@7.9.0 |
| 04-sigma | Sigma.js + graphology | WebGL，物理由 d3-force 驱动 | sigma@3.0.3, graphology@0.26.0, d3@7.9.0 |
| 05-g6 | AntV G6 v5 | Canvas + 内置 d3-force | @antv/g6@5.1.1 |
| 06-vis-network | vis-network | Canvas + Barnes-Hut 物理引擎 | vis-network@10.1.2 |
| 07-cytoscape-cola | Cytoscape.js + cola | Canvas + 约束布局 | cytoscape@3.34.3, webcola@3.4.0, cytoscape-cola@2.5.1 |
| 08-echarts | ECharts graph | Canvas + 内置力导布局 | echarts@6.1.0 |
| 09-3d-force-graph | 3d-force-graph | Three.js + d3-force-3d | 3d-force-graph@1.80.0, d3@7.9.0 |

未包含：Cosmograph / cosmos.gl（依赖 GPU 计算，按要求排除）；Reagraph（需要 React 构建环境）。

## 结论

| 方案 | 与 Obsidian 的差距 |
|---|---|
| **02 d3-force + PixiJS** | 渲染库、物理算法都与 Obsidian 相同，只差“物理放进 Worker”和精确参数 → **被选为复刻路线** |
| 01 force-graph | 手感一致，但 Canvas 2D 逐个画文字，几千个节点时先卡 |
| 04 Sigma | WebGL 性能好，但坐标和标签规则自成一套，复刻 Obsidian 外观要和它对着干 |
| 03 SVG | 上千个节点就卡 |
| 05~09 | 各自的力导算法不是 d3-force，手感天生不同 |

之后通过逆向 Obsidian 1.13.7 安装包，证实了它用的正是 PixiJS 7 + d3-force（放在 Web Worker 里，并有 WebAssembly 加速），详见 [技术底层分析](../../docs/Obsidian关系图谱技术底层分析.md)。

## 面板参数映射（本目录各方案）

各方案使用的是自定义的近似映射，不是 Obsidian 的真实换算公式（真实公式见技术底层分析第 8 节，复刻版已采用）。

| Obsidian 滑块 | d3-force 系方案（01~05、09） | vis-network | cola | ECharts |
|---|---|---|---|---|
| 图谱向心力 | forceX/Y strength = v × 0.1 | centralGravity | centerGraph 开关 | gravity |
| 节点间的排斥力 | manyBody strength = −v × 30 | gravitationalConstant | nodeSpacing | repulsion |
| 相连节点间的吸引力 | link strength = v | springConstant | 近似为连线收缩 | 无 |
| 连线长度 | link distance = v × 0.4 | springLength | edgeLength | edgeLength |
