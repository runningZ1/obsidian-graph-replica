module.exports = {
  prefix: 'var ',
  header: `/**
 * Obsidian 1.13.7 · 关系图谱 · 渲染层源码（app.js 第 117377–118777 行，prettier 格式化后）
 *
 * 来源：%APPDATA%/obsidian/obsidian-1.13.7.asar → app.js
 * 处理：Babel 作用域安全重命名（压缩符号 → 有意义的名字）+ 中文注释；逻辑未做任何改动。
 *       对照用的原始格式化版本见 01-graph-renderer.raw.js
 * 版权：Obsidian 闭源（UNLICENSED），仅供个人学习分析，请勿公开传播。
 *
 * 本段包含：
 *   DIM_ALPHA / lerp / lerpColor / isOutsideViewport / boundsOf   工具函数与常量
 *   GraphNode      节点（圆 + 标签 + 悬停描边）
 *   GraphLink      连线（Sprite 拉伸成线 + 箭头）
 *   PowerTag       “Powered by Obsidian” 角标（Publish 用）
 *   GraphRenderer  渲染器：PixiJS 场景、交互、渲染循环、与 Worker 通信
 *   buildLocalGraph        局部图谱 BFS
 *   PublishGraphView / buildPublishGraphData   Obsidian Publish（网页版）的图谱
 *
 * 仍为压缩名的外部符号（定义在 app.js 其他位置，含义为推断）：
 *   y(...) = TypeScript __awaiter；b(...) = __generator；v(a,b) = __extends
 *   Vl(path) = 路径 → 显示名（取文件名，仅去掉 .md 扩展名）；id(evt) = 是否为“右键/辅助点击”；nm/wv = 截图转 Blob / 写剪贴板
 *   CW(url, opts) = 创建 Worker（Publish）；$m(el, cb) = 元素可见时回调；gm(url) = 加载脚本
 *   LA / OA / M / kD / bD / Fl = Publish 数据构建用的遍历/链接解析/扩展名工具
 */
`,
  rename: {
    e$: 'DIM_ALPHA', t$: 'lerp', n$: 'lerpColor', i$: 'isOutsideViewport', r$: 'boundsOf', o$: 'resetElementStyle',
    a$: 'DEFAULT_GRAPH_FILTER', s$: 'createNodeData', l$: 'cloneNodeData', c$: 'NON_EXPANDING_TYPES',
    u$: 'COLOR_CLASS_MAP', h$: 'CIRCLE_RADIUS', p$: 'GraphNode', d$: 'GraphLink', f$: 'PowerTag', v$: 'GraphRenderer',
    m$: 'buildLocalGraph', g$: 'pixiLoaded', y$: 'PublishGraphView', b$: 'buildPublishGraphData',
  },
  external: { Kb: 'parseCssColor', rd: 'Platform' },
  comments: {
    DIM_ALPHA: '悬停/拖拽时，与高亮节点无关的节点和连线淡化到的透明度',
    lerp: `线性插值：lerp(a, b, k=0.9) = a·k + b·(1−k)
每帧调用一次 → 指数逼近目标值。图谱里几乎所有“渐变”（透明度、颜色、标签位移、缩放）都靠它`,
    lerpColor: '颜色插值：把 0xRRGGBB 拆成三个通道分别 lerp，悬停变色因此是渐变的',
    isOutsideViewport: '两个矩形是否不相交（视口裁剪用）',
    boundsOf: '以 (x, y) 为中心、半径 r 的包围盒',
    resetElementStyle: '把 iframe / canvas 的外边距、边框清零并铺满容器',
    DEFAULT_GRAPH_FILTER: '筛选相关的默认选项（全局图谱 + 局部图谱）',
    createNodeData: 'setData 使用的节点数据结构：{ type: "" | "tag" | "attachment" | "unresolved" | "focused", links: { 目标id: true } }',
    cloneNodeData: '复制节点的 type / color，但不复制 links（局部图谱 BFS 用）',
    NON_EXPANDING_TYPES: '局部图谱 BFS 中不会继续向外扩展的节点类型：标签（否则一个热门标签会把整个库拉进来）',
    COLOR_CLASS_MAP: '颜色键 → CSS 类名。testCSS() 会为每个类创建临时 div 并读取 computed color / opacity',
    CIRCLE_RADIUS: '节点圆的几何半径固定为 100，实际显示大小通过 scale 控制，改变大小时不需要重绘几何',

    GraphNode: '节点：一个白色圆（用 tint 着色）+ 一个 PIXI.Text 标签 + 悬停时的描边圆',
    'GraphNode.constructor': `forward / reverse：出链、入链字典（id → GraphLink）
weight：权重（全局图谱 = 相关节点数；局部图谱 = 按深度递减的值）
fadeAlpha：当前的淡入淡出透明度；moveText：标签当前的下移量（悬停时趋向 15）
rendered：是否已创建 Pixi 对象（懒加载）`,
    'GraphNode.initGraphics': `懒加载：只在渲染循环挑中时才创建 Pixi 对象
- 圆：Graphics 画半径 100 的白色圆，pivot 放到圆心，用 tint 上色；移动端额外画一个半径 500 的近乎透明的大圆扩大点击区域
- 事件：pointerdown → 开始拖拽；pointerover/out → 悬停高亮；click/rightclick → 右键菜单
- 标签：PIXI.Text，resolution 2（高清），anchor(0.5, 0) 放在圆的正下方
- fadeAlpha 从 0 开始 → 新节点会淡入`,
    'GraphNode.clearGraphics': '销毁 Pixi 对象（节点被移除或渲染器销毁时调用）',
    'GraphNode.getTextStyle': '标签样式：字号 14 + 半径/4（大节点字也大），自动换行宽度 300，居中',
    'GraphNode.render': `每帧调用。关键逻辑：
1. 目标透明度：没有高亮节点，或自己就是高亮节点，或与高亮节点直接相连 → 1；否则 DIM_ALPHA(0.2)
2. fadeAlpha = lerp(fadeAlpha, 目标)，圆的 alpha = fadeAlpha × 填充色 alpha
3. 标签透明度 = renderer.textAlpha（由缩放决定）× fadeAlpha；被高亮时强制为 1
4. moveText：被高亮时趋向 15，标签平滑下移，给描边让出位置
5. 视口裁剪：圆的包围盒在视口外就不可见；标签检查 x±300、y..y+200 的区域
6. 圆：tint 做颜色插值；scale = size/100 × nodeScale（nodeScale = √(1/缩放)）
7. 标签：y = 节点 y + (size+5)·nodeScale + moveText/缩放；被高亮且缩放 < 1 时按 1/缩放 放大，保持可读
8. 高亮描边：线宽 max(1, 1/缩放/nodeScale)，颜色取 color-circle
9. fontDirty（主题或节点大小变化后）→ 重建文字样式`,
    'GraphNode.getFillColor': '填充色优先级：高亮 > focused（当前打开的笔记）> 颜色组 > 标签 > 未解析 > 附件 > 默认',
    'GraphNode.getSize': '节点半径 = 节点大小倍数 × clamp(3·√(weight+1), 8, 30)',
    'GraphNode.getDisplayText': '显示文字：Vl(path) 先取文件名（去掉目录），只有 .md 才去掉扩展名，附件保留扩展名（已核实）',
    'GraphNode.getRelated': '所有相关节点 id（出链 + 入链）',

    GraphLink: '连线：用 Sprite(Texture.WHITE) 拉伸、旋转成细长矩形。Sprite 可以被 Pixi 批量合并绘制，比 Graphics 画线快得多',
    'GraphLink.initGraphics': `两端节点都已创建后才创建连线
px：Container，定位在源节点边缘并旋转到连线方向；line：白色 Sprite
arrow：Graphics 画的三角形 (0,0) (−4,−2) (−3,0) (−4,2)，用 tint 上色`,
    'GraphLink.render': `每帧调用：
- 高亮节点存在且本线与之无关 → 目标透明度 0.2，否则 1；与高亮节点相连的线换成 lineHighlight 颜色
- 箭头额外乘 clamp(2·(缩放−0.3), 0, 1)：缩小到 0.3 以下箭头自动消失
- 双向链接只画一条：两端互链且 source.id < target.id 时这条不画
- 线宽 = 连线粗细倍数 / 缩放 → 屏幕上的线宽恒定
- 线段从源节点圆的边缘画到目标节点圆的边缘（长度减去两端半径）
- 视口裁剪：线段包围盒不在视口内就隐藏`,
    PowerTag: 'Obsidian Publish 图谱右下角的 “Powered by Obsidian” 文字（桌面端通过 hidePowerTag 隐藏）',

    GraphRenderer: `渲染器。构造参数：(容器, 是否使用 iframe, 是否隐藏角标, 可选的已有 Worker)
桌面端传入 useIframe = !Platform.isIosApp，即除 iOS 外画布都放在 iframe 中`,
    'GraphRenderer.constructor': `1. testCSS() 读取主题颜色
2. 创建 interactiveEl：一个透明 canvas 放在最上层，负责接收鼠标事件（wheel / mousemove / mouseout）
3. 创建 Worker：new Worker("/sim.js", { name: "Graph Worker" })，收到的坐标存进 workerResults 后调用 changed()
4. useIframe 时画布放在 iframe 里（onIframeLoad 中初始化）；否则直接创建 canvas，延迟 50ms 初始化（失败则 300ms 后重试）`,
    'GraphRenderer.destroy': '关闭视图：终止 Worker 并销毁所有 Pixi 对象',
    'GraphRenderer.onIframeLoad': 'iframe 加载完成：在 iframe 的 body 里放一个 <canvas>，用它初始化 Pixi',
    'GraphRenderer.onWheel': `滚轮缩放：
- deltaMode 为行时 ×40、为页时 ×800，统一换算成像素
- targetScale *= 1.5^(−delta/120)，即每格约 1.5 倍
- 缩小时 zoomCenter = (0,0)，以屏幕中心缩放；放大时以鼠标位置（乘 devicePixelRatio）为中心`,
    'GraphRenderer.onMouseMove': '记录鼠标位置（渲染循环用它做“离开高亮节点”的兜底判断）',
    'GraphRenderer.initGraphics': `初始化 Pixi 与全部交互（核心方法）：
- 临时把 window.WebGL2RenderingContext 换成 iframe 里的同名对象，创建完 PIXI.Application 后恢复
- PIXI.Application({ view, antialias: true, backgroundAlpha: 0, autoStart: false })：不用 Pixi 自带的 ticker
- 事件目标设为 interactiveEl
- 节点拖拽：pointerdown 记录按下位置；pointermove 超过 5px 就不再算点击，并发送 forceNode + alphaTarget 0.3；
  pointerup 时仍算点击则打开笔记，然后释放节点并把 alphaTarget 设回 0
- 背景平移：一个 10000×10000 的透明矩形接收拖拽，计算平均帧间隔和速度，松手后进入惯性
- 触屏：单指平移，双指以两指中点为中心缩放
- renderCallback：主渲染循环（详见下方）`,
    'GraphRenderer#onPointerDown': '按下节点：记录拖拽节点和按下位置（按下位置用于判断是点击还是拖拽）',
    'GraphRenderer#onPointerOver': '悬停节点（触摸除外）：设为高亮节点，并通知外部（用于悬停预览）',
    'GraphRenderer#onPointerOut': '移出节点：取消高亮',
    'GraphRenderer#renderCallback': `主渲染循环（requestAnimationFrame 驱动）：
0. idleFrames > 60 → 直接返回，渲染休眠
1. 读取 Worker 坐标：SharedArrayBuffer 用末尾 4 字节的版本号判断是否有新数据；被钉住的节点用 fx/fy 覆盖
2. 平移惯性：pan += 1000·panv/60；panv 按 0.9 系数向键盘方向（通常为 0）衰减
3. 键盘缩放：targetScale ×/÷ (1 + Shift ? 0.1 : 0.03)，以屏幕中心为中心
4. updateZoom()，计算世界坐标下的 viewport
5. 懒加载：在未创建的节点中选离视口中心最近的 50 个，initGraphics（维护一个按距离排序、长度 50 的小数组）
6. 所有连线 initGraphics，所有节点、连线 render，sortChildren，app.render()
7. idleFrames++，排下一帧
8. 兜底：鼠标已离开高亮节点半径 + 2 → 取消高亮`,
    'GraphRenderer.destroyGraphics': '销毁全部 Pixi 对象、取消动画帧；iframe 仍在文档中时连同纹理一起 destroy',
    'GraphRenderer.zoomTo': '以屏幕中心为中心缩放到指定倍数（有 point 参数时以该点为中心）',
    'GraphRenderer.onResize': '容器尺寸变化：按 devicePixelRatio 调整渲染尺寸，并平移让内容保持居中',
    'GraphRenderer.resetPan': '把世界原点 (0,0) 移到视图中心',
    'GraphRenderer.setData': `接收图数据并做增量对比（核心方法）：
1. 删除不在新数据中的节点，同时算出现有节点离原点的最大距离 v
2. 已有节点更新 color / type；新节点创建 GraphNode
3. 按 links 字典对比连线：删除消失的、新建新增的，同时维护 forward / reverse
4. 新节点的初始位置：
   - 有已定位的相关节点 → 放在它们的平均位置 ± 随机偏移 √(3600·新增数)
   - 否则 → 撒在现有图外围的圆环上：半径 ∈ [v, √(3600·新增数/π + v²)]，面积均匀分布
   这就是新增笔记会“从邻居旁边长出来”、孤立笔记会出现在外圈的原因
5. weight = 传入的 weights（局部图谱）或相关节点数
6. 有变化时把节点（新节点带坐标，旧节点为 null）和全部连线发给 Worker，alpha 0.3`,
    'GraphRenderer.setRenderOptions': '外观选项：节点大小、连线粗细、文本透明度、是否显示箭头',
    'GraphRenderer.setForces': '力度选项 → Worker；同时 alpha 提到 0.3，让图谱重新找平衡',
    'GraphRenderer.getHighlightNode': '当前高亮节点：正在拖拽的节点优先，其次是悬停的节点',
    'GraphRenderer.updateZoom': `每帧调用的平滑缩放：
- targetScale 限制在 [1/128, 8]
- 与当前值相差超过 1% 时：保持 zoomCenter 这一点在屏幕上不动，scale = lerp(scale, target, 0.85)`,
    'GraphRenderer.setPan': '平移：直接移动 hanger 容器',
    'GraphRenderer.setScale': `缩放：hanger.scale = scale
nodeScale = √(1/scale)：视图放大 4 倍时节点只放大 2 倍
textAlpha = clamp(log₂(scale) + 1 − 文本透明度, 0, 1)：缩小时标签按对数曲线淡出`,
    'GraphRenderer.changed': '有变化：清零空闲计数并请求渲染（渲染循环因此被唤醒）',
    'GraphRenderer.queueRender': '如果还没有排队的动画帧，就请求一帧',
    'GraphRenderer.testCSS': '读取主题颜色：为每个 COLOR_CLASS_MAP 类创建临时 div，读取 computed color 和 opacity → {rgb, a}',
    'GraphRenderer.getTransparentScreenshot': '截图：立即渲染一帧并返回 canvas（透明背景）',
    'GraphRenderer.getBackgroundScreenshot': '截图：在白底 canvas 上绘制透明截图',

    buildLocalGraph: `局部图谱 BFS：
- 中心文件 weight = 30；每扩展一层，新节点的 weight = 30 − (30/深度)·(层数+1)，局部图谱的节点大小因此按距离递减
- forelinks：从已包含节点沿出链加入目标；backlinks：沿入链加入来源
- 标签节点（NON_EXPANDING_TYPES）不会继续扩展
- interlinks：扩展结束后，把已包含节点之间的完整连线补回来`,
    pixiLoaded: 'Publish 网页版按需加载 pixi.min.js（版本 7.2.4）',
    PublishGraphView: `Obsidian Publish 网页版的图谱：同一个 GraphRenderer，默认缩放 0.5、文本透明度 −1
默认显示当前页面的局部图谱（深度 1），“Global Graph” 按钮切换为全局图谱`,
    buildPublishGraphData: 'Publish 版的数据构建：直接遍历站点缓存中每个文件的链接（没有 MetadataCache 的 resolvedLinks）',
  },
};

module.exports.locals = {
  'GraphNode.render': { e: 'self', t: 'renderer', n: 'x', i: 'y', r: 'circle', o: 'ring', a: 'label', s: 'fadeAlpha',
    l: 'moveText', c: 'size', u: 'fill', h: 'textColor', p: 'highlightNode', d: 'isHighlighted', f: 'nodeScale',
    v: 'labelWasVisible', m: 'targetAlpha', g: 'circleAlpha', y: 'labelAlpha', b: 'moveTarget', w: 'labelVisible',
    k: 'viewport', C: 'circleVisible', E: 'ringWidth', M: 'ringColor' },
  'GraphLink.render': { e: 'self', t: 'container', n: 'line', i: 'arrow', r: 'renderer', o: 'source', a: 'target',
    s: 'highlightNode', l: 'touchesHighlight', c: 'lineAlpha', u: 'arrowAlpha', h: 'lineColor', p: 'boxA', d: 'boxB',
    f: 'arrowColor', v: 'drawLine', m: 'drawArrow', g: 'lineWidth', y: 'viewport', b: 'sourceBox', w: 'targetBox',
    k: 'inViewport', C: 'dx', E: 'dy', M: 'dist', S: 'sourceRadius', x: 'targetRadius' },
  'GraphRenderer.setData': { e: 'data', t: 'self', n: 'nodes', i: 'nodeLookup', r: 'links', o: 'incoming',
    a: 'workerNodes', s: 'removedNodes', l: 'removedLinks', c: 'changed', u: 'styleChanged', h: 'maxDist2', f: 'node',
    v: 'currentRadius', m: 'addedNodes', g: 'id', y: 'spec', b: 'color', w: 'wantedLinks', k: 'targetId',
    C: 'targetNode', E: 'link', M: 'removeLink', A: 'forward', P: 'reverse', I: 'addedCount', L: 'area',
    O: 'ringWidth', F: 'jitter', B: 'sumX', V: 'sumY', H: 'placedCount', q: 'related', W: 'relatedId',
    j: 'relatedNode', U: 'angle', _: 'radius', K: 'weights', G: 'weight', Y: 'linkPairs' },
  'GraphRenderer.onWheel': { e: 'evt', t: 'delta', n: 'target', i: 'dpr' },
  'GraphRenderer.updateZoom': { e: 'self', t: 'scale', n: 'target', i: 'panX', r: 'panY', o: 'centerX',
    a: 'centerY', s: 'dpr', l: 'anchorWorld' },
  'GraphRenderer.setScale': { e: 'scale', t: 'hanger', n: 'log2Scale' },
  'GraphRenderer.initGraphics': { e: 'canvas', t: 'app', n: 'renderer', i: 'self', r: 'iframeEl', o: 'interactiveEl',
    a: 'worker', s: 'origWebGL2', l: 'pressPos', c: 'onDragEnd', u: 'hanger', h: 'powerTag', p: 'background',
    d: 'panStart', f: 'panOrigin', v: 'lastMoveTime', m: 'avgMoveInterval', g: 'touchA', y: 'touchB',
    b: 'touchVX', w: 'touchVY', k: 'onTouch', C: 'onPanEnd' },
  'GraphRenderer#renderCallback': { e: 'self', i: 'nodes', r: 'links', o: 'results', a: 'ids', s: 'buffer',
    l: 'hasNewData', c: 'versionView', p: 'positions', d: 'idx', f: 'self2', v: 'panning', m: 'panvX', g: 'panvY',
    y: 'keys', b: 'shift', w: 'keyDX', k: 'keyDY', C: 'keySpeed', E: 'zoomStep', M: 'keyZoom', S: 'dpr',
    x: 'scale', T: 'vpLeft', D: 'vpTop', A: 'vpRight', P: 'vpBottom', I: 'vpCenterX', L: 'vpCenterY',
    O: 'nearest', F: 'byDist', B: 'dist2', U: 'node', G: 'self3', Y: 'mouseX', X: 'mouseY', Q: 'hovered',
    $: 'mouseWorldX', Z: 'mouseWorldY', J: 'dx', ee: 'dy', te: 'hitRadius' },
  buildLocalGraph: { e: 'graph', t: 'opts', n: 'allNodes', i: 'result', r: 'weights', o: 'centerFile', a: 'jumps',
    s: 'interlinks', l: 'forelinks', c: 'backlinks', u: 'expandOneLayer', h: 'weightStep', p: 'layer' },
  'buildLocalGraph/expandOneLayer': { e: 'layerWeight', t: 'added', o: 'srcId', a: 'srcNode', s: 'srcLinks',
    u: 'dstId', h: 'srcResult' },
};
