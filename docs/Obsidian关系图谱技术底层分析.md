# Obsidian 关系图谱（Graph View）技术底层分析

> 分析对象：Obsidian 桌面版 **1.13.7**（Windows），安装包 `%APPDATA%\obsidian\obsidian-1.13.7.asar`
> 分析方式：解包 asar → 阅读压缩后的 `app.js` / `sim.js` / `app.css` → 提取并反汇编 `sim.js` 内嵌的 WebAssembly
> 用途说明：Obsidian 为闭源软件（`package.json` 中 `"license": "UNLICENSED"`）。本文仅记录架构、算法与参数，用于学习和兼容性研究；本项目的复刻版（`replica/`）是按这些参数独立实现的，没有复制 Obsidian 的代码。
> 说明：源码经过压缩，文中的 `v$`、`h0` 等是压缩后的符号名，不同版本可能变化。凡是根据上下文推断、而非直接读到的结论，文中都标注了“推断”。
> 配套：完整的带注释源码（压缩符号已重命名为可读名字，如 `v$` → `GraphRenderer`）可用 `npm run obsidian:all` 从本机安装包**在本地生成**（`docs/Obsidian关系图谱源码解读.md` 与 `docs/obsidian-source/`）。其中含 Obsidian 闭源代码，**不包含在本仓库中，仅供个人学习**。

---

## 0. 一页结论

| 层 | 技术 | 关键点 |
|---|---|---|
| 数据 | `MetadataCache.resolvedLinks / unresolvedLinks / getTags()` | 不重新解析 Markdown，直接复用全局链接索引 |
| 筛选 | 与全局搜索同一套查询引擎，分批异步执行 | 每 333ms 增量刷新一次图谱，大库搜索不卡 UI |
| 渲染 | **PixiJS 7.2.4（WebGL）**，画布放在独立 **iframe** 里 | 手动驱动渲染循环，静止 60 帧后休眠；节点懒加载；视口裁剪 |
| 物理 | 独立 **Web Worker**（`sim.js`，名为 "Graph Worker"） | 主力是 **WebAssembly 内核**（3322 字节），失败时退回纯 JS 的 d3-force |
| 通信 | **SharedArrayBuffer** + 版本号；不支持时改为“转移 ArrayBuffer” | 坐标以 Float32Array `[x0,y0,x1,y1,…]` 传递，零拷贝 |
| 手感 | 排斥力 −1000、速度衰减 0.4、碰撞半径 60、alpha 衰减 300 步 | 各种视觉属性每帧按 0.9 系数插值，缩放按 0.85 系数插值 |

“丝滑”的根源有三点：**物理和渲染分属两个线程**、**所有视觉变化都经过帧间插值**、**不需要的东西一律不画、不算**（懒加载、视口裁剪、空闲休眠、alpha 到阈值就停止模拟）。

---

## 1. 证据来源

### 1.1 安装包结构（与图谱相关的部分）

```
obsidian-1.13.7.asar
├── index.html          # 以 <script> 引入 lib/pixi.min.js
├── app.js              # 主程序（约 3MB，已压缩），图谱代码在其中
├── app.css             # .graph-view.color-* 颜色类、--graph-* 变量
├── sim.js              # 图谱物理 Worker（17.7KB，内嵌 WebAssembly）
├── worker.js           # "Metadata Cache Worker"（解析 Markdown，与图谱间接相关）
└── lib/pixi.min.js     # PixiJS 7.2.4
```

直接证据：

- `app.js`：`gm("/lib/pixi.min.js?7.2.4")`，Pixi 源码中的版本号为 `"7.2.4"`
- `app.js`：`new Worker("/sim.js",{name:"Graph Worker"})`
- `sim.js`：`console.log("Using fallback d3 simulator")`
- `sim.js`：`WebAssembly.Module(atob("AGFzbQEAAAAB..."))`，解码后得到 3322 字节的 wasm 模块

### 1.2 复现分析的命令

整个提取、注释流程已写成脚本（`tools/obsidian-source/`），在项目根目录执行：

```bash
npm install
npm run obsidian:extract    # 解包 asar → 格式化 → 切出图谱片段 → 提取并反汇编 WebAssembly → 筛选 CSS
npm run obsidian:annotate   # 作用域安全重命名 + 中文注释 → 结构等价校验 → 生成《源码解读》
# 或一次执行：npm run obsidian:all
```

产物生成在本地的 `docs/obsidian-source/` 和 `docs/Obsidian关系图谱源码解读.md`（含闭源代码，已被 `.gitignore` 排除，不会提交到仓库）。

### 1.3 压缩符号对照表

| 符号 | 含义 |
|---|---|
| `r0` | 图谱核心插件（id=`graph`）：注册命令、视图类型、功能区按钮 |
| `a0` / `o0="graph"` | 全局图谱视图 `GraphView` |
| `l0` / `s0="localgraph"` | 局部图谱视图 `LocalGraphView` |
| `h0` | 图谱数据引擎 `GraphDataEngine`：控制面板、搜索、生成图数据、播放动画 |
| `d0` / `f0` / `m0` / `y0` | 控制面板四个分组：筛选 / 颜色组 / 外观 / 力度 |
| `v$` | 渲染器 `GraphRenderer`（PixiJS） |
| `p$` / `d$` / `f$` | 节点 / 连线 / 角标 "Powered by Obsidian"（Publish 用） |
| `m$` | 局部图谱的 BFS 扩展算法 |
| `b$` / `y$` | Obsidian Publish（网页版）的图谱数据与视图 |
| `c0` / `u0` | 滑块 → 物理参数的对数映射及其反函数 |
| `t$` | 线性插值 `lerp(a,b,k=0.9) = a·k + b·(1−k)` |
| `n$` | 颜色逐通道插值（RGB 各自调用 `t$`） |
| `e$ = 0.2` | 淡化系数（悬停时无关元素的透明度） |
| `a$` | 筛选默认值 |
| `v0` / `g0` | 外观默认值 / 力度默认值 |

---

## 2. 整体架构

```
┌──────────────────────── 主线程（渲染进程）────────────────────────┐
│                                                                  │
│  Vault(文件系统) ──► MetadataCache ◄── worker.js(解析 Markdown)    │
│                        │  resolvedLinks / unresolvedLinks / tags │
│                        ▼                                         │
│  GraphView(a0) / LocalGraphView(l0)                              │
│        │                                                         │
│        ▼                                                         │
│  GraphDataEngine(h0) ── 搜索引擎(AP/PP，分批异步) ── 控制面板      │
│        │ setData({nodes:{id:{type,color,links}}})                │
│        ▼                                                         │
│  GraphRenderer(v$) ──► PixiJS 7.2.4（画布在 iframe 中）           │
│        │  ▲                                                      │
│  postMessage│ │Float32Array 坐标（SharedArrayBuffer / 转移）      │
└────────────┼─┼───────────────────────────────────────────────────┘
             ▼ │
┌──────────────┴───────── Graph Worker（sim.js）──────────────────┐
│  60Hz setTimeout 循环；alpha 衰减；alpha < 0.001 停止             │
│  ├─ WebAssembly 内核：init / simulate / complete                 │
│  └─ 备用：内置精简版 d3-force（forceX/Y、Link、ManyBody、Collide） │
└─────────────────────────────────────────────────────────────────┘
```

**职责划分**

- **数据引擎**只负责“要画什么”：生成 `{nodes:{id:{type,color,links:{}}}}`。
- **渲染器**负责“怎么画、怎么交互”：新增和删除节点的对比、初始摆放、交互、绘制。
- **Worker** 只负责“节点在哪”：接收节点、连线和力的参数，持续输出坐标。

三者之间只通过纯数据通信，所以筛选、上色、动画可以随时调用 `setData`，物理模拟也不用重启，会从当前状态继续平滑过渡。

---

## 3. 插件与视图层

### 3.1 核心插件 `graph`（r0）

- 功能区图标 `lucide-git-fork`；命令 `graph:open`（快捷键 **Mod+G**）、`graph:open-local`、`graph:animate`（播放动画）
- 注册两种视图：`graph`（全局）和 `localgraph`（局部）
- 文件右键菜单中加入“打开局部图谱”
- 注册悬停预览来源 `registerHoverLinkSource("graph", {defaultMod: true})`：在图谱中悬停节点时，需要按住 Ctrl/Cmd 才会弹出页面预览

### 3.2 视图创建渲染器

```js
// 全局图谱与局部图谱相同
renderer = new v$(contentEl, /*useIframe*/ !isIosApp, /*hidePowerTag*/ true)
```

- 桌面端和安卓端把 Pixi 画布放在 **iframe** 中，只有 iOS 应用例外。
- 初始化时会临时把 `window.WebGL2RenderingContext` 替换为 iframe 窗口中的同名对象，创建完 Pixi 后再恢复。
- 在 iframe 之上另有一个透明的 `interactiveEl` canvas 负责接收鼠标和键盘事件，通过 `renderer.events.setTargetElement(interactiveEl)` 转交给 Pixi。
- **推断**：这样做是为了把 WebGL 上下文和 Pixi 的全局状态隔离在 iframe 里，避免多个图谱视图或插件之间互相污染；关闭视图时整个 iframe 可以彻底销毁，回收显存。

### 3.3 事件订阅（数据引擎的 `load()`）

| 事件 | 处理 |
|---|---|
| `metadataCache.on("resolved")` | 整体 `update()` → `render()` |
| `vault.on("create" / "modify")` | 非 md 文件时 `recomputeFile`（加入搜索队列） |
| `vault.on("rename")`、`metadataCache.on("resolve")` | `recomputeFile` |
| `workspace.on("css-change")` | `renderer.testCSS()`，重新读取主题颜色 |
| `workspace.on("file-open")` | 更新 `currentFocusFile`，把当前笔记节点标为 `focused` |
| 每 2 秒轮询 `targetScale` | 缩放变化后保存配置（不是每次滚轮都保存） |
| `keydown / keyup` | 方向键平移、`+/-` 缩放，Shift 加速 |

---

## 4. 数据层：笔记库 → 图

### 4.1 数据来源

完全复用 `MetadataCache`，不再解析文件：

- `resolvedLinks[源路径][目标路径] = 次数`：已解析的链接
- `unresolvedLinks[源路径][链接文本] = 次数`：指向不存在笔记的链接
- `getTags()` 加上每个文件缓存里的标签：标签节点
- `getCachedFiles()`：参与的文件列表
- `isUserIgnored(path)`：设置中“排除的文件”不参与

### 4.2 生成算法（h0.render 中的内联函数）

```text
tagCase = showTags ? { 小写标签: 原始写法 } : {}
files   = getCachedFiles()
若在播放动画: files 按 min(ctime, mtime) 升序排序

for file in files:
    isAttachment = 不是 md
    if isAttachment 且未开“附件”: 跳过
    if filter(file, type) 为假，或文件被排除: 跳过
    nodes[file] = { type: isAttachment ? "attachment" : "", links: {} }
    若 filter 返回颜色: nodes[file].color = 颜色

    for dest in resolvedLinks[file]:             # 已解析链接
        若 dest 是附件且未开“附件”: 跳过
        若 filter(dest) 为真: links[dest] = true
    if !hideUnresolved:
        for dest in unresolvedLinks[file]:       # 未解析链接
            links[dest] = true；nodes[dest] ??= { type: "unresolved" }
    if showTags:
        for tag in 文件标签:
            links[tag] = true；nodes[tag] ??= { type: "tag" }

若关闭“孤立文件”: 删除既没有出边、也没有入边的节点
若 currentFocusFile 在图中: 该节点 type = "focused"
```

要点：

- 链接的方向保存在 `links` 字典里（源 → 目标），渲染器据此建立 `forward` / `reverse` 两张表，用来画箭头和判断相关节点。
- 节点只保存 `type` 和 `color`。标题由渲染器根据路径生成显示名（已核实，`Vl` 函数）：先取文件名（去掉目录），只有 `.md` 文件才去掉扩展名，附件保留扩展名（如 `Pasted image 2024….png`）。
- 返回值中的 `numLinks` 是节点和连线的总数，播放动画时用来计数（见 4.5）。

### 4.3 筛选函数的语义

```text
filter(path, type):
    没有任何查询                        → 真
    type == ""（笔记）                  → path == localFile ? 真
                                         : fileFilter[path]（true / 颜色 / false）
                                         ?? !hasFilter
    type == "tag"                      → 每个查询要么是颜色组，要么 query.matchTag(tag)
    type == "attachment"               → 每个查询要么是颜色组，要么 query.matchFilepath(path)
    type == "unresolved"               → 真（未解析节点不受搜索影响）
```

- `hasFilter` 只在“筛选”搜索框里有内容时为真。颜色组的查询只负责上色，不会过滤节点。
- 局部图谱的中心文件永远可见。

### 4.4 搜索与颜色组：分批异步执行

```text
updateSearch()（输入防抖 250ms）:
    queries = [搜索框查询(不带颜色)] + 颜色组查询(按顺序)
    每个查询用全局搜索的解析器 AP 解析（支持 path: tag: file: line: 等全部语法）
    queue = Rw 任务队列(vault.getFiles())
    PP(app, 查询需要的输入, queue, 每个文件的回调):
        依次匹配查询:
            不匹配且是筛选查询 → 该文件不可见，停止
            匹配且是颜色组     → 记录颜色，停止（第一个匹配的颜色组生效）
        fileFilter[path] = 可见 ? (颜色 || true) : false
    beforePause: 每 333ms 如果有新结果就 render() 一次
```

搜索是**增量、可中断**的：大库搜索时图谱会逐步更新，不会冻结界面；输入新内容时 `queue.cancel()` 取消旧任务。

### 4.5 播放动画（Timelapse）

```text
renderProgression():
    progression = 1
    total = render()                                   # 节点 + 连线总数
    speed = clamp(0.5·√total, 5, 100)                  # 每秒增加多少条目
    循环（每次 setTimeout 0）:
        k = 1 + floor(speed · 已过秒数)
        若 k 变化: progression = k; render()
        若 render 返回的数量没有再增长，或被打断: 结束
```

`render()` 在 `progression > 0` 时：

1. 文件按 `min(ctime, mtime)` 排序；
2. 遍历时每加入一个节点或一条连线计数 +1，**计数达到 progression 时停下**，记下当前文件；
3. 删除排在该文件之后的所有节点。

所以动画是按“节点 + 连线”这个粒度生长的：一篇笔记先出现，然后它的链接一条接一条连出去。

### 4.6 局部图谱（m$）

```text
输入: 完整图数据, localFile, localJumps(深度), forelinks/backlinks/interlinks 开关
weights[localFile] = 30
step = 30 / jumps
for p in 0..jumps-1:
    新加入的节点集合 = {}
    for 图中每个非标签节点 o:
        for o 的每条链接 → u:
            若开“出链”，o 已在结果中而 u 不在，且 o 不是标签: 加入 u
            若开“反链”，u 已在结果中而 o 不在，且 u 不是标签: 加入 o
    新节点的 weight = 30 − step·(p+1)
若开“相邻链接”: 把结果内节点的完整链接表补回来（邻居之间也连线）
```

- **标签节点不会继续扩展**（`c$={tag:true}`），否则一个热门标签会把整个库都拉进来。
- 局部图谱的节点大小由 **weights（按深度递减：30 → …）** 决定，而不是按连接数，所以中心节点最大、越往外越小。
- 局部图谱没有“孤立文件”开关，也没有“播放动画”按钮。

---

## 5. 渲染层：PixiJS 渲染器（v$）

### 5.1 场景结构

```
PIXI.Application({ view: iframe 内的 canvas, antialias: true, backgroundAlpha: 0, autoStart: false })
stage
├── 背景矩形 Graphics(10000×10000, alpha 0)   # 捕获平移拖拽
└── hanger: Container（平移/缩放都作用在它上面；子元素按 zIndex 排序）
    ├── Link.px: Container → Sprite(Texture.WHITE)   # 连线，zIndex 0
    ├── Link.arrow: Graphics（三角形）                 # 箭头，zIndex 1
    ├── Node.circle: Graphics（半径 100 的白色圆，用 tint 着色） # zIndex 1
    ├── Node.highlight: Graphics（悬停描边，按需创建） # zIndex 1
    └── Node.text: PIXI.Text（resolution 2）           # zIndex 2
```

- **颜色全部用 `tint`**：图形本身是白色，着色和变色时只改 tint，不需要重绘几何。
- **连线是 Sprite 而不是 Graphics 线段**：把一个白色纹理拉伸、旋转成细长矩形。Sprite 能被 Pixi 批量合并绘制，上千条线只需要很少的绘制调用，这是性能关键之一。
- **圆的半径固定为 100**，显示大小靠 `scale = size/100 × nodeScale` 控制，同样不需要重绘几何。
- Pixi 以 `autoStart:false` 创建，**不使用 Pixi 自带的 ticker**，由渲染器自己的 `requestAnimationFrame` 调用 `app.render()`。

### 5.2 渲染循环

```text
changed()     → idleFrames = 0; queueRender()
queueRender() → 如果还没排队，就 requestAnimationFrame(renderCallback)

renderCallback():
    if idleFrames > 60: return                # 连续 60 帧没有变化 → 休眠，CPU/GPU 占用归零
    读取 Worker 结果（SharedArrayBuffer 用版本号判断是否有新数据）→ 写入 node.x/y（fx/fy 优先）
    平移惯性: panX += 1000·panvX/60；panv 按 0.9 系数向键盘方向（通常为 0）插值
    键盘缩放: targetScale ×/÷ (1 + (Shift ? 0.1 : 0.03))
    updateZoom()
    计算世界坐标下的 viewport
    懒加载: 在未初始化的节点里选离视口中心最近的 50 个，initGraphics()
    所有连线 initGraphics()（两端节点都已初始化才会真正创建）
    所有节点 render()；所有连线 render()
    hanger.sortChildren(); app.render()
    idleFrames++；queueRender()
    悬停兜底: 鼠标离开高亮节点半径 + 2 后取消高亮
```

**懒加载的视觉效果**：打开图谱时，每帧只创建离视口中心最近的 50 个节点，每个节点的 `fadeAlpha` 从 0 开始插值到 1，于是图谱从中心向外渐次淡入“生长”出来，同时也把创建大量 PIXI.Text 的开销分摊到很多帧里。

### 5.3 节点绘制（p$.render）

| 属性 | 公式 / 规则 |
|---|---|
| 半径 size | `nodeSizeMultiplier × max(8, min(3·√(weight+1), 30))`；全局图谱 weight = 相关节点数，局部图谱 weight 见 4.6 |
| 节点缩放 nodeScale | `√(1/scale)`：视图放大 4 倍时节点只放大 2 倍，所以缩放时节点看起来大小比较稳定 |
| 圆的 scale | `size/100 × nodeScale` |
| 目标透明度 | 没有高亮节点，或自己就是高亮节点，或与高亮节点直接相连 → 1，否则 **0.2** |
| fadeAlpha | `fadeAlpha = lerp(fadeAlpha, 目标, 0.9)`，每帧插值 |
| 圆的 alpha | `fadeAlpha × 填充色.a` |
| 颜色 tint | `tint = 颜色插值(tint, 目标色)`，悬停变色是渐变的 |
| 填充色优先级 | 高亮 → `focused`（当前笔记）→ 颜色组 → 标签 → 未解析 → 附件 → 默认 |
| 标签字号 | `14 + size/4`，自动换行宽度 300，居中 |
| 标签透明度 | `textAlpha × fadeAlpha × 文字色.a`；被高亮时为 1 |
| textAlpha | `clamp(log₂(scale) + 1 − textFadeMultiplier, 0, 1)` |
| 标签位置 | `y + (size+5)·nodeScale + moveText/scale` |
| moveText | 被高亮时目标为 15，否则为 0，每帧插值：悬停时标签会平滑下移 15px，给描边让出位置 |
| 标签缩放 | `nodeScale`；被高亮且 `scale<1` 时为 `1/scale`（悬停节点的标签在缩小视图下也保持可读） |
| 高亮描边 | 线宽 `max(1, 1/scale/nodeScale)`，颜色取 `color-circle` |
| 视口裁剪 | 圆的包围盒不在视口内就不显示；标签检测范围为 `x±300, y…y+200` |

`textFadeMultiplier` 的含义：默认 0 时，缩放到 0.5 以下标签就完全消失；设为 −3（滑块最小值）时，要缩放到 1/16 以下才消失，所以缩得很小时仍能看到满屏文字。

### 5.4 连线绘制（d$.render）

| 属性 | 公式 / 规则 |
|---|---|
| 是否绘制 | 双向链接只画一条：两端互相链接且 `source.id < target.id` 的那条不画 |
| 线宽 | `lineSizeMultiplier / scale`，所以屏幕上的线宽不随缩放变化 |
| 起止点 | 从源节点圆的边缘到目标节点圆的边缘：长度 = 距离 − 两端半径 |
| 目标透明度 | 有高亮节点且本线与它无关 → 0.2，否则 1，再乘以颜色的 a |
| 颜色 | 与高亮节点相连的线用 `color-line-highlight`，并做 tint 插值 |
| 箭头透明度 | 在上面的基础上再乘 `clamp(2·(scale − 0.3), 0, 1)`：缩小到 0.3 以下箭头自动隐藏 |
| 箭头尺寸 | `2·√lineSizeMultiplier / scale`，位置在目标节点边缘外 1px |
| 视口裁剪 | 线段包围盒与视口不相交就隐藏 |

### 5.5 主题颜色：从 CSS 读取

`testCSS()` 对每个颜色键创建一个临时的 `<div class="graph-view color-xxx">`，读取它计算后的 `color` 和 `opacity`，转换成 `{rgb, a}`。主题切换会触发 `css-change` 事件，再读一遍，并把所有标签标记为需要重建字体。

| 颜色类 | CSS 变量 | 默认浅色主题 |
|---|---|---|
| `color-fill` | `--graph-node` = `--text-muted` | `#5c5c5c` |
| `color-fill-focused` | `--graph-node-focused` = `--text-accent` | 主题强调色 `hsl(258,88%,66%)` |
| `color-fill-tag` | `--graph-node-tag` = `--color-green` | `#08b94e` |
| `color-fill-attachment` | `--graph-node-attachment` = `--color-yellow` | `#e0ac00` |
| `color-fill-unresolved` | `--graph-node-unresolved` = `--text-faint`，opacity .5 | `#ababab` × 0.5 |
| `color-line` | `--graph-line` = `--color-base-35` | `#dadada` |
| `color-text` | `--graph-text` = `--text-normal` | `#222222` |
| `color-arrow` | `--text-normal`，opacity .5 | |
| `color-circle` | `--graph-node-focused` | 强调色 |
| `color-fill-highlight` / `color-line-highlight` | `--interactive-accent` | 强调色的亮一档 |

所以**用 CSS 片段改 `--graph-*` 变量就能完全改变图谱配色**，这正是很多主题能定制图谱外观的原因。

---

## 6. 交互层

### 6.1 缩放

```text
onWheel(e):
    delta = deltaY（按行滚动 ×40，按页滚动 ×800）
    targetScale *= 1.5 ^ (−delta/120)                 # 每格约 1.5 倍
    若是缩小: zoomCenter = (0,0) → 以屏幕中心为中心
    若是放大: zoomCenter = 鼠标位置 × devicePixelRatio

updateZoom()（每帧调用）:
    targetScale 限制在 [1/128, 8]
    若 |scale/target − 1| ≥ 1%:
        以 zoomCenter 为不动点，scale = lerp(scale, target, 0.85)
        修正 pan，使不动点在屏幕上的位置不变
    setScale(scale):
        nodeScale = √(1/scale)
        textAlpha = clamp(log₂ scale + 1 − textFade, 0, 1)
```

**放大时以鼠标为中心、缩小时以屏幕中心为中心**，这个不对称设计让缩小时图谱总是收拢到中间，不会越缩越偏。

### 6.2 平移与惯性

- 在背景上按下开始平移，body 加上 `is-grabbing` 类（光标变为抓手）。
- 移动时：`avgDt = lerp(avgDt, 两次移动的间隔, 0.8)`；`panv = lerp(panv, 本次位移, 0.8)`。
- 松手时：如果距离最后一次移动超过 100ms，速度清零（停住后再松手不会滑动）；否则 `panv /= avgDt`，换算成 px/ms，进入惯性。
- 每帧：`pan += 1000·panv/60`，`panv` 按 0.9 系数衰减。

### 6.3 拖拽节点

```text
pointerdown(节点): dragNode = 节点；记录按下位置（用于判断是否是点击）
pointermove:
    若拖拽中:
        位移超过 5px（平方 > 25）→ 不再算作点击
        坐标 = 相对 hanger 的局部坐标
        node.fx/fy = 坐标
        worker.postMessage({ alpha: .3, alphaTarget: .3, run: true, forceNode: {id, x, y} })
pointerup:
    若仍算点击 → onNodeClick（打开笔记；Ctrl/Cmd 在新标签页打开）
    node.fx = fy = null
    worker.postMessage({ alphaTarget: 0, forceNode: {id, x: null, y: null} })
```

拖拽时 `alphaTarget = 0.3`，让整张图保持“温热”，邻居节点会持续跟随弹动；松手后 `alphaTarget` 回到 0，能量按 alpha 衰减曲线逐渐消失，图谱自然静止。这就是拖拽手感的来源。

### 6.4 悬停

- 节点的 `pointerover` → `highlightNode = 节点`，同时触发悬停预览（需要按住 Ctrl/Cmd）。
- `getHighlightNode() = dragNode || highlightNode`：拖拽时被拖的节点始终处于高亮状态。
- 兜底：节点在移动时 `pointerout` 可能不触发，所以每帧检查鼠标是否已离开高亮节点半径 + 2，离开就取消高亮。

### 6.5 触屏

支持单指平移（带惯性）和双指缩放：以两指中点为缩放中心，`targetScale *= 当前两指距离 / 上次两指距离`，同时平移到新的中点。

### 6.6 其他

- 右键节点（仅限文件节点）：弹出与文件菜单同一套结构的菜单，分区为 `title / open / action / info / info.copy / view / view.linked（“打开关联视图”子菜单）/ system / danger`，具体菜单项由各核心插件和第三方插件注册进去。
- 左键点击：文件节点调用 `workspace.openLinkText` 打开笔记（按住 Ctrl/Cmd 在新标签页打开）；标签节点则打开全局搜索 `tag:xxx`。
- 视图菜单“复制截图”：`getTransparentScreenshot()` 调用一次 `app.render()` 后返回 canvas，复制为 PNG。

---

## 7. 物理层：Graph Worker（sim.js）

### 7.1 消息协议

主线程 → Worker：

| 字段 | 含义 |
|---|---|
| `nodes: {id: [x,y] \| null}` | 完整节点集合；`[x,y]` 是新节点的初始坐标，`null` 表示沿用 Worker 中已有的坐标；不在其中的节点会被删除 |
| `links: [[sourceId, targetId], …]` | 完整连线集合 |
| `forces: {centerStrength, linkStrength, linkDistance, repelStrength}` | 力的参数（已经过滑块换算） |
| `forceNode: {id, x, y}` | 钉住或释放节点（x、y 为 null 时释放） |
| `alpha` | 只会**提高** alpha（取较大值），不会降低 |
| `alphaTarget` | 设置 alpha 的目标值 |
| `run: true` | 若循环未运行则启动 |

Worker → 主线程：

- 启动时发送一次 `{ignore: true, shared: SharedArrayBuffer(1)}`，用来探测当前环境能否传递 SharedArrayBuffer。
- 支持时：`{id: [节点 id 列表], buffer: SharedArrayBuffer, v: 版本号}`。buffer 大小为 `N×2×4 + 4` 字节，最后 4 字节是自增的 Uint32 版本号。主线程比较版本号，没有变化就不重复读取。节点数不变时 buffer 会被复用。
- 不支持时：`{id, buffer: ArrayBuffer}`，并把 buffer 作为可转移对象发送（零拷贝，但每帧新建一个）。

### 7.2 Worker 状态与主循环

```js
alpha = 1
alphaDecay = 1 − 0.001^(1/300)      // 与 d3 默认一致：约 300 步从 1 衰减到 0.001
alphaTarget = 0
centerStrength = 0.1, linkStrength(倍数) = 1, linkDistance = 250, charge = −1000

loop():                             // setTimeout(loop, 1000/60)
    if alpha > 0.001:
        schedule(next)
        alpha += (alphaTarget − alpha) · alphaDecay
        step()                      // WebAssembly 或 JS 备用
        post()                      // 发送坐标
```

- 用 `setTimeout` 而不是 `requestAnimationFrame`，因为 Worker 里没有 rAF。计算节奏固定在约 60Hz，与显示器刷新率解耦。
- alpha 降到 0.001 以下后**完全停止计算**，静止的图谱不消耗 CPU。
- `repelStrength` 的处理：`charge = −repelStrength`，绝对值小于 1 时强制为 −1（保证至少有一点排斥）。

### 7.3 WebAssembly 内核

以 base64 内嵌在 `sim.js` 中，通过同步的 `new WebAssembly.Module` 和 `new WebAssembly.Instance` 实例化。**没有任何导入**（传入的 `env.abort/clog/flog` 实际没有被引用），3322 字节。

导出：

| 导出 | 签名（wasm 类型） | 作用 |
|---|---|---|
| `memory` | — | 线性内存，JS 按需 `grow` |
| `memset` | (i32,i32,i32)→i32 | 清零一段内存（构建四叉树前） |
| `init` | (ptr, N, L) | **已核实**：把每个节点的第 5 个字段清零后按连线累加成**度数**；再为每条连线计算 `bias = 度[源] / (度[源] + 度[目标])`，与 d3 forceLink 完全相同 |
| `simulate` | (ptr, N, L, alpha, center, linkMul, linkDist, charge, 0.9, 0.5) | **已核实**：① `v −= 坐标 · center · alpha`；② 连线力：用预测位置 `x+vx` 求距离，两点重合时用 0.1 替代，强度 = `linkMul / min(两端度数)`，按 bias 在两端分配；③ 调用 `manyBody(ptr, N, L, alpha·charge, 0.9, 0.5)` |
| `manyBody` | (ptr, N, L, alpha·charge, theta, collideStrength) | 参数已由调用处核实。按指令结构解读：建立 2 的幂大小的网格，累加质心，自底向上合并成多层网格（等价于完全四叉树），再对每个节点调用 `visitCharge` 和 `visitCollide` |
| `visitCharge` | … | 多体排斥（Barnes-Hut 近似，theta = 0.9） |
| `visitCollide` | … | 碰撞（强度 0.5；半径推断与 JS 备用方案相同，为 60） |
| `complete` | (ptr, N, 0.6) | 速度乘 0.6（即 velocityDecay 0.4），再累加到位置 |

**内存布局**（由 JS 胶水代码和 `init` 指令得出）：

```
所需字节 = 13·N·4 + 3·L·4 + 1024，不够就 memory.grow(ceil(差额 / 64KB))
[0, 20N)                 Float32 × 5 / 节点：x, y, vx, vy, degree（由 init 计算）
[20N, 20N + 12L)         每条连线 3 个 4 字节槽：sourceIndex(i32), targetIndex(i32), bias(f32，由 init 计算)
其余空间                  网格 / 四叉树等临时数据（13N 中剩余的 8N 个 float）
```

**每一步的调用顺序**（JS 胶水代码）：

1. 节点或连线有变化时：把 x/y/vx/vy 和连线索引写入线性内存，调用 `init(0, N, L)`
2. `simulate(0, N, L, alpha, center, linkMul, linkDist, charge, 0.9, 0.5)`
3. `complete(0, N, 0.6)`
4. 对被钉住的节点：用 fx/fy 覆盖坐标，速度清零
5. 把内存中的 x/y/vx/vy 读回 JS 节点对象

**推断**：从导入签名（`env.abort`）和代码风格看，这个内核很可能是用 AssemblyScript 把 d3-force 的核心力移植后编译出来的。它的价值在于 f32 运算、紧凑的内存布局，以及没有对象分配和 GC 压力，在上万个节点时比 JS 版快得多。

### 7.4 JS 备用方案（内置精简版 d3-force）

WebAssembly 实例化失败时（`catch` 后返回 null），改用 `sim.js` 内置的 d3-force 精简版：

| 力 | 参数 |
|---|---|
| forceX / forceY | 目标 0，strength = centerStrength |
| forceLink | distance = linkDistance；strength = linkStrength × d3 默认值 `1/min(两端度数)` |
| forceManyBody | strength = charge（默认 −1000），**distanceMin = 30**，theta 为 d3 默认值 |
| forceCollide | **radius = 60，strength = 0.5** |
| 位置积分 | `vx *= 0.6; x += vx`（被钉住时 `x = fx, vx = 0`） |
| 随机数 | LCG：`p = (1664525·p + 1013904223) mod 2³²`，种子为 1，结果可复现 |

---

## 8. 滑块与物理参数的换算

```js
c0(v, t) = (t^(1−v) − t) / (1 − t)          // 滑块 → 实际值（对数曲线）
u0(x, t) = 1 − log(x·(1−t) + t) / log(t)    // 实际值 → 滑块（反函数）
```

| 滑块 | 范围 | 换算 | 默认滑块值 → 实际值 |
|---|---|---|---|
| 图谱向心力 | 0 ~ 1 | `c0(v, 0.01)` | `u0(0.1) ≈ 0.5187` → **0.1** |
| 节点间的排斥力 | 0 ~ 20 | **v³** | 10 → **1000**（charge = −1000） |
| 相连节点间的吸引力 | 0 ~ 1 | `c0(v, 0.01)` | `u0(1) = 1` → **1**（乘到 d3 默认强度上） |
| 连线长度 | 30 ~ 500（步长 1） | 原值 | **250** |
| 文本透明度 | −3 ~ 3（步长 0.1） | 原值 | 0 |
| 节点大小 | 0.1 ~ 5 | 原值 | 1 |
| 连线粗细 | 0.1 ~ 5 | 原值 | 1 |

**为什么用对数和立方**：向心力和吸引力的有效范围跨越好几个数量级（0.001 到 1），线性滑块会让大部分行程都没有意义；排斥力用立方，是为了让低段调节得更细、高段增长得更快。

每次改变力的参数都会发送 `{forces, alpha: 0.3, run: true}`，让图谱“醒过来”，重新找到平衡。

---

## 9. 配置持久化

- **全局图谱**：保存在 `<库>/.obsidian/graph.json`（核心插件的 `saveData`），写入有 100ms 防抖；缩放值每 2 秒检查一次，变化了才保存。
- **局部图谱**：配置保存在工作区布局状态里（`getState/setState` → `requestSaveLayout`），每个局部图谱面板各自独立。

以一个实际使用中的库的 `.obsidian/graph.json` 为例（文本透明度调到了最小值 −3）：

```json
{
  "collapse-filter": true,
  "search": "",
  "showTags": false,
  "showAttachments": false,
  "hideUnresolved": false,
  "showOrphans": false,
  "collapse-color-groups": true,
  "colorGroups": [],
  "collapse-display": false,
  "showArrow": false,
  "textFadeMultiplier": -3,
  "nodeSizeMultiplier": 1.0711590296496,
  "lineSizeMultiplier": 2.61355195283714,
  "collapse-forces": false,
  "centerStrength": 0.518713248970312,
  "repelStrength": 10,
  "linkStrength": 1,
  "linkDistance": 250,
  "scale": 0.49463631000219915,
  "close": true
}
```

注意：文件里保存的是**滑块值**（例如 `centerStrength: 0.5187`），不是换算后的物理值（0.1）。`colorGroups` 的格式为 `[{query: "path:xxx", color: {a: 1, rgb: 整数}}]`（推断，依据是颜色组面板读写的结构）。

---

## 10. 性能设计清单

| 手段 | 作用 |
|---|---|
| 物理计算放在 Worker | 主线程只负责渲染，拖拽和缩放不受计算量影响 |
| WebAssembly 内核 | f32 运算、线性内存、无 GC，大图的计算量大幅下降 |
| SharedArrayBuffer + 版本号 | 坐标零拷贝；数据没变时主线程不重复读取 |
| alpha < 0.001 停止模拟 | 静止时 Worker 不占 CPU |
| 静止 60 帧后渲染休眠 | 静止时主线程和 GPU 都不占用 |
| 懒加载（每帧 50 个） | 打开大库时不卡顿，并形成“生长”动画 |
| 视口裁剪 | 看不见的节点、标签、连线都设为 `visible=false` |
| 连线用 Sprite | 可以批量合并绘制，绘制调用少 |
| 着色用 tint、缩放用 scale | 不需要重绘几何 |
| 标签字号固定、按缩放整体缩放 | 只在节点大小变化时才重建文字纹理（`fontDirty`） |
| 双向链接只画一条 | 连线数量减半 |
| 分批异步搜索 | 大库搜索不冻结界面，结果逐步显示 |
| 画布放在 iframe | 隔离 WebGL 上下文，销毁时可以彻底回收（推断） |

## 11. 手感参数速查

| 参数 | 值 | 作用 |
|---|---|---|
| 物理步进 | 60Hz（setTimeout 16.7ms） | 与显示器刷新率解耦 |
| alpha 衰减 | 300 步从 1 到 0.001 | 约 5 秒后静止 |
| 速度保留率 | 0.6 / 步 | 阻尼适中，不拖泥带水 |
| 拖拽时 alphaTarget | 0.3 | 拖拽过程中整张图保持活跃 |
| 修改参数时唤醒 | alpha ≥ 0.3 | 平滑地重新找平衡 |
| 视觉插值 | 0.9 / 帧 | 悬停变暗、变色、标签下移都是渐变 |
| 缩放插值 | 0.85 / 帧 | 滚轮缩放有“追赶”感 |
| 滚轮倍率 | 1.5 / 120 单位 | |
| 缩放范围 | 1/128 ~ 8 | |
| 惯性衰减 | 0.9 / 帧；停顿 100ms 后松手不滑动 | |
| 点击判定阈值 | 5px | |
| 淡化透明度 | 0.2 | |

---

## 12. 与本项目复刻版（replica/）的对照

对照源码逐项审计后的结果（✅ 一致；⚙️ 按需求有意调整；⚠️ 有差异；❌ 未实现）。

| 环节 | Obsidian 1.13.7 | 复刻版 | 状态 |
|---|---|---|---|
| 渲染库 | PixiJS 7.2.4 | PixiJS 7.4.3 | ✅ 大版本相同 |
| 场景结构、tint 着色、Sprite 连线 | 见 5.1 | 相同做法 | ✅ |
| 节点、标签、连线、箭头公式 | 见 5.3、5.4 | 按相同公式实现 | ✅ |
| 双向链接只画一条线 | 存在反向链接且 source.id < target.id 时不画线，箭头照画 | 相同 | ✅ 审计后修复（原先画两条，线色加深） |
| 懒加载、视口裁剪、空闲休眠 | 见 5.2 | 相同 | ✅ |
| 缩放、惯性、拖拽、悬停 | 见第 6 节 | 相同 | ✅ |
| 键盘操作 | ↑↓←→ 平移、+/- 缩放、Shift 加速 | 相同 | ✅ 审计后补上 |
| 缩放记忆 | 每 2 秒检查 targetScale，变化才保存 | 相同（按库规模分别保存） | ✅ 审计后补上 |
| 文本透明度 | 范围 −3～3，默认 0（拉远会隐藏标签） | 范围 −7～3，**默认 −7（任何缩放都显示标签）** | ⚙️ 按需求调整；调到 0 即为 Obsidian 默认行为 |
| 数据构建 | graphData()：遍历文件，节点与连线逐个计数 | 同构实现 | ✅ 审计后重写 |
| 附件节点 | 开启后显示所有附件，未被引用的也作为孤立点 | 相同 | ✅ 审计后修复 |
| 颜色组作用范围 | 只给笔记上色 | 相同 | ✅ 审计后修复（原先标签也会被上色） |
| 搜索对标签 / 附件 | 标签按 matchTag、附件按路径过滤，未解析节点不受影响 | 相同语义 | ✅ 审计后修复 |
| 播放动画 | 按创建时间排序，按“节点 + 连线”计数，速度 clamp(0.5·√总数, 5, 100) | 相同 | ✅ 审计后重写（虚构库只有 ctime，没有 mtime） |
| 滑块换算 | c0 / v³ | 相同 | ✅ |
| 搜索语法 | 完整的全局搜索语法，分批异步 | 简化版 `tag:` `path:` `file:` 和 `-` 排除，同步执行 | ⚠️ |
| 节点标识 | 文件路径（不同目录的同名笔记是不同节点） | 文件名 | ⚠️ 虚构库没有同名笔记，不影响演示 |
| 标签字号更新 | 只在创建或主题变化时确定 | 节点大小、权重变化时也会更新 | ⚠️ 复刻版更新得更及时，属于细微差异 |
| iframe 隔离画布 | 有 | 无（直接放在页面里） | ⚠️ 单图谱场景下没有影响 |
| 物理 Worker | WebAssembly + JS 备用 | 只有 JS（d3-force，与其备用方案同算法） | ⚠️ 上万节点时性能有差距 |
| 坐标传输 | SharedArrayBuffer；不支持时转移 | 只用转移（`file://` 下无法使用 SharedArrayBuffer） | ⚠️ |
| Worker 加载方式 | `new Worker("/sim.js")` | Blob URL（兼容 `file://`） | ⚙️ 为了能直接打开页面 |
| 数据来源 | MetadataCache | 虚构笔记库生成器 | ⚙️ 演示用途 |
| 局部图谱 | BFS + 按深度递减的权重（见 4.6） | 无 | ❌ |
| Ctrl + 悬停页面预览 | 有 | 无（点击节点弹出笔记卡片代替） | ❌ |
| 右键菜单 | 与文件菜单同结构 | 无 | ❌ |
| 触屏单指平移惯性 / 双指缩放 | 有 | 只有鼠标 | ❌ |

审计修复项的自动化验证：`npm run test:audit`（`tests/replica-audit-fixes.cjs`）。
