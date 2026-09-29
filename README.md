# Obsidian 关系图谱 · 逆向解包与复刻

解包本机 Obsidian 1.13.7 的安装包，分析关系图谱（Graph View）从数据、渲染、交互到物理模拟的完整实现，然后按源码中的公式与参数**独立实现**一个高仿复刻版，还原 Obsidian 拖拽、缩放、悬停时那种丝滑的动态效果。

> ⚠️ Obsidian 是闭源软件（UNLICENSED）。**本仓库不包含任何 Obsidian 源码**：提取出的代码（《源码解读》与 `docs/obsidian-source/` 下的源码文件）已被 `.gitignore` 排除，需要时可以用仓库里的工具链从你本机安装的 Obsidian **在本地生成**，仅供个人学习分析。复刻版 `replica/` 的代码是独立编写的，没有复制 Obsidian 的代码。

## 项目结构

```
├── index.html                 项目首页（入口导航）
├── replica/                   ★ 主体：Obsidian 关系图谱高仿复刻
│   ├── index.html               页面骨架（仿 Obsidian 视图顶栏 + 控制面板）
│   ├── renderer.js              PixiJS 渲染器：节点 / 标签 / 连线 / 箭头、交互、渲染循环
│   ├── sim-worker.js            物理 Worker：d3-force（按 Obsidian 的力组合与常量）
│   ├── app.js                   数据构建（与源码 graphData 同构）、筛选、颜色组、播放动画、设置
│   ├── vault.js                 虚构笔记库生成器（文件夹 / 标签 / 附件 / 未解析链接 / 孤立笔记）
│   ├── concepts-data.js         笔记库的种子数据（LLM 主题概念与关系）
│   └── style.css                Obsidian 默认主题的颜色变量（明 / 暗）
├── docs/                      逆向分析
│   ├── Obsidian关系图谱技术底层分析.md
│   ├── Obsidian关系图谱源码解读.md    （本地生成，不在仓库中）
│   └── obsidian-source/         提取出的源码（本地生成，仓库中只有说明文件 README.md）
├── tools/obsidian-source/     逆向工具链：解包 → 切片 → 重命名与注释 → 等价校验 → 生成文档
├── tests/                     复刻版与页面的自动化测试
└── archive/explorations/      早期方案探索（01~09，已归档）
```

## 快速开始

浏览页面**不需要安装任何东西**，依赖库从 CDN 加载，版本都已固定。

- 直接双击根目录的 `index.html`（`file://` 方式可用），或者
- 起一个本地服务：`npm run serve`（即 `python -m http.server 5173`），然后访问 http://localhost:5173

只有运行测试或逆向工具链时才需要执行 `npm install`。

## 复刻版（replica/）

| 方面 | 实现 |
|---|---|
| 渲染 | PixiJS 7.4.3（Obsidian 用的是 7.2.4）。节点是用 tint 着色的圆，连线是拉伸的 Sprite；懒加载、视口裁剪，静止 60 帧后休眠 |
| 物理 | Web Worker 中运行 d3-force：向心力、连线力、排斥力（最小距离 30）、碰撞（半径 60，强度 0.5）；速度保留率 0.6；60Hz 步进 |
| 动效 | 透明度、颜色、标签位移每帧按 0.9 插值；缩放按 0.85 追赶目标；平移松手后带惯性；打开时节点从中心向外淡入 |
| 公式 | 节点半径 `clamp(3·√(度+1), 8, 30)`；标签透明度 `clamp(log₂缩放 + 1 − 文本透明度, 0, 1)`；滑块换算（对数曲线、排斥力 v³）与源码一致 |
| 面板 | 筛选（搜索、标签、附件、仅存在文件、孤立文件）、颜色组、外观（箭头、文本透明度、节点大小、连线粗细、播放动画）、力度 |
| 交互 | 拖拽、悬停高亮一度邻居、滚轮缩放、键盘（方向键平移、`+`/`-` 缩放、Shift 加速）、点击节点打开笔记卡片 |
| 其他 | 明暗主题、设置自动保存（含缩放值）、库规模切换（标准 / ×3 / ×8） |

与 Obsidian 的逐项对照（包括有意调整和尚未实现的部分）见技术底层分析第 12 节。有意调整的一项：**文本透明度默认为 −7**，任何缩放下都显示节点名字（Obsidian 默认 0，拉远会隐藏）；可以在“外观”面板中调整，调到 0 即恢复 Obsidian 的默认行为。

CDN 依赖：`pixi.js@7.4.3`，Worker 内 `d3-force@3.0.0`、`d3-quadtree@3.0.1`、`d3-dispatch@3.0.1`、`d3-timer@3.0.1`。

## 逆向分析文档

- [技术底层分析](docs/Obsidian关系图谱技术底层分析.md)：架构、数据流、渲染与交互公式、Worker 消息协议、WebAssembly 内核（关键函数已对照指令核实）、滑块换算、性能设计、复刻版对照表
- 源码解读（`docs/Obsidian关系图谱源码解读.md`，**本地生成，不在仓库中**）：按章节排列的完整注释版源码。压缩符号已重命名为可读名字（如 `v$` → `GraphRenderer`），并通过结构等价校验（AST 与变量绑定逐一比对，差异为 0）。在装有 Obsidian 的电脑上执行 `npm install && npm run obsidian:all` 即可生成，详见 [docs/obsidian-source/README.md](docs/obsidian-source/README.md)

## 逆向工具链

```bash
npm install
npm run obsidian:extract     # 解包 %APPDATA%/obsidian/obsidian-*.asar → 格式化 → 切出图谱片段 → 反汇编 WebAssembly → 筛选 CSS
npm run obsidian:annotate    # 重命名与注释 → 结构等价校验 → 生成《源码解读》
npm run obsidian:all         # 以上两步一起执行
```

| 文件 | 说明 |
|---|---|
| `tools/obsidian-source/extract.cjs` | 从 asar 提取，按代码特征定位片段边界（只在 1.13.7 上验证过） |
| `tools/obsidian-source/annotate.cjs` + `cfg-*.cjs` | 作用域安全的两阶段重命名 + 注释；配置文件中是重命名表和注释内容 |
| `tools/obsidian-source/cfg-wat.cjs` | WebAssembly 反汇编的人工注释 |
| `tools/obsidian-source/verify.cjs` | 结构等价校验，不通过时流程失败退出 |
| `tools/obsidian-source/build-guide.cjs` | 从注释版源码生成《源码解读》 |
| `tools/obsidian-source/pipeline.cjs` | 串联：注释 → 校验 → 生成文档 |
| `tools/obsidian-source/which.cjs` | 调试：按序号定位校验报告里的差异节点 |

中间文件放在 `tools/obsidian-source/.work/`（约 30MB），可以随时删除。

## 测试

```bash
npm run test:physics   # 物理 Worker 单测（在 Node 中运行，需要联网加载 d3）
npm run test:e2e       # 复刻版功能端到端测试（需要先 npm run serve）
npm run test:audit     # 源码审计修复项验证：标签默认显示、设置迁移、双向链接、键盘、缩放记忆、颜色组、播放动画（需要先 npm run serve）
npm run test:file      # 以 file:// 方式打开所有页面：检查能否出图、有无报错、有无死链
```

截图输出到 `tests/.output/`。浏览器默认使用 `C:/Program Files/Google/Chrome/Application/chrome.exe`，可以用环境变量 `CHROME_PATH` 指定其他路径。

## 项目脉络

1. **方案探索**：用 9 个开源库分别实现类 Obsidian 图谱，对比手感与性能，锁定 d3-force + PixiJS 路线 → [`archive/explorations/`](archive/explorations/)
2. **逆向解包**：解包 asar，定位 Graph Worker（`sim.js`）、PixiJS 7.2.4、内嵌的 WebAssembly 物理内核
3. **源码注释**：Babel 作用域安全重命名 + 中文注释，用结构等价校验保证逻辑不变
4. **高仿复刻**：按源码公式与常量独立实现渲染器、物理 Worker 和控制面板
5. **审计修正**：对照源码逐项审计复刻版，修正差异，并补上自动化测试
